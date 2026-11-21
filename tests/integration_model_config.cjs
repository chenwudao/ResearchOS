const assert = require('node:assert/strict')
const { chromium } = require('playwright')

const [url, stubUrl] = process.argv.slice(2)
if (!url || !stubUrl) {
  console.error('Usage: node integration_model_config.cjs <url> <stubUrl>')
  process.exit(1)
}

async function run() {
  const browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge',
    headless: true,
    args: ['--disable-gpu'],
  })
  const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1280, height: 820 } })
  const page = await context.newPage()
  page.on('pageerror', err => console.error('PAGEERROR:', err))
  page.on('console', msg => { if (msg.type() === 'error') console.error('CONSOLE_ERR:', msg.text()) })
  const button = name => page.getByRole('button', { name, exact: true })
  let step = '启动页面'

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await button('Weave').last().waitFor({ timeout: 30000 })

    step = '首次使用只显示模型 API 配置'
    const setup = page.getByRole('dialog', { name: '配置模型 API', exact: true })
    await setup.waitFor()
    assert.doesNotMatch(await setup.innerText(), /DeepSeek\s+(?:Account|账号)|LabWeave|\b(?:DSH|DS)\b|预览版|登录|注册/i)
    assert.equal(await page.getByRole('dialog').count(), 1)
    assert.equal(await setup.locator('input').count(), 1)
    assert.equal(await setup.locator('select').count(), 0)
    assert.equal(await setup.getByRole('combobox').count(), 1)
    await setup.getByLabel('模型供应商', { exact: true }).click()
    await page.locator('[role="listbox"] [role="option"][data-value="openai"]').click()
    await setup.getByLabel('API Key', { exact: true }).fill('sk-e2e-imported-1234')
    await setup.getByRole('button', { name: '保存并继续', exact: true }).click()
    await setup.waitFor({ state: 'hidden' })

    step = '验证 API 配置写入原生模型设置并在重新打开后生效'
    await page.reload()
    await button('Weave').last().waitFor()
    await page.getByRole('button', { name: /gpt[- ]4o[- ]mini/i }).first().waitFor()
    assert.equal(await page.getByRole('dialog').count(), 0)
    await button('模型与 API').click()
    const modal = page.locator('[data-shortcut-modal="settings"]')
    await modal.waitFor()
    await modal.getByText(/Custom LLM|openai/i).first().waitFor()
    await modal.getByRole('button', { name: '关闭', exact: true }).click()
    await modal.waitFor({ state: 'hidden' })

    step = '新建项目并验证主聊天自动兼容已配置模型'
    await button('新建项目').click()
    const projForm = page.getByRole('dialog', { name: '新建项目' })
    await projForm.getByLabel('项目名称').fill('新项目兼容')
    await projForm.getByRole('button', { name: '创建', exact: true }).click()
    const projectBar = page.getByRole('navigation', { name: '新项目兼容 项目功能' })
    await projectBar.waitFor()
    await page.getByRole('button', { name: /gpt[- ]4o[- ]mini/i }).waitFor({ timeout: 10000 })
    await page.waitForFunction(async () => {
      const sessionId = [...document.querySelectorAll('[data-conversation-session]')]
        .find(el => el.getClientRects().length)?.getAttribute('data-conversation-session')
      if (!sessionId) return false
      const view = await fetch('/api/labweave/project', {method: 'POST',
        headers: {'Content-Type': 'application/json'}, body: JSON.stringify({sessionId, action: 'view'})})
      return view.ok && (await view.json()).name === '新项目兼容'
    })

    const mainBox = page.locator('[contenteditable=true]:visible').last()
    await mainBox.waitFor({ timeout: 10000 })
    await mainBox.click()
    await mainBox.fill('MAIN_CHAT_PING')
    const sendMainBtn = button('发送消息')
    await page.waitForFunction(() => {
      const btn = [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === '发送消息' || b.textContent?.trim() === '发送消息')
      return btn && !btn.disabled
    }, { timeout: 10000 }).catch(() => {})
    await sendMainBtn.click()
    await page.getByText('STUB_MODEL_OK', { exact: false }).first().waitFor({ timeout: 45000 })
    step = '验证 Weave 工具卡及其原始参数'
    const processRow = page.locator('button[data-turn-process][data-turn-process-tool-calls="1"]').last()
    if (await processRow.getAttribute('aria-expanded') === 'false') await processRow.click()
    const calls = page.locator('[data-step-process]').getByRole('button', {name: /已调用工具/}).first()
    if (await calls.getAttribute('aria-expanded') === 'false') await calls.click()
    const projectTool = page.locator('[data-tool="labweave_memory_search"]').last()
    const toolHeader = projectTool.locator('[data-disclosure-row]')
    await toolHeader.getByText(/查找项目记忆/).first().waitFor()
    assert.doesNotMatch(await toolHeader.innerText(), /labweave_memory_search/)
    await toolHeader.click()
    await projectTool.getByText(/"query":\s*"DSH 论文 \$DSH_HOME"/).first().waitFor()

    step = '验证新项目功能 Bot 自动使用新配置的自定义模型并对话'
    await projectBar.getByRole('button', { name: '点子', exact: true }).click()
    await page.waitForTimeout(400)
    const diag = await page.evaluate(() => ({
      regions: [...document.querySelectorAll('[role="region"], section[aria-label]')].map(el => el.getAttribute('aria-label')),
      mains: [...document.querySelectorAll('main')].map(el => el.getAttribute('aria-label')),
      lwPages: document.querySelectorAll('.lw-page, .lw-panel').length,
      ideasMainText: document.querySelector('main[aria-label="新项目兼容的点子"]')?.innerText || '',
    }))
    console.log('AFTER_IDEAS_CLICK_DIAG:', JSON.stringify(diag))
    const ideas = page.getByRole('region', { name: '点子', exact: true })
    await ideas.waitFor({ timeout: 15000 })

    const composerBox = await ideas.locator('.lw-fbot-composer').boundingBox()
    assert.ok(composerBox && composerBox.height <= 96, `Composer 高度超限: ${JSON.stringify(composerBox)}`)

    assert.equal(await ideas.locator('select[aria-label="功能对话模型"], .lw-fbot-model-select').count(), 0)

    await ideas.getByLabel('向 点子 发送消息').fill('FEATURE_BOT_PING')
    await ideas.getByRole('button', { name: '发送', exact: true }).click()
    await ideas.getByText('STUB_MODEL_OK', { exact: false }).waitFor({ timeout: 45000 })
  } catch (err) {
    console.error('FAILED AT STEP:', step)
    console.error('ON_FAIL_IDEAS_MAIN_TEXT:', await page.locator('main[aria-label="新项目兼容的点子"]').innerText({ timeout: 2000 }).catch(() => 'NONE'))
    console.error('ON_FAIL_BODY_SNIPPET:', (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 500))
    console.error(err)
    process.exitCode = 1
  } finally {
    await browser.close()
  }
}

run()
