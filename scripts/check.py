"""Dependency-free syntax, hygiene, and architectural-boundary checks."""

import ast
import pathlib
import sys

root = pathlib.Path(__file__).resolve().parents[1]
errors = []
for path in sorted(root.rglob("*.py")):
    if any(part in {".venv", "build", "dist"} for part in path.parts):
        continue
    text = path.read_text()
    try:
        tree = ast.parse(text, filename=str(path))
        compile(tree, str(path), "exec")
    except SyntaxError as exc:
        errors.append(str(exc))
        continue
    if "\t" in text or any(line.rstrip() != line for line in text.splitlines()):
        errors.append(f"Whitespace violation: {path.relative_to(root)}")
    if path.parent.name == "core":
        for node in ast.walk(tree):
            names = ([node.module or ""] if isinstance(node, ast.ImportFrom)
                     else [a.name for a in node.names] if isinstance(node, ast.Import) else [])
            for name in names:
                if name.startswith("jarvis.") and name != "jarvis.contracts":
                    errors.append(f"Core depends on concrete module: {name}")
                if name in {"sqlite3", "requests", "httpx", "openai", "anthropic"}:
                    errors.append(f"Core depends on adapter implementation: {name}")
if errors:
    print("\n".join(errors))
    sys.exit(1)
print("PASS: Python syntax, whitespace hygiene, and Core dependency boundaries")
