"""Scoped reference candidates and bounded context for the research composer."""

import features
import memory_store
import project_service
import research_records
import workspace


def _records(scope, kinds):
    if kinds & {"library", "result"}:
        project = project_service.project(workspace.snapshot(), scope)
        labels = {bot["id"]: bot["label"] for bot in features.list_features(scope, scope)
                  if bot["id"] not in {"chat", "feed", "library"}}
        labels["library"] = "文献与资料"
        for rail, entries in project["rails"].items():
            kind = "library" if rail == "library" else "result"
            if rail in labels and kind in kinds:
                for entry in reversed(entries):
                    name = str(entry.get("title") or entry.get("name") or entry.get("text") or "").strip()
                    description = str(entry.get("doi") or "")[:120] if rail == "library" else labels[rail]
                    yield kind, name, description, entry
    if kinds & {"rule", "decision"}:
        for kind in ("rule", "decision"):
            if kind in kinds:
                for entry in memory_store.list_memories(scope, category=kind):
                    yield kind, entry["content"], "已置顶" if entry["pinned"] else "", entry
    if "experiment" in kinds:
        for entry in research_records.records(scope, "experiment"):
            yield "experiment", entry["name"], "", entry


KINDS = frozenset({"library", "result", "rule", "decision", "experiment"})
FIELD_NAMES = {
    "library": ("title", "text", "summary", "url", "doi", "kind", "path", "sources"),
    "result": ("title", "text", "summary", "url", "kind", "status", "sources", "outputFiles"),
    "experiment": ("name", "status", "created", "updated", "metrics", "visualizations"),
    "rule": ("content", "pinned", "updatedAt"),
    "decision": ("content", "pinned", "updatedAt"),
}


def candidates(scope, args):
    kind = args.get("kind")
    query = workspace.text(args.get("query"), 600).casefold()
    if kind is not None and (not isinstance(kind, str) or kind not in KINDS):
        raise workspace.WorkspaceError(400, "无效的引用类别。")
    limit = 12 if kind else 4
    groups = {}
    for entry_kind, name, description, entry in _records(scope, {kind} if kind else KINDS):
        group = groups.setdefault(entry_kind, [])
        if len(group) >= limit or not isinstance(entry.get("id"), str) or not name.strip():
            continue
        if query not in " ".join(str(value or "") for value in
                                 (name, description, entry.get("doi"), entry.get("url"), entry.get("path"))).casefold():
            continue
        group.append({"id": entry["id"], "kind": entry_kind, "name": name.splitlines()[0][:100],
                      "description": description})
    return [item for group in groups.values() for item in group]


def read(scope, args):
    kind, identity = args.get("kind"), args.get("id")
    if not isinstance(kind, str) or kind not in KINDS or not isinstance(identity, str):
        raise workspace.WorkspaceError(400, "无效的科研引用。")
    for _, name, description, entry in _records(scope, {kind}):
        if entry.get("id") != identity:
            continue
        context = {key: entry[key] for key in FIELD_NAMES[kind] if key in entry}
        if kind == "experiment":
            context["metrics"] = {key: value[-20:] if isinstance(value, list) else value
                                  for key, value in list(context.get("metrics", {}).items())[:24]}
            context["visualizations"] = [{**chart, "points": chart["points"][-24:]}
                                         for chart in context.get("visualizations", [])[:3]]
        for key in ("content", "text"):
            if isinstance(context.get(key), str):
                context[key] = context[key][:4500]
        return {"id": identity, "referenceKind": kind, "name": name.split("\n", 1)[0][:100],
                **({"group": description} if description else {}), **context}
    raise workspace.WorkspaceError(404, "这项引用在当前项目中已不可用。")
