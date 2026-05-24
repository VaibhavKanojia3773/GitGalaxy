import asyncio
import os
import re
import tempfile
from typing import Optional

import httpx
from cache import cache

ALLOWED_EXTENSIONS = {
    '.py', '.js', '.ts', '.tsx', '.jsx', '.java', '.go',
    '.cpp', '.c', '.h', '.cs', '.rb', '.rs', '.php', '.md'
}
EXCLUDED_DIRS  = {'node_modules', 'dist', 'build', '.git', '__pycache__', '.venv', 'venv'}
EXCLUDED_FILES = {'.min.js', 'package-lock.json', 'yarn.lock', 'poetry.lock', 'Pipfile.lock'}


class GitHubClient:
    def __init__(self, token: Optional[str] = None):
        self.token = (token or '').strip()
        self.base_url = 'https://api.github.com'
        self._api_headers = {'Accept': 'application/vnd.github.v3+json'}
        if self.token:
            self._api_headers['Authorization'] = f'Bearer {self.token}'

    def _api_client(self):
        return httpx.AsyncClient(headers=self._api_headers, timeout=30.0)

    @staticmethod
    def parse_repo_url(url: str) -> tuple[str, str]:
        url = url.strip().rstrip('/')
        url = re.sub(r'^https?://', '', url)
        url = re.sub(r'^github\.com/', '', url)
        parts = url.split('/')
        if len(parts) < 2 or not parts[0] or not parts[1]:
            raise ValueError(f'Invalid GitHub URL: {url}')
        return parts[0], parts[1]

    def _should_include(self, path: str) -> bool:
        parts = path.replace('\\', '/').split('/')
        if any(p in EXCLUDED_DIRS for p in parts):
            return False
        filename = parts[-1]
        if any(filename.endswith(excl) or filename == excl for excl in EXCLUDED_FILES):
            return False
        ext = os.path.splitext(filename)[1].lower()
        return ext in ALLOWED_EXTENSIONS

    def _do_clone(self, owner: str, repo: str) -> dict[str, str]:
        import git
        print(f'[github] Shallow cloning {owner}/{repo}...')
        with tempfile.TemporaryDirectory() as tmp:
            git.Repo.clone_from(
                f'https://github.com/{owner}/{repo}.git',
                tmp,
                depth=1,
                single_branch=True,
            )
            files: dict[str, str] = {}
            for root, dirs, filenames in os.walk(tmp):
                # prune excluded dirs in-place so os.walk skips them
                dirs[:] = [d for d in dirs if d not in EXCLUDED_DIRS]
                for filename in filenames:
                    filepath = os.path.join(root, filename)
                    rel = os.path.relpath(filepath, tmp).replace('\\', '/')
                    if not self._should_include(rel):
                        continue
                    try:
                        with open(filepath, encoding='utf-8', errors='replace') as f:
                            files[rel] = f.read()
                    except Exception:
                        pass
        print(f'[github] Cloned {len(files)} files from {owner}/{repo}')
        return files

    # ── public API ─────────────────────────────────────────────────────────

    async def fetch_file_tree(self, owner: str, repo: str) -> list[dict]:
        cache_key = (owner, repo, 'tree')
        if cache_key in cache:
            return cache[cache_key]

        loop = asyncio.get_event_loop()
        contents = await loop.run_in_executor(None, self._do_clone, owner, repo)

        file_list = [{'path': p, 'sha': '', 'size': len(c)} for p, c in contents.items()]
        cache.set(cache_key, file_list, expire=3600)
        # store bulk contents so fetch_file_content doesn't re-clone
        cache.set((owner, repo, 'contents_bulk'), contents, expire=3600)
        return file_list

    async def fetch_file_content(self, owner: str, repo: str, path: str) -> str:
        cache_key = (owner, repo, f'content:{path}')
        if cache_key in cache:
            return cache[cache_key]

        # bulk contents populated by fetch_file_tree
        bulk = cache.get((owner, repo, 'contents_bulk'))
        if bulk and path in bulk:
            cache.set(cache_key, bulk[path], expire=3600)
            return bulk[path]

        # fallback: raw.githubusercontent.com — no auth needed
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(
                    f'https://raw.githubusercontent.com/{owner}/{repo}/HEAD/{path}'
                )
                content = resp.text if resp.status_code == 200 else ''
        except Exception:
            content = ''

        cache.set(cache_key, content, expire=3600)
        return content

    async def fetch_issues(self, owner: str, repo: str) -> list[dict]:
        cache_key = (owner, repo, 'issues')
        if cache_key in cache:
            return cache[cache_key]
        try:
            async with self._api_client() as client:
                resp = await client.get(
                    f'{self.base_url}/repos/{owner}/{repo}/issues?state=open&per_page=50'
                )
                resp.raise_for_status()
                raw = resp.json()
        except Exception:
            return []

        issues = [
            {
                'number': item['number'],
                'title': item['title'],
                'body': (item.get('body') or '')[:1000],
                'labels': [lbl['name'] for lbl in item.get('labels', [])],
            }
            for item in raw if 'pull_request' not in item
        ]
        cache.set(cache_key, issues, expire=3600)
        return issues

    async def fetch_prs(self, owner: str, repo: str) -> list[dict]:
        cache_key = (owner, repo, 'prs')
        if cache_key in cache:
            return cache[cache_key]
        try:
            async with self._api_client() as client:
                resp = await client.get(
                    f'{self.base_url}/repos/{owner}/{repo}/pulls?state=open&per_page=30'
                )
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
            }
            for item in raw
        ]
        cache.set(cache_key, prs, expire=3600)
        return prs
