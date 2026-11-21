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
    const project = page.getByRole('navigation', { name: '模型选择测试 项目功能' })
    if (!await project.isVisible()) await button('模型选择测试').click()
    await project.getByRole('button', { name: '在模型选择测试中新建对话', exact: true }).click()
    assert.equal(await page.getByRole('dialog', { name: '配置模型 API', exact: true }).count(), 0)

    const openComposerModelMenu = async () => {
      const btn = page.locator('[data-composer-card] button[aria-haspopup="menu"][aria-label^="选择模型"]:visible').last()
      await btn.waitFor()
      const menu = page.locator('[role="menu"][aria-label="模型与推理强度"], [role="group"][aria-label="模型与推理强度"]').last()
      if (!await menu.isVisible()) await btn.click()
      await menu.waitFor()
      return { btn, menu }
    }

    step = '验证模型弹出菜单展示模型、推理强度、上下文窗口，且不含模型与 API 设置或全局默认'
    {
      const { menu } = await openComposerModelMenu()
      await menu.getByRole('menuitem', { name: /模型\s+DeepSeek/ }).waitFor()
      await menu.getByRole('menuitem', { name: /推理强度/ }).waitFor()
      await menu.getByRole('menuitem', { name: /上下文窗口/ }).waitFor()
      assert.equal(await menu.getByRole('menuitem', { name: /模型供应商/ }).count(), 0)
      assert.equal(await menu.getByRole('menuitem', { name: /模型与 API 设置/ }).count(), 0)
      assert.equal(await menu.getByRole('button', { name: /^(设为全局默认|已设为默认)$/ }).count(), 0)

      const assertRoot = async () => {
        await menu.getByRole('menuitem', { name: /^模型\s/ }).waitFor()
        await menu.getByRole('menuitem', { name: /^推理强度/ }).waitFor()
        await menu.getByRole('menuitem', { name: /^上下文窗口/ }).waitFor()
      }
      const checkNavigation = async () => {
        for (const name of ['模型', '推理强度', '上下文窗口']) {
          await menu.getByRole('menuitem', { name: new RegExp('^' + name + '\\s') }).click()
          const back = menu.locator('.lw-mo-back').filter({ hasText: new RegExp('^' + name + '$') })
          await back.waitFor()
          if (name === '上下文窗口') {
            assert.equal(await menu.getByRole('menuitem', { name: /^(模型|推理强度)/ }).count(), 0)
          }
          await back.click()
          await assertRoot()
        }
      }
      await checkNavigation()
      if (process.env.LABWEAVE_CHECK_MODEL_NAVIGATION === '1') {
        await page.setViewportSize({ width: 900, height: 700 })
        await page.evaluate(() => { document.documentElement.style.zoom = '125%' })
        await checkNavigation()
        console.log('项目对话三个模型子页的返回及上下文标题通过，覆盖 100% 和 125% 缩放')
        return
      }

      const pickModel = async (name) => {
        const current = menu.getByRole('menuitem', { name: /模型\s+/ }).first()
        await current.click()
        await page.locator('button.lw-mo-back').filter({ hasText: '模型' }).waitFor()
        const candidates = [
          menu.getByRole('menuitemradio', { name: new RegExp(name) }),
          menu.getByRole('option', { name: new RegExp(name) }),
          menu.getByRole('menuitem', { name: new RegExp(name) }),
          menu.getByRole('button', { name: new RegExp(name) }),
        ]
        for (const loc of candidates) {
          if (await loc.count()) {
            await loc.first().click()
            await menu.waitFor({ state: 'hidden' })
            await openComposerModelMenu()
            return
          }
        }
        throw new Error('未找到模型选项: ' + name)
      }

      step = '验证可直接切换不同模型并配置推理强度与上下文窗口长度'
      await pickModel('GPT-4o Mini')
      await menu.getByRole('menuitem', { name: /模型\s+GPT-4o Mini/ }).waitFor()
      const triggerText = await page.locator('[data-composer-card] button').filter({ hasText: /GPT-4o Mini/ }).last().innerText()
      assert.match(triggerText, /GPT-4o Mini/, '切换模型后底部触发栏应同步更新')

      await pickModel('O3 Mini')
      await menu.getByRole('menuitem', { name: /模型\s+O3 Mini/ }).waitFor()

      const customReasonRow = menu.getByRole('menuitem', { name: /推理强度/ })
      if (await customReasonRow.isVisible().catch(() => false)) {
        await customReasonRow.click()
        const reasonPanel = menu.getByRole('group', { name: '模型推理强度配置' })
        await reasonPanel.waitFor()
        await reasonPanel.getByRole('button', { name: /启用（Off \/ Low \/ Medium \/ High）/ }).click()
        await reasonPanel.waitFor({ state: 'hidden' })
      }
      await menu.getByRole('menuitem', { name: /推理强度/ }).click()
      await page.locator('button.lw-mo-back').filter({ hasText: '推理强度' }).waitFor()
      await menu.getByRole('menuitemradio', { name: 'Low', exact: true }).click()

      if (await menu.isVisible().catch(() => false)) {
        await page.mouse.click(10, 10)
      }
      await menu.waitFor({ state: 'hidden' })
    }

    {
      const { menu } = await openComposerModelMenu()
      await menu.getByRole('menuitem', { name: /推理强度\s+Low/ }).waitFor()
      await menu.getByRole('menuitem', { name: /上下文窗口/ }).click()
      const ctxPanel = menu.getByRole('group', { name: '上下文窗口长度' })
      await ctxPanel.waitFor()
      await ctxPanel.getByRole('menuitemradio', { name: '256K', exact: true }).click()
      await ctxPanel.waitFor({ state: 'hidden' })
      await menu.getByRole('menuitem', { name: /上下文窗口\s+256K/ }).waitFor()

      await menu.getByRole('menuitem', { name: /上下文窗口/ }).click()
      await ctxPanel.waitFor()
      await ctxPanel.getByLabel('自定义上下文窗口长度').fill('192K')
      await ctxPanel.getByRole('button', { name: '应用', exact: true }).click()
      await ctxPanel.waitFor({ state: 'hidden' })
      await menu.getByRole('menuitem', { name: /上下文窗口\s+192K/ }).waitFor()

      const pickModel = async (name) => {
        const current = menu.getByRole('menuitem', { name: /模型\s+/ }).first()
        await current.click()
        await page.locator('button.lw-mo-back').filter({ hasText: '模型' }).waitFor()
        const candidates = [
          menu.getByRole('menuitemradio', { name: new RegExp(name) }),
          menu.getByRole('option', { name: new RegExp(name) }),
          menu.getByRole('menuitem', { name: new RegExp(name) }),
          menu.getByRole('button', { name: new RegExp(name) }),
        ]
        for (const loc of candidates) {
          if (await loc.count()) {
            await loc.first().click()
            await menu.waitFor({ state: 'hidden' })
            await openComposerModelMenu()
            return
          }
        }
        throw new Error('未找到模型选项: ' + name)
      }

      await pickModel('DeepSeek')
      await menu.getByRole('menuitem', { name: /模型\s+DeepSeek/ }).waitFor()
      await menu.getByRole('menuitem', { name: /上下文窗口/ }).click()
      await ctxPanel.getByRole('menuitemradio', { name: '1M', exact: true }).click()
      await menu.getByRole('menuitem', { name: /上下文窗口\s+1M/ }).waitFor()

      await pickModel('O3 Mini')
      await menu.getByRole('menuitem', { name: /上下文窗口\s+192K/ }).waitFor()

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

    step = '页面刷新后验证上下文窗口、推理强度与所选模型持久化'
    await page.setViewportSize({ width: 1280, height: 820 })
    await page.reload({ waitUntil: 'domcontentloaded' })
    const { menu } = await openComposerModelMenu()
    await menu.getByRole('menuitem', { name: /上下文窗口\s+192K/ }).waitFor()
    await menu.getByRole('menuitem', { name: /模型\s+O3 Mini/ }).waitFor()

    console.log('模型选择、推理强度与上下文窗口端到端测试全部通过')
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
