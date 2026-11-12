"""ResearchOS tools using the standard MCP stdio transport."""
import json
from pathlib import Path
import sys
import workspace
import project_service

TOOLS = {
    "task_get": ("Read a project task result and execution events.", {"id": {"type": "string"}}),
    "experiment_list": ("List experiment parameters, metrics and logs.", {}),
    "experiment_record": ("Create or update an experiment run.", {"id": {"type": "string"}, "name": {"type": "string"}, "parameters": {"type": "object"}, "metrics": {"type": "object"}, "status": {"type": "string"}, "logs": {"type": "string"}, "taskId": {"type": "string"}}),
    "benchmark_list": ("List research task quality evaluations.", {}),
    "benchmark_record": ("Record evidence-backed quality scores. Each dimension is 0 to 5; rationale is required. Set evaluator to DSH.", {"taskId": {"type": "string"}, "scores": {"type": "object", "properties": {key: {"type": "number"} for key in ("completeness", "correctness", "evidence", "reproducibility")}}, "rationale": {"type": "string"}, "evaluator": {"type": "string"}}),

    "project_update": ("Update project name, background or topic.", {"name": {"type": "string"}, "description": {"type": "string"}, "topic": {"type": "string"}}),
    "paper_citations": ("Get real bibliographic references from Crossref for a DOI.", {"doi": {"type": "string"}}),
    "project_list": ("List available research projects.", {}),
    "project_create": ("Create a research project from the global assistant.", {"name": {"type": "string"}}),
    "project_get_context": ("Read current project, notes, resources and long-term memories.", {}),
    "resource_search": ("Find project resources.", {"query": {"type": "string"}}),
    "resource_read": ("Read a registered text resource, repository listing or PDF page.", {"id": {"type": "string"}, "page": {"type": "integer"}}),
    "paper_read": ("Read one page of a registered PDF with page attribution.", {"id": {"type": "string"}, "page": {"type": "integer"}}),
    "paper_search": ("Search real Crossref paper metadata.", {"query": {"type": "string"}}),
    "idea_create": ("Save a research idea with optional paper URL.", {"text": {"type": "string"}, "url": {"type": "string"}}),
    "idea_update": ("Edit an existing idea.", {"id": {"type": "string"}, "text": {"type": "string"}}),
    "goal_create": ("Create goal or subtask with existing parent/dependency IDs.", {"text": {"type": "string"}, "due": {"type": "string"}, "parentId": {"type": "string"}, "dependsOn": {"type": "array", "items": {"type": "string"}}}),
    "goal_update": ("Update a goal's text, due date or completion.", {"id": {"type": "string"}, "text": {"type": "string"}, "due": {"type": "string"}, "done": {"type": "boolean"}}),
    "task_create": ("Queue a new task for user confirmation.", {"text": {"type": "string"}, "goalId": {"type": "string"}}),
    "memory_search": ("Search persistent research decisions and results.", {"query": {"type": "string"}}),
    "memory_write": ("Save a durable research decision or observation.", {"text": {"type": "string"}, "category": {"type": "string"}}),
}


def main():
    workspace.DATA = Path(sys.argv[1])
    scope = sys.argv[2]
    for line in sys.stdin:
        request = {}
        try:
            request = json.loads(line)
            method = request.get("method")
            if "id" not in request:
                continue
            if method == "initialize":
                result = {"protocolVersion": "2024-11-05", "capabilities": {"tools": {}},
                          "serverInfo": {"name": "researchos", "version": "2.0.0"}}
            elif method == "tools/list":
                result = {"tools": [{"name": name, "description": description,
                                    "inputSchema": {"type": "object", "properties": {**schema, "projectId": {"type": "string"}}, "additionalProperties": False}}
                                   for name, (description, schema) in TOOLS.items()]}
            elif method == "tools/call":
                params = request.get("params", {})
                try:
                    value = project_service.call(params["name"], params.get("arguments", {}), scope)
                    result = {"content": [{"type": "text", "text": json.dumps(value, ensure_ascii=False)}]}
                except Exception as exc:
                    result = {"isError": True, "content": [{"type": "text", "text": str(exc)}]}
            elif method == "ping":
                result = {}
            else:
                raise ValueError("Unsupported method")
            response = {"jsonrpc": "2.0", "id": request["id"], "result": result}
        except Exception as exc:
            response = {"jsonrpc": "2.0", "id": request.get("id"), "error": {"code": -32603, "message": str(exc)}}
        print(json.dumps(response, ensure_ascii=True), flush=True)


if __name__ == "__main__":
    main()
