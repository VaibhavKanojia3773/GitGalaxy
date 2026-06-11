# GitGalaxy — System Spec & Product Vision

> Paste a GitHub URL → explore the repository as a living 3D galaxy, and talk to it.

---

## 1. Vision

GitGalaxy turns any public GitHub repository into a navigable 3D galaxy: files become
planets, functions and classes become moons, issues and pull requests orbit as glowing
satellites, and semantic similarity draws constellations between related code. A hybrid
search engine and an AI chatbot let you ask the repo questions and fly straight to the
answer.

### Design pillars

| Pillar | What it means in practice |
|---|---|
| **Smoothness** | 60 fps target. Instanced meshes (one draw call per node type), GLSL shader-driven visuals, damped camera motion, no per-node React overhead. |
| **Speed** | First load of a typical repo (~50–100 files) in under ~2 minutes; cached revisits feel instant. SSE progress streaming so the user is never staring at a dead screen. |
| **Modern aesthetic** | Awwwards-3D-site inspired: dark space palette, indigo/purple gradients, glassmorphism panels, bloom postprocessing, confident typography, micro-interactions. |
| **Useful context over completeness** | File / group-of-files granularity in the galaxy. Function-level detail exists but is revealed *on demand* (expand a planet to see its moons) — never 500 nodes of noise at once. |
| **Free-first** | Works fully offline with zero API keys (local embeddings, rule-based chat). Hosted providers (Groq, Voyage, Gemini, OpenAI) are optional upgrades, all with free tiers. |

---

## 2. Current Architecture (as-built)

### Backend — FastAPI (`backend/`)

Pipeline (streamed over SSE at `/api/repo/stream`):

```
GitHub URL
  → shallow clone (gitpython, depth=1, single branch; raw.githubusercontent fallback)
  → tree-sitter chunking (python/js/ts/tsx/java/go; whole-file fallback)
      caps: MAX_FILES=300, MAX_CHUNKS=500
  → embeddings (default: local BAAI/bge-base-en-v1.5, 768-dim)
  → UMAP 3D projection (n_neighbors=5, min_dist=0.1, cosine, ×15 scale)
  → FAISS IndexFlatIP (semantic search + O(n log n) semantic edges, MAX_EDGES=3000)
  → graph_builder (file planets, function/class moons, issue/PR nodes, edges)
  → diskcache persistence
```

| Module | Responsibility |
|---|---|
| `main.py` | FastAPI app, SSE pipeline orchestration, `/api/search`, `/api/chat`, `/api/agent/*` |
| `github_client.py` | Clone / file fetch, issues & PRs via REST v3 (httpx), optional `GITHUB_TOKEN` |
| `chunker.py` | tree-sitter function/class extraction with whole-file fallback |
| `embedder.py` | sentence-transformers local model + Gemini/OpenAI providers, UMAP, FAISS |
| `graph_builder.py` | Node/edge construction, language colors, planet sizing |
| `chat.py` | `ChatEngine`: rule-based fast paths + BM25+FAISS RRF hybrid search + Groq fallback |
| `agents.py` | Ollama `qwen2.5-coder:7b` agentic explains (cluster/issue/search/tour), graceful fallback |
| `cache.py` | diskcache wrapper (`backend/.cache/`) |

### Frontend — React + R3F + Zustand (`frontend/`)

| Component | Responsibility |
|---|---|
| `App.jsx` | Status state machine: idle → loading → ready / error (with backend-down detection) |
| `RepoInput.jsx` | Landing page, URL input, provider setup |
| `LoadingOverlay.jsx` | Glass overlay + staged progress bar over the live galaxy |
| `Scene.jsx` | Canvas, galaxy particles, nebula, core glow, bloom, OrbitControls |
| `Nodes.jsx` | InstancedMesh planets w/ GLSL surface shaders (5 biomes), burst moons, issue/PR nodes |
| `Edges.jsx` | Structural arcs + animated semantic arcs (file-planet level) |
| `SearchBar.jsx` / `NodePanel.jsx` / `Legend.jsx` / `ChatPanel.jsx` | HUD layer |
| `store.js` | Zustand: graph, selection, expansion, highlights, chat history, repo status |

### Granularity model (important)

Nodes are produced per-chunk (function/class/file) in the backend, **but the galaxy
renders file-planets as the primary unit** (top files by chunk count). Function/class
moons exist only inside an expanded planet (click to burst out). This is the deliberate
"file and group of files" philosophy — keep it. Semantic edges aggregate to planet level.

---

## 3. Caching & Performance

### Current
- diskcache at `backend/.cache/` — graph, chunks, embeddings, FAISS index cached per repo
  (24 h for pipeline artifacts; shorter for issues/PRs which go stale faster).
- Embedding model loaded once at startup (~550 MB first download, then instant).

### Planned improvements
- **Commit-SHA cache busting**: key caches on `repo@HEAD-sha` (one cheap API call) so an
  unchanged repo is a 100 % cache hit and a pushed repo invalidates automatically.
- **Cache management endpoint**: `DELETE /api/cache/{owner}/{repo}` for manual refresh.
- **Frontend**: keep instanced rendering; avoid re-mounting Canvas between repos
  (multi-repo support should swap graph data, not the WebGL context).

---

## 4. 3D Visual Spec

- **Galaxy backdrop**: spiral particle field (~12k points), nebula sprites, core glow,
  bloom postprocessing. Always visible — even while loading and on the landing page.
- **File planets**: GLSL shader spheres, 5 surface biomes keyed by language color
  (gas giant / desert / ice / lava / ocean), fbm terrain, day-night terminator, clouds
  on gas/ocean types, lava self-glow, atmosphere halos (faint always, bright when
  expanded), rings on the largest planets.
