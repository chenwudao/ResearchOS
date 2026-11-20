"""Read-only local folders explicitly associated with a research project."""
import codecs
from contextlib import contextmanager
from itertools import islice
import os
from pathlib import Path, PurePosixPath
import stat
from uuid import uuid4

import model_config
import project_service as projects
import workspace


def _protected(path):
    return any(path.is_relative_to(root.resolve()) for root in (
        workspace.DATA, model_config.active_web_home(),
    ))


def settings(project_id):
    item = projects.project(workspace.snapshot(), project_id)
    return {
        "name": item["name"],
        "description": item.get("description") or "",
        "topic": item.get("topic") or "",
        "directory": str(projects.folder(project_id)),
        "sources": [{**source, "available": _available(source)} for source in item.get("sourceFolders", [])],
    }


def _directory(source):
    try:
        path = Path(source["path"])
        canonical = path.resolve(strict=True)
        if canonical == path and path.is_dir() and not _protected(path):
            return path
    except (OSError, ValueError, RuntimeError):
        pass
    raise workspace.WorkspaceError(404, "来源文件夹不可用，请在项目设置中重新选择。")


def _available(source):
    try:
        _directory(source)
        return True
    except workspace.WorkspaceError:
        return False


def _find(sources, source_id):
    match = next((item for item in sources if item["id"] == source_id), None)
    if match is None:
        raise workspace.WorkspaceError(404, "这个项目没有该来源文件夹。")
    return match


def _prepare(raw, name=None):
    if not isinstance(raw, str) or not raw.strip() or not Path(raw.strip()).is_absolute():
        raise workspace.WorkspaceError(400, "请输入本机文件夹的绝对路径。")
    try:
        canonical = Path(raw.strip()).resolve(strict=True)
    except (OSError, ValueError, RuntimeError) as error:
        raise workspace.WorkspaceError(400, "无法打开这个本机文件夹。") from error
    if not canonical.is_dir() or _protected(canonical):
        raise workspace.WorkspaceError(400, "请选择可读取的本机资料文件夹。")
    name = workspace.text(name, 80) or canonical.name or str(canonical)
    return canonical, name


def prepare_initial(paths):
    if paths is None:
        return []
    if not isinstance(paths, list):
        raise workspace.WorkspaceError(400, "来源文件夹必须是路径列表。")
    records = {}
    for index, path in enumerate(paths, 1):
        try:
            canonical, name = _prepare(path)
        except workspace.WorkspaceError as error:
            raise workspace.WorkspaceError(error.status, f"来源文件夹 {index}：{error}") from error
        if canonical not in records:
            records[canonical] = {"id": uuid4().hex, "name": name, "path": str(canonical)}
    return list(records.values())


def save(project_id, args):
    canonical, name = _prepare(args.get("path"), args.get("name"))
    source_id = args.get("id")
    path = str(canonical)

    def update(item):
        sources = item.setdefault("sourceFolders", [])
        record = _find(sources, source_id) if source_id is not None else None
        duplicate = next((source for source in sources if Path(source["path"]) == canonical and source is not record), None)
        if duplicate:
            if record is None:
                return {**duplicate, "available": True}
            raise workspace.WorkspaceError(409, "该文件夹已在来源列表中。")
        if record is None:
            record = {"id": uuid4().hex}
            sources.append(record)
        record.update(name=name, path=path)
        return {**record, "available": True}

    return projects.mutate(project_id, update)


def remove(project_id, source_id):
    def update(item):
        sources = item.get("sourceFolders", [])
        sources.remove(_find(sources, source_id))
        return {"ok": True}

    return projects.mutate(project_id, update)


def list_sources(project_id):
    item = projects.project(workspace.snapshot(), project_id)
    return [{"id": source["id"], "name": source["name"], "available": _available(source)}
            for source in item.get("sourceFolders", [])]


def _visible(name):
    return not name.startswith(".") and name not in ("node_modules", "__pycache__")


