"""HTTP actions and MCP tools for structured research state and evidence."""
import project_service as projects
import research_ledger as ledger
import workspace


def overview(payload):
    project = payload.get('projectId')
    return {'state': ledger.state(project), 'workflows': [],
            'evidence': ledger.graph(project, payload.get('query', '')), 'directory': str(projects.folder(project))}


def call_tool(name, args, project):
    if name == 'research_state_get':
        return ledger.state(project)
    if name == 'research_state_propose':
        return ledger.save_state(project, args, proposal=True)
    if name == 'evidence_search':
        return ledger.graph(project, args.get('query', ''))
    if name == 'evidence_add':
        return ledger.put_node(project, args)
    if name == 'evidence_link':
        return ledger.link(project, args)
    raise workspace.WorkspaceError(404, '未知科研工具。')


POST = {
    'research/overview': overview,
    'research/state': lambda p: ledger.save_state(p.get('projectId'), p),
    'research/evidence': lambda p: ledger.put_node(p.get('projectId'), p),
    'research/link': lambda p: ledger.link(p.get('projectId'), p),
    'research/review-evidence': lambda p: ledger.set_status(p.get('projectId'), p),
}
