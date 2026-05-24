import asyncio
import json
import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator, Optional

import numpy as np
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

load_dotenv()

from cache import cache
from github_client import GitHubClient
from chunker import CodeChunker
from embedder import Embedder
from graph_builder import build_graph
from agents import AgentService

MAX_FILES = 300
MAX_CHUNKS = 500

# ── app state ──────────────────────────────────────────────────────────────
_state: dict = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    _state['agent'] = AgentService()
    _state['github'] = GitHubClient(token=os.getenv('GITHUB_TOKEN'))
    _state['chunker'] = CodeChunker()

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
    provider: str = 'local'
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

class ChatRequest(BaseModel):
    repo: str
    query: str
    history: list = []


# ── helpers ────────────────────────────────────────────────────────────────
def _get_embedder(provider: str, api_key: str) -> Embedder:
    provider = provider.lower()
    if provider == 'local':
        if _state.get('local_embedder') is None:
            _state['local_embedder'] = Embedder(provider='local')
        return _state['local_embedder']
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

def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


# ── shared pipeline ─────────────────────────────────────────────────────────
async def _run_pipeline(req: RepoRequest, progress_cb=None) -> tuple:
    """
    Runs the full repo-processing pipeline.
    progress_cb is an optional async callable: (stage, message, pct) -> None
    Returns (graph, repo_key, from_cache).
    """
    github: GitHubClient = _state['github']
    chunker: CodeChunker = _state['chunker']

    try:
        owner, repo_name = GitHubClient.parse_repo_url(req.url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    repo_key = f'{owner}/{repo_name}'

    cached = cache.get(f'graph:{repo_key}')
    if cached is not None:
        return cached, repo_key, True

    try:
        embedder = _get_embedder(req.provider, req.api_key or '')
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    async def progress(stage: str, message: str, pct: int):
        if progress_cb:
            await progress_cb(stage, message, pct)

    await progress('fetching', 'Fetching file tree...', 5)

    try:
        files = await github.fetch_file_tree(owner, repo_name)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'GitHub API error: {e}')

    if len(files) > MAX_FILES:
        files = files[:MAX_FILES]

    await progress('fetching', f'Fetching {len(files)} file contents...', 10)

    sem = asyncio.Semaphore(20)

    async def fetch_one(path: str) -> tuple[str, str]:
        async with sem:
            content = await github.fetch_file_content(owner, repo_name, path)
            await asyncio.sleep(0.05)
            return path, content

    results = await asyncio.gather(*[fetch_one(f['path']) for f in files], return_exceptions=True)
    contents = {r[0]: r[1] for r in results if isinstance(r, tuple)}

    await progress('fetching', 'Fetching issues and PRs...', 15)

    issues, prs = await asyncio.gather(
        github.fetch_issues(owner, repo_name),
        github.fetch_prs(owner, repo_name),
    )

    await progress('chunking', 'Parsing and chunking code...', 18)

    chunks = chunker.chunk_repository(files, contents)
    if not chunks:
        raise HTTPException(status_code=500, detail='No code chunks extracted from repository.')

    if len(chunks) > MAX_CHUNKS:
        chunks = chunks[:MAX_CHUNKS]

    # embed in batches of 64 with progress after each batch
    loop = asyncio.get_event_loop()
    BATCH = 64
    all_embeddings = []

    await progress('embedding', f'Embedding 0/{len(chunks)} chunks...', 20)

    for batch_start in range(0, len(chunks), BATCH):
        batch = chunks[batch_start:batch_start + BATCH]
        batch_emb = await loop.run_in_executor(None, embedder.embed_chunks, batch)
        all_embeddings.append(batch_emb)
        done = min(batch_start + BATCH, len(chunks))
        pct = int(20 + done / len(chunks) * 50)
        await progress('embedding', f'Embedding {done}/{len(chunks)} chunks...', pct)

    code_embeddings = np.vstack(all_embeddings).astype(np.float32)

    await progress('embedding', 'Embedding issues and PRs...', 72)

    issue_texts = [f"{i['title']}\n{i['body']}" for i in issues]
    pr_texts = [f"{p['title']}\n{p.get('body', '')}" for p in prs]
    issue_embeddings = (
        await loop.run_in_executor(None, embedder.embed_texts, issue_texts)
        if issue_texts else np.zeros((0, 768), dtype=np.float32)
    )
    pr_embeddings = (
        await loop.run_in_executor(None, embedder.embed_texts, pr_texts)
        if pr_texts else np.zeros((0, 768), dtype=np.float32)
    )

    await progress('umap', 'Running UMAP projection...', 75)

    all_parts = [code_embeddings]
    if len(issue_embeddings): all_parts.append(issue_embeddings)
    if len(pr_embeddings): all_parts.append(pr_embeddings)
    combined = np.vstack(all_parts)
    combined_coords = await loop.run_in_executor(None, embedder.compute_umap, combined)
    cache.set(f'umap_coords:{repo_key}', combined_coords, expire=86400)

    n_code, n_issues = len(chunks), len(issues)
    code_coords = combined_coords[:n_code]
    issue_coords = combined_coords[n_code:n_code + n_issues]
    pr_coords = combined_coords[n_code + n_issues:]

    await progress('indexing', 'Building search index...', 88)

    faiss_index = embedder.build_faiss_index(code_embeddings)
    import faiss as faiss_lib
    cache.set(f'index:{repo_key}', faiss_lib.serialize_index(faiss_index), expire=86400)
    cache.set(f'embeddings:{repo_key}', code_embeddings, expire=86400)
    cache.set(f'chunks:{repo_key}', chunks, expire=86400)
    cache.set(f'provider:{repo_key}', {'provider': req.provider, 'api_key': req.api_key or ''}, expire=86400)

    await progress('building', 'Building graph...', 93)

    graph = build_graph(
        chunks=chunks, embeddings=code_embeddings, coords_3d=code_coords,
        issues=issues, prs=prs, issue_coords=issue_coords, pr_coords=pr_coords,
        issue_embeddings=issue_embeddings, pr_embeddings=pr_embeddings,
        repo=repo_key, file_contents=contents,
        faiss_index=faiss_index,
    )
    cache.set(f'graph:{repo_key}', graph, expire=86400)
    return graph, repo_key, False


