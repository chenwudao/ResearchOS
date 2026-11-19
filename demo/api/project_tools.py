"""Project work-tree listings, Git status and keyword-category storage."""
from datetime import datetime, timezone
import json
import os
import re
import shutil
import subprocess
from pathlib import Path
from uuid import uuid4

import project_service as projects
import workspace

SKIP_DIRS = {".git", ".venv", "node_modules", "__pycache__", ".mypy_cache",
             ".pytest_cache", ".tox", ".idea", ".vscode", "dist", "build"}
LIST_LIMIT = 400
LOG_LIMIT = 8
MAX_UPLOAD = 20 * 1024 * 1024
MANIFEST = "manifest.json"


def timestamp():
    return datetime.now(timezone.utc).isoformat()


def _root(project_id):
    return projects.folder(project_id)


def _safe(root, relative):
    text = "." if relative in (None, "") else str(relative)
    candidate = Path(text)
    if candidate.is_absolute() or ".." in candidate.parts:
        raise workspace.WorkspaceError(400, "无效路径。")
    path = (root / candidate).resolve()
    if not path.is_relative_to(root):
        raise workspace.WorkspaceError(400, "路径超出项目目录。")
    return path


def _git(cwd, *args, timeout=15):
    try:
        return subprocess.run(
            ["git", *args], cwd=cwd, capture_output=True, text=True, timeout=timeout,
            env={**os.environ, "GIT_TERMINAL_PROMPT": "0", "LC_ALL": "C"},
        )
    except (OSError, subprocess.SubprocessError):
        return None


def _is_git(path):
    if not path.is_dir():
        return False
    git = path / ".git"
    return git.is_dir() or git.is_file()


def _branch(path):
    result = _git(path, "rev-parse", "--abbrev-ref", "HEAD")
    if result and result.returncode == 0:
        name = result.stdout.strip()
        return name or None
    return None


def _repo_name(path):
    result = _git(path, "remote", "get-url", "origin")
    if result and result.returncode == 0:
        url = result.stdout.strip().rstrip("/")
        if url.endswith(".git"):
            url = url[:-4]
        name = url.rsplit("/", 1)[-1]
        if name:
            return name
    name = path.name
    if re.fullmatch(r"[a-f0-9]{16,32}", name):
        return "仓库"
    return name


def _inside(root, path):
    try:
        path.resolve().relative_to(root)
        return True
    except ValueError:
        return False


def _worktrees(repo):
    result = _git(repo, "worktree", "list", "--porcelain")
    if not result or result.returncode != 0:
        return []
    items, current = [], {}
    for line in result.stdout.splitlines():
        if not line:
            if current.get("path"):
                items.append(current)
            current = {}
            continue
        if line.startswith("worktree "):
            current["path"] = line[9:]
        elif line.startswith("branch refs/heads/"):
            current["branch"] = line.split("refs/heads/", 1)[-1]
        elif line == "bare":
            current["bare"] = True
        elif line == "detached":
            current["branch"] = "detached"
    if current.get("path"):
        items.append(current)
    return items


def _discover_git(root):
    found = []
    if _is_git(root):
        found.append(root)
    try:
        children = sorted(root.iterdir(), key=lambda p: p.name.lower())
    except OSError:
        children = []
    for child in children:
        if not child.is_dir() or child.is_symlink() or child.name in SKIP_DIRS:
            continue
        if _is_git(child):
            found.append(child)
            continue
        if child.name == "repositories":
            try:
                nested = sorted(child.iterdir(), key=lambda p: p.name.lower())
            except OSError:
                nested = []
            for repo in nested:
                if repo.is_dir() and not repo.is_symlink() and _is_git(repo):
                    found.append(repo)
    return found