def _relative(root, value):
    value = "." if value is None else value
    if not isinstance(value, str) or "\\" in value or ":" in value:
        raise workspace.WorkspaceError(400, "请输入来源内的相对路径。")
    relative = PurePosixPath(value)
    if relative.is_absolute() or any(not _visible(part) for part in relative.parts):
        raise workspace.WorkspaceError(403, "路径超出可读取的来源范围。")
    current = root
    try:
        for part in relative.parts:
            current = current / part
            if current.is_symlink() or current.is_junction():
                raise workspace.WorkspaceError(403, "来源文件夹中的链接不可访问。")
        resolved = current.resolve(strict=True)
    except (OSError, ValueError, RuntimeError) as error:
        raise workspace.WorkspaceError(404, "来源内没有这个文件或目录。") from error
    if resolved != current or not resolved.is_relative_to(root) or _protected(resolved):
        raise workspace.WorkspaceError(403, "路径超出可读取的来源范围。")
    return resolved


def _source(project_id, source_id):
    item = projects.project(workspace.snapshot(), project_id)
    source = _find(item.get("sourceFolders", []), source_id)
    return source, _directory(source)


def list_directory(project_id, source_id, relative=None):
    source, root = _source(project_id, source_id)
    directory = _relative(root, relative)
    if not directory.is_dir():
        raise workspace.WorkspaceError(400, "请选择来源内的目录。")
    try:
        items = []
        protected = (workspace.DATA.resolve(), model_config.active_web_home().resolve())
        with os.scandir(directory) as entries:
            entries = iter(entries)
            for entry in islice(entries, 2000):
                child = directory / entry.name
                if not _visible(entry.name) or any(child.is_relative_to(path) for path in protected):
                    continue
                if entry.is_symlink() or child.is_junction():
                    continue
                if entry.is_file(follow_symlinks=False) or entry.is_dir(follow_symlinks=False):
                    items.append({"path": child.relative_to(root).as_posix(),
                                  "kind": "directory" if entry.is_dir(follow_symlinks=False) else "file"})
            truncated = next(entries, None) is not None
    except OSError as error:
        raise workspace.WorkspaceError(403, "无法读取该来源目录。") from error
    items.sort(key=lambda entry: (entry["kind"] != "directory", entry["path"].casefold()))
    return {"source": source["name"], "path": directory.relative_to(root).as_posix(), "entries": items[:200],
            "truncated": truncated or len(items) > 200}


@contextmanager
def _open_file(path):
    if not path.is_file():
        raise workspace.WorkspaceError(400, "请选择来源内的普通文件。")
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0) | getattr(os, "O_BINARY", 0)
    try:
        with os.fdopen(os.open(path, flags), "rb") as file:
            info = os.fstat(file.fileno())
            if not stat.S_ISREG(info.st_mode):
                raise workspace.WorkspaceError(400, "请选择来源内的普通文件。")
            yield file, info
    except OSError as error:
        raise workspace.WorkspaceError(403, "无法读取该来源文件。") from error


def read_file(project_id, args):
    source, root = _source(project_id, args.get("sourceId"))
    path = _relative(root, args.get("path"))
    result = {"source": source["name"], "path": path.relative_to(root).as_posix()}
    with _open_file(path) as (file, info):
        if path.suffix.lower() == ".pdf":
            from pypdf import PdfReader
            from pypdf.errors import PdfReadError
            if info.st_size > 50 * 1024**2:
                raise workspace.WorkspaceError(413, "PDF 超过 50 MB。")
            page = args.get("page", 1)
            try:
                reader = PdfReader(file)
                if type(page) is not int or not 1 <= page <= len(reader.pages):
                    raise workspace.WorkspaceError(400, "页码超出范围。")
                return {**result, "page": page, "pages": len(reader.pages),
                        "text": (reader.pages[page - 1].extract_text() or "")[:24000]}
            except PdfReadError as error:
                raise workspace.WorkspaceError(400, "无法解析该 PDF。") from error
        offset = args.get("offset", 0)
        if type(offset) is not int or not 0 <= offset <= info.st_size:
            raise workspace.WorkspaceError(400, "文本读取位置无效。")
        file.seek(offset)
        data = file.read(24 * 1024)
        if b"\0" in data:
            raise workspace.WorkspaceError(400, "目前支持读取文本和 PDF 文件。")
        decoder = codecs.getincrementaldecoder("utf-8")(errors="replace")
        text = decoder.decode(data, final=file.tell() >= info.st_size)
        next_offset = offset + len(data) - len(decoder.getstate()[0])
        return {**result, "text": text, "nextOffset": next_offset if next_offset < info.st_size else None}
