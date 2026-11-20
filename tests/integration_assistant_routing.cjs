const assert = require('node:assert/strict')
const fs = require('node:fs')
const { chromium } = require('playwright')

async function main() {
  const { url, sourceFolder } = JSON.parse(fs.readFileSync(0, 'utf8'))
  const channel = process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : 'chromium')
  const browser = await chromium.launch({ channel, headless: true })
  const page = await browser.newPage({ locale: 'zh-CN', viewport: { width: 1280, height: 820 } })
  let step = 'cold start'
  page.setDefaultTimeout(12000)
  const button = (name, area = page) => area.getByRole('button', { name, exact: true })
  const chat = page.locator('[data-conversation-content][data-conversation-session]:visible').last()
  const brandMark = page.locator('[data-slot="sidebar"] .lw-brand-mark')
  const wordmark = page.locator('[data-slot="sidebar"] .lw-wordmark')
  const tree = page.locator('.lw-tree')
  async function send(suffix, message) {
    const marker = 'ROUTE_CASE_' + suffix
    await chat.locator('[contenteditable=true]').last().fill(message + '\n' + marker)
    await button('发送消息', chat).click()
    await chat.locator('[data-chat-flow-kind]').getByText('完成 ' + marker, { exact: true }).waitFor()
    return chat.getAttribute('data-conversation-session')
  }
  async function openAssistantSettings() {
    await button('设置').click()
    const modal = page.locator('[data-shortcut-modal="settings"]')
    await button('深色', modal).click()
    await modal.getByText('助手设置', { exact: true }).first().click()
    return modal.getByRole('region', { name: '助手设置', exact: true })
  }
  const readPreference = () => page.evaluate(async () => {
    const result = await fetch('/api/labweave/assistant-model')
    if (!result.ok) throw Error('助手设置读取失败')
    return (await result.json()).preference
  })
  async function checkWindow(size) {
    await chat.getByRole('button', { name: /^上下文已用/ }).click()
    const meter = page.getByRole('dialog', { name: '上下文已用', exact: true })
    await meter.getByText(new RegExp('/\\s*' + size + 'K$')).waitFor()
    await page.keyboard.press('Escape')
    await meter.waitFor({ state: 'hidden' })
  }

  try {
    await page.goto(url)
    step = 'assistant sidebar entrance'
    const welcome = page.locator('.lw-welcome')
    await welcome.getByRole('heading', { name: /^(早上|下午|晚上)好$/ }).waitFor()
    assert.equal(await page.locator('[data-composer-card]:visible').count(), 0)
    await brandMark.waitFor()
    const treeTop = (await tree.boundingBox()).y
    await page.evaluate(() => {
      const mark = document.querySelector('[data-slot="sidebar"] .lw-brand-mark')
      mark.addEventListener('transitionrun', () => {
        const properties = mark.getAnimations().map(animation => animation.transitionProperty)
        window.sidebarBrandExit = {
          upward: properties.includes('translate'),
          fading: properties.includes('opacity'),
          flight: Boolean(document.querySelector('.lw-assistant-flight')),
        }
      }, { once: true })
    })
    await button('打开助手').click()
    await brandMark.waitFor({ state: 'hidden' })
    await wordmark.waitFor({ state: 'hidden' })
    assert.deepEqual(await page.evaluate(() => window.sidebarBrandExit), { upward: true, fading: true, flight: true })
    const compactTop = (await tree.boundingBox()).y
    assert.ok(compactTop < treeTop, 'Project navigation should move up when the brand exits')

    step = 'fold and reopen the assistant'
    await button('收回助手').click()
    await welcome.waitFor()
    assert.equal(await page.locator('[data-composer-card]:visible').count(), 0)
    await wordmark.waitFor()
    await button('打开助手').click()
    await page.locator('.lw-hero-profile-entry').waitFor()
    await wordmark.waitFor({ state: 'hidden' })

    step = 'automatic model and effort'
    const globalSession = await send('QUICK', '你好')
    await page.locator('.lw-active-profile-entry').waitFor()
    assert.equal(await brandMark.isVisible(), false)
    assert.equal(await wordmark.isVisible(), false)
    assert.ok(Math.abs((await tree.boundingBox()).y - compactTop) <= 1)
    await button('收回助手').click()
    await welcome.waitFor()
    await button('打开助手').click()
    await page.locator('.lw-active-profile-entry').waitFor()
    assert.equal(await chat.getAttribute('data-conversation-session'), globalSession)
    await checkWindow(96)
    assert.equal(await send('REASON', '请比较这两个实验方案并推导可区分它们的判据'), globalSession)
    await send('LONG', '论'.repeat(36000))
    await checkWindow('(?:128|192|256)')
    step = 'fixed settings'
    const settings = await openAssistantSettings()
    await page.setViewportSize({ width: 980, height: 700 })
    await page.evaluate(() => { document.documentElement.style.zoom = '125%' })
    const permission = settings.getByLabel('助手权限', { exact: true })
    // Dropdowns are DSH-style comboboxes with a floating listbox, never the browser's native <select>.
    const pick = async (trigger, value) => {
      await trigger.click()
      await page.locator(`[role="listbox"] [role="option"][data-value='${value}']`).click()
      await page.locator('[role="listbox"]').waitFor({ state: 'detached' })
    }
    const selectedValue = label => page.evaluate(label => {
      const trigger = document.querySelector(`[role="combobox"][aria-label="${label}"]`)
      return trigger?.querySelector('.lw-sel-text')?.textContent || ''
    }, label)
    assert.equal(await page.locator('select').count(), 0)
    await page.waitForFunction(() => document.querySelector('[role="combobox"][aria-label="助手权限"] .lw-sel-text')?.textContent === '仅可查看')
    await permission.click()
    assert.equal(await page.locator('[role="listbox"] [role="option"]').filter({ hasText: /DSH|沿用/ }).count(), 0)
    assert.equal(await page.locator('[role="listbox"] [role="option"][data-value=""]').count(), 0)
    assert.equal(await page.locator('[role="listbox"] [role="option"][aria-selected="true"]').count(), 1)
    await page.keyboard.press('Escape')
    await page.locator('[role="listbox"]').waitFor({ state: 'detached' })
    await pick(permission, 'workspace-write')
    await page.waitForFunction(() => document.querySelector('[role="combobox"][aria-label="助手权限"] .lw-sel-text')?.textContent === '工作区内修改')
    await settings.getByRole('radio', { name: /^固定模型/ }).click()
    await pick(settings.getByLabel('使用的模型', { exact: true }), '["customgw","gpt-fixture-pro"]')
    await pick(settings.getByLabel('推理强度', { exact: true }), 'low')
    await pick(settings.getByLabel('上下文窗口', { exact: true }), '384000')
    await page.waitForFunction(() => !/默认/.test(document.querySelector('[role="combobox"][aria-label="上下文窗口"] .lw-sel-text')?.textContent || '默认'))
    assert.deepEqual(await readPreference(), {
      mode: 'fixed', provider: 'customgw', model: 'gpt-fixture-pro', reasoningEffort: 'low', contextWindow: 384000,
    })
    for (const label of ['使用的模型', '推理强度', '上下文窗口']) {
      const fits = await settings.getByLabel(label, { exact: true }).evaluate(element => {
        const rect = element.getBoundingClientRect()
        return rect.left >= 0 && rect.right <= innerWidth + 1 && rect.width > 0
      })
      assert.ok(fits, label + ' 超出窗口')
    }
    await page.keyboard.press('Escape')
    await page.evaluate(() => { document.documentElement.style.zoom = '' })
    await page.setViewportSize({ width: 1280, height: 820 })
    await send('FIXED', '请比较并详细推导')
    await checkWindow(384)
    step = 'project isolation'
    const nav = page.getByRole('navigation', { name: '路由测试项目 项目功能' })
    if (!await nav.isVisible()) await button('路由测试项目').click()
    await button('在路由测试项目中新建对话', nav).click()
    await page.waitForFunction(id => {
      const chat = document.querySelector('[data-conversation-content][data-conversation-session]')
      return chat && chat.getAttribute('data-conversation-session') !== id
    }, globalSession)
    await send('PROJECT', '你好')
    await brandMark.waitFor()
    await wordmark.waitFor()
    await page.waitForFunction(top => Math.abs(document.querySelector('.lw-tree').getBoundingClientRect().top - top) <= 1, treeTop)
    await checkWindow(512)
    step = 'project settings and local sources'
    const projectSettings = page.getByRole('dialog', { name: '项目设置', exact: true })
    await button('项目设置 路由测试项目').click()
    await projectSettings.getByLabel('项目简介').fill('读取本机研究材料')
    await projectSettings.getByLabel('研究主题').fill('验证项目来源')
    await button('保存', projectSettings).click()
    await projectSettings.getByText('已保存项目信息。', { exact: true }).waitFor()
    await button('来源文件夹', projectSettings).click()
    await button('添加文件夹', projectSettings).click()
    await projectSettings.getByLabel('文件夹路径').fill(sourceFolder)
    await button('添加来源', projectSettings).click()
    await projectSettings.getByText('参考资料', { exact: true }).waitFor()
    await button('编辑来源 参考资料', projectSettings).click()
    await projectSettings.getByLabel('显示名称').fill('论文资料')
    await button('保存来源', projectSettings).click()
    await projectSettings.getByText('论文资料', { exact: true }).waitFor()
    await page.keyboard.press('Escape')
    await send('SOURCE', '读取项目已关联的本机来源')
    await page.reload()
    assert.equal((await readPreference()).contextWindow, 384000)
    await button('项目设置 路由测试项目').click()
    await projectSettings.getByLabel('项目简介').waitFor()
    assert.equal(await projectSettings.getByLabel('项目简介').inputValue(), '读取本机研究材料')
    await button('来源文件夹', projectSettings).click()
    await projectSettings.getByText('论文资料', { exact: true }).waitFor()
    await page.setViewportSize({ width: 540, height: 720 })
    await page.evaluate(() => { document.documentElement.style.zoom = '125%' })
    const panel = await projectSettings.boundingBox()
    assert.ok(panel && panel.x >= 0 && panel.x + panel.width <= 541, JSON.stringify(panel))
    await button('移除来源 论文资料', projectSettings).click()
    await projectSettings.getByText('论文资料', { exact: true }).waitFor({ state: 'hidden' })
    console.log('项目设置、本机来源读取和重新加载通过。')
    console.log('助手自动选型、固定推理与窗口、刷新保存及项目隔离通过。')
  } catch (error) {
    console.error('Failed at', step)
    console.error((await page.locator('body').innerText().catch(() => '')).slice(-1100))
    throw error
  } finally {
    await browser.close()
  }
}

main().catch(error => { console.error(error.message.replace(/(?:token=|sk-)\S+/g, '[redacted]')); process.exitCode = 1 })
