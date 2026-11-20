const titleOf = item => item.title || String(item.text || '').split('\n', 1)[0].slice(0, 80)
const folderOf = item => item.category || ''

export function createNotebook(React, { Btn, Markdown, formatDate, resourceImage, safeUrl }) {
  const h = React.createElement
  const blank = folder => ({ title: '', text: '', category: folder, noteTags: '' })
  const commands = [
    ['标题', '# ', '', '标题'], ['粗体', '**', '**', '重点'], ['列表', '\n- ', '', '条目'],
    ['代码', '\n```python\n', '\n```\n', 'print("结果")'],
    ['表格', '\n', '\n', '| 指标 | 结果 |\n| --- | --- |\n| 准确率 | 0.90 |'],
    ['公式', '$', '$', 'x^2 + y^2 = z^2'],
  ]
  return function Notebook({ items, resources, requested, busy, save, upload, previewFile, changeLink, links,
    readHistory, askAssistant, decideSuggestion, calendars, draftGoal }) {
    const [folder, setFolder] = React.useState('')
    const [selected, setSelected] = React.useState('')
    const [tag, setTag] = React.useState('')
    const [query, setQuery] = React.useState('')
    const [folderDraft, setFolderDraft] = React.useState(null)
    const [editor, setEditor] = React.useState(null)
    const [preview, setPreview] = React.useState(false)
    const [wide, setWide] = React.useState(false)
    const [attachment, setAttachment] = React.useState('')
    const [image, setImage] = React.useState(null)
    const [history, setHistory] = React.useState(null)
    const [aiRequest, setAiRequest] = React.useState('')
    const [excerpt, setExcerpt] = React.useState('')
    const [calendarId, setCalendarId] = React.useState('')
    const calendar = calendars.find(item => item.id === calendarId) || calendars[0]
    const textarea = React.useRef(null)
    const noteText = React.useRef(null)
    const input = React.useRef(null)
    const documents = items.filter(item => item.kind !== 'note-folder')
    const active = documents.find(item => item.id === selected)
    const proposal = active?.noteSuggestion
    const proposalCurrent = proposal?.baseVersion === active?.noteVersion
    const paths = [...new Set(items.flatMap(item => folderOf(item).split('/').filter(Boolean)
      .map((_, n, parts) => parts.slice(0, n + 1).join('/'))))].sort((a, b) => a.localeCompare(b, 'zh-CN'))
    const tags = [...new Set(documents.flatMap(item => item.noteTags || []))].sort()
    const visible = documents.filter(item => (!folder || folderOf(item) === folder || folderOf(item).startsWith(folder + '/')) &&
      (!tag || item.noteTags?.includes(tag)) && (!query.trim() || (titleOf(item) + '\n' + item.text).toLowerCase().includes(query.trim().toLowerCase())))
    const attached = new Set((active?.recordRefs || []).filter(ref => ref.featureId === 'library').map(ref => ref.id))
    const open = id => {
      setSelected(id); setEditor(null); setPreview(false); setAttachment(''); setImage(null); setHistory(null); setAiRequest(''); setExcerpt('')
    }
    React.useEffect(() => { if (requested) open(requested.id) }, [requested])

    function insert(before, after, example) {
      const field = textarea.current
      const from = field?.selectionStart ?? editor.text.length
      const to = field?.selectionEnd ?? from
      const content = editor.text.slice(from, to) || example
      setEditor({ ...editor, text: editor.text.slice(0, from) + before + content + after + editor.text.slice(to) })
      requestAnimationFrame(() => {
        field?.focus()
        field?.setSelectionRange(from + before.length, from + before.length + content.length)
      })
    }
    async function commit(event) {
      event.preventDefault()
      const { id, expectedNoteVersion, title, text, category, noteTags: rawTags } = editor
      if (busy || !title.trim() || !text.trim()) return
      const noteTags = rawTags.split(/[,，、]/).map(value => value.trim()).filter(Boolean)
      const result = await save({ ...(id && { id, expectedNoteVersion }), title: title.trim(), text: text.trim(),
        category: category.trim(), noteTags, kind: 'note' })
      if (result?.id) {
        if (folder && category !== folder && !category.startsWith(folder + '/')) setFolder(category.trim())
        open(result.id)
      }
    }
    async function addFolder(event) {
      event.preventDefault()
      const title = folderDraft.trim()
      if (!title || busy) return
      const category = folder ? folder + '/' + title : title
      if (await save({ title, text: title, category, kind: 'note-folder' })) {
        setFolder(category)
        setFolderDraft(null)
      }
    }
    function openResource(resource) {
      const src = resourceImage(resource)
      if (src) return setImage({ src, name: titleOf(resource) })
      if (resource.path || /\/api\/workspace\/pdf\//.test(resource.url || '')) previewFile(resource.id)
    }
    function captureSelection() {
      const selection = window.getSelection()
      const selectedText = selection?.anchorNode && selection.focusNode && noteText.current?.contains(selection.anchorNode)
        && noteText.current.contains(selection.focusNode) ? selection.toString().trim().slice(0, 1500) : ''
      setExcerpt(selectedText)
    }
    async function suggest(event) {
      event.preventDefault()
      if (!active || editor || !aiRequest.trim() || busy) return
      if (await askAssistant(active, aiRequest.trim(), excerpt)) {
        setAiRequest('')
        setExcerpt('')
      }
    }
    const toggle = (label, active, onClick) => Btn({ variant: 'ghost', size: 'xs', 'aria-pressed': active, onClick }, label)
    const field = (label, key, props = {}) => h('label', null, label,
      h('input', { className: 'lw-input', value: editor[key], onChange: e => setEditor({ ...editor, [key]: e.target.value }), ...props }))
    const resourceRow = (item, remove) => h('li', { key: item.id },
      safeUrl(item.url) && !item.path ? h('a', { href: safeUrl(item.url), target: '_blank', rel: 'noopener noreferrer' }, titleOf(item))
        : Btn({ variant: 'ghost', size: 'xs', onClick: () => openResource(item) }, titleOf(item)),
      remove && Btn({ variant: 'ghost', size: 'xs', disabled: busy, 'aria-label': '解除附件 ' + titleOf(item), onClick: remove }, '解除'))

    return h('section', { className: 'lw-notebook', 'aria-label': '项目笔记资料库', 'data-wide': wide },
      h('header', { className: 'lw-notebook-toolbar' },
        h('strong', null, '笔记与资料'),
        h('div', { className: 'lw-actions' },
          Btn({ size: 'xs', disabled: Boolean(editor), onClick: () => { setSelected(''); setHistory(null); setEditor(blank(folder)) } }, '新建笔记'),
          toggle(wide ? '退出宽屏' : '宽屏编辑', wide, () => setWide(!wide)))),
      h('div', { className: 'lw-notebook-body' },
        !wide && h('aside', { className: 'lw-notebook-tree', 'aria-label': '笔记目录' },
          h('input', { type: 'search', className: 'lw-input', 'aria-label': '搜索笔记', placeholder: '搜索笔记', value: query,
            onChange: event => setQuery(event.target.value) }),
          toggle('全部笔记', !folder, () => setFolder('')),
          paths.map(path => h('div', { key: path, style: { paddingInlineStart: Math.min(5, path.split('/').length - 1) * 10 } },
            toggle(path.split('/').at(-1), path === folder, () => setFolder(path)))),
          folderDraft === null ? Btn({ variant: 'ghost', size: 'xs', onClick: () => setFolderDraft('') }, '新增目录')
            : h('form', { className: 'lw-notebook-form', onSubmit: addFolder },
              h('input', { className: 'lw-input', 'aria-label': '目录名称', required: true, value: folderDraft,
                onChange: event => setFolderDraft(event.target.value) }),
              h('div', { className: 'lw-actions' },
                Btn({ type: 'submit', size: 'xs', disabled: busy }, '保存目录'),
                Btn({ variant: 'ghost', size: 'xs', onClick: () => setFolderDraft(null) }, '取消'))),
          tags.length > 0 && h('select', { className: 'lw-select', 'aria-label': '按标签筛选', value: tag,
            onChange: event => setTag(event.target.value) },
            h('option', { value: '' }, '全部标签'), tags.map(name => h('option', { key: name }, name))),
          h('div', { className: 'lw-notebook-files' },
            visible.length ? visible.map(item => h('div', { key: item.id },
              Btn({ variant: 'ghost', size: 'xs', disabled: Boolean(editor), 'aria-current': selected === item.id ? 'page' : undefined,
                onClick: () => open(item.id) }, titleOf(item)))) : h('p', { className: 'lw-hint' }, '暂无匹配笔记')),
          h('details', null, h('summary', null, '项目资料库'),
            resources.length ? h('ul', null, resources.map(item => resourceRow(item))) : h('p', { className: 'lw-hint' }, '暂无导入资料'))),
        h('article', { className: 'lw-notebook-document', 'aria-label': '笔记正文' },
          editor ? h('form', { className: 'lw-notebook-form', onSubmit: commit },
            field('笔记标题', 'title', { required: true, maxLength: 240 }),
            h('div', { className: 'lw-notebook-metadata' }, field('归档目录', 'category', { placeholder: '例如：文献/方法', maxLength: 80 }),
              field('标签', 'noteTags', { placeholder: '用逗号分隔' })),
            h('div', { className: 'lw-notebook-toolbar' }, h('div', { className: 'lw-actions' },
              toggle('编辑正文', !preview, () => setPreview(false)), toggle('预览笔记', preview, () => setPreview(true))),
              !preview && h('div', { className: 'lw-actions', 'aria-label': '编辑格式' }, commands.map(([name, before, after, example]) =>
                Btn({ variant: 'ghost', size: 'xs', key: name, onClick: () => insert(before, after, example) }, name)))),
            preview ? h(Markdown, { source: editor.text, notebook: true }) :
              h('textarea', { className: 'lw-textarea', ref: textarea, rows: 10, value: editor.text,
                'aria-label': '笔记内容', maxLength: 16000, onChange: event => setEditor({ ...editor, text: event.target.value }) }),
            h('div', { className: 'lw-actions' },
              Btn({ variant: 'primary', size: 'xs', type: 'submit', disabled: busy || !editor.title.trim() || !editor.text.trim() }, '保存笔记'),
              Btn({ variant: 'ghost', size: 'xs', onClick: () => { setEditor(null); setPreview(false); if (editor.id) setSelected(editor.id) } }, '取消编辑'))) :
            active ? h(React.Fragment, null,
              h('h2', null, titleOf(active)),
              h('p', { className: 'lw-hint' }, [folderOf(active), active.noteOrigin === 'assistant' ? 'AI 写入' : active.source,
                formatDate(active.noteEditedAt || active.ts)].filter(Boolean).join(' · ')),
              active.noteTags?.length > 0 && h('ul', { className: 'lw-notebook-tags', 'aria-label': '笔记标签' },
                active.noteTags.map(name => h('li', { key: name }, name))),
              h('div', { ref: noteText, onMouseUp: captureSelection, onKeyUp: captureSelection },
                h(Markdown, { source: active.text, notebook: true })),
              h('div', { className: 'lw-actions' },
                Btn({ size: 'xs', onClick: () => setEditor({ id: active.id, expectedNoteVersion: active.noteVersion || 1,
                  title: titleOf(active), text: active.text, category: folderOf(active), noteTags: (active.noteTags || []).join(', ') }) }, '编辑笔记'),
                Btn({ variant: 'ghost', size: 'xs', disabled: busy, onClick: async () => setHistory(history ? null : await readHistory(active)) },
                  history ? '收起版本历史' : '查看版本历史')),
              history?.versions && h('section', { 'aria-label': '笔记版本历史' }, history.versions.map(version =>
                h('details', { key: version.version },
                  h('summary', null, '第 ' + version.version + ' 版 · ' + (version.author === 'assistant' ? 'AI' : '用户') + ' · ' + formatDate(version.at)),
                  h(Markdown, { source: version.text, notebook: true })))),
              proposal && h('section', { className: 'lw-note-proposal', 'aria-label': 'AI 整理草稿' },
                h('h3', null, 'AI 整理草稿'),
                proposal.reason && h('p', { className: 'lw-hint' }, proposal.reason),
                !proposalCurrent && h('p', { role: 'status', className: 'lw-hint' }, '原笔记有新版本，请重新生成建议。'),
                h('div', { className: 'lw-note-comparison' },
                  h('div', null, h('h4', null, '当前正文'), h(Markdown, { source: active.text, notebook: true })),
                  h('div', null, h('h4', null, '建议正文'), h(Markdown, { source: proposal.text, notebook: true }))),
                h('div', { className: 'lw-actions' },
                  Btn({ variant: 'primary', size: 'xs', disabled: busy || !proposalCurrent,
                    onClick: async () => { if (await decideSuggestion(active, proposal, true)) setHistory(null) } }, '采纳整理'),
                  Btn({ variant: 'ghost', size: 'xs', disabled: busy,
                    onClick: () => decideSuggestion(active, proposal, false) }, '忽略草稿')))) :
            h('p', { className: 'lw-hint' }, '从左侧选择一篇笔记，或新建笔记。'),
          image && h('figure', { className: 'lw-notebook-attachment-preview' },
            h('figcaption', null, image.name, Btn({ variant: 'ghost', size: 'xs', onClick: () => setImage(null) }, '关闭预览')),
            h('img', { src: image.src, alt: image.name }))),
        !wide && active && h('aside', { className: 'lw-notebook-context', 'aria-label': '笔记附件与关联' },
          h('h3', null, '附件'),
          h('ul', null, resources.filter(item => attached.has(item.id)).map(item =>
            resourceRow(item, () => changeLink(active, { featureId: 'library', id: item.id }, true)))),
          h('div', { className: 'lw-notebook-form' },
            h('select', { className: 'lw-select', 'aria-label': '选择项目资料', value: attachment, onChange: event => setAttachment(event.target.value) },
              h('option', { value: '' }, '选择已有资料'),
              resources.filter(item => !attached.has(item.id)).map(item => h('option', { value: item.id, key: item.id }, titleOf(item)))),
            h('div', { className: 'lw-actions' },
              Btn({ size: 'xs', disabled: !attachment || busy, onClick: async () => {
                if (await changeLink(active, { featureId: 'library', id: attachment }, false)) setAttachment('')
              } }, '关联附件'),
              Btn({ variant: 'ghost', size: 'xs', disabled: busy, onClick: () => input.current?.click() }, '上传附件')),
            h('input', { type: 'file', 'aria-label': '笔记附件文件', ref: input, hidden: true, onChange: event => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) upload(active, file)
            } })),
          links(active),
          calendar && h('div', { className: 'lw-notebook-form' },
            calendars.length > 1 && h('select', { className: 'lw-select', 'aria-label': '目标日历', value: calendar.id,
              onChange: event => setCalendarId(event.target.value) }, calendars.map(item => h('option', { key: item.id, value: item.id }, item.label))),
            Btn({ size: 'xs', disabled: busy || Boolean(editor), onClick: () => draftGoal(active, calendar.id) }, '转为待办草稿')),
          h('details', { className: 'lw-notebook-ai' },
            h('summary', null, 'AI 辅助整理'),
            h('form', { className: 'lw-notebook-form', onSubmit: suggest },
              excerpt && h('div', { className: 'lw-actions' },
                h('span', { className: 'lw-hint' }, '仅整理选中的段落'),
                Btn({ variant: 'ghost', size: 'xs', onClick: () => setExcerpt('') }, '取消选段')),
              h('textarea', { className: 'lw-textarea', rows: 2, maxLength: 1000, value: aiRequest,
                'aria-label': '笔记整理要求', placeholder: '例如：按观察、证据、下一步整理',
                onChange: event => setAiRequest(event.target.value) }),
              Btn({ type: 'submit', size: 'xs', disabled: busy || Boolean(editor) || !aiRequest.trim() }, '生成整理草稿'))))))
  }
}
