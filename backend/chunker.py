import os
from typing import Optional

LANG_MAP = {
    '.py': 'python',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.ts': 'typescript',
    '.tsx': 'tsx',
    '.java': 'java',
    '.go': 'go',
}

MAX_CHUNK_LINES = 150
MAX_FILE_CHARS = 3000


def _get_ext(path: str) -> str:
    _, ext = os.path.splitext(path)
    return ext.lower()


def _extract_name(node, content: str) -> str:
    for child in node.children:
        if child.type in ('identifier', 'name', 'type_identifier', 'property_identifier'):
            start = child.start_byte
            end = child.end_byte
            return content[start:end]
    return node.type


def _node_type_label(node_type: str) -> str:
    if 'class' in node_type:
        return 'class'
    return 'function'


class CodeChunker:
    def __init__(self):
        self._parsers: dict = {}
        self._load_parsers()

    def _load_parsers(self):
        try:
            from tree_sitter import Language, Parser
        except ImportError as e:
            print(f'[chunker] tree-sitter not available: {e}')
            return

        lang_factories = {}
        try:
            import tree_sitter_python as m
            lang_factories['python'] = m.language
        except Exception as e:
            print(f'[chunker] python grammar unavailable: {e}')

        try:
            import tree_sitter_javascript as m
            lang_factories['javascript'] = m.language
        except Exception as e:
            print(f'[chunker] javascript grammar unavailable: {e}')

        try:
            import tree_sitter_typescript as m
            lang_factories['typescript'] = m.language_typescript
            lang_factories['tsx'] = m.language_tsx
        except Exception as e:
            print(f'[chunker] typescript grammar unavailable: {e}')

        try:
            import tree_sitter_java as m
            lang_factories['java'] = m.language
        except Exception as e:
            print(f'[chunker] java grammar unavailable: {e}')

        try:
            import tree_sitter_go as m
            lang_factories['go'] = m.language
        except Exception as e:
            print(f'[chunker] go grammar unavailable: {e}')

        for name, factory in lang_factories.items():
            try:
                lang_obj = Language(factory(), name)
                parser = Parser()
                parser.set_language(lang_obj)
                self._parsers[name] = parser
            except Exception as e:
                print(f'[chunker] Failed to init parser for {name}: {e}')

        print(f'[chunker] Loaded parsers: {list(self._parsers.keys())}')

    def _parse_chunks(self, lang: str, content: str, path: str) -> Optional[list[dict]]:
        parser = self._parsers.get(lang)
        if parser is None:
            return None

        try:
            tree = parser.parse(content.encode('utf-8', errors='replace'))
        except Exception:
            return None

        node_types = {
            'python': ['function_definition', 'class_definition'],
            'javascript': ['function_declaration', 'function_expression', 'arrow_function',
                           'class_declaration', 'method_definition'],
            'typescript': ['function_declaration', 'function_expression', 'arrow_function',
                           'class_declaration', 'method_definition'],
            'tsx': ['function_declaration', 'function_expression', 'arrow_function',
                    'class_declaration', 'method_definition'],
            'java': ['method_declaration', 'class_declaration', 'constructor_declaration'],
            'go': ['function_declaration', 'method_declaration', 'type_declaration'],
        }
        target_types = set(node_types.get(lang, []))
        lines = content.splitlines()
        chunks = []

        def walk(node):
            if node.type in target_types:
                start = node.start_point[0]
                end = node.end_point[0]
                name = _extract_name(node, content)
                chunk_lines = lines[start:end + 1]
                if len(chunk_lines) > MAX_CHUNK_LINES:
                    for i in range(0, len(chunk_lines), MAX_CHUNK_LINES):
                        sub = chunk_lines[i:i + MAX_CHUNK_LINES]
                        sub_start = start + i
                        sub_end = sub_start + len(sub) - 1
                        sub_name = f'{name}_part{i // MAX_CHUNK_LINES}'
                        chunks.append({
                            'id': f'{path}::{sub_name}::{sub_start}',
                            'file_path': path,
                            'name': sub_name,
                            'content': '\n'.join(sub),
                            'start_line': sub_start,
                            'end_line': sub_end,
                            'type': _node_type_label(node.type),
                        })
                else:
                    chunks.append({
                        'id': f'{path}::{name}::{start}',
                        'file_path': path,
                        'name': name,
                        'content': '\n'.join(chunk_lines),
                        'start_line': start,
                        'end_line': end,
                        'type': _node_type_label(node.type),
                    })
            else:
                for child in node.children:
                    walk(child)

        walk(tree.root_node)
        return chunks if chunks else None

    def chunk_file(self, path: str, content: str) -> list[dict]:
        ext = _get_ext(path)
        lang = LANG_MAP.get(ext)

        if lang and lang in self._parsers:
            try:
                chunks = self._parse_chunks(lang, content, path)
                if chunks:
                    return chunks
            except Exception:
                pass

        # fallback: whole file as one chunk
        truncated = content[:MAX_FILE_CHARS]
        filename = os.path.basename(path)
        return [{
            'id': f'{path}::{filename}::0',
            'file_path': path,
            'name': filename,
            'content': truncated,
            'start_line': 0,
            'end_line': len(content.splitlines()),
            'type': 'file',
        }]

    def chunk_repository(self, files: list[dict], contents: dict[str, str]) -> list[dict]:
        all_chunks = []
        for f in files:
            path = f['path']
            content = contents.get(path, '')
            if not content:
                continue
            all_chunks.extend(self.chunk_file(path, content))
        return all_chunks