def trees(project_id):
    item = projects.project(workspace.snapshot(), project_id)
    root = _root(project_id)
    rows = [{
        "id": "project",
        "name": item.get("name") or "项目目录",
        "kind": "project",
        "path": ".",
        "branch": _branch(root) if _is_git(root) else None,
    }]
    seen = {root.resolve()}
    for repo in _discover_git(root):
        resolved = repo.resolve()
        if resolved not in seen:
            seen.add(resolved)
            rel = "." if resolved == root.resolve() else str(repo.relative_to(root))
            if rel != ".":
                rows.append({
                    "id": "repo:" + rel,
                    "name": _repo_name(repo),
                    "kind": "repository",
                    "path": rel,
                    "branch": _branch(repo),
                })
        for worktree in _worktrees(repo):
            if worktree.get("bare"):
                continue
            path = Path(worktree["path"]).resolve()
            if path in seen or not _inside(root, path):
                continue
            seen.add(path)
            rel = str(path.relative_to(root))
            rows.append({
                "id": "worktree:" + rel,
                "name": path.name,
                "kind": "worktree",
                "path": rel,
                "branch": worktree.get("branch") or _branch(path),
            })
    return {"directory": str(root), "trees": rows}


def _tree_root(project_id, tree_id):
    listing = trees(project_id)
    for item in listing["trees"]:
        if item["id"] == tree_id:
            return listing, item, _safe(_root(project_id), item["path"])
    raise workspace.WorkspaceError(404, "工作树不存在。")


def listdir(project_id, tree_id, relative=""):
    listing, tree, base = _tree_root(project_id, tree_id)
    folder = _safe(base, relative) if relative else base
    if not folder.is_dir():
        raise workspace.WorkspaceError(404, "目录不存在。")
    entries = []
    try:
        children = sorted(folder.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower()))
    except OSError as exc:
        raise workspace.WorkspaceError(500, "无法读取目录。") from exc
    for child in children:
        if child.name in SKIP_DIRS or child.is_symlink():
            continue
        try:
            stat = child.stat()
        except OSError:
            continue
        rel = str(child.relative_to(base))
        entry = {
            "name": child.name,
            "path": rel,
            "kind": "dir" if child.is_dir() else "file",
        }
        if child.is_file():
            entry["size"] = stat.st_size
        entries.append(entry)
        if len(entries) >= LIST_LIMIT:
            break
    parent = "" if folder == base else str(folder.parent.relative_to(base))
    current = "" if folder == base else str(folder.relative_to(base))
    return {
        "tree": tree,
        "path": current,
        "parent": parent if current else None,
        "entries": entries,
        "truncated": len(entries) >= LIST_LIMIT,
        "directory": listing["directory"],
    }


def git_status(project_id, tree_id=None):
    listing = trees(project_id)
    selected = [t for t in listing["trees"] if t["kind"] != "project" or t.get("branch")]
    # Always include every discovered git path, including project root if it is a repo.
    roots = []
    seen = set()
    for item in listing["trees"]:
        if tree_id and item["id"] != tree_id:
            continue
        path = _safe(_root(project_id), item["path"])
        if not _is_git(path) or path in seen:
            continue
        seen.add(path)
        roots.append(item)
    repos = []
    for item in roots:
        path = _safe(_root(project_id), item["path"])
        status = _git(path, "status", "--porcelain=v1", "-b")
        log = _git(path, "log", "-n", str(LOG_LIMIT), "--pretty=format:%h%x09%ad%x09%s", "--date=short")
        remotes = _git(path, "remote", "-v")
        branch = item.get("branch") or _branch(path)
        files, ahead, behind, tracking = [], 0, 0, None
        if status and status.returncode == 0:
            lines = status.stdout.splitlines()
            if lines and lines[0].startswith("## "):
                header = lines[0][3:]
                tracking = header
                ahead_match = re.search(r"ahead (\d+)", header)
                behind_match = re.search(r"behind (\d+)", header)
                ahead = int(ahead_match.group(1)) if ahead_match else 0
                behind = int(behind_match.group(1)) if behind_match else 0
                lines = lines[1:]
            for line in lines:
                if len(line) < 3:
                    continue
                files.append({"code": line[:2], "path": line[3:]})
        commits = []
        if log and log.returncode == 0 and log.stdout.strip():
            for line in log.stdout.splitlines():
                parts = line.split("\t", 2)
                if len(parts) == 3:
                    commits.append({"hash": parts[0], "date": parts[1], "subject": parts[2]})
        remote_urls = []
        if remotes and remotes.returncode == 0:
            seen_urls = set()
            for line in remotes.stdout.splitlines():
                parts = line.split()
                if len(parts) >= 2 and parts[1] not in seen_urls:
                    seen_urls.add(parts[1])
                    remote_urls.append({"name": parts[0], "url": parts[1]})
        repos.append({
            **item,
            "branch": branch,
            "tracking": tracking,
            "ahead": ahead,
            "behind": behind,
            "clean": not files,
            "files": files,
            "commits": commits,
            "remotes": remote_urls,
        })
    return {"directory": listing["directory"], "repos": repos, "trees": listing["trees"]}


