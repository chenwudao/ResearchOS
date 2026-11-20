export function registerProjectTools(ctx, { call, caller, output }) {
  function target(exec) {
    const { row, workspace } = caller(exec)
    if (row.scope === 'global') throw Error('请在具体项目的对话里使用工作区文件或 Git。')
    return { row, workspace }
  }
  const projectId = { type: 'string', description: 'Ignored in a project chat; the current project is used.' }
  const sourceId = { type: 'string', description: 'Source folder ID returned by labweave_sources_list.' }
  const sourcePath = { type: 'string', description: 'Path within the source folder, using forward slashes.' }

  for (const { name, description, action, properties, required } of [
    { name: 'labweave_sources_list', description: 'List read-only local source folders selected for this project.',
      action: 'sources/list', properties: {}, required: [] },
    { name: 'labweave_source_directory', description: 'List files and subfolders in a selected local source folder.',
      action: 'sources/directory', properties: { sourceId, path: sourcePath }, required: ['sourceId'] },
    { name: 'labweave_source_read', description: 'Read UTF-8 text or one PDF page from a local source. For text, pass nextOffset to continue reading.',
      action: 'sources/read', properties: { sourceId, path: sourcePath, page: { type: 'integer' }, offset: { type: 'integer' } },
      required: ['sourceId', 'path'] },
  ]) {
    ctx.tools.register({
      name, description, output,
      parameters: { type: 'object', additionalProperties: false, properties, required },
      async execute(args, exec) {
        const { workspace } = target(exec)
        return JSON.stringify(await call('project', { workspace, action, args }, exec.signal))
      },
    })
  }

  ctx.tools.register({
    name: 'labweave_workspace_trees',
    description: 'List this project\'s work trees and the directory contents of one path. Omit treeId and path to list the trees; pass them to list one directory.',
    parameters: { type: 'object', additionalProperties: false, properties: {
      treeId: { type: 'string' }, path: { type: 'string' }, projectId,
    } }, output,
    async execute(args, exec) {
      const { workspace } = target(exec)
      const action = args.treeId ? 'tools/listdir' : 'tools/trees'
      return JSON.stringify(await call('project', { workspace, action, args: { treeId: args.treeId, path: args.path } }, exec.signal))
    },
  })

  ctx.tools.register({
    name: 'labweave_git_status',
    description: 'Read Git status, changed files and recent commits for repositories and work trees in this project.',
    parameters: { type: 'object', additionalProperties: false, properties: { treeId: { type: 'string' }, projectId } },
    output,
    async execute(args, exec) {
      const { workspace } = target(exec)
      return JSON.stringify(await call('project', { workspace, action: 'tools/git', args: { treeId: args.treeId } }, exec.signal))
    },
  })
}
