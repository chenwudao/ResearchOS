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
    step = 'automatic model and effort'
    const globalSession = await send('QUICK', '你好')
    await checkWindow(96)
    assert.equal(await send('REASON', '请比较这两个实验方案并推导可区分它们的判据'), globalSession)
    await send('LONG', '论'.repeat(36000))
    await checkWindow('(?:128|192|256)')
    step = 'fixed settings'
    const settings = await openAssistantSettings()
    await page.setViewportSize({ width: 980, height: 700 })
    await page.evaluate(() => { document.documentElement.style.zoom = '125%' })
    const permission = settings.getByLabel('助手权限', { exact: true })
    await page.waitForFunction(() => document.querySelector('select[aria-label="助手权限"]')?.value === 'read-only')
    assert.equal(await permission.getByRole('option').filter({ hasText: /DSH|沿用/ }).count(), 0)
    assert.equal(await permission.locator('option[value=""]').count(), 0)
    await permission.selectOption('workspace-write')
    await page.waitForFunction(() => document.querySelector('select[aria-label="助手权限"]')?.value === 'workspace-write')
    await settings.getByRole('radio', { name: /^固定模型/ }).click()
    await settings.getByLabel('使用的模型').selectOption('["customgw","gpt-fixture-pro"]')
    await settings.getByLabel('推理强度', { exact: true }).selectOption('low')
    await settings.getByLabel('上下文窗口', { exact: true }).selectOption('384000')
    await page.waitForFunction(() => document.querySelector('select[aria-label="上下文窗口"]')?.value === '384000')
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
