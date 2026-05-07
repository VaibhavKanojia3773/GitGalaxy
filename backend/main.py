import asyncio
import os
from contextlib import asynccontextmanager
from typing import Optional

import numpy as np
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv()

from cache import cache
from github_client import GitHubClient
from chunker import CodeChunker
from embedder import Embedder
from graph_builder import build_graph
from agents import AgentService

# ── app state ──────────────────────────────────────────────────────────────
_state: dict = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    _state['agent'] = AgentService()
    _state['github'] = GitHubClient(token=os.getenv('GITHUB_TOKEN'))
    _state['chunker'] = CodeChunker()

    # Pre-load local model only if default provider is local
    default_provider = os.getenv('EMBEDDING_PROVIDER', 'local').lower()
    if default_provider == 'local':
        print('[startup] Pre-loading local embedding model...')
        _state['local_embedder'] = Embedder(provider='local')
    else:
        _state['local_embedder'] = None

    print('[startup] Ready.')
    yield


app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_methods=['*'],
    allow_headers=['*'],
)


# ── request models ─────────────────────────────────────────────────────────
class RepoRequest(BaseModel):
    url: str
    provider: str = 'local'       # 'local' | 'gemini' | 'openai'
    api_key: Optional[str] = ''

class SearchRequest(BaseModel):
    repo: str
    query: str
    provider: str = 'local'
    api_key: Optional[str] = ''

class ClusterRequest(BaseModel):
    node_ids: list[str]
    repo: str

class IssueRequest(BaseModel):
    issue_id: str
    repo: str
    nearby_node_ids: list[str]

class SearchExplainRequest(BaseModel):
    query: str
    result_node_ids: list[str]
    repo: str

class TourRequest(BaseModel):
    repo: str


# ── helpers ────────────────────────────────────────────────────────────────
def _get_embedder(provider: str, api_key: str) -> Embedder:
    provider = provider.lower()
    if provider == 'local':
        if _state.get('local_embedder') is None:
            # lazy-load if not pre-loaded at startup
            _state['local_embedder'] = Embedder(provider='local')
        return _state['local_embedder']
    # API providers: create a lightweight instance (no model download)
    key = api_key or os.getenv('GEMINI_API_KEY' if provider == 'gemini' else 'OPENAI_API_KEY', '')
    return Embedder(provider=provider, api_key=key)

def _get_graph(repo: str) -> dict:
    graph = cache.get(f'graph:{repo}')
    if graph is None:
        raise HTTPException(status_code=404, detail=f'Repo {repo} not processed yet. POST /api/repo first.')
    return graph

def _nodes_by_ids(graph: dict, ids: list[str]) -> list[dict]:
    node_map = {n['id']: n for n in graph['nodes']}
    return [node_map[i] for i in ids if i in node_map]


# ── routes ─────────────────────────────────────────────────────────────────
@app.post('/api/repo')
async def process_repo(req: RepoRequest):
    github: GitHubClient = _state['github']
    chunker: CodeChunker = _state['chunker']

    try:
        owner, repo_name = GitHubClient.parse_repo_url(req.url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    repo_key = f'{owner}/{repo_name}'
    cached = cache.get(f'graph:{repo_key}')
    if cached is not None:
        return {'status': 'cached', 'graph': cached}

    try:
        embedder = _get_embedder(req.provider, req.api_key or '')
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # fetch file tree
    try:
        files = await github.fetch_file_tree(owner, repo_name)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'GitHub API error: {e}')

    # fetch file contents concurrently
    sem = asyncio.Semaphore(20)

    async def fetch_one(path: str) -> tuple[str, str]:
        async with sem:
            content = await github.fetch_file_content(owner, repo_name, path)
            await asyncio.sleep(0.05)
            return path, content

    results = await asyncio.gather(*[fetch_one(f['path']) for f in files], return_exceptions=True)
    contents = {r[0]: r[1] for r in results if isinstance(r, tuple)}

    # fetch issues and PRs
    issues, prs = await asyncio.gather(
        github.fetch_issues(owner, repo_name),
        github.fetch_prs(owner, repo_name),
    )

    # chunk
    chunks = chunker.chunk_repository(files, contents)
    if not chunks:
        raise HTTPException(status_code=500, detail='No code chunks extracted from repository.')

    # embed (offload blocking call to thread so FastAPI stays responsive)
    loop = asyncio.get_event_loop()
    code_embeddings = await loop.run_in_executor(None, embedder.embed_chunks, chunks)

    issue_texts = [f"{i['title']}\n{i['body']}" for i in issues]
    pr_texts = [f"{p['title']}\n{p.get('body', '')}" for p in prs]
    issue_embeddings = await loop.run_in_executor(None, embedder.embed_texts, issue_texts) if issue_texts else np.zeros((0, 768), dtype=np.float32)
    pr_embeddings = await loop.run_in_executor(None, embedder.embed_texts, pr_texts) if pr_texts else np.zeros((0, 768), dtype=np.float32)

    # UMAP on combined embeddings
    all_parts = [code_embeddings]
    if len(issue_embeddings): all_parts.append(issue_embeddings)
    if len(pr_embeddings): all_parts.append(pr_embeddings)
    combined = np.vstack(all_parts)
    combined_coords = await loop.run_in_executor(None, embedder.compute_umap, combined)

    n_code, n_issues = len(chunks), len(issues)
    code_coords = combined_coords[:n_code]
    issue_coords = combined_coords[n_code:n_code + n_issues]
    pr_coords = combined_coords[n_code + n_issues:]

    # FAISS index (code only)
    faiss_index = embedder.build_faiss_index(code_embeddings)
    import faiss as faiss_lib
    cache.set(f'index:{repo_key}', faiss_lib.serialize_index(faiss_index), expire=86400)
    cache.set(f'embeddings:{repo_key}', code_embeddings, expire=86400)
    cache.set(f'chunks:{repo_key}', chunks, expire=86400)
    # remember which provider was used so search uses the same one
    cache.set(f'provider:{repo_key}', {'provider': req.provider, 'api_key': req.api_key or ''}, expire=86400)

    graph = build_graph(
        chunks=chunks, embeddings=code_embeddings, coords_3d=code_coords,
        issues=issues, prs=prs, issue_coords=issue_coords, pr_coords=pr_coords,
        issue_embeddings=issue_embeddings, pr_embeddings=pr_embeddings,
        repo=repo_key, file_contents=contents,
    )
    cache.set(f'graph:{repo_key}', graph, expire=86400)
    return {'status': 'ok', 'graph': graph}


