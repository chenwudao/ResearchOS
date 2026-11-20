const assert = require('node:assert/strict')
const fs = require('node:fs')
const { chromium } = require('playwright')

async function main() {
  const [firstRun, secondRun, fixtureUrl] = process.argv.slice(2)
  const url = fs.readFileSync(0, 'utf8').trim()
  const channel = process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : 'chromium')
  const browser = await chromium.launch({ channel, headless: true })
  const page = await browser.newPage({ locale: 'zh-CN', viewport: { width: 1360, height: 850 }, reducedMotion: 'reduce' })
  page.setDefaultTimeout(12000)
  const btn = (area, name) => area.getByRole('button', { name, exact: true })
  const dialog = name => page.getByRole('dialog', { name, exact: true })
  const workbench = dialog('点子 工作台')
  const owner = (route, data) => page.evaluate(async ({ route, data }) => {
    const response = await fetch('/api/labweave/' + route, data ? {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    } : {})
    return { status: response.status, data: await response.json() }
  }, { route, data })
  async function openBot(project) {
    const nav = page.getByRole('navigation', { name: project + ' 项目功能', exact: true })
    if (!await nav.isVisible()) await btn(page, project).click()
    await btn(nav, '点子').click()
    const main = page.getByRole('main', { name: project + '的点子' })
    await main.waitFor()
    const before = await main.boundingBox()
    await btn(main, '打开 Bot 工作台').click()
    const box = await workbench.boundingBox()
    assert.ok(box && Math.abs(box.x + box.width - page.viewportSize().width) < 28)
    assert.equal((await main.boundingBox()).width, before.width)
  }
  let step = 'boot'
  try {
    await page.goto(url)
    await openBot('试验工作区')
    const brief = workbench.getByRole('region', { name: 'Bot 特点' })
    await brief.getByText('持续学习回归', { exact: true }).first().waitFor()

    step = 'tasks and durable schedule edits'
    await btn(workbench, '职责').click()
    let editor = dialog('新建分配任务')
    await editor.getByLabel('任务名称').fill('回归检查')
    await editor.getByLabel('内容（Markdown）').fill('检查 **旧任务指标**')
    await btn(editor, '保存').click()
    await workbench.getByText('旧任务指标', { exact: true }).waitFor()
    await btn(workbench, '定时任务').click()
    editor = dialog('新建分配任务')
    await editor.getByLabel('任务名称').fill('每周跟进')
    await editor.getByLabel('内容（Markdown）').fill('汇总待复核数据')
    await btn(editor, '保存').click()
    await workbench.getByText('每周跟进', { exact: true }).waitFor()
    await workbench.getByText(/下次投递/).waitFor()
    await workbench.getByText('投递记录', { exact: true }).click()
    await workbench.getByText('还没有投递记录。', { exact: true }).waitFor()
    await btn(workbench, '编辑 每周跟进').click()
    editor = dialog('编辑分配任务')
    await editor.getByLabel('任务名称').fill('每周复核')
    await btn(editor, '保存').click()
    await workbench.getByText('每周复核', { exact: true }).waitFor()
    await btn(workbench, '删除 每周复核').click()
    await workbench.getByText('还没有定时任务。', { exact: true }).waitFor()

    step = 'live delivery and the original Bot conversation'
    await btn(workbench, '定时任务').click()
    editor = dialog('新建分配任务')
    await editor.getByLabel('任务名称').fill('投递验收')
    await editor.getByLabel('内容（Markdown）').fill('汇总数据')
    const starts = new Date(Date.now() + 8000).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
    await editor.getByLabel('重复规则（RRULE）').fill(`DTSTART:${starts}\nRRULE:FREQ=MINUTELY`)
    await btn(editor, '保存').click()
    await workbench.getByText('投递验收', { exact: true }).waitFor()
    await workbench.getByText('投递记录', { exact: true }).click()
    await btn(workbench, '打开对话').click({ timeout: 20000 })
    await btn(page, '返回 Bot 工作台').click()
    await workbench.waitFor()
    await btn(workbench, '删除 投递验收').click()
    await workbench.getByText('还没有定时任务。', { exact: true }).waitFor()

    step = 'create a formal workflow from the Bot conversation'
    await page.keyboard.press('Escape')
    const main = page.getByRole('main', { name: '试验工作区的点子' })
    await main.getByRole('textbox', { name: '向 点子 发送消息' }).fill('拟定对照计划')
    await btn(main, '发送').click()
    await btn(main, '打开 Bot 工作台').click()
    await btn(workbench, '实验').click()
    const plan = workbench.getByRole('button', { name: /持续学习回归计划/ })
    await plan.waitFor()
    await plan.click()
    await workbench.getByRole('region', { name: '实验详情' }).getByText('待审批', { exact: true }).waitFor()
    await btn(workbench, '返回实验').click()

    step = 'project and Bot scope, experiment preview and original run'
    const catalog = (await owner('catalog')).data
    const firstWorkspace = catalog.find(row => row.name === '试验工作区').workspaceId
    const request = (action, args) => owner('workspace-page', { workspaceId: firstWorkspace, action, args })
    assert.equal((await request('bot/experiment', { featureId: 'ideas', id: secondRun, kind: 'trial' })).status, 404)
    assert.equal((await request('bot/artifact', { featureId: 'ideas', id: firstRun, kind: 'trial', name: '../curve.svg' })).status, 404)
    await workbench.getByRole('button', { name: /消融对照/ }).click()
    assert.equal(await workbench.getByText('证据核对', { exact: true }).count(), 0)
    await btn(workbench, 'scores.csv').click()
    await workbench.getByRole('img', { name: /按表格行序绘制/ }).waitFor()
    await workbench.getByLabel('指标', { exact: true }).click()
    await page.locator('[role="listbox"] [role="option"]').filter({ hasText: /^accuracy$/ }).click()
    await workbench.getByText(/0.72 至 0.89/).waitFor()
    if (process.env.LABWEAVE_PREVIEW_DIR) {
      await page.screenshot({ path: process.env.LABWEAVE_PREVIEW_DIR + '/bot-workbench-experiment.png' })
    }
    await btn(workbench, 'curve.svg').click()
    const image = workbench.getByRole('img', { name: 'curve.svg' })
    await image.waitFor()
    await page.waitForFunction(() => Boolean(document.querySelector('.lw-bot-artifact-img')?.naturalWidth))
    await btn(workbench, '在项目代码沙盒打开').click()
    await page.getByText('消融对照', { exact: true }).last().waitFor()
    await btn(page, '返回 Bot 工作台').click()
    await workbench.waitFor()

    step = 'native browser launcher and return to the Bot'
    await btn(workbench, '工具').click()
    await btn(workbench, '浏览器').click()
    const browserAddress = page.locator('[data-rightbar-col] input').first()
    await browserAddress.fill(fixtureUrl + '/bot-browser')
    await browserAddress.press('Enter')
    await page.frameLocator('[data-rightbar-col] iframe').getByText('Bot browser example').waitFor()
    await btn(page, '返回 Bot 工作台').click()
    await workbench.waitFor()

    step = 'switch Bot project and check the narrow right drawer'
    await page.keyboard.press('Escape')
    await workbench.waitFor({ state: 'hidden' })
    await btn(page, '设置').click()
    await btn(page, '深色').click()
    await page.getByRole('button', { name: '深色', exact: true, pressed: true }).waitFor()
    await page.keyboard.press('Escape')
    await page.setViewportSize({ width: 940, height: 660 })
    await page.evaluate(() => { document.documentElement.style.zoom = '125%' })
    await openBot('文献工作区')
    await workbench.getByText('论文证据校对', { exact: true }).first().waitFor()
    assert.equal(await workbench.getByText('旧任务指标', { exact: true }).count(), 0)
    await btn(workbench, '实验').click()
    await workbench.getByRole('button', { name: /证据核对/ }).waitFor()
    assert.equal(await workbench.getByRole('button', { name: /消融对照/ }).count(), 0)
    if (process.env.LABWEAVE_PREVIEW_DIR) {
      await page.screenshot({ path: process.env.LABWEAVE_PREVIEW_DIR + '/bot-workbench-narrow.png' })
    }
    console.log('Bot workbench, native schedule writes, scoped previews, browser and narrow drawer verified.')
  } catch (error) {
    console.error('Failed at', step, error.message)
    console.error((await page.locator('body').innerText()).slice(0, 1400))
    process.exitCode = 1
  } finally {
    await browser.close()
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1 })
