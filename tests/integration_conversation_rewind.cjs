const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const { chromium } = require('playwright')

async function main(url, afterRestart, home) {
  const channel = process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : 'chromium')
  const browser = await chromium.launch({ channel, headless: true })
  const page = await browser.newPage({ locale: 'zh-CN', viewport: { width: 1360, height: 850 } })
  page.on('pageerror', error => console.error(error.message))
  page.on('console', message => {
    if (message.type() === 'error' || message.type() === 'warning') {
      const lines = message.text().split('\n')
      console.error(lines.slice(0, lines[0].startsWith('web boot:') ? 3 : 1).join('\n'))
    }
  })
  page.setDefaultTimeout(12000)
  const button = (area, name) => area.getByRole('button', { name, exact: true })
  let step = 'onboarding'
  try {
    await page.goto(url)
    const nativeArea = () => page.locator('[data-conversation-session]:visible').last()
    if (afterRestart) {
      step = 'resume after restarting Weave'
      await button(page, '打开助理').first().click()
      await button(page, '助手历史对话').click()
      const history = page.getByRole('dialog', { name: '助手历史对话列表', exact: true })
      await history.locator('.lw-session-popover-list .lw-row-main').first().click()
      const conversation = nativeArea()
      await conversation.getByText('REWIND_GLOBAL_4_REPLY', { exact: true }).waitFor()
      assert.equal(await conversation.getByText('REWIND_GLOBAL_2_ASK', { exact: true }).count(), 0)
      await conversation.locator('[contenteditable=true]').last().fill('REWIND_GLOBAL_5_ASK')
      await button(conversation, '发送消息').click()
      await conversation.getByText('REWIND_GLOBAL_5_REPLY', { exact: true }).waitFor()
      console.log('Host restart and continued conversation verified')
      return
    }

    step = 'set the global assistant permission'
    await button(page, '设置').click()
    const settings = page.locator('[data-shortcut-modal="settings"]')
    await button(settings, '助手设置').click()
    const permission = settings.getByLabel('助手权限', { exact: true })
    await permission.selectOption('read-only')
    await settings.getByText('此设置仅作用于全局助手，从下一轮回复起生效。', { exact: true }).waitFor()
    await page.keyboard.press('Escape')
    await settings.waitFor({ state: 'hidden' })

    async function check(section, area, composer, sendLabel, bot = false) {
      const ask = n => 'REWIND_' + section + '_' + n + '_ASK'
      const reply = n => 'REWIND_' + section + '_' + n + '_REPLY'
      const content = text => bot ? area.locator('.lw-bot-msg').filter({ hasText: text }).last()
        : area.locator('[data-chat-flow-kind]').getByText(text, { exact: true }).last()
      async function send(n) {
        const checkProgress = n === 1 && section !== 'PROJECT'
        await composer.fill(ask(n) + (checkProgress ? ' ' + '核对科研记录'.repeat(30) : ''))
        await button(area, sendLabel).click()
        const progress = area.locator('.lw-turn-progress')
        if (checkProgress) {
          await progress.getByRole('status').filter({ hasText: ask(n) }).waitFor()
          await progress.getByText(/正在整理.*结果/).waitFor()
          await progress.getByText('正在推理', { exact: true }).waitFor()
          await progress.locator('time').waitFor()
          assert.equal(await area.locator('[data-chat-running]:visible').count(), 0)
          assert.equal(await progress.count(), 1)
          const card = await area.locator(bot ? '.lw-fbot-composer' : '[data-composer-card]').boundingBox()
          const strip = await progress.boundingBox()
          assert.ok(Math.abs(card.x - strip.x) <= 2 && Math.abs(card.width - strip.width) <= 2 &&
            strip.y + strip.height <= card.y + 1, JSON.stringify({ card, strip }))
          await progress.getByText('正在生成回复', { exact: true }).waitFor()
        }
        await content(reply(n)).waitFor()
        if (checkProgress) await progress.waitFor({ state: 'hidden' })
      }
      async function select(role, n) {
        const label = role === 'user' ? '撤回提问' : '撤回答复'
        const message = content(role === 'user' ? ask(n) : reply(n))
        let row
        if (bot) {
          row = message
        } else if (role === 'user') {
          row = message.locator('xpath=ancestor::*[@data-chat-flow-kind="user"][1]')
        } else {
          const turn = await message.locator('xpath=ancestor::*[@data-chat-turn][1]').getAttribute('data-chat-turn')
          row = area.locator(`[data-chat-flow-kind="turn-tail"][data-chat-turn="${turn}"]`)
        }
        await row.hover()
        await button(row, label).click()
        return page.getByRole('dialog', { name: label, exact: true })
      }
      async function confirm(dialog) {
        const box = await dialog.boundingBox()
        const viewport = page.viewportSize()
        assert.ok(box && box.x >= 0 && box.x + box.width <= viewport.width + 1)
        const request = page.waitForRequest(item => item.url().endsWith('/api/labweave/conversation-rewind'))
        await button(dialog, '确认撤回').click()
        await dialog.waitFor({ state: 'hidden' })
        return (await request).postDataJSON()
      }

      step = section + ' send two turns'
      await send(1)
      await send(2)
      await send(0)
      step = section + ' cancel rewind'
      const cancel = await select('assistant', 2)
      await button(cancel, '取消').click()
      assert.equal(await content(reply(2)).isVisible(), true)
      step = section + ' rewind answer'
      const rewindRequest = await confirm(await select('assistant', 2))
      await content(reply(2)).waitFor({ state: 'hidden' })
      await content(ask(0)).waitFor({ state: 'hidden' })
      await content(reply(0)).waitFor({ state: 'hidden' })
      await content(ask(2)).waitFor()
      await content(reply(1)).waitFor()
      if (section === 'GLOBAL') {
        const status = await page.evaluate(async data => {
          const response = await fetch('/api/labweave/conversation-rewind', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
          })
          return response.status
        }, rewindRequest)
        assert.equal(status, 409)
      }
      await send(3)
      step = section + ' rewind earlier input'
      await composer.fill('draft already in the composer')
      await confirm(await select('user', 2))
      await content(ask(2)).waitFor({ state: 'hidden' })
      await content(ask(3)).waitFor({ state: 'hidden' })
      await content(reply(3)).waitFor({ state: 'hidden' })
      await content(reply(1)).waitFor()
      const draft = bot ? await composer.inputValue() : await composer.innerText()
      assert.ok(draft.includes('draft already in the composer') && draft.includes(ask(2)), draft)
      step = section + ' continue after rewind'
      await send(4)
      console.log(section + ' rewind verified')
    }

    await button(page, '打开助理').first().click()
    await check('GLOBAL', nativeArea(), nativeArea().locator('[contenteditable=true]').last(), '发送消息')
    const globalSession = await nativeArea().getAttribute('data-conversation-session')
    step = 'reload the rewound session'
    await page.reload()
    await nativeArea().getByText('REWIND_GLOBAL_4_REPLY', { exact: true }).waitFor()
    assert.equal(await nativeArea().getAttribute('data-conversation-session'), globalSession)
    assert.equal(await nativeArea().getByText('REWIND_GLOBAL_2_ASK', { exact: true }).count(), 0)

    step = 'enable dark theme'
    await button(page, '设置').click()
    await button(page, '深色').click()
    await page.getByRole('button', { name: '深色', exact: true, pressed: true }).waitFor()
    await page.keyboard.press('Escape')
    step = 'open project'
    await page.setViewportSize({ width: 1110, height: 760 })
    const project = page.getByRole('navigation', { name: '撤回测试 项目功能', exact: true })
    if (!(await project.isVisible())) await button(page, '撤回测试').click()
    const projectChat = button(project, '聊天')
    const nativePermission = () => nativeArea().locator('[data-slot="conversation.input.permission"] button').first()
    const nativeComposer = () => nativeArea().locator('[contenteditable=true]:visible').last()
    const projectSessions = () => {
      const registry = JSON.parse(readFileSync(path.join(home, 'storages/workspace.json'), 'utf8'))
      return Object.values(registry.tables.workspaces).find(workspace => workspace.title === '撤回测试').sessionIds
    }
    const originalIds = projectSessions()
    await projectChat.click()
    await nativePermission().waitFor()
    await nativeArea().getByRole('button', { name: /选择模型/ }).first().waitFor()
    const blankId = await nativeArea().getAttribute('data-conversation-session')
    const draftIds = projectSessions()
    assert.ok(draftIds.includes(blankId))
    if (originalIds.length) assert.deepEqual(draftIds, originalIds)
    else assert.equal(draftIds.length, 1)
    assert.equal(await project.locator('.lw-sessions .lw-row-main').count(), 0)
    await page.evaluate(() => { document.documentElement.style.zoom = '125%' })
    const bounds = await nativeComposer().boundingBox()
    assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= page.viewportSize().width + 1)
    await nativeComposer().fill('REWIND_PROJECT_6_ASK')
    await projectChat.click()
    assert.equal(await nativeComposer().innerText(), 'REWIND_PROJECT_6_ASK')
    assert.deepEqual(projectSessions(), draftIds)
    await button(nativeArea(), '发送消息').click()
    await nativeArea().getByText('REWIND_PROJECT_6_REPLY', { exact: true }).waitFor()
    const submittedId = await nativeArea().getAttribute('data-conversation-session')
    assert.ok(projectSessions().includes(submittedId))
    assert.equal(submittedId, blankId)
    assert.deepEqual(projectSessions(), draftIds)
    await page.evaluate(() => { document.documentElement.style.zoom = '' })
    await page.waitForFunction(async expected => {
      const conversation = [...document.querySelectorAll('[data-conversation-session]')].find(el => el.getClientRects().length)
      if (!conversation) return false
      const response = await fetch('/api/labweave/project', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: conversation.dataset.conversationSession, action: 'view' }) })
      return response.ok && (await response.json()).name === expected
    }, '撤回测试')
    step = 'set the project conversation permission'
    async function selectProjectPermission(label) {
      await nativeArea().locator('[data-slot="conversation.input.permission"] button').first().click()
      await page.getByText(label, { exact: true }).last().click()
    }
    await selectProjectPermission('工作区内修改')
    await page.evaluate(() => { document.documentElement.style.zoom = '125%' })
    await check('PROJECT', nativeArea(), nativeArea().locator('[contenteditable=true]').last(), '发送消息')
    await page.evaluate(() => { document.documentElement.style.zoom = '' })

    step = 'open Feature Bot'
    await button(project, '实验记录 Bot').click()
    const bot = page.getByRole('region', { name: '实验记录 Bot', exact: true })
    await page.evaluate(() => { document.documentElement.style.zoom = '125%' })
    await check('BOT', bot, bot.getByLabel('向 实验记录 Bot 发送消息', { exact: true }), '发送', true)
    await page.evaluate(() => { document.documentElement.style.zoom = '' })
    step = 'refresh the existing Bot permission from its project'
    const idsBeforeLanding = projectSessions()
    await projectChat.click()
    await nativePermission().waitFor()
    const nextBlankId = await nativeArea().getAttribute('data-conversation-session')
    assert.notEqual(nextBlankId, submittedId)
    await page.locator('[data-conversation-session][data-content-phase="hero"]:visible').last().waitFor()
    const idsWithDraft = projectSessions()
    assert.ok(idsWithDraft.includes(nextBlankId))
    assert.ok(idsWithDraft.length <= idsBeforeLanding.length + 1)
    assert.equal(await projectChat.getAttribute('aria-expanded'), 'false')
    await projectChat.click()
    assert.equal(await projectChat.getAttribute('aria-expanded'), 'true')
    assert.equal(await nativeArea().getAttribute('data-conversation-session'), nextBlankId)
    assert.deepEqual(projectSessions(), idsWithDraft)
    assert.equal(await project.locator('.lw-sessions .lw-row-main').count(), 1)
    await project.locator('.lw-sessions .lw-row-main').first().click()
    await nativeArea().getByText('REWIND_PROJECT_4_REPLY', { exact: true }).waitFor()
    await selectProjectPermission('仅可查看')
    await button(project, '实验记录 Bot').click()
    await bot.getByLabel('向 实验记录 Bot 发送消息', { exact: true }).fill('REWIND_BOT_5_ASK')
    await button(bot, '发送').click()
    await bot.locator('.lw-bot-msg').filter({ hasText: 'REWIND_BOT_5_REPLY' }).waitFor()
  } catch (error) {
    console.error('Failed at', step)
    console.error((await page.locator('body').innerText().catch(() => '')).slice(-1800))
    throw error
  } finally {
    await browser.close()
  }
}

main(process.argv[2], process.argv[3] === 'restart', process.argv[4]).catch(error => {
  console.error(error.message)
  process.exitCode = 1
})
