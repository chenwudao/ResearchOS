const assert = require('node:assert/strict')
const fs = require('node:fs')
const { chromium } = require('playwright')

async function main() {
  const [url, stubUrl] = process.argv.slice(2)
  const browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge',
    headless: true,
    args: ['--disable-gpu'],
  })
  const context = await browser.newContext({
    locale: 'zh-CN',
    viewport: { width: 1280, height: 820 },
  })
  const page = await context.newPage()
  page.setDefaultTimeout(25000)
  page.on('pageerror', err => console.error('PAGEERROR:', err.message))

  let step = '进入 DSH Web'
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
    const button = name => page.getByRole('button', { name, exact: true })
    const welcome = button('继续')
    const addKey = button('添加 API Key')
    await welcome.or(addKey).first().waitFor()
    if (await welcome.isVisible()) { await welcome.click(); await welcome.waitFor({ state: 'hidden' }) }
    if (await addKey.isVisible()) { await addKey.click(); await button('稍后配置').click() }

    const openComposerModelMenu = async () => {
      const btn = page.locator('[data-composer-card] button').filter({ hasText: /DeepSeek|gpt[- ]4o|o3[- ]mini|Custom|选择模型/i }).last()
      await btn.waitFor()
      await btn.click()
      const menu = page.locator('[role="menu"][aria-label="模型与推理等级"], [role="group"][aria-label="模型与推理等级"]').last()
      await menu.waitFor()
      return { btn, menu }
    }

    step = '验证模型弹出菜单展示模型、推理等级、上下文窗口与底部模型供应商入口'
    {
      const { menu } = await openComposerModelMenu()
      await menu.getByRole('menuitem', { name: /模型\s+DeepSeek/ }).waitFor()
      await menu.getByRole('menuitem', { name: /推理等级/ }).waitFor()
      await menu.getByRole('menuitem', { name: /上下文窗口/ }).waitFor()
      await menu.getByRole('menuitem', { name: /模型供应商\s+DeepSeek/ }).waitFor()

      // Verify 模型供应商 is positioned below 模型 & 推理等级
      const orderOk = await menu.evaluate(el => {
        const items = [...el.querySelectorAll('[role="menuitem"]')]
        const labels = items.map(i => (i.innerText || '').trim())
        const modelIdx = labels.findIndex(t => t.startsWith('模型\n') || t.startsWith('模型 '))
        const ctxIdx = labels.findIndex(t => t.includes('上下文窗口'))
        const provIdx = labels.findIndex(t => t.includes('模型供应商'))
        return modelIdx >= 0 && ctxIdx > modelIdx && provIdx > ctxIdx && provIdx === items.length - 1
      })
      assert.ok(orderOk, '模型供应商入口应位于弹出菜单最下方')

      step = '验证切换模型供应商会同步改变上方模型与底部显示，且每个供应商对应不同模型'
      await menu.getByRole('menuitem', { name: /模型供应商/ }).click()
      const provPanel = menu.getByRole('group', { name: '模型供应商' })
      await provPanel.waitFor()
      await provPanel.getByRole('menuitemradio', { name: /DeepSeek.*2 个模型/ }).waitFor()
      await provPanel.getByRole('menuitemradio', { name: /Custom Gateway.*2 个模型/ }).click()
      await provPanel.waitFor({ state: 'hidden' })

      await menu.getByRole('menuitem', { name: /模型\s+GPT-4o Mini/ }).waitFor()
      await menu.getByRole('menuitem', { name: /模型供应商\s+Custom Gateway/ }).waitFor()
      const triggerText = await page.locator('[data-composer-card] button').filter({ hasText: /GPT-4o Mini/ }).last().innerText()
      assert.match(triggerText, /GPT-4o Mini/, '切换供应商后底部触发栏应同步改为目标供应商模型')

      step = '验证切换同供应商下不同模型并配置推理强度与上下文窗口长度'
      await menu.getByRole('menuitem', { name: /模型供应商/ }).click()
      await provPanel.waitFor()
      await provPanel.getByRole('button', { name: 'O3 Mini', exact: true }).click()
      await provPanel.waitFor({ state: 'hidden' })
      await menu.getByRole('menuitem', { name: /模型\s+O3 Mini/ }).waitFor()

      // Enable custom reasoning strength for third-party custom model if absent, then switch effort
      const customReasonRow = menu.getByRole('menuitem', { name: /推理强度/ })
      if (await customReasonRow.isVisible().catch(() => false)) {
        await customReasonRow.click()
        const reasonPanel = menu.getByRole('group', { name: '模型推理强度配置' })
        await reasonPanel.waitFor()
        await reasonPanel.getByRole('button', { name: /启用（Off \/ Low \/ Medium \/ High）/ }).click()
        await reasonPanel.waitFor({ state: 'hidden' })
      }
      await menu.getByRole('menuitem', { name: /推理等级/ }).click()
      await menu.getByRole('menuitemradio', { name: 'Low', exact: true }).click()

      // Ensure menu closes before reopening
      if (await menu.isVisible().catch(() => false)) {
        await page.mouse.click(10, 10)
      }
      await menu.waitFor({ state: 'hidden' })
    }

    {
      const { menu } = await openComposerModelMenu()
      await menu.getByRole('menuitem', { name: /推理等级\s+Low/ }).waitFor()
      await menu.getByRole('menuitem', { name: /上下文窗口/ }).click()
      const ctxPanel = menu.getByRole('group', { name: '上下文窗口长度' })
      await ctxPanel.waitFor()
      await ctxPanel.getByRole('menuitemradio', { name: '256K', exact: true }).click()
      await ctxPanel.waitFor({ state: 'hidden' })
      await menu.getByRole('menuitem', { name: /上下文窗口\s+256K/ }).waitFor()

      // Test custom numeric context window
      await menu.getByRole('menuitem', { name: /上下文窗口/ }).click()
      await ctxPanel.waitFor()
      await ctxPanel.getByLabel('自定义上下文窗口长度').fill('192K')
      await ctxPanel.getByRole('button', { name: '应用', exact: true }).click()
      await ctxPanel.waitFor({ state: 'hidden' })
      await menu.getByRole('menuitem', { name: /上下文窗口\s+192K/ }).waitFor()

      // Also test setting DeepSeek Flash context window
      await menu.getByRole('menuitem', { name: /模型供应商/ }).click()
      await menu.getByRole('group', { name: '模型供应商' }).getByRole('menuitemradio', { name: /DeepSeek/ }).click()
      await menu.getByRole('menuitem', { name: /模型\s+DeepSeek/ }).waitFor()
      await menu.getByRole('menuitem', { name: /上下文窗口/ }).click()
      await ctxPanel.getByRole('menuitemradio', { name: '1M', exact: true }).click()
      await menu.getByRole('menuitem', { name: /上下文窗口\s+1M/ }).waitFor()

      // Switch back to Custom Gateway -> O3 Mini & verify context stayed 192K & set as global default
      await menu.getByRole('menuitem', { name: /模型供应商/ }).click()
      await menu.getByRole('group', { name: '模型供应商' }).getByRole('button', { name: 'O3 Mini', exact: true }).click()
      await menu.getByRole('menuitem', { name: /上下文窗口\s+192K/ }).waitFor()
      await menu.getByRole('menuitem', { name: /模型供应商/ }).click()
      await menu.getByRole('button', { name: '设为全局默认', exact: true }).click()
      await menu.getByRole('button', { name: '已设为默认', exact: true }).waitFor()

      // Narrow viewport & 125% zoom layout check
      await page.setViewportSize({ width: 900, height: 700 })
      await page.evaluate(() => { document.documentElement.style.zoom = '125%' })
      const fitCheck = await menu.evaluate(el => {
        const rect = el.getBoundingClientRect()
        return {
          docOk: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
          menuRightOk: rect.right <= window.innerWidth + 2,
          menuBottomOk: rect.bottom <= window.innerHeight + 2,
        }
      })
      assert.ok(fitCheck.docOk && fitCheck.menuRightOk, `900x700 125% 缩放应无横向溢出: ${JSON.stringify(fitCheck)}`)
      await page.evaluate(() => { document.documentElement.style.zoom = '' })
    }

    step = '验证点击添加/管理供应商与密钥跳转到模型与 API 设置'
    {
      const { menu } = await openComposerModelMenu()
      await menu.getByRole('menuitem', { name: /模型供应商/ }).click()
      await menu.getByRole('button', { name: /添加 \/ 管理供应商与密钥/ }).click()
      await menu.waitFor({ state: 'hidden' })
      await page.getByRole('dialog').getByText('模型与 API').first().waitFor()
      await page.keyboard.press('Escape')
      await page.getByRole('dialog').waitFor({ state: 'hidden' })
    }

    step = '页面刷新后验证上下文窗口、推理等级与默认供应商持久化'
    await page.setViewportSize({ width: 1280, height: 820 })
    await page.reload({ waitUntil: 'domcontentloaded' })
    const { menu } = await openComposerModelMenu()
    await menu.getByRole('menuitem', { name: /上下文窗口\s+192K/ }).waitFor()
    await menu.getByRole('menuitem', { name: /模型供应商\s+Custom Gateway/ }).waitFor()

    console.log('模型供应商入口、推理强度与上下文窗口端到端测试全部通过')
  } catch (err) {
    console.error('失败步骤: ' + step)
    console.error((await page.locator('body').innerText().catch(() => '')).slice(0, 1200))
    throw err
  } finally {
    await context.close()
    await browser.close()
  }
}

main().catch(err => { console.error(err); process.exitCode = 1 })
