import re
import os
import numpy as np

MAX_EDGES = 3000
SEMANTIC_THRESHOLD = 0.70
SEMANTIC_K = 6

LANG_BY_EXT = {
    '.py': 'python', '.js': 'javascript', '.jsx': 'javascript',
    '.ts': 'typescript', '.tsx': 'typescript', '.java': 'java',
    '.go': 'go', '.cpp': 'cpp', '.c': 'c', '.h': 'c',
    '.cs': 'csharp', '.rb': 'ruby', '.rs': 'rust',
    '.php': 'php', '.md': 'markdown',
}


def _get_language(path: str) -> str:
    ext = os.path.splitext(path)[1].lower()
    return LANG_BY_EXT.get(ext, 'unknown')


def _parse_imports(file_path: str, content: str) -> list[str]:
    ext = os.path.splitext(file_path)[1].lower()
    imports = []
    if ext == '.py':
        for m in re.finditer(r'^(?:import|from)\s+([\w.]+)', content, re.MULTILINE):
            imports.append(m.group(1).replace('.', '/'))
    elif ext in ('.js', '.jsx', '.ts', '.tsx'):
        for m in re.finditer(r'''from\s+['"]([^'"]+)['"]''', content):
            imports.append(m.group(1))
    return imports


def _resolve_import(imp: str, source_path: str, all_paths: set) -> str | None:
    source_dir = os.path.dirname(source_path)
    candidates = [
        imp,
        imp + '.py',
        imp + '.js',
        imp + '.ts',
        imp + '.jsx',
        imp + '.tsx',
        os.path.join(source_dir, imp).replace('\\', '/'),
        os.path.join(source_dir, imp + '.py').replace('\\', '/'),
        os.path.join(source_dir, imp + '.js').replace('\\', '/'),
        os.path.join(source_dir, imp + '.ts').replace('\\', '/'),
        os.path.join(source_dir, imp + '.tsx').replace('\\', '/'),
    ]
    for c in candidates:
        c = c.lstrip('./')
        if c in all_paths:
            return c
    return None


def build_graph(
    chunks: list[dict],
    embeddings: np.ndarray,
    coords_3d: np.ndarray,
    issues: list[dict],
    prs: list[dict],
    issue_coords: np.ndarray,
    pr_coords: np.ndarray,
    issue_embeddings: np.ndarray,
    pr_embeddings: np.ndarray,
    repo: str,
    file_contents: dict[str, str],
) -> dict:
    nodes = []
    node_index_map: dict[str, int] = {}

    # code nodes
    for i, chunk in enumerate(chunks):
        node = {
            'id': chunk['id'],
            'type': 'code',
            'file_path': chunk['file_path'],
            'name': chunk['name'],
            'chunk_type': chunk['type'],
            'language': _get_language(chunk['file_path']),
            'x': float(coords_3d[i][0]),
            'y': float(coords_3d[i][1]),
            'z': float(coords_3d[i][2]),
            'size': min(len(chunk['content']) / 500, 3.0),
            'content_preview': chunk['content'][:300],
            'embedding_index': i,
        }
        node_index_map[chunk['id']] = i
        nodes.append(node)

    n_code = len(chunks)

    # issue nodes
    for j, issue in enumerate(issues):
        idx = n_code + j
        coords = issue_coords[j] if j < len(issue_coords) else [0.0, 0.0, 0.0]
        node = {
            'id': f"issue::{issue['number']}",
            'type': 'issue',
            'title': issue['title'],
            'body': issue['body'],
            'number': issue['number'],
            'labels': issue.get('labels', []),
            'x': float(coords[0]),
            'y': float(coords[1]),
            'z': float(coords[2]),
            'size': 1.5,
            'embedding_index': idx,
        }
        node_index_map[node['id']] = idx
        nodes.append(node)

    n_code_issue = n_code + len(issues)

    # pr nodes
    for k, pr in enumerate(prs):
        idx = n_code_issue + k
        coords = pr_coords[k] if k < len(pr_coords) else [0.0, 0.0, 0.0]
        node = {
            'id': f"pr::{pr['number']}",
            'type': 'pr',
            'title': pr['title'],
            'body': pr.get('body', ''),
            'number': pr['number'],
            'state': pr.get('state', 'open'),
            'x': float(coords[0]),
            'y': float(coords[1]),
            'z': float(coords[2]),
            'size': 1.5,
            'embedding_index': idx,
        }
        node_index_map[node['id']] = idx
        nodes.append(node)

    # structural edges
    edges = []
    edge_set: set[tuple] = set()
    all_paths = {chunk['file_path'] for chunk in chunks}
    # map file path -> list of node ids for that file
    file_to_nodes: dict[str, list[str]] = {}
    for chunk in chunks:
        file_to_nodes.setdefault(chunk['file_path'], []).append(chunk['id'])

    for file_path, content in file_contents.items():
        source_nodes = file_to_nodes.get(file_path, [])
        if not source_nodes:
            continue
        for imp in _parse_imports(file_path, content):
            resolved = _resolve_import(imp, file_path, all_paths)
            if resolved and resolved != file_path:
                target_nodes = file_to_nodes.get(resolved, [])
                for src_id in source_nodes:
                    for tgt_id in target_nodes:
                        key = (src_id, tgt_id)
                        if key not in edge_set:
                            edge_set.add(key)
                            edges.append({
                                'source': src_id,
                                'target': tgt_id,
                                'type': 'structural',
                                'weight': 1.0,
                            })

    # semantic edges from code embeddings
    if len(embeddings) > 1:
        sim_matrix = embeddings @ embeddings.T  # (n, n) cosine similarities
        semantic_edges = []
        for i in range(len(chunks)):
            sims = sim_matrix[i].copy()
            sims[i] = -1  # exclude self
            top_k_idx = np.argsort(sims)[-SEMANTIC_K:][::-1]
            for j in top_k_idx:
                sim = float(sims[j])
                if sim < SEMANTIC_THRESHOLD:
                    continue
                src_id = chunks[i]['id']
                tgt_id = chunks[j]['id']
                key = tuple(sorted([src_id, tgt_id]))
                if key not in edge_set:
                    edge_set.add(key)
                    semantic_edges.append({
                        'source': src_id,
                        'target': tgt_id,
                        'type': 'semantic',
                        'weight': sim,
                    })

        # sort by weight, cap total
        semantic_edges.sort(key=lambda e: e['weight'], reverse=True)
        remaining = MAX_EDGES - len(edges)
        edges.extend(semantic_edges[:max(0, remaining)])

    # cap total edges
    if len(edges) > MAX_EDGES:
        structural = [e for e in edges if e['type'] == 'structural']
        semantic = sorted(
            [e for e in edges if e['type'] == 'semantic'],
            key=lambda e: e['weight'],
            reverse=True
        )
        edges = (structural + semantic)[:MAX_EDGES]

    # language counts
    lang_counts: dict[str, int] = {}
    file_paths_seen = set()
    for chunk in chunks:
        if chunk['file_path'] not in file_paths_seen:
            file_paths_seen.add(chunk['file_path'])
            lang = _get_language(chunk['file_path'])
            lang_counts[lang] = lang_counts.get(lang, 0) + 1

    metadata = {
        'repo': repo,
        'total_files': len(file_paths_seen),
        'total_chunks': len(chunks),
        'languages': lang_counts,
        'open_issues': len(issues),
        'open_prs': len(prs),
        'total_nodes': len(nodes),
        'total_edges': len(edges),
    }

    return {'nodes': nodes, 'edges': edges, 'metadata': metadata}
