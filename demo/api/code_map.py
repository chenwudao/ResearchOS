"""Bounded, read-only Python source maps within the current project's sources."""

import ast
import importlib.util
import io
import os
from pathlib import PurePosixPath
import re
import tokenize

import features
import project_service
import project_sources
import workspace


MAX_FILES = 150
MAX_ENTRIES = 8000
MAX_BYTES = 192 * 1024
SKIP_DIRS = frozenset({"__pycache__", "build", "dist", "env", "node_modules", "venv"})
PROJECT_STORAGE = frozenset({"outputs", "repositories", "resources"})


def _sources(project):
    item = project_service.project(workspace.snapshot(), project)
    repositories = [
        {"id": entry["id"], "name": entry.get("title") or entry["text"], "path": entry["path"]}
        for entry in item["rails"].get("library", [])
        if entry.get("kind") == "repository" and re.fullmatch(r"repositories/[a-f0-9]{32}", entry.get("path") or "")
    ]
    return repositories, project_sources.list_sources(project)


def _root(project, selected, repositories, sources):
    internal = project_service.folder(project)
    if selected == "project":
        return internal, PROJECT_STORAGE, ()
    repository = next((entry for entry in repositories if entry["id"] == selected), None)
    if repository:
        path = internal / repository["path"]
        if path.is_dir() and path.resolve() == path and not path.is_symlink() and not path.is_junction():
            return path, (), ()
    if any(entry["id"] == selected for entry in sources):
        _, path = project_sources._source(project, selected)
        return path, (), project_sources.protected_roots()
    raise workspace.WorkspaceError(404, "代码来源不属于当前项目或已不可用。")


def _allowed(path, excluded):
    return (not path.name.startswith(".") and path.name not in SKIP_DIRS and
            not path.is_symlink() and not path.is_junction() and
            not any(path.is_relative_to(root) for root in excluded))


def _files(root, skip_top, excluded):
    files, remaining, scanned = [], [root], 0
    while remaining:
        directory = remaining.pop()
        with os.scandir(directory) as listing:
            entries = []
            for entry in listing:
                scanned += 1
                if scanned > MAX_ENTRIES:
                    return files, True
                entries.append(entry)
        for entry in sorted(entries, key=lambda item: item.name.casefold()):
            path = directory / entry.name
            if directory == root and entry.name in skip_top or not _allowed(path, excluded):
                continue
            if entry.is_dir(follow_symlinks=False):
                remaining.append(path)
            elif path.suffix == ".py" and entry.is_file(follow_symlinks=False):
                if len(files) == MAX_FILES:
                    return files, True
                files.append(path)
    return files, False


def _read(path, root):
    if path.resolve(strict=True) != path or not path.is_relative_to(root):
        raise workspace.WorkspaceError(403, "文件超出代码来源范围。")
    with project_sources._open_file(path) as (file, info):
        if info.st_size > MAX_BYTES:
            raise workspace.WorkspaceError(413, "单个 Python 文件超过 192 KiB。")
        data = file.read(MAX_BYTES + 1)
        if len(data) > MAX_BYTES:
            raise workspace.WorkspaceError(413, "单个 Python 文件超过 192 KiB。")
    encoding, _ = tokenize.detect_encoding(io.BytesIO(data).readline)
    return data.decode(encoding)


def _module_name(relative):
    parts = list(PurePosixPath(relative).with_suffix("").parts)
    if len(parts) > 1 and parts[0] == "src":
        parts.pop(0)
    if parts[-1] == "__init__":
        parts.pop()
    return ".".join(parts)


def _file_record(root, path):
    relative = path.relative_to(root).as_posix()
    module = _module_name(relative)
    group = (module.split(".", 1)[0] if "/" in relative and module else ".")
    record = {"path": relative, "module": module, "group": group, "symbols": [], "imports": []}
    text = ""
    try:
        text = _read(path, root)
        tree = ast.parse(text, filename=relative)
    except (OSError, SyntaxError, ValueError, LookupError, RecursionError, workspace.WorkspaceError) as error:
        record["error"] = (str(error) if isinstance(error, workspace.WorkspaceError) else
                           f"第 {error.lineno} 行无法解析。" if isinstance(error, SyntaxError) and error.lineno else "无法解析该 Python 文件。")
        return record, text
    package = module if path.name == "__init__.py" else module.rpartition(".")[0]
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            record["imports"].extend({"module": alias.name, "line": node.lineno} for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            name = node.module or ""
            if node.level:
                try:
                    name = importlib.util.resolve_name("." * node.level + name, package)
                except ImportError:
                    continue
            record["imports"].extend({"module": name, "member": alias.name, "line": node.lineno} for alias in node.names)
    for node in tree.body:
        if isinstance(node, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)):
            record["symbols"].append({"name": node.name, "line": node.lineno, "end": node.end_lineno,
                                      "kind": "class" if isinstance(node, ast.ClassDef) else "function"})
    return record, text


def _link_imports(records):
    names = {}
    for entry in records:
        if entry["module"]:
            names.setdefault(entry["module"], []).append(entry["path"])
    for entry in records:
        for item in entry["imports"]:
            candidate = item["module"] + "." + item["member"] if item.get("member") else item["module"]
            targets = names.get(candidate, names.get(item["module"], []))
            if len(targets) == 1 and targets[0] != entry["path"]:
                item["target"] = targets[0]


def view(project, action, args):
    bot = next((row for row in features.list_features(project, project)
                if row["id"] == args.get("featureId") and row.get("layout") == "code-map" and not row.get("archived")), None)
    if bot is None:
        raise workspace.WorkspaceError(404, "当前项目没有此工程台。")
    repositories, sources = _sources(project)
    if action == "workbench/sources":
        return [{"id": "project", "name": "项目内代码", "available": True},
                *sources, *({"id": entry["id"], "name": entry["name"], "available": True} for entry in repositories)]
    root, skip_top, excluded = _root(project, args.get("sourceId"), repositories, sources)
    try:
        paths, truncated = _files(root, skip_top, excluded)
    except OSError as error:
        raise workspace.WorkspaceError(403, "无法读取部分代码目录。") from error
    if action == "workbench/file":
        path = next((file for file in paths if file.relative_to(root).as_posix() == args.get("path")), None)
        if path is None:
            raise workspace.WorkspaceError(404, "代码文件不在当前来源的索引中。")
        record, text = _file_record(root, path)
        return {**record, "text": text}
    records = [_file_record(root, path)[0] for path in paths]
    _link_imports(records)
    return {"files": records, "truncated": truncated}
