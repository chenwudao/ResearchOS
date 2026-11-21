"""LabWeave tools using the standard MCP stdio transport."""
import json
from pathlib import Path
import sys
import workspace
import project_service
import naming
import project_plugins
import features
from visualizations import CHART_SCHEMA

TOOLS = {
    "plugin_create": ("Create a reusable instruction plugin. A global conversation must explicitly set projectId to one project or 'all'. Project conversations can only create a plugin for themselves.", {"name": {"type": "string"}, "prompt": {"type": "string"}}),
    "plugin_rename": ("Rename a custom project plugin in this conversation's permitted scope.", {"id": {"type": "string"}, "name": {"type": "string"}}),
    "plugin_list": ("List instruction plugins applicable to the current or explicitly selected project.", {}),
    "assistant_name_get": ("Read the global assistant's current display name.", {}),
    "assistant_rename": ("Change the global assistant's display name when requested in the conversation.", {"name": {"type": "string"}}),
    "feature_labels": ("Read active feature IDs and their current display names for this conversation scope. A global conversation may optionally specify projectId.", {}),
    "feature_list": ("List active Feature Bots in the project. clusterParent identifies grouped members. Use includeArchived to find completed temporary Bots and their preserved results.", {"includeArchived":{"type":"boolean"}}),
    "feature_create": ("Create a Bot with one paradigm and one compatible layout. Use goals: checklist/path/bus, notes: library/timeline, mindmap: graph/lineage/star/bus, ideas: branches/reasoning/star or engineering: sequence/matrix. Star emphasizes a central record; bus emphasizes sources feeding connected groups. For a project extension, use its ext_ ID and fixed layout from project_get_context. Global chat must specify the project explicitly.", {
        "label":{"type":"string"}, "paradigm":{"type":"string"},
        "layout":{"type":"string","enum":list(dict.fromkeys(layout for layouts in features.BOT_LAYOUTS.values() for layout in layouts))},
        "hint":{"type":"string"}, "temporary":{"type":"boolean","description":"Use only for a one-time assignment without a suitable existing Bot. Successful archived deliveries retire it automatically."}}),
    "feature_delete": ("Remove a non-chat Feature Bot (builtin feed/ideas/goals/library or custom feature) from the specified projectId/'all' (global chat) or current project. Cannot delete 'chat'.", {"featureId": {"type": "string"}}),
    "project_paradigm_create": ("Create a project-local paradigm with one layout, a matching avatar icon, and typed display fields. Assign unique title, summary, group, date, status, source or relation roles as needed. Other fields use detail. Use date for date roles, url for source, and reference for relation to another record within the same Bot. Optionally pass symbol (e.g. lucide:book-open, lucide:bug, lucide:database, lucide:flask-conical) or omit it to let Weave auto-match a fitting icon.", {
        "label": {"type": "string"}, "description": {"type": "string"}, "base": {"type": "string"},
        "layout": {"type": "string"},
        "symbol": {"type": "string", "description": "Optional avatar icon ID (e.g. lucide:book-open, lucide:bug, lucide:database). Omit for automatic matching."},
        "fields": {"type": "array", "minItems": 1, "maxItems": 12, "items": {
            "type": "object", "required": ["name", "type", "role"], "additionalProperties": False,
            "properties": {"name": {"type": "string"}, "type": {"type": "string", "enum": list(features.FIELD_TYPES)},
                           "role": {"type": "string", "enum": list(features.FIELD_ROLES)}}}},
        "elements": {"type": "array", "items": {"type": "string"}, "description": "Legacy text-only detail names."}}),
    "feature_entries": ("Read current entries pushed to a project Feature Bot.", {"featureId": {"type": "string"}}),
    "feature_layout": ("Change a project Bot's one saved layout after an explicit organization decision. Use a layout supported by the Bot's existing paradigm. Read feature_list first.", {
        "featureId": {"type": "string"}, "layout": {"type": "string"}}),
    "feature_push": (
        "Save a record in a project Bot's assigned layout, or pass id to update one. Use parentId for a branch, dependsOn for true prerequisites, and relatedIds for non-directional associations. Targets must be existing cards in this Bot or its cluster. Set relationships only when supported by project records or user instructions. "
        "Give the canvas card a specific title and a short plain-text summary. Write text as a self-contained Markdown brief with the finding first, then short sections for relevant evidence, methods or next steps. Put links and figures with the finding they support. "
        "Decide based on the Bot's purpose and message intent "
        "whether to include a figure/diagram (imagePath in project folder, inline imageSvg diagram/chart, imageData, "
        "or imageUrl) plus title and caption, or concise text only. For sourced pushes, include the original "
        "publication or repository link as url and its publisher, journal, or repository name as source.",
        {
            "featureId": {"type": "string"},
            "id": {"type": "string"},
            "title": {"type": "string"},
            "text": {"type": "string"},
            "caption": {"type": "string"},
            "imagePath": {"type": "string"},
            "imageSvg": {"type": "string"},
            "imageData": {"type": "string"},
            "imageUrl": {"type": "string"},
            "url": {"type": "string"},
            "source": {"type": "string"},
            "sources": {"type": "array", "maxItems": 12,
                        "description": "Named sources for the card. Use a project recordId or a verified original url.",
                        "items": {"type": "object", "additionalProperties": False, "properties": {
                            "title": {"type": "string"}, "recordId": {"type": "string"}, "url": {"type": "string"}}}},
            "kind": {"type": "string"},
            "category": {"type": "string"}, "parentId": {"type": ["string", "null"]},
            "relatedIds": {"type": "array", "items": {"type": "string"}, "maxItems": 100},
            "visualizations": {**CHART_SCHEMA, "description": "Charts of observed or sourced data. Use actual x and y values, and name axes with units. An empty array clears existing charts."},
            "due": {"type": "string"}, "done": {"type": "boolean"},
            "dependsOn": {"type": "array", "items": {"type": "string"}},
            "eventDate": {"type": "string", "description": "Known publication or event date in YYYY-MM-DD."},
            **{name: {"type": "string", "description": label}
               for name, (label, _) in features.BOT_RECORD_TEXT_FIELDS.items()},
            "elements": {"type": "object", "additionalProperties": {"type": ["string", "number", "boolean", "null"]},
                         "description": "Values keyed by the names of the Bot's typed extension fields. Use null to clear a field."},
        },
    ),
    "rename_feature": ("Rename a Feature Bot only in response to the user's conversation. Built-in IDs are chat, feed, ideas, goals, library; custom feature IDs (feat_*) are also supported. In a project conversation this changes only that project; global changes shared builtin defaults unless projectId is specified.", {"featureId": {"type": "string"}, "label": {"type": "string"}}),
    "research_state_get": ("Read confirmed structured project state and pending proposals before planning.", {}),
    "research_state_propose": ("Propose project state changes for human confirmation; never overwrite confirmed state.", {key: {"type": "string"} for key in ("question", "stage", "hypotheses", "blockers", "nextAction", "decisions", "reason")}),
    "evidence_search": ("Search project hypotheses, experiments, conclusions and linked evidence, including source integrity.", {"query": {"type": "string"}}),
    "evidence_add": ("Propose a knowledge object with insufficient evidence status. sources must include location and optionally project-relative path.", {"kind": {"type": "string"}, "text": {"type": "string"}, "sources": {"type": "array", "items": {"type": "object"}}}),
    "evidence_link": ("Link two existing project knowledge objects; relation is supports, contradicts, tests, uses, derived_from or motivates.", {key: {"type": "string"} for key in ("source", "target", "relation", "note")}),
    "task_get": ("Read a project task result and execution events.", {"id": {"type": "string"}}),
    "experiment_list": ("List experiment parameters, metrics and logs.", {}),
    "experiment_record": ("Create or update an experiment run. Put the actual environment, script, command parameters and project-relative output paths (artifacts array) in parameters. Update the same id with observed logs, metrics and optional visualizations of measured values as they become available. Use the actual step, epoch or timestamp on the x axis.", {"id": {"type": "string"}, "name": {"type": "string"}, "parameters": {"type": "object"}, "metrics": {"type": "object"}, "visualizations": CHART_SCHEMA, "status": {"type": "string"}, "logs": {"type": "string"}, "taskId": {"type": "string"}}),
    "benchmark_list": ("List task quality evaluations.", {}),
    "benchmark_record": ("Record evidence-backed quality scores. Each dimension is 0 to 5; rationale is required. Set evaluator to Weave.", {"taskId": {"type": "string"}, "scores": {"type": "object", "properties": {key: {"type": "number"} for key in ("completeness", "correctness", "evidence", "reproducibility")}}, "rationale": {"type": "string"}, "evaluator": {"type": "string"}}),

    "project_update": ("Update project name, background or topic.", {"name": {"type": "string"}, "description": {"type": "string"}, "topic": {"type": "string"}}),
    "paper_citations": ("Get real bibliographic references from Crossref for a DOI.", {"doi": {"type": "string"}}),
    "project_list": ("List available projects.", {}),
    "project_create": ("Create a workspace project from the global assistant.", {"name": {"type": "string"}}),
    "project_get_context": ("Read current project progress, notes, resources and a compact selection of shared project memories. Use memory_search for full records and other relevant memories.", {}),
    "resource_search": ("Find project resources.", {"query": {"type": "string"}}),
    "resource_read": ("Read a registered text resource, repository listing or PDF page.", {"id": {"type": "string"}, "page": {"type": "integer"}}),
    "paper_read": ("Read one page of a registered project PDF by id, or an open arXiv PDF by arxivId (prefer an explicit version), with a source locator.", {
        "id": {"type": "string"}, "arxivId": {"type": "string"}, "page": {"type": "integer"},
    }),
    "paper_search": ("Discover paper metadata across Crossref and OpenAlex. Optionally select arXiv for preprints or Europe PMC for biomedical literature. Matching DOIs are merged and retain their sources. "
                     "Use includeStatus for a reproducible query and per-source coverage. Search metadata alone cannot substantiate full-text claims.", {
        "query": {"type": "string"}, "limit": {"type": "integer", "minimum": 1, "maximum": 25},
        "providers": {"type": "array", "minItems": 1, "maxItems": 4, "uniqueItems": True,
                      "items": {"type": "string", "enum": ["crossref", "openalex", "arxiv", "europepmc"]}},
        "includeStatus": {"type": "boolean"},
    }),
    "paper_lookup": ("Resolve a DOI, OpenAlex ID or arXiv ID to authoritative metadata and available open-access links.", {
        "id": {"type": "string"},
    }),
    "paper_neighbors": ("Follow a seed paper's outgoing references and incoming citations using the OpenAlex index. "
                        "Use a DOI, OpenAlex ID or arXiv ID. Indexed counts can exceed the returned sample and citation links do not establish scientific support.", {
        "id": {"type": "string"}, "direction": {"type": "string", "enum": ["references", "cited_by", "both"]},
        "limit": {"type": "integer", "minimum": 1, "maximum": 25},
    }),
    "idea_create": ("Save a project idea with an optional source URL.", {"text": {"type": "string"}, "url": {"type": "string"}}),
    "idea_update": ("Edit an existing idea.", {"id": {"type": "string"}, "text": {"type": "string"}}),
    "goal_create": ("Create goal or subtask with existing parent/dependency IDs.", {"text": {"type": "string"}, "due": {"type": "string"}, "parentId": {"type": "string"}, "dependsOn": {"type": "array", "items": {"type": "string"}}}),
    "goal_update": ("Update a goal's text, due date or completion.", {"id": {"type": "string"}, "text": {"type": "string"}, "due": {"type": "string"}, "done": {"type": "boolean"}}),
    "task_create": ("Queue an SDK task for user confirmation. For a research Bot's core Skill, pass the Bot's featureId within this project.", {
        "text": {"type": "string"}, "goalId": {"type": "string"}, "featureId": {"type": "string"},
    }),
    "memory_search": ("Search the shared project memories, including rules, decisions and results from the project chat and its Bots. Use a short task-specific query or a category filter. The global assistant must identify the target project explicitly.", {
        "query": {"type": "string"}, "category": {"type": "string"}, "limit": {"type": "integer"}}),
    "memory_write": ("Save a durable decision or verified observation for the project chat and every Bot in the same project. For a user-established project rule use category 'rule' and pinned:true.", {
        "text": {"type": "string"}, "category": {"type": "string"}, "pinned": {"type": "boolean"}}),
    "memory_update": ("Revise an existing shared project memory by its ID when a confirmed decision, result or user rule changes.", {
        "id": {"type": "string"}, "text": {"type": "string"}, "category": {"type": "string"}, "pinned": {"type": "boolean"}}),
    "memory_pin": ("Pin or unpin a project memory so it remains in core prompt context.", {
        "id": {"type": "string"}, "pinned": {"type": "boolean"}}),
    "global_memory_search": ("Search Weave global assistant's persistent cross-session memories (global chat only).", {
        "query": {"type": "string"}, "category": {"type": "string"}, "limit": {"type": "integer"}}),
    "global_memory_write": ("Save a durable user preference, workflow norm, or memo to global assistant memory (global chat only).", {
        "content": {"type": "string"}, "text": {"type": "string"}, "category": {"type": "string"}, "pinned": {"type": "boolean"}}),
    "global_memory_pin": ("Pin or unpin a global assistant memory (global chat only).", {
        "id": {"type": "string"}, "pinned": {"type": "boolean"}}),
}


