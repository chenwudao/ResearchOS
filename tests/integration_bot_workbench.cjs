const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { chromium } = require('playwright')

async function main() {
  const { url, first, second } = JSON.parse(readFileSync(0, 'utf8'))
  const channel = process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : 'chromium')
  const browser = await chromium.launch({ channel })
  try {
    const page = await browser.newPage({ locale: 'zh-CN', viewport: { width: 1360, height: 850 } })
    page.setDefaultTimeout(15000)
    const button = (area, name) => area.getByRole('button', { name, exact: true })
    const request = (workspaceId, action, args) => page.evaluate(async data => (await fetch('/api/labweave/workspace-page', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    })).status, { workspaceId, action, args })

    async function openRun(project, other, score) {
      const nav = page.getByRole('navigation', { name: project.name + ' 项目功能' })
      if (!await nav.isVisible()) await button(page, project.name).click()
      await button(nav, '评测工程台').click()
      const main = page.getByRole('main', { name: project.name + '的评测工程台' })
      await button(main, '运行记录').click()
      await button(main, project.title).waitFor()
      assert.equal(await button(main, other.title).count(), 0)
      await button(main, project.title).click()
      const detail = main.getByRole('region', { name: '实验详情' })
      await button(detail, 'scores.csv').click()
      await detail.getByRole('img', { name: 'accuracy按表格行序绘制' }).waitFor()
      await detail.getByText('原始数据', { exact: true }).click()
      await detail.locator('pre').filter({ hasText: score }).waitFor()
    }

    await page.goto(url)
    const setup = page.getByRole('dialog', { name: '配置模型 API' })
    await button(setup, '稍后配置').click()
    await openRun(first, second, '0.89')
    const catalog = await page.evaluate(async () => (await fetch('/api/labweave/catalog')).json())
    const workspaceId = scope => catalog.find(row => row.scope === scope).workspaceId
    const run = { featureId: first.bot, id: first.run, kind: 'experiment' }
    assert.equal(await request(workspaceId(first.scope), 'bot/experiment', { ...run, featureId: first.sibling }), 404)
    assert.equal(await request(workspaceId(second.scope), 'bot/experiment', { ...run, featureId: second.bot }), 404)
    assert.equal(await request(workspaceId(first.scope), 'bot/artifact', { ...run, name: 'outputs/unrelated.csv' }), 404)
    await page.setViewportSize({ width: 940, height: 700 })
    await page.locator('html').evaluate(node => { node.style.zoom = '1.15' })
    await openRun(second, first, '0.93')
    console.log('Engineering Bot run previews and project, Bot, and artifact isolation passed.')
  } finally {
    await browser.close()
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1 })
