const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('playwright')

const [phase, root] = process.argv.slice(2)
const url = fs.readFileSync(0, 'utf8').trim()
const projectName = '升级兼容项目'
const sessionName = '升级前对话'
const taskName = '升级前定时任务'
const proofPath = path.join(root, 'session-proof.json')

async function main() {
  const context = await chromium.launchPersistentContext(path.join(root, 'browser'), {
    channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true, locale: 'zh-CN',
    viewport: { width: 1280, height: 820 },
  })
  const page = context.pages()[0]
  page.setDefaultTimeout(15000)
  const button = name => page.getByRole('button', { name, exact: true })
  const settings = page.locator('[data-shortcut-modal="settings"]')
  const session = page.locator('[data-conversation-session]:visible').last()
  const projectBar = page.getByRole('navigation', { name: projectName + ' 项目功能' })
  const owner = (route, payload) => page.evaluate(async ({ route, payload }) => {
    const resp = await fetch('/api/labweave/' + route, payload === undefined ? {} : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
    if (!resp.ok) throw Error(route + ' HTTP ' + resp.status)
    return resp.json()
  }, { route, payload })
  async function send(marker, prompt = marker) {
    const composer = session.locator('[contenteditable=true]:visible').last()
    await composer.click()
    await composer.fill(prompt)
    await button('发送消息').click()
    await session.getByText(prompt, { exact: true }).waitFor()
    await session.getByText(marker + '_OK', { exact: true }).waitFor({ timeout: 45000 })
    await session.locator('[data-chat-running]:not([data-holding])').waitFor({ state: 'hidden' })
  }
  async function checkSchedule() {
    const history = await owner('assistant-history')
    const task = history.schedules.find(item => item.title === taskName)
    assert.ok(task, '找不到原生定时任务')
    return task.id
  }

  let step = '打开 DSH Web'
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    await button(phase === 'before' ? 'Weave' : '打开助手').last().waitFor()
    const ids = await page.evaluate(() => window.__DSH_BOOT__.entries.map(entry => entry.id))
    assert.equal(ids.filter(id => id === 'labweave-research-workspace').length, 1)
    assert.equal(ids.filter(id => id === 'labweave-dsh-prototype').length, phase === 'before' ? 1 : 0)
    if (phase === 'before') {
      step = '完成旧版引导并保存深色主题'
      const welcome = button('继续')
      const addKey = button('添加 API Key')
      await welcome.or(addKey).first().waitFor()
      if (await welcome.isVisible()) {
        await welcome.click()
        await welcome.waitFor({ state: 'hidden' })
      }
      if (await addKey.isVisible()) {
        await addKey.click()
        await button('稍后配置').click()
      }
      await button('设置').click()
      await button('深色').click()
      await page.getByRole('button', { name: '深色', exact: true, pressed: true }).waitFor()
      await page.keyboard.press('Escape')
      await settings.waitFor({ state: 'hidden' })

      step = '旧版使用预设的自定义模型创建项目'
      await button('创建科研项目').click()
      const form = page.getByRole('dialog', { name: '创建科研项目' })
      await form.getByLabel('项目名称').fill(projectName)
      await form.getByRole('button', { name: '创建', exact: true }).click()
      await projectBar.waitFor()
      await session.getByRole('button', { name: /GPT-4o Fixture/ }).waitFor()
      await page.waitForFunction(async (name) => {
        const sessionId = document.querySelector('[data-conversation-session]')?.dataset.conversationSession
        if (!sessionId) return false
        const view = await fetch('/api/labweave/project', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, action: 'view' }) })
        return view.ok && (await view.json()).name === name
      }, projectName)

      step = '旧版保存会话、项目目标和绑定该会话的定时任务'
      await send('UPGRADE_BEFORE', '在本会话创建测试定时任务。UPGRADE_BEFORE')
      const sessionId = await session.getAttribute('data-conversation-session')
      const project = await owner('project', { sessionId, action: 'view' })
      assert.equal(project.name, projectName)
      await owner('project', { sessionId, action: 'goal_create', args: { text: '旧版科研目标' } })
      const rows = await owner('catalog')
      const { workspaceId } = rows.find(row => row.scope === project.scope)
      const history = projectBar.locator('.lw-sessions')
      await history.getByRole('button', { name: /^重命名对话 / }).click()
      const rename = page.getByRole('dialog', { name: '重命名对话' })
      await rename.getByRole('textbox').fill(sessionName)
      await rename.getByRole('button', { name: '保存', exact: true }).click()
      await history.getByRole('button', { name: sessionName, exact: true }).waitFor()
      const taskId = await checkSchedule()
      fs.writeFileSync(proofPath, JSON.stringify({ workspaceId, sessionId, scope: project.scope, taskId }))
      return
    }

    step = '升级后从侧栏打开同一个项目和旧会话'
    const old = JSON.parse(fs.readFileSync(proofPath, 'utf8'))
    const rows = await owner('catalog')
    assert.equal(rows.find(row => row.scope === old.scope).workspaceId, old.workspaceId)
    if (!(await projectBar.isVisible())) await button(projectName).click()
    await projectBar.getByRole('button', { name: sessionName, exact: true }).click()
    await page.locator(`[data-conversation-session="${old.sessionId}"]:visible`).waitFor()
    assert.equal(await session.getAttribute('data-conversation-session'), old.sessionId)
    await session.getByText('UPGRADE_BEFORE_OK', { exact: true }).waitFor()
    const project = await owner('project', { sessionId: old.sessionId, action: 'view' })
    assert.ok(project.rails.goals.some(goal => goal.text === '旧版科研目标'))
    assert.equal(await checkSchedule(), old.taskId)
    await button('设置').click()
    await page.getByRole('button', { name: '深色', exact: true, pressed: true }).waitFor()
    await page.keyboard.press('Escape')

    step = '旧会话继续对话并验证窄窗口缩放'
    await page.setViewportSize({ width: 900, height: 700 })
    await page.evaluate(() => { document.documentElement.style.zoom = '125%' })
    await send('UPGRADE_RESUME')
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1))
    await page.evaluate(() => { document.documentElement.style.zoom = '' })
    await page.setViewportSize({ width: 1280, height: 820 })

    step = '新会话自动使用旧配置中的全局默认模型'
    await projectBar.getByRole('button', { name: '在' + projectName + '中新建对话', exact: true }).click()
    await page.waitForFunction(id => {
      const current = document.querySelector('[data-conversation-session]')
      return current?.dataset.conversationSession && current.dataset.conversationSession !== id
    }, old.sessionId)
    await send('UPGRADE_NEW_SESSION')
  } catch (error) {
    console.error('失败步骤:', step)
    console.error((await page.locator('body').innerText({ timeout: 3000 }).catch(() => '')).slice(0, 1000))
    throw error
  } finally {
    await context.close()
  }
}

main().catch(error => { console.error(String(error.stack).replaceAll(url, '[test login]')); process.exitCode = 1 })