def dispatch(request, scope, *, protocol_version="2024-11-05", bot_binding=None):
    """Handle one MCP request with the server's fixed project scope."""
    if "id" not in request:
        return None
    try:
        method = request.get("method")
        if method == "initialize":
            result = {"protocolVersion": protocol_version, "capabilities": {"tools": {}},
                      "serverInfo": {"name": "researchos", "version": "2.0.0"}}
        elif method == "tools/list":
            result = {"tools": [{"name": name, "description": description,
                                "inputSchema": {"type": "object",
                                                "properties": schema if name.startswith("global_memory_") else {**schema, "projectId": {"type": "string"}},
                                                "additionalProperties": False,
                                                **({"required": ["label", "paradigm"]} if name == "feature_create" else {})}}
                               for name, (description, schema) in TOOLS.items()]}
        elif method == "tools/call":
            params = request.get("params", {})
            try:
                name = params.get("name")
                if not isinstance(name, str) or name not in TOOLS:
                    raise workspace.WorkspaceError(404, "未公开此工具。")
                arguments = params.get("arguments", {})
                if (scope != "global" and isinstance(arguments, dict)
                        and arguments.get("projectId") not in (None, scope)):
                    raise workspace.WorkspaceError(403, "不能访问其他项目。")
                if not isinstance(arguments, dict):
                    raise workspace.WorkspaceError(400, "工具参数必须是对象。")
                if bot_binding and name in ("feature_push", "experiment_record"):
                    from tasks import task_bot
                    feature_id, session_id = bot_binding
                    bot = task_bot(scope, feature_id)
                    if name == "feature_push":
                        if arguments.get("featureId") not in (None, feature_id):
                            raise workspace.WorkspaceError(403, "后台任务只能把记录写到承接 Bot。")
                        value = project_service.call(name, {**arguments, "featureId": feature_id}, scope)
                    else:
                        if (bot.get("extension") or {}).get("base", bot["paradigm"]) != "engineering":
                            raise workspace.WorkspaceError(403, "实验运行记录由工程台 Bot 提交。")
                        import bot_activity
                        value = bot_activity.record(scope, feature_id, session_id, arguments)
                elif name == "plugin_create":
                    value = project_plugins.create(arguments.get("projectId") if scope == "global" else scope, arguments)
                elif name == "plugin_rename":
                    value = project_plugins.rename(scope, arguments.get("id"), arguments.get("name"))
                elif name == "plugin_list":
                    value = project_plugins.list_for(arguments.get("projectId", "all") if scope == "global" else scope)
                elif name in ("assistant_name_get", "assistant_rename"):
                    # Only an existing project conversation or the explicit global
                    # conversation may change/read this shared assistant setting.
                    if scope != "global":
                        project_service.project(workspace.snapshot(), scope)
                    store = naming.NamingStore()
                    value = {"name": store.assistant_name() if name == "assistant_name_get"
                             else store.rename_assistant(arguments.get("name"))}
                elif name in ("feature_labels", "feature_list", "feature_create", "feature_delete", "rename_feature"):
                    # The caller scope is bound when this MCP server is started,
                    # never accepted from tool arguments or the generic HTTP API.
                    target = arguments.get("projectId")
                    if name in ("feature_labels", "rename_feature", "feature_list") and scope == "global" and target == "global":
                        target = None
                    if name == "feature_labels":
                        if scope == "global" and target is None:
                            value = naming.NamingStore().feature_labels("global")
                        else:
                            resolved_id = target if target is not None else scope
                            project_service.project(workspace.snapshot(), resolved_id)
                            value = features.feature_labels_map(resolved_id)
                    elif name == "feature_list":
                        value = [item for item in features.list_features(scope, project_id=target)
                                 if arguments.get("includeArchived") or not item.get("archived")]
                    elif name == "feature_create":
                        value = features.create_feature(
                            scope, arguments.get("label"), arguments.get("hint", ""), project_id=target,
                            symbol=arguments.get("symbol"), keywords=arguments.get("keywords"),
                            paradigm=arguments.get("paradigm", "notes"), layout=arguments.get("layout"),
                            temporary=arguments.get("temporary", False))
                    elif name == "feature_delete":
                        value = features.delete_feature(scope, arguments.get("featureId"), project_id=target)
                    else:
                        value = features.rename_feature(
                            scope, arguments.get("featureId"), arguments.get("label"), project_id=target)
                else:
                    value = project_service.call(name, arguments, scope)
                result = {"content": [{"type": "text", "text": json.dumps(value, ensure_ascii=False)}]}
            except Exception as exc:
                result = {"isError": True, "content": [{"type": "text", "text": str(exc)}]}
        elif method == "ping":
            result = {}
        else:
            return {"jsonrpc": "2.0", "id": request["id"], "error": {"code": -32601, "message": "Unsupported method"}}
        return {"jsonrpc": "2.0", "id": request["id"], "result": result}
    except Exception as exc:
        return {"jsonrpc": "2.0", "id": request.get("id"), "error": {"code": -32603, "message": str(exc)}}


def main():
    workspace.DATA = Path(sys.argv[1])
    scope = sys.argv[2]
    bot_binding = tuple(sys.argv[3:]) or None
    for line in sys.stdin:
        try:
            request = json.loads(line)
            response = dispatch(request, scope, bot_binding=bot_binding)
        except Exception as exc:
            response = {"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": str(exc)}}
        if response is not None:
            print(json.dumps(response, ensure_ascii=True), flush=True)


if __name__ == "__main__":
    main()
