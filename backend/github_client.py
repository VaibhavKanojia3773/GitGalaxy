import base64
import re
from typing import Optional
import httpx
from cache import cache

ALLOWED_EXTENSIONS = {
    '.py', '.js', '.ts', '.tsx', '.jsx', '.java', '.go',
    '.cpp', '.c', '.h', '.cs', '.rb', '.rs', '.php', '.md'
}
EXCLUDED_PATHS = {'node_modules/', 'dist/', 'build/', '.git/'}
EXCLUDED_PATTERNS = {'.min.js', 'package-lock.json', 'yarn.lock', 'poetry.lock', 'Pipfile.lock'}
EXCLUDED_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.gif', '.webp', '.lock'}


class GitHubClient:
    def __init__(self, token: Optional[str] = None):
        self.token = token
        self.base_url = 'https://api.github.com'
        headers = {'Accept': 'application/vnd.github.v3+json'}
        if token:
            headers['Authorization'] = f'Bearer {token}'
        self._headers = headers

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(headers=self._headers, timeout=30.0)

    @staticmethod
    def parse_repo_url(url: str) -> tuple[str, str]:
        url = url.strip().rstrip('/')
        url = re.sub(r'^https?://', '', url)
        url = re.sub(r'^github\.com/', '', url)
        parts = url.split('/')
        if len(parts) < 2:
            raise ValueError(f'Invalid GitHub URL: {url}')
        owner, repo = parts[0], parts[1]
        if not owner or not repo:
            raise ValueError(f'Invalid GitHub URL: {url}')
        return owner, repo

    def _should_include(self, path: str) -> bool:
        for excl in EXCLUDED_PATHS:
            if excl in path:
                return False
        for excl in EXCLUDED_PATTERNS:
            if path.endswith(excl) or path == excl:
                return False
        ext = '.' + path.rsplit('.', 1)[-1] if '.' in path else ''
        if ext in EXCLUDED_EXTENSIONS:
            return False
        return ext in ALLOWED_EXTENSIONS

    async def fetch_file_tree(self, owner: str, repo: str) -> list[dict]:
        cache_key = (owner, repo, 'tree')
        if cache_key in cache:
            return cache[cache_key]

        async with self._client() as client:
            url = f'{self.base_url}/repos/{owner}/{repo}/git/trees/HEAD?recursive=1'
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()

        files = [
            {'path': item['path'], 'sha': item['sha'], 'size': item.get('size', 0)}
            for item in data.get('tree', [])
            if item['type'] == 'blob' and self._should_include(item['path'])
        ]
        cache.set(cache_key, files, expire=3600)
        return files

    async def fetch_file_content(self, owner: str, repo: str, path: str) -> str:
        cache_key = (owner, repo, f'content:{path}')
        if cache_key in cache:
            return cache[cache_key]

        try:
            async with self._client() as client:
                url = f'{self.base_url}/repos/{owner}/{repo}/contents/{path}'
                resp = await client.get(url)
                resp.raise_for_status()
                data = resp.json()

            content_b64 = data.get('content', '')
            content = base64.b64decode(content_b64).decode('utf-8', errors='replace')
        except Exception:
            content = ''

        cache.set(cache_key, content, expire=3600)
        return content

    async def fetch_issues(self, owner: str, repo: str) -> list[dict]:
        cache_key = (owner, repo, 'issues')
        if cache_key in cache:
            return cache[cache_key]

        try:
            async with self._client() as client:
                url = f'{self.base_url}/repos/{owner}/{repo}/issues?state=open&per_page=50'
                resp = await client.get(url)
                resp.raise_for_status()
                raw = resp.json()
        except Exception:
            return []

        issues = []
        for item in raw:
            if 'pull_request' in item:
                continue
            body = (item.get('body') or '')[:1000]
            issues.append({
                'number': item['number'],
                'title': item['title'],
                'body': body,
                'labels': [lbl['name'] for lbl in item.get('labels', [])],
                'created_at': item.get('created_at', ''),
            })

        cache.set(cache_key, issues, expire=3600)
        return issues

    async def fetch_prs(self, owner: str, repo: str) -> list[dict]:
        cache_key = (owner, repo, 'prs')
        if cache_key in cache:
            return cache[cache_key]

        try:
            async with self._client() as client:
                url = f'{self.base_url}/repos/{owner}/{repo}/pulls?state=open&per_page=30'
                resp = await client.get(url)
                resp.raise_for_status()
                raw = resp.json()
        except Exception:
            return []

        prs = [
            {
                'number': item['number'],
                'title': item['title'],
                'body': (item.get('body') or '')[:1000],
                'state': item.get('state', 'open'),
                'created_at': item.get('created_at', ''),
            }
            for item in raw
        ]

        cache.set(cache_key, prs, expire=3600)
        return prs
