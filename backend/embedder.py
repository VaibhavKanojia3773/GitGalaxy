import numpy as np
import faiss


class Embedder:
    def __init__(self):
        from sentence_transformers import SentenceTransformer
        # Pinned to a specific commit to avoid re-downloading unreviewed code.
        # Revision: main branch as of 2024-01 — change only after manual review.
        self.model = SentenceTransformer(
            'jinaai/jina-embeddings-v2-base-code',
            trust_remote_code=True,
            revision='b52ee6b781bfe3e0a25c4b99de15494ecb8a7aea',
        )
        print('Embedding model loaded.')

    def embed_chunks(self, chunks: list[dict]) -> np.ndarray:
        texts = [
            f"File: {c['file_path']}\n\n{c['content']}"
            for c in chunks
        ]
        return self.model.encode(
            texts,
            batch_size=32,
            show_progress_bar=True,
            normalize_embeddings=True,
        )

    def embed_texts(self, texts: list[str]) -> np.ndarray:
        if not texts:
            return np.zeros((0, 768), dtype=np.float32)
        return self.model.encode(
            texts,
            batch_size=32,
            show_progress_bar=False,
            normalize_embeddings=True,
        )

    def compute_umap(self, embeddings: np.ndarray) -> np.ndarray:
        import umap
        print(f'Running UMAP on {len(embeddings)} embeddings...')
        reducer = umap.UMAP(
            n_components=3,
            n_neighbors=15,
            min_dist=0.08,
            metric='cosine',
            random_state=42,
        )
        coords = reducer.fit_transform(embeddings)
        print('UMAP done.')
        return (coords * 15).astype(np.float32)

    def build_faiss_index(self, embeddings: np.ndarray) -> faiss.Index:
        dim = embeddings.shape[1]
        index = faiss.IndexFlatIP(dim)
        index.add(embeddings.astype(np.float32))
        return index

    def search(self, query_embedding: np.ndarray, index: faiss.Index, k: int = 10):
        q = query_embedding.reshape(1, -1).astype(np.float32)
        distances, indices = index.search(q, k)
        return distances[0], indices[0]
