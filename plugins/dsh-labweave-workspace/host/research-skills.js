import { readFileSync, readdirSync } from 'node:fs'

const skills = new Map(['goals', 'notes', 'mindmap', 'ideas', 'engineering'].map(paradigm => [
  paradigm,
  readFileSync(new URL('../research-skills/' + paradigm + '/SKILL.md', import.meta.url), 'utf8').trim(),
]))

export function researchSkill(bot) {
  return skills.get(bot?.extension?.base || bot?.paradigm) || ''
}

export const researchProjectLoopName = 'research-project-loop'
let projectLoop

export function researchProjectLoop() {
  const path = researchProjectLoopName + '/SKILL.md'
  if (projectLoop === undefined) {
    try { projectLoop = readFileSync(new URL('../research-workflows/' + path, import.meta.url), 'utf8') }
    catch (error) {
      if (error.code !== 'ENOENT') throw error
      projectLoop = readFileSync(new URL('../../../skills/' + path, import.meta.url), 'utf8')
    }
    projectLoop = projectLoop.replace(/^---\r?\n[\s\S]+?\r?\n---\r?\n/u, '').trim()
  }
  return projectLoop
}

export const canvasCardGuidance = [
  'In every user-facing Bot reply, progress update and card, lead with the conclusion or current result. Report what you found, checked, verified, changed or delivered. Say what remains unverified or blocked when relevant.',
  'Omit tool names, MCP names, and call-by-call narration from user-facing prose unless explicitly requested. For example, say “I found three relevant papers and verified the sample sizes of two against the original publications.” Include methods when they help the user judge or reproduce the finding.',
  'Use [file name](weave-file:<stored file ID>) to cite an existing file when a project tool has confirmed the file ID.',
  'When a saved card branches from or needs another card, include its card ID as parentId or in dependsOn. Use relatedIds for a meaningful non-directional association. Read eligible cards before linking them.',
  'Use Markdown bold for key findings and short paragraphs and headings for evidence, limits or next steps when useful. Cite material where it supports a claim using [readable source name](https://…) for an original publication or [record title](weave-record:<record ID>) for an existing record read in this project. Use the sources field when publishing a card. Use verified destinations and explain unverified evidence. Keep record IDs, card keys, raw tool output and save receipts out of visible prose. Keep scientific identifiers needed as evidence.',
  'Each card covers a single coherent update with a specific title and a one- or two-sentence plain-text summary. Write its detail as a short self-contained Markdown article. Use structured charts for real data and attach relevant project files through their dedicated fields.',
].join(' ')

export function registerResearchSkills(ctx) {
  const workflowDirectory = new URL('../research-workflows/', import.meta.url)
  const workflows = readdirSync(workflowDirectory, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => readFileSync(new URL(entry.name + '/SKILL.md', workflowDirectory), 'utf8'))
  for (const skill of [...skills.values(), ...workflows]) {
    const [, metadata, content] = /^---\r?\n([\s\S]+?)\r?\n---\r?\n([\s\S]+)$/.exec(skill)
    const [, name] = /^name:\s*([a-z0-9-]+)\s*$/m.exec(metadata)
    const description = metadata.split('description:')[1].replace(/^\s*>-?\s*/, '').trim().replace(/\s+/g, ' ')
    ctx.skills.register({ name, description, content: content.trim(), source: 'bundled' })
  }
}