- **Moons**: functions (small, cratered) and classes (slightly larger), hidden until
  parent planet expands with a burst animation; orbit the planet.
- **Issues / PRs**: pulsing red-amber / green satellites near the galaxy core.
- **Edges**: structural (import) solid arcs; semantic (similarity) animated dashed arcs.
- **Camera**: OrbitControls + **damped fly-to** (~0.6 s ease) on click / search result /
  chat highlight; gentle idle auto-rotation.
- **Micro-interactions**: hover tooltips (glass card: path, language, size), planet idle
  bob/rotation, highlight glow pulse.

### UI / UX language (Awwwards-inspired)
- Dark space palette `#020617` base + indigo→purple gradient accents.
- Glassmorphism everywhere consistent: `backdrop-filter: blur`, 4–8 % white borders.
- Large gradient display headline on landing; monospace for paths/code.
- Transitions only: subtle vignette/dissolve when the galaxy reveals after loading.
- Accessibility: motion kept subtle; heavy effects on landing page only.

---

## 5. Product Feature Set

### Landing
- Full-bleed animated starfield behind a centered hero: gradient headline, one URL
  input, example-repo chips (`psf/requests`, `pallets/flask`), provider setup as a
  collapsible advanced panel.

### Loading
- Galaxy visible behind glass overlay; staged progress ("Cloning… Parsing 142 files…
  Embedding… Building galaxy…") streamed via SSE; smooth reveal on completion.

### Galaxy view
- **Repo header bar** (glass pill, top): repo name, ⭐ stars, forks, license, last
  updated, byte-accurate language breakdown bar — all from free GitHub endpoints.
- Planets/moons/issues/PRs as above; click planet → burst moons + NodePanel;
  click moon → NodePanel with the function/class source.
- Search bar: hybrid BM25+FAISS suggestions; selecting a result highlights + flies.
- Legend, node panel with code preview and "open on GitHub" link.

### Chat
- Bottom glass drawer. Rule-based instant answers (stats, issues, PRs, biggest files,
  structure, functions-in-file) + hybrid retrieval + Groq LLM fallback grounded in repo
  summary and top-4 retrieved chunks.
- Answers that reference nodes highlight them and offer fly-to.
- Suggested prompt chips when the conversation is empty.

---

## 6. Tooling Evaluation (open-source / free-tier)

### Embeddings

| Option | Type | Cost | Notes |
|---|---|---|---|
| **BAAI/bge-base-en-v1.5** *(current default)* | local, 768d | free forever, no key | Solid general code+text retrieval, zero setup, offline. **Keep as default.** |
| jinaai/jina-embeddings-v2-base-code | local, 768d | free | Code-specialized, 8k context. Drop-in swap in `embedder.py` for better code retrieval. |
| **Voyage AI** `voyage-code-3` / `voyage-3-lite` | hosted | **200M free tokens** (3-lite) | Code-tuned, top-tier retrieval quality, generous free tier. **Add as a 4th provider option** alongside Gemini/OpenAI. |
| Gemini `text-embedding-004` *(supported)* | hosted | free tier | Already wired in ProviderSetup. |
| OpenAI `text-embedding-3-small` *(supported)* | hosted | paid | Already wired in ProviderSetup. |

### Search & retrieval
- **FAISS IndexFlatIP** *(current)* — exact search, perfect at ≤500 chunks. Keep.
  (hnswlib only worth it if chunk caps are ever lifted 10×.)
- **rank-bm25** *(current)* — simple, effective sparse signal for RRF fusion. Keep.

### LLMs
- **Groq `llama-3.1-8b-instant`** *(current)* — free tier, very fast. Keep as default;
  consider a "smarter" toggle to `llama-3.3-70b-versatile` (also free tier).
- **Ollama `qwen2.5-coder:7b`** *(current)* — local, optional, code-focused; powers the
  agent explains. Graceful no-op when absent. Keep.

### Free GitHub context enrichment (no token needed; 5000 req/hr with optional token)

All one cheap REST call each, cacheable 24 h, zero new dependencies (httpx present):

| Endpoint | Gives us | Used for |
|---|---|---|
| `/repos/{owner}/{repo}` | stars, forks, watchers, license, topics, description, default branch, pushed_at | Repo header bar |
| `/repos/{owner}/{repo}/languages` | byte-weighted language breakdown | Accurate language bar (better than extension guessing) |
| `/repos/{owner}/{repo}/contributors` | top contributors + avatars | Contributor ring near galaxy core (future) |
| `/repos/{owner}/{repo}/commits?per_page=10` | recent activity | Freshness indicator |
| `/repos/{owner}/{repo}/releases/latest` | latest version | Version badge |

---

## 7. Roadmap

**Now (this phase)**
1. Repo header bar: backend repo-metadata fetch + glass header UI.
2. Smooth camera fly-to on planet/moon click, search select, chat highlight.
3. Moon click → NodePanel (currently only planets are clickable into the panel).
4. Chat suggested-prompt chips; clickable file references that fly the camera.
5. Landing hero polish (starfield behind input, example chips).

**Next**
- Voyage AI as an embedding provider option in ProviderSetup.
- Commit-SHA cache keys + cache invalidation endpoint.
- Contributor ring, hover tooltips, orbit-path rings, highlight glow pulse.
- Multi-repo support without Canvas remount.

**Later**
- Repo "guided tour" mode (camera path through the most-connected planets, narrated by the agent).
- Diff galaxies (compare two branches/releases).
- Shareable permalink state (camera + selection in URL).
