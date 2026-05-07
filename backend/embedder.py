import numpy as np

# Supported providers: "local", "gemini", "openai"


class Embedder:
    def __init__(self, provider: str = "local", api_key: str = ""):
        self.provider = provider.lower()
        self.api_key = api_key
        self._model = None

        if self.provider == "local":
            self._load_local_model()
        elif self.provider not in ("gemini", "openai"):
            raise ValueError(f"Unknown provider: {provider}. Choose local, gemini, or openai.")

    def _load_local_model(self):
        from sentence_transformers import SentenceTransformer
        print("[embedder] Loading local model (jinaai/jina-embeddings-v2-base-code)...")
        self._model = SentenceTransformer(
            "jinaai/jina-embeddings-v2-base-code",
            trust_remote_code=True,
            revision="b52ee6b781bfe3e0a25c4b99de15494ecb8a7aea",
        )
        print("[embedder] Local model loaded.")

    # ── public API ──────────────────────────────────────────────────────────

    def embed_chunks(self, chunks: list[dict]) -> np.ndarray:
        texts = [
            f"File: {c['file_path']}\n\n{c['content']}"
            for c in chunks
        ]
        return self.embed_texts(texts)

    def embed_texts(self, texts: list[str]) -> np.ndarray:
        if not texts:
            return np.zeros((0, self._dim()), dtype=np.float32)
        if self.provider == "local":
            return self._encode_local(texts)
        if self.provider == "gemini":
            return self._encode_gemini(texts)
        if self.provider == "openai":
            return self._encode_openai(texts)

    def compute_umap(self, embeddings: np.ndarray) -> np.ndarray:
        import umap
        print(f"[embedder] Running UMAP on {len(embeddings)} embeddings...")
        reducer = umap.UMAP(
            n_components=3,
            n_neighbors=15,
            min_dist=0.08,
            metric="cosine",
            random_state=42,
        )
        coords = reducer.fit_transform(embeddings)
        print("[embedder] UMAP done.")
        return (coords * 15).astype(np.float32)

    def build_faiss_index(self, embeddings: np.ndarray):
        import faiss
        dim = embeddings.shape[1]
        index = faiss.IndexFlatIP(dim)
        index.add(embeddings.astype(np.float32))
        return index

    def search(self, query_embedding: np.ndarray, index, k: int = 10):
        q = query_embedding.reshape(1, -1).astype(np.float32)
        distances, indices = index.search(q, k)
        return distances[0], indices[0]

    # ── private helpers ─────────────────────────────────────────────────────

    def _dim(self) -> int:
        return 768  # all three providers use 768-dim

    def _encode_local(self, texts: list[str]) -> np.ndarray:
        return self._model.encode(
            texts,
            batch_size=32,
            show_progress_bar=True,
            normalize_embeddings=True,
        ).astype(np.float32)

    def _encode_gemini(self, texts: list[str]) -> np.ndarray:
        import httpx, time
        if not self.api_key:
            raise ValueError("Gemini API key is required. Set GEMINI_API_KEY in .env or enter it in the UI.")

        url = "https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:batchEmbedContents"
        headers = {"Content-Type": "application/json", "x-goog-api-key": self.api_key}

        # Gemini batchEmbedContents accepts up to 100 items per call
        BATCH = 100
        all_embeddings = []

        for i in range(0, len(texts), BATCH):
            batch = texts[i:i + BATCH]
            payload = {
                "requests": [
                    {"model": "models/text-embedding-004", "content": {"parts": [{"text": t}]}}
                    for t in batch
                ]
            }
            for attempt in range(3):
                resp = httpx.post(url, json=payload, headers=headers, timeout=60)
                if resp.status_code == 429:
                    time.sleep(2 ** attempt)
                    continue
                resp.raise_for_status()
                break

            data = resp.json()
            for emb_obj in data["embeddings"]:
                all_embeddings.append(emb_obj["values"])

            print(f"[embedder] Gemini: {min(i + BATCH, len(texts))}/{len(texts)} embedded")

        arr = np.array(all_embeddings, dtype=np.float32)
        # normalize for cosine similarity
        norms = np.linalg.norm(arr, axis=1, keepdims=True)
        return arr / np.maximum(norms, 1e-9)

    def _encode_openai(self, texts: list[str]) -> np.ndarray:
        import httpx, time
        if not self.api_key:
            raise ValueError("OpenAI API key is required. Set OPENAI_API_KEY in .env or enter it in the UI.")

        url = "https://api.openai.com/v1/embeddings"
        headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}

        # OpenAI accepts up to 2048 inputs but keep batches small to stay within token limits
        BATCH = 200
        all_embeddings = []

        for i in range(0, len(texts), BATCH):
            batch = texts[i:i + BATCH]
            payload = {"model": "text-embedding-3-small", "input": batch, "dimensions": 768}
            for attempt in range(3):
                resp = httpx.post(url, json=payload, headers=headers, timeout=60)
                if resp.status_code == 429:
                    time.sleep(2 ** attempt)
                    continue
                resp.raise_for_status()
                break

            for item in sorted(resp.json()["data"], key=lambda x: x["index"]):
                all_embeddings.append(item["embedding"])

            print(f"[embedder] OpenAI: {min(i + BATCH, len(texts))}/{len(texts)} embedded")

        arr = np.array(all_embeddings, dtype=np.float32)
        norms = np.linalg.norm(arr, axis=1, keepdims=True)
        return arr / np.maximum(norms, 1e-9)
