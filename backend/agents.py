class AgentService:
    def __init__(self, model: str = 'qwen2.5-coder:7b'):
        self.model = model
        self.available = False
        try:
            import ollama
            self._ollama = ollama
            ollama.list()
            self.available = True
            print(f'[agents] Ollama available, model: {model}')
        except Exception as e:
            print(f'[agents] Ollama not available: {e}')
            print('[agents] Graph and search will still work. Start Ollama for AI explanations.')

    def _call(self, prompt: str) -> str:
        if not self.available:
            return 'Agent not available — start Ollama with: ollama run qwen2.5-coder:7b'
        try:
            resp = self._ollama.chat(
                model=self.model,
                messages=[{'role': 'user', 'content': prompt}]
            )
            return resp['message']['content']
        except Exception as e:
            return f'Agent error: {e}'

    def explain_cluster(self, node_previews: list[dict]) -> str:
        files_text = '\n'.join(
            f"--- {n.get('name', '?')} ({n.get('file_path', '?')})\n{n.get('content_preview', '')}\n"
            for n in node_previews
        )
        prompt = f"""You are analysing a cluster of related code files from a software repository.
These files were grouped together by semantic similarity in their embeddings.

Files in this cluster:
{files_text}

In 2-3 sentences, explain:
1. What does this cluster of code do?
2. Why do these files belong together semantically?
Keep it concise and technical."""
        return self._call(prompt)

    def analyse_issue(self, issue: dict, nearby_files: list[dict]) -> str:
        files_text = '\n'.join(
            f"--- {n.get('name', '?')} ({n.get('file_path', '?')})\n{n.get('content_preview', '')}\n"
            for n in nearby_files
        )
        prompt = f"""You are a senior engineer analysing a GitHub issue and its related code.

ISSUE #{issue.get('number', '?')}: {issue.get('title', '')}
{issue.get('body', '')}

SEMANTICALLY RELATED FILES:
{files_text}

In 2-3 sentences:
1. Which specific file(s) or function(s) does this issue most likely affect?
2. What is the likely root cause based on the code?
Be specific about file names and function names."""
        return self._call(prompt)

    def explain_search_results(self, query: str, results: list[dict]) -> str:
        results_text = '\n'.join(
            f"--- {n.get('name', '?')} ({n.get('file_path', '?')})\n{n.get('content_preview', '')}\n"
            for n in results
        )
        prompt = f"""A developer searched a codebase for: "{query}"

TOP MATCHING CODE:
{results_text}

In one sentence per result, explain WHY each result matches the search query.
Format: "• {{name}}: [reason]" """
        return self._call(prompt)

    def generate_repo_tour(self, metadata: dict, top_nodes: list[dict]) -> str:
        nodes_text = '\n'.join(
            f"- {n.get('name', '?')} ({n.get('file_path', '?')})"
            for n in top_nodes
        )
        langs = ', '.join(f'{k} ({v})' for k, v in metadata.get('languages', {}).items())
        prompt = f"""You are giving a new developer their first tour of a codebase.

REPOSITORY: {metadata.get('repo', '?')}
LANGUAGES: {langs}
FILES: {metadata.get('total_files', 0)}, CHUNKS: {metadata.get('total_chunks', 0)}, OPEN ISSUES: {metadata.get('open_issues', 0)}

MOST CONNECTED FILES (by number of relationships):
{nodes_text}

In 3-4 sentences, give a helpful onboarding overview:
1. What does this codebase appear to do?
2. Where should a new developer start?
3. What are the most important areas?"""
        return self._call(prompt)
