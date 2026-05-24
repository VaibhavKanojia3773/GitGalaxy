import re
from collections import defaultdict


class ChatEngine:
    """
    Rule-based chat engine for answering questions about a repository.
    Falls back to Groq llama-3.1-8b-instant for unmatched queries.
    """

    def __init__(self, graph: dict, chunks: list, faiss_index, embedder, groq_key: str = ''):
        self.graph = graph
        self.chunks = chunks
        self.faiss_index = faiss_index
        self.embedder = embedder
        self.groq_key = groq_key
        self.metadata = graph.get('metadata', {})
        self.nodes = graph.get('nodes', [])

        # keyword index: word → list of chunk indices
        self._kw_index: dict[str, list[int]] = defaultdict(list)
        for i, chunk in enumerate(chunks):
            text = (chunk.get('file_path', '') + ' ' + chunk.get('name', '') + ' ' + chunk.get('content', '')).lower()
            for word in re.findall(r'\w+', text):
                if len(word) >= 3:
                    self._kw_index[word].append(i)

        # file path index: path → list of chunk indices
        self._file_index: dict[str, list[int]] = defaultdict(list)
        for i, chunk in enumerate(chunks):
            self._file_index[chunk.get('file_path', '')].append(i)

    # ── public ─────────────────────────────────────────────────────────────

    def query(self, q: str, history: list = []) -> dict:
        q_lower = q.lower().strip()

        # 1. stats / overview
        if re.search(r'\b(stat|overview|summary|languages?|how many files|total)\b', q_lower):
            return self._stats_answer()

        # 2. issues
        if re.search(r'\b(issues?)\b', q_lower) and not re.search(r'\b(pull|pr)\b', q_lower):
            return self._issues_answer()

        # 3. pull requests / PRs
        if re.search(r'\b(pull requests?|prs?)\b', q_lower):
            return self._prs_answer()

        # 4. biggest / largest files
        if re.search(r'\b(biggest|largest|longest|most lines)\b', q_lower):
            return self._biggest_answer()

        # 5. functions in <file>
        m = re.search(r'\bfunctions?\s+in\s+([\w./\\-]+)', q_lower)
        if m:
            return self._chunks_in_file(m.group(1), 'function')

        # 6. classes in <file>
        m = re.search(r'\bclasses?\s+in\s+([\w./\\-]+)', q_lower)
        if m:
            return self._chunks_in_file(m.group(1), 'class')

        # 7. structure / architecture
        if re.search(r'\b(structure|architecture|layout|organiz)\b', q_lower):
            return self._structure_answer()

        # 8. how many files use <term>
        m = re.search(r'\bhow many files?\s+(?:use|import|contain)\s+(\w+)', q_lower)
        if m:
            return self._usage_count(m.group(1))

        # 9. find / where / show / search — semantic + keyword
        if re.search(r'\b(find|where|show|search|locate|look for)\b', q_lower):
            return self._semantic_search(q)

        # 10. Groq fallback for open-ended questions
        return self._groq_fallback(q, history)

    # ── rule handlers ───────────────────────────────────────────────────────

    def _stats_answer(self) -> dict:
        m = self.metadata
        langs = m.get('languages', {})
        lang_str = ', '.join(f'{k} ({v})' for k, v in sorted(langs.items(), key=lambda x: -x[1]))
        answer = (
            f"**{m.get('repo', 'This repo')}** has:\n"
            f"- {m.get('total_files', '?')} files, {m.get('total_chunks', '?')} code chunks\n"
            f"- {m.get('open_issues', 0)} open issues, {m.get('open_prs', 0)} open PRs\n"
            f"- Languages: {lang_str or 'unknown'}\n"
            f"- {m.get('total_nodes', '?')} graph nodes, {m.get('total_edges', '?')} edges"
        )
        return {'answer': answer, 'node_ids': [], 'action': 'none'}

    def _issues_answer(self) -> dict:
        issue_nodes = [n for n in self.nodes if n.get('type') == 'issue']
        if not issue_nodes:
            return {'answer': 'No open issues found in this repository.', 'node_ids': [], 'action': 'none'}
        ids = [n['id'] for n in issue_nodes]
        titles = '\n'.join(f"- #{n['number']}: {n['title']}" for n in issue_nodes[:10])
        answer = f"Found **{len(issue_nodes)}** open issues:\n{titles}"
        if len(issue_nodes) > 10:
            answer += f'\n...and {len(issue_nodes) - 10} more'
        return {'answer': answer, 'node_ids': ids, 'action': 'highlight'}

    def _prs_answer(self) -> dict:
        pr_nodes = [n for n in self.nodes if n.get('type') == 'pr']
        if not pr_nodes:
            return {'answer': 'No open pull requests found in this repository.', 'node_ids': [], 'action': 'none'}
        ids = [n['id'] for n in pr_nodes]
        titles = '\n'.join(f"- #{n['number']}: {n['title']}" for n in pr_nodes[:10])
        answer = f"Found **{len(pr_nodes)}** open PRs:\n{titles}"
        if len(pr_nodes) > 10:
            answer += f'\n...and {len(pr_nodes) - 10} more'
        return {'answer': answer, 'node_ids': ids, 'action': 'highlight'}

    def _biggest_answer(self) -> dict:
        if not self.chunks:
            return {'answer': 'No chunks available.', 'node_ids': [], 'action': 'none'}
        top = sorted(self.chunks, key=lambda c: len(c.get('content', '')), reverse=True)[:5]
        lines = '\n'.join(f"- `{c['file_path']}` — {len(c.get('content',''))} chars" for c in top)
        ids = [c['id'] for c in top]
        return {
            'answer': f'Largest code chunks:\n{lines}',
            'node_ids': ids,
            'action': 'fly',
        }

    def _chunks_in_file(self, filename: str, chunk_type: str) -> dict:
        matches = []
        for path, indices in self._file_index.items():
            if filename.lower() in path.lower():
                for i in indices:
                    c = self.chunks[i]
                    if c.get('type') == chunk_type:
                        matches.append(c)
        if not matches:
            return {
                'answer': f'No {chunk_type}s found in files matching `{filename}`.',
                'node_ids': [],
                'action': 'none',
            }
        lines = '\n'.join(f"- `{c['name']}` in {c['file_path']}" for c in matches[:15])
        ids = [c['id'] for c in matches]
        return {
            'answer': f'Found **{len(matches)}** {chunk_type}{"s" if len(matches) != 1 else ""}:\n{lines}',
            'node_ids': ids,
            'action': 'highlight',
        }

    def _structure_answer(self) -> dict:
        m = self.metadata
        # top connected nodes by edge degree
        edge_count: dict[str, int] = {}
        for edge in self.graph.get('edges', []):
            edge_count[edge['source']] = edge_count.get(edge['source'], 0) + 1
            edge_count[edge['target']] = edge_count.get(edge['target'], 0) + 1
        code_nodes = [n for n in self.nodes if n.get('type') == 'code']
        top = sorted(code_nodes, key=lambda n: edge_count.get(n['id'], 0), reverse=True)[:8]
        lines = '\n'.join(f"- `{n['file_path']}` ({edge_count.get(n['id'], 0)} connections)" for n in top)
        langs = ', '.join(m.get('languages', {}).keys())
        answer = (
            f"**Repository structure** — {m.get('total_files', '?')} files in {langs}.\n\n"
            f"Most connected files (likely core modules):\n{lines}"
        )
        return {'answer': answer, 'node_ids': [n['id'] for n in top], 'action': 'highlight'}

    def _usage_count(self, term: str) -> dict:
        indices = self._kw_index.get(term.lower(), [])
        files = {self.chunks[i]['file_path'] for i in indices}
        return {
            'answer': f'**{len(files)}** file(s) reference `{term}`.',
            'node_ids': [self.chunks[i]['id'] for i in indices[:10]],
            'action': 'highlight',
        }

    def _semantic_search(self, query: str) -> dict:
        # keyword pass
        words = [w for w in re.findall(r'\w+', query.lower()) if len(w) >= 3]
        kw_hits: dict[int, int] = {}
        for w in words:
            for idx in self._kw_index.get(w, []):
                kw_hits[idx] = kw_hits.get(idx, 0) + 1

        # FAISS semantic pass
        faiss_hits: list[int] = []
        if self.faiss_index is not None:
            try:
                emb = self.embedder.embed_texts([query])[0]
                _, indices = self.embedder.search(emb, self.faiss_index, k=8)
                faiss_hits = [int(i) for i in indices if 0 <= int(i) < len(self.chunks)]
            except Exception:
                pass

        # merge: semantic results first, then keyword
        seen: set[int] = set()
        merged: list[int] = []
        for i in faiss_hits:
            if i not in seen:
                seen.add(i)
                merged.append(i)
        for i in sorted(kw_hits, key=lambda x: -kw_hits[x]):
            if i not in seen:
                seen.add(i)
                merged.append(i)

        top = merged[:5]
        if not top:
            return {
                'answer': f'No results found for "{query}".',
                'node_ids': [],
                'action': 'none',
            }
        lines = '\n'.join(f"- `{self.chunks[i]['name']}` in `{self.chunks[i]['file_path']}`" for i in top)
        ids = [self.chunks[i]['id'] for i in top]
        return {
            'answer': f'Top results for **"{query}"**:\n{lines}',
            'node_ids': ids,
            'action': 'fly',
        }

    def _groq_fallback(self, query: str, history: list) -> dict:
        if not self.groq_key:
            return {
                'answer': (
                    "I can answer questions like:\n"
                    "- *\"where is authentication\"* — finds relevant code\n"
                    "- *\"functions in models.py\"* — lists functions in a file\n"
                    "- *\"show me the biggest file\"*\n"
                    "- *\"languages\"* or *\"stats\"*\n\n"
                    "For open-ended questions, add a `GROQ_API_KEY` to `.env` for AI answers."
                ),
                'node_ids': [],
                'action': 'none',
            }

        try:
            return self._call_groq(query, history)
        except ImportError:
            return {
                'answer': 'Groq package not installed. Run `pip install groq` to enable AI answers.',
                'node_ids': [],
                'action': 'none',
            }
        except Exception as e:
            return {
                'answer': f'AI answer unavailable: {e}',
                'node_ids': [],
                'action': 'none',
            }

    def _call_groq(self, query: str, history: list) -> dict:
        from groq import Groq

        client = Groq(api_key=self.groq_key)
        m = self.metadata

        system = (
            f"You are a helpful code assistant for the GitHub repository '{m.get('repo', 'unknown')}'.\n"
            f"It has {m.get('total_files', '?')} files and {m.get('total_chunks', '?')} code chunks. "
            f"Languages: {', '.join(m.get('languages', {}).keys())}. "
            f"Give concise, factual answers in markdown. Max 3 paragraphs."
        )

        messages = [{'role': 'system', 'content': system}]
        for turn in history[-6:]:
            if isinstance(turn, dict) and 'role' in turn and 'content' in turn:
                messages.append({'role': turn['role'], 'content': turn['content']})
        messages.append({'role': 'user', 'content': query})

        resp = client.chat.completions.create(
            model='llama-3.1-8b-instant',
            messages=messages,
            max_tokens=512,
            temperature=0.3,
        )
        answer = resp.choices[0].message.content.strip()
        return {'answer': answer, 'node_ids': [], 'action': 'none'}
