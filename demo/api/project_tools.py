"""Project work-tree listings and Git status."""
import os
import re
import subprocess
from pathlib import Path

import project_service as projects
import workspace

SKIP_DIRS = {".git", ".venv", "node_modules", "__pycache__", ".mypy_cache",
             ".pytest_cache", ".tox", ".idea", ".vscode", "dist", "build"}
LIST_LIMIT = 400
LOG_LIMIT = 8


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


def handle(project_id, action, args):
    args = args or {}
    if action == "tools/trees":
        return trees(project_id)
    if action == "tools/listdir":
        return listdir(project_id, args.get("treeId") or "project", args.get("path") or "")
    if action == "tools/git":
        return git_status(project_id, args.get("treeId"))
    return None
