# GitGalaxy

Explore any GitHub repository as a navigable 3D semantic galaxy.
Node positions = UMAP projections of code embeddings. Proximity = semantic similarity.

## Setup

### Prerequisites
- Python 3.10+
- Node 18+
- Ollama (optional, for AI explanations): https://ollama.com

### Backend
```bash
cd backend
pip install -r requirements.txt
cp .env.example .env
# Add your GitHub token to .env (optional but recommended)
uvicorn main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Ollama (optional)
```bash
ollama pull qwen2.5-coder:7b
# Then agents will work. Without Ollama, the graph and search still work fine.
```

## First run
The embedding model (~550MB) downloads on first run from HuggingFace.
A small repo (~50 files) takes ~2 minutes to embed on CPU.
Pre-computed repos are cached after first run — subsequent loads are instant.

**Recommended test repo:** `https://github.com/psf/requests` (~50 files, fast to process)

## Architecture
- **Embeddings**: jinaai/jina-embeddings-v2-base-code (local, free, no API key)
- **Layout**: UMAP on 768-dim embeddings → 3D coordinates
- **Search**: FAISS flat index, sub-20ms queries
- **Agents**: qwen2.5-coder:7b via Ollama (local, free) — optional
- **Parsing**: Tree-sitter for function/class boundary detection

## Usage
1. Open `http://localhost:5173`
2. Enter a GitHub URL and click **Launch Galaxy**
3. Orbit/zoom/pan with mouse (left drag, scroll, right drag)
4. Click any node to see its code preview in the right panel
5. Type in the search bar to highlight semantically matching nodes
6. Click **Explain cluster** / **Analyse impact** for AI explanations (requires Ollama)