# ── routes ─────────────────────────────────────────────────────────────────
@app.post('/api/repo')
async def process_repo(req: RepoRequest):
    graph, repo_key, from_cache = await _run_pipeline(req)
    return {'status': 'cached' if from_cache else 'ok', 'graph': graph}


@app.post('/api/repo/stream')
async def stream_repo(req: RepoRequest):
    queue: asyncio.Queue = asyncio.Queue()

    async def progress_cb(stage: str, message: str, pct: int):
        await queue.put(('progress', {'stage': stage, 'message': message, 'pct': pct}))

    async def _task():
        try:
            graph, _, from_cache = await _run_pipeline(req, progress_cb=progress_cb)
            await queue.put(('done', {'graph': graph}))
        except HTTPException as e:
            await queue.put(('error', {'detail': e.detail}))
        except Exception as e:
            await queue.put(('error', {'detail': str(e)}))

    task = asyncio.create_task(_task())

    async def event_gen() -> AsyncGenerator[str, None]:
        try:
            while True:
                try:
                    event, data = await asyncio.wait_for(queue.get(), timeout=300)
                except asyncio.TimeoutError:
                    yield _sse('error', {'detail': 'Pipeline timed out after 5 minutes'})
                    break
                yield _sse(event, data)
                if event in ('done', 'error'):
                    break
        finally:
            if not task.done():
                task.cancel()

    return StreamingResponse(
        event_gen(),
        media_type='text/event-stream',
        headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'},
    )


@app.post('/api/search')
async def search(req: SearchRequest):
    import faiss as faiss_lib

    index_buf = cache.get(f'index:{req.repo}')
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


@app.post('/api/chat')
async def chat(req: ChatRequest):
    import faiss as faiss_lib
    from chat import ChatEngine

    graph = _get_graph(req.repo)
    chunks = cache.get(f'chunks:{req.repo}')
    index_buf = cache.get(f'index:{req.repo}')
    provider_info = cache.get(f'provider:{req.repo}') or {}

    if chunks is None:
        raise HTTPException(status_code=404, detail='Repo not processed. POST /api/repo first.')

    faiss_index = faiss_lib.deserialize_index(index_buf) if index_buf else None
    embedder = _get_embedder(provider_info.get('provider', 'local'), provider_info.get('api_key', ''))

    engine = ChatEngine(
        graph=graph,
        chunks=chunks,
        faiss_index=faiss_index,
        embedder=embedder,
        groq_key=os.getenv('GROQ_API_KEY', ''),
    )
    return engine.query(req.query, req.history)


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