def _storage_root(project_id):
    path = _root(project_id) / "storage"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _load_manifest(project_id):
    folder = _storage_root(project_id)
    path = folder / MANIFEST
    if not path.is_file():
        return {"categories": []}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"categories": []}
    categories = data.get("categories")
    if not isinstance(categories, list):
        return {"categories": []}
    cleaned = []
    for item in categories:
        if not isinstance(item, dict) or not item.get("id") or not item.get("name"):
            continue
        keywords = item.get("keywords") if isinstance(item.get("keywords"), list) else []
        cleaned.append({
            "id": str(item["id"]),
            "name": str(item["name"])[:80],
            "keywords": [str(k).strip()[:40] for k in keywords if str(k).strip()][:16],
            "createdAt": item.get("createdAt") or timestamp(),
            "updatedAt": item.get("updatedAt") or item.get("createdAt") or timestamp(),
        })
    return {"categories": cleaned}


def _save_manifest(project_id, data):
    path = _storage_root(project_id) / MANIFEST
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return data


def _category(data, key):
    if not key:
        return None
    needle = str(key).strip()
    for item in data["categories"]:
        if item["id"] == needle or item["name"].casefold() == needle.casefold():
            return item
    return None


def _safe_name(name):
    text = workspace.text(name, 180) or "file"
    text = re.sub(r"[\\/]+", "_", text).strip(" .")
    return text or "file"


def _list_files(project_id, category):
    folder = _storage_root(project_id) / category["id"]
    if not folder.is_dir():
        return []
    files = []
    for child in sorted(folder.iterdir(), key=lambda p: p.name.lower()):
        if not child.is_file() or child.is_symlink() or child.name.startswith("."):
            continue
        try:
            stat = child.stat()
        except OSError:
            continue
        files.append({
            "name": child.name,
            "path": str(child.relative_to(_root(project_id))),
            "size": stat.st_size,
            "updatedAt": datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat(),
        })
    return files


def storage_list(project_id):
    data = _load_manifest(project_id)
    categories = [{**item, "files": _list_files(project_id, item)} for item in data["categories"]]
    return {"categories": categories}


def storage_define(project_id, name, keywords=None, category_id=None):
    title = workspace.text(name, 80)
    if not title:
        raise workspace.WorkspaceError(400, "请填写类别名称。")
    words = []
    for raw in keywords or []:
        word = workspace.text(str(raw), 40)
        if word and word not in words:
            words.append(word)
    data = _load_manifest(project_id)
    existing = _category(data, category_id) or _category(data, title)
    now = timestamp()
    if existing:
        existing["name"] = title
        existing["keywords"] = words or existing["keywords"]
        existing["updatedAt"] = now
        _save_manifest(project_id, data)
        return existing
    item = {
        "id": "cat_" + uuid4().hex[:16],
        "name": title,
        "keywords": words,
        "createdAt": now,
        "updatedAt": now,
    }
    data["categories"].append(item)
    (_storage_root(project_id) / item["id"]).mkdir(parents=True, exist_ok=True)
    _save_manifest(project_id, data)
    return item