@app.post('/api/search')
async def search(req: SearchRequest):
    import faiss as faiss_lib

    index_buf = cache.get(f'index:{req.repo}')
    code_embeddings = cache.get(f'embeddings:{req.repo}')
    chunks = cache.get(f'chunks:{req.repo}')
    provider_info = cache.get(f'provider:{req.repo}') or {'provider': req.provider, 'api_key': req.api_key or ''}

    if index_buf is None or chunks is None:
        raise HTTPException(status_code=404, detail='Repo not processed. POST /api/repo first.')

    embedder = _get_embedder(provider_info['provider'], provider_info['api_key'])
    faiss_index = faiss_lib.deserialize_index(index_buf)

    loop = asyncio.get_event_loop()
    query_emb_arr = await loop.run_in_executor(None, embedder.embed_texts, [req.query])
    query_emb = query_emb_arr[0]
    distances, indices = embedder.search(query_emb, faiss_index, k=10)

    results = []
    for dist, idx in zip(distances, indices):
        if idx < 0 or idx >= len(chunks):
            continue
        chunk = chunks[idx]
        results.append({'node_id': chunk['id'], 'score': float(dist),
                        'file_path': chunk['file_path'], 'name': chunk['name']})
    return {'results': results}


@app.post('/api/agent/cluster')
async def agent_cluster(req: ClusterRequest):
    agent: AgentService = _state['agent']
    graph = _get_graph(req.repo)
    return {'explanation': agent.explain_cluster(_nodes_by_ids(graph, req.node_ids))}


@app.post('/api/agent/issue')
async def agent_issue(req: IssueRequest):
    agent: AgentService = _state['agent']
    graph = _get_graph(req.repo)
    node_map = {n['id']: n for n in graph['nodes']}
    issue_node = node_map.get(req.issue_id)
    if not issue_node:
        raise HTTPException(status_code=404, detail='Issue node not found.')
    return {'explanation': agent.analyse_issue(issue_node, _nodes_by_ids(graph, req.nearby_node_ids))}


@app.post('/api/agent/search-explain')
async def agent_search_explain(req: SearchExplainRequest):
    agent: AgentService = _state['agent']
    graph = _get_graph(req.repo)
    return {'explanation': agent.explain_search_results(req.query, _nodes_by_ids(graph, req.result_node_ids))}


@app.post('/api/agent/tour')
async def agent_tour(req: TourRequest):
    agent: AgentService = _state['agent']
    graph = _get_graph(req.repo)
    edge_count: dict[str, int] = {}
    for edge in graph['edges']:
        edge_count[edge['source']] = edge_count.get(edge['source'], 0) + 1
        edge_count[edge['target']] = edge_count.get(edge['target'], 0) + 1
    code_nodes = [n for n in graph['nodes'] if n['type'] == 'code']
    top_nodes = sorted(code_nodes, key=lambda n: edge_count.get(n['id'], 0), reverse=True)[:10]
    return {'tour': agent.generate_repo_tour(graph['metadata'], top_nodes)}
