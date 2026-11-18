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

    step = '关闭首次启动引导'
    const welcome = button('继续')
    const addKey = button('添加 API Key')
    await welcome.or(addKey).first().waitFor({ timeout: 15000 })
    if (await welcome.isVisible()) {
      await welcome.click()
      await welcome.waitFor({ state: 'hidden' })
    }
    if (await addKey.waitFor({ timeout: 4000 }).then(() => true, () => false)) {
      await addKey.click()
      const skip = button('稍后配置')
      if (await skip.isVisible().catch(() => false)) {
        await skip.click()
        await skip.waitFor({ state: 'hidden' })
      }
    }

    step = '打开原生模型与 API 面板并确认已移除自定义导入扩展区'
    await button('模型与 API').click()
    const modal = page.locator('[data-shortcut-modal="settings"]')
    await modal.waitFor()
    assert.equal(await modal.getByRole('region', { name: '科研工作区模型联动与外部配置导入' }).count(), 0)
    assert.equal(await modal.getByText('本机用户目录 API 配置检测', { exact: true }).count(), 0)

    step = '通过 DSH 原生入口创建自定义 OpenAI 兼容模型提供商'
    await modal.getByRole('button', { name: '添加模型提供商', exact: true }).click()
    await modal.getByText('自定义模型 API', { exact: true }).click()

    await modal.getByLabel('Provider ID', { exact: true }).fill('customllm')
    await modal.getByLabel('显示名称', { exact: true }).fill('Custom LLM')
    await modal.locator('input[placeholder="https://gateway.example/v1"]').fill(`${stubUrl}/v1`)
    await modal.locator('input[placeholder="输入 API 密钥"]').fill('sk-e2e-imported-1234')

    await modal.getByRole('button', { name: '添加模型', exact: true }).click()
    await modal.locator('input[placeholder="模型 ID"]:visible').last().fill('gpt-4o-mini')

    await modal.getByRole('button', { name: '创建提供商', exact: true }).click()
    await modal.getByText('Custom LLM', { exact: false }).waitFor({ timeout: 10000 })
    await modal.getByRole('button', { name: '关闭', exact: true }).click()
    await modal.waitFor({ state: 'hidden' })

    step = '新建科研项目并验证主聊天自动兼容已配置模型'
    await button('创建科研项目').click()
    const projForm = page.getByRole('dialog', { name: '创建科研项目' })
    await projForm.getByLabel('项目名称').fill('新项目兼容')
    await projForm.getByRole('button', { name: '创建', exact: true }).click()
    const projectBar = page.getByRole('navigation', { name: '新项目兼容 项目功能' })
    await projectBar.waitFor()
    await page.getByRole('button', { name: /gpt-4o-mini/ }).waitFor({ timeout: 10000 })

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

    step = '验证新项目功能 Bot 自动使用新配置的自定义模型并对话'
    await projectBar.getByRole('button', { name: '点子', exact: true }).click()
    await page.waitForTimeout(400)
    const diag = await page.evaluate(() => ({
      regions: [...document.querySelectorAll('[role="region"], section[aria-label]')].map(el => el.getAttribute('aria-label')),
      mains: [...document.querySelectorAll('main')].map(el => el.getAttribute('aria-label')),
      lwPages: document.querySelectorAll('.lw-page, .lw-panel').length,
      ideasMainText: document.querySelector('main[aria-label="新项目兼容 · 点子"]')?.innerText || '',
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
    console.error('ON_FAIL_IDEAS_MAIN_TEXT:', await page.locator('main[aria-label="新项目兼容 · 点子"]').innerText().catch(() => 'NONE'))
    console.error('ON_FAIL_BODY_SNIPPET:', (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 500))
    console.error(err)
    process.exitCode = 1
  } finally {
    await browser.close()
  }
}

run()
