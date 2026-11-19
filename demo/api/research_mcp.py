"""LabWeave tools using the standard MCP stdio transport."""
import json
from pathlib import Path
import sys
import workspace
import project_service
import naming
import project_plugins
import features

TOOLS = {
    "plugin_create": ("Create a reusable research instruction plugin. A global conversation must explicitly set projectId to one project or 'all'. Project conversations can only create a plugin for themselves.", {"name": {"type": "string"}, "prompt": {"type": "string"}}),
    "plugin_rename": ("Rename a custom research plugin in this conversation's permitted scope.", {"id": {"type": "string"}, "name": {"type": "string"}}),
    "plugin_list": ("List instruction plugins applicable to the current or explicitly selected project.", {}),
    "assistant_name_get": ("Read the global assistant's current display name.", {}),
    "assistant_rename": ("Change the global assistant's display name when requested in the conversation.", {"name": {"type": "string"}}),
    "feature_labels": ("Read active research feature IDs and their current display names for this conversation scope. A global conversation may optionally specify projectId.", {}),
    "feature_list": ("List active Feature Bots for the current project or explicitly specified projectId. Global assistant itself retains only the core chat assistant.", {}),
    "feature_create": ("Add a custom Feature Bot with a name, description, symbol and keywords. Global chat must specify an explicit projectId or 'all'; project chat adds only to its own project.", {"label":{"type":"string"},"hint":{"type":"string"},"symbol":{"type":"string","enum":list(features.BOT_SYMBOLS)},"keywords":{"type":"array","items":{"type":"string"}}}),
    "feature_delete": ("Remove a non-chat Feature Bot (builtin feed/ideas/goals/library or custom feature) from the specified projectId/'all' (global chat) or current project. Cannot delete 'chat'.", {"featureId": {"type": "string"}}),
    "feature_entries": ("Read current entries pushed to a project Feature Bot.", {"featureId": {"type": "string"}}),
    "feature_push": (
        "Push a message or illustrated summary card into a project Feature Bot's timeline stream, "
        "or pass id to update an existing entry. Decide based on the Bot's purpose and message intent "
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
            "kind": {"type": "string"},
        },
    ),
    "rename_feature": ("Rename a research Feature Bot only in response to the user's conversation. Built-in IDs are chat, feed, ideas, goals, library; custom feature IDs (feat_*) are also supported. In a project conversation this changes only that project; global changes shared builtin defaults unless projectId is specified.", {"featureId": {"type": "string"}, "label": {"type": "string"}}),
    "research_state_get": ("Read confirmed structured research state and pending proposals before planning.", {}),
    "research_state_propose": ("Propose research state changes for human confirmation; never overwrite confirmed state.", {key: {"type": "string"} for key in ("question", "stage", "hypotheses", "blockers", "nextAction", "decisions", "reason")}),
    "evidence_search": ("Search project hypotheses, experiments, conclusions and linked evidence, including source integrity.", {"query": {"type": "string"}}),
    "evidence_add": ("Propose a knowledge object with insufficient evidence status. sources must include location and optionally project-relative path.", {"kind": {"type": "string"}, "text": {"type": "string"}, "sources": {"type": "array", "items": {"type": "object"}}}),
    "evidence_link": ("Link two existing project knowledge objects; relation is supports, contradicts, tests, uses, derived_from or motivates.", {key: {"type": "string"} for key in ("source", "target", "relation", "note")}),
    "workflow_list": ("List approved experimental workflows and checkpoints. Drafts do not execute until the user approves in the UI.", {}),
    "workflow_get": ("Inspect a workflow, protocol, experiment runs, diagnostics and recommendations.", {"id": {"type": "string"}}),
    "workflow_draft": ("Save an editable experiment plan only. plan requires question, hypothesis, python, inputs, methods [{name,script,args}], matrix {seeds,budgets}, protocol {metric,direction,baseline,split,minSeeds,minImprovement,maxStd}, budget {maxRuns,concurrency,timeoutSeconds,retries,wallSeconds}. args must contain {seed}, {budget}, {metrics}. Scripts output JSON or one-row CSV with primary metric and split_id. Do not run the experiment yourself; wait for human budget approval.", {"plan": {"type": "object"}, "id": {"type": "string"}, "revision": {"type": "integer"}, "parentId": {"type": "string"}}),
    "task_get": ("Read a project task result and execution events.", {"id": {"type": "string"}}),
    "experiment_list": ("List experiment parameters, metrics and logs.", {}),
    "experiment_record": ("Create or update an experiment run.", {"id": {"type": "string"}, "name": {"type": "string"}, "parameters": {"type": "object"}, "metrics": {"type": "object"}, "status": {"type": "string"}, "logs": {"type": "string"}, "taskId": {"type": "string"}}),
    "benchmark_list": ("List research task quality evaluations.", {}),
    "benchmark_record": ("Record evidence-backed quality scores. Each dimension is 0 to 5; rationale is required. Set evaluator to Weave.", {"taskId": {"type": "string"}, "scores": {"type": "object", "properties": {key: {"type": "number"} for key in ("completeness", "correctness", "evidence", "reproducibility")}}, "rationale": {"type": "string"}, "evaluator": {"type": "string"}}),

    "project_update": ("Update project name, background or topic.", {"name": {"type": "string"}, "description": {"type": "string"}, "topic": {"type": "string"}}),
    "paper_citations": ("Get real bibliographic references from Crossref for a DOI.", {"doi": {"type": "string"}}),
    "project_list": ("List available research projects.", {}),
    "project_create": ("Create a workspace project from the global assistant.", {"name": {"type": "string"}}),
    "project_get_context": ("Read the current project details, notes, and resources.", {}),
    "resource_search": ("Find project resources.", {"query": {"type": "string"}}),
    "resource_read": ("Read a registered text resource, repository listing or PDF page.", {"id": {"type": "string"}, "page": {"type": "integer"}}),
    "paper_read": ("Read one page of a registered PDF with page attribution.", {"id": {"type": "string"}, "page": {"type": "integer"}}),
    "paper_search": ("Search real Crossref paper metadata.", {"query": {"type": "string"}}),
    "idea_create": ("Save a research idea with optional paper URL.", {"text": {"type": "string"}, "url": {"type": "string"}}),
    "idea_update": ("Edit an existing idea.", {"id": {"type": "string"}, "text": {"type": "string"}}),
    "goal_create": ("Create goal or subtask with existing parent/dependency IDs.", {"text": {"type": "string"}, "due": {"type": "string"}, "parentId": {"type": "string"}, "dependsOn": {"type": "array", "items": {"type": "string"}}}),
    "goal_update": ("Update a goal's text, due date or completion.", {"id": {"type": "string"}, "text": {"type": "string"}, "due": {"type": "string"}, "done": {"type": "boolean"}}),
    "task_create": ("Queue a new task for user confirmation.", {"text": {"type": "string"}, "goalId": {"type": "string"}}),
    "memory_search": ("Search persistent project research decisions and results (FTS5 + recency + pinned).", {
        "query": {"type": "string"}, "category": {"type": "string"}, "limit": {"type": "integer"}}),
    "memory_write": ("Save or deduplicate a durable research decision or observation in the project.", {
        "text": {"type": "string"}, "category": {"type": "string"}, "pinned": {"type": "boolean"}}),
    "memory_pin": ("Pin or unpin a project memory so it remains in core prompt context.", {
        "id": {"type": "string"}, "pinned": {"type": "boolean"}}),
    "global_memory_search": ("Search Weave global assistant's persistent cross-session memories (global chat only).", {
        "query": {"type": "string"}, "category": {"type": "string"}, "limit": {"type": "integer"}}),
    "global_memory_write": ("Save a durable user preference, workflow norm, or memo to global assistant memory (global chat only).", {
        "content": {"type": "string"}, "text": {"type": "string"}, "category": {"type": "string"}, "pinned": {"type": "boolean"}}),
    "global_memory_pin": ("Pin or unpin a global assistant memory (global chat only).", {
        "id": {"type": "string"}, "pinned": {"type": "boolean"}}),
}


def dispatch(request, scope, *, protocol_version="2024-11-05"):
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
                                                "additionalProperties": False}}
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
                if name == "plugin_create":
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
                        value = features.list_features(scope, project_id=target)
                    elif name == "feature_create":
                        value = features.create_feature(
                            scope, arguments.get("label"), arguments.get("hint", ""), project_id=target,
                            symbol=arguments.get("symbol","✦"), keywords=arguments.get("keywords"))
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
    for line in sys.stdin:
        try:
            request = json.loads(line)
            response = dispatch(request, scope)
        except Exception as exc:
            response = {"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": str(exc)}}
        if response is not None:
            print(json.dumps(response, ensure_ascii=True), flush=True)


if __name__ == "__main__":
    main()