def storage_remove_category(project_id, category_id):
    data = _load_manifest(project_id)
    item = _category(data, category_id)
    if not item:
        raise workspace.WorkspaceError(404, "类别不存在。")
    data["categories"] = [c for c in data["categories"] if c["id"] != item["id"]]
    _save_manifest(project_id, data)
    folder = _storage_root(project_id) / item["id"]
    if folder.is_dir():
        shutil.rmtree(folder)
    return {"ok": True, "id": item["id"]}


def _unique(path):
    if not path.exists():
        return path
    stem, suffix, parent, n = path.stem, path.suffix, path.parent, 2
    while True:
        candidate = parent / f"{stem}-{n}{suffix}"
        if not candidate.exists():
            return candidate
        n += 1


def storage_save(project_id, category_key, source=None, filename=None, content=None):
    data = _load_manifest(project_id)
    item = _category(data, category_key)
    if not item:
        raise workspace.WorkspaceError(404, "请先创建或指定存储类别。")
    dest_dir = _storage_root(project_id) / item["id"]
    dest_dir.mkdir(parents=True, exist_ok=True)
    root = _root(project_id)
    if source:
        origin = _safe(root, source)
        if not origin.is_file():
            raise workspace.WorkspaceError(404, "要归档的文件不存在。")
        if origin.resolve().is_relative_to(dest_dir.resolve()) and origin.parent.resolve() == dest_dir.resolve():
            return {"category": item, "name": origin.name, "path": str(origin.relative_to(root))}
        target = _unique(dest_dir / _safe_name(filename or origin.name))
        shutil.copy2(origin, target)
    elif content is not None:
        import base64
        raw = content
        if isinstance(raw, str):
            try:
                raw = base64.b64decode(raw)
            except Exception as exc:
                raise workspace.WorkspaceError(400, "文件内容无效。") from exc
        if not isinstance(raw, (bytes, bytearray)):
            raise workspace.WorkspaceError(400, "文件内容无效。")
        if len(raw) > MAX_UPLOAD:
            raise workspace.WorkspaceError(400, "文件超过 20 MB。")
        target = _unique(dest_dir / _safe_name(filename or "file"))
        target.write_bytes(raw)
    else:
        raise workspace.WorkspaceError(400, "请提供要归档的文件。")
    item["updatedAt"] = timestamp()
    _save_manifest(project_id, data)
    return {"category": item, "name": target.name, "path": str(target.relative_to(root)), "size": target.stat().st_size}


def storage_remove_file(project_id, category_key, relative):
    data = _load_manifest(project_id)
    item = _category(data, category_key)
    if not item:
        raise workspace.WorkspaceError(404, "类别不存在。")
    dest_dir = _storage_root(project_id) / item["id"]
    path = _safe(dest_dir, Path(relative).name if "/" in str(relative) or str(relative).startswith("storage/") else relative)
    # Accept either the bare filename or the project-relative storage path.
    if not path.is_file():
        path = _safe(root := _root(project_id), relative)
        if not path.is_relative_to(dest_dir) or not path.is_file():
            raise workspace.WorkspaceError(404, "文件不存在。")
    path.unlink()
    return {"ok": True}


def handle(project_id, action, args):
    args = args or {}
    if action == "tools/trees":
        return trees(project_id)
    if action == "tools/listdir":
        return listdir(project_id, args.get("treeId") or "project", args.get("path") or "")
    if action == "tools/git":
        return git_status(project_id, args.get("treeId"))
    if action == "tools/storage/list":
        return storage_list(project_id)
    if action == "tools/storage/define":
        return storage_define(project_id, args.get("name"), args.get("keywords"), args.get("id"))
    if action == "tools/storage/remove-category":
        return storage_remove_category(project_id, args.get("id"))
    if action == "tools/storage/save":
        return storage_save(project_id, args.get("category") or args.get("id"),
                            source=args.get("source"), filename=args.get("name") or args.get("filename"),
                            content=args.get("content"))
    if action == "tools/storage/remove-file":
        return storage_remove_file(project_id, args.get("category") or args.get("id"), args.get("path"))
    return None
