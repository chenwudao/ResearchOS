export function registerProjectTools(ctx, { call, caller, output }) {
  function target(exec) {
    const { row, workspace } = caller(exec)
    if (row.scope === 'global') throw Error('请在具体科研项目的对话里使用工作区文件、Git 或存储空间。')
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

  ctx.tools.register({
    name: 'labweave_storage_list',
    description: 'List this project\'s keyword-category storage space and the files in each category.',
    parameters: { type: 'object', additionalProperties: false, properties: { projectId } }, output,
    async execute(_args, exec) {
      const { workspace } = target(exec)
      return JSON.stringify(await call('project', { workspace, action: 'tools/storage/list', args: {} }, exec.signal))
    },
  })

  ctx.tools.register({
    name: 'labweave_storage_define',
    description: 'Create or update a keyword storage category in this project. Same name updates the existing category and its keywords. Use this when the user asks to organize files by topic.',
    parameters: { type: 'object', additionalProperties: false, properties: {
      name: { type: 'string' }, keywords: { type: 'array', items: { type: 'string' } }, id: { type: 'string' }, projectId,
    }, required: ['name'] }, output,
    async execute(args, exec) {
      const { workspace } = target(exec)
      return JSON.stringify(await call('project', { workspace, action: 'tools/storage/define', args }, exec.signal))
    },
  })

  ctx.tools.register({
    name: 'labweave_storage_save',
    description: 'Copy an existing project-relative file into a keyword storage category. Pass the category name or id, and the source path relative to the project folder.',
    parameters: { type: 'object', additionalProperties: false, properties: {
      category: { type: 'string' }, source: { type: 'string' }, name: { type: 'string' }, projectId,
    }, required: ['category', 'source'] }, output,
    async execute(args, exec) {
      const { workspace } = target(exec)
      return JSON.stringify(await call('project', { workspace, action: 'tools/storage/save', args }, exec.signal))
    },
  })

  ctx.tools.register({
    name: 'labweave_storage_remove',
    description: 'Remove a file from a storage category, or delete the category and its files when path is omitted.',
    parameters: { type: 'object', additionalProperties: false, properties: {
      category: { type: 'string' }, path: { type: 'string' }, projectId,
    }, required: ['category'] }, output,
    async execute(args, exec) {
      const { workspace } = target(exec)
      const action = args.path ? 'tools/storage/remove-file' : 'tools/storage/remove-category'
      return JSON.stringify(await call('project', { workspace, action, args: { category: args.category, id: args.category, path: args.path } }, exec.signal))
    },
  })
}
