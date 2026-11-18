// The login URL travels over stdin and is never included in diagnostic output.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('playwright')

async function main() {
  const [phase, root, model] = process.argv.slice(2)
  const url = fs.readFileSync(0, 'utf8').trim()
  const context = await chromium.launchPersistentContext(path.join(root, 'browser'), {
    channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true, locale: 'zh-CN', viewport: { width: 1280, height: 820 },
    deviceScaleFactor: phase === 'restart' ? 1.5 : 1,
  })
  const page = context.pages()[0]
  const evidence = path.join(root, 'session-proof.json')
  page.setDefaultTimeout(20000)
  let step = '打开科研工作区'
  async function preview(name) {
    if (process.env.LABWEAVE_PREVIEW_DIR) {
      fs.mkdirSync(process.env.LABWEAVE_PREVIEW_DIR, { recursive: true })
      await page.screenshot({ path: path.join(process.env.LABWEAVE_PREVIEW_DIR, name + '.png'), animations: 'disabled' })
    }
  }
  const owner = (route, data) => page.evaluate(async ({ route, data }) => {
    const r = await fetch('/api/labweave/' + route, data === undefined ? {} : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    })
    return { code: r.status, data: await r.json() }
  }, { route, data })
  const button = name => page.getByRole('button', { name, exact: true })
  async function openSettings() {
    await button('账号菜单').click()
    await page.getByRole('menuitem', { name: /^设置/ }).click()
  }
  async function checkBrand() {
    const mark = page.locator('[class*="brandIdentity"]:has(.lw-wordmark) .lw-brand-mark').first()
    await mark.waitFor()
    const clipped = await mark.evaluate(async img => {
      await img.decode()
      const rect = img.getBoundingClientRect()
      for (let parent = img.parentElement; parent; parent = parent.parentElement) {
        const box = parent.getBoundingClientRect(), style = getComputedStyle(parent)
        if (/(hidden|clip|auto|scroll)/.test(style.overflowX) && (rect.left < box.left - 1 || rect.right > box.right + 1)) return true
        if (/(hidden|clip|auto|scroll)/.test(style.overflowY) && (rect.top < box.top - 1 || rect.bottom > box.bottom + 1)) return true
      }
      return rect.width < 20 || Math.abs(rect.height - rect.width) > 1
    })
    assert.equal(clipped, false, '左上角品牌图标超出可见区域')
    const icons = await page.locator('link[rel="icon"]').evaluateAll(links => links.map(link => new URL(link.href).pathname))
    assert.ok(icons.length > 0 && icons.every(path => path === '/labweave-orbit.svg'))
    const svg = await fetch(new URL(icons[0], url))
    assert.match(svg.headers.get('content-type'), /image\/svg\+xml/)
    assert.equal(await svg.text(), fs.readFileSync(path.join(__dirname, '../plugins/dsh-labweave-workspace/labweave-orbit.svg'), 'utf8'))
    const manifest = await (await fetch(new URL('/manifest.webmanifest', url))).json()
    assert.equal(manifest.name, 'leaweave')
    for (const icon of manifest.icons) {
      const bytes = Buffer.from(await (await fetch(new URL(icon.src, url))).arrayBuffer())
      assert.equal(bytes.readUInt32BE(16) + 'x' + bytes.readUInt32BE(20), icon.sizes)
    }
  }
  async function waitView(check) {
    const until = Date.now() + 22000
    do {
      const sessionId = await page.locator('[data-conversation-session]:visible').last().getAttribute('data-conversation-session', { timeout: 600 }).catch(() => null)
      if (sessionId) {
        const response = await owner('project', { sessionId, action: 'view' })
        if (response.code === 200 && check(response.data)) return { sessionId, ...response.data }
      }
      await page.waitForTimeout(150)
    } while (Date.now() < until)
    throw Error('目标会话未出现')
  }
  async function newProject(name) {
    await button('创建科研项目').click()
    const form = page.getByRole('dialog', { name: '创建科研项目' })
    await form.getByLabel('项目名称').fill(name)
    await form.getByRole('button', { name: '创建', exact: true }).click()
    await page.getByRole('navigation', { name: name + ' 项目功能' }).waitFor()
    await page.getByRole('main', { name: name + ' · 聊天' }).getByRole('button', { name: '新建项目对话' }).click()
    return waitView(v => v?.name === name)
  }
  try {
    await page.goto(url)
    await button('goat').last().waitFor()
    await page.waitForFunction(() => /(^| — )leaweave$/.test(document.title))
    await checkBrand()
    const welcome = button('继续'), addKey = button('添加 API Key')
    if (phase === 'initial') {
      await welcome.or(addKey).first().waitFor()
      if (await welcome.isVisible()) {
        await welcome.click()
        await welcome.waitFor({ state: 'hidden' })
      }
    }
    if (model !== 'model' && (phase === 'initial' ||
        await addKey.waitFor({ timeout: 5000 }).then(() => true, () => false))) {
      await addKey.click()
      await button('稍后配置').click()
      await button('稍后配置').waitFor({ state: 'hidden' })
    }
    const unauthed = await fetch(new URL('/api/labweave/catalog', url))
    assert.ok([401, 403].includes(unauthed.status))
    if (phase === 'restart') {
      const before = JSON.parse(fs.readFileSync(evidence))
      assert.equal(await page.getByText('标准模式', { exact: true }).count(), 0)
      const rows = (await owner('catalog')).data
      assert.deepEqual(rows.map(r => r.workspaceId).sort(), before.rows.sort())
      const recovered = await owner('project', { sessionId: before.session, action: 'view' })
      assert.equal(recovered.code, 200)
      assert.equal(recovered.data.rails.ideas[0].text, '仅项目甲可见的想法')
      assert.deepEqual(recovered.data.plugins.map(p => p.name), ['核查来源', '周报'])
      const schedule = JSON.parse(fs.readFileSync(path.join(root, 'home/storages/schedule.json')))
      const persisted = Object.values(schedule.tables.tasks).find(r => r.record?.title === '仅乙的定时复盘')
      assert.ok(persisted, '指定项目的自动化任务未持久化')
      assert.equal(path.basename(persisted.target.create.cwd), before.projectB)
      step = '原生项目改名与设置'
      assert.equal(await page.evaluate(() => devicePixelRatio), 1.5)
      if (!(await button('重命名研究甲').isVisible())) await button('研究甲').click()
      await button('重命名研究甲').click()
      const rename = page.getByRole('dialog', { name: '重命名项目' })
      await rename.getByRole('textbox').fill('研究甲修订')
      await rename.getByRole('button', { name: '保存' }).click()
      await page.getByText('研究甲修订', { exact: true }).first().waitFor()
      assert.equal((await owner('project', { sessionId: before.session, action: 'view' })).data.name, '研究甲修订')
      await openSettings()
      const setting = page.getByLabel('全局助手名称', { exact: true })
      await setting.fill('我的研究助手')
      await setting.locator('..').getByRole('button', { name: '保存' }).click()
      await setting.locator('..').getByRole('status').filter({ hasText: '已保存。' }).waitFor()
      assert.equal((await owner('assistant-name')).data.name, '我的研究助手')
      await button('深色').click()
      await page.getByRole('button', { name: '深色', pressed: true }).waitFor()
      await page.reload()
      await button('我的研究助手').last().waitFor()
      if (!(await button('深色').isVisible())) await openSettings()
      await page.getByRole('button', { name: '深色', pressed: true }).waitFor()
      assert.ok((await page.title()).endsWith('leaweave'))
      console.log('重启后的会话、项目更名、助手名、深色主题和自动化目标验证通过')
      return
    }
    step = '原生项目创建与五项功能'
    await button('goat').last().click()
    await waitView(v => v.scope === 'global')
    await page.getByRole('button', { name: '梳理研究方向' }).waitFor()
    const heroMark = page.locator('[data-content-phase="hero"] img.lw-brand-mark')
    await heroMark.waitFor()
    assert.equal(await heroMark.evaluate(async img => { await img.decode(); return img.getBoundingClientRect().width }), 34)
    assert.equal(await page.locator('[data-home-whale]').count(), 0)
    await button('收起侧边栏').click()
    await page.mouse.move(480, 450)
    await page.locator('[data-sidebar-toggle] img.lw-brand-mark').waitFor()
    await button('打开侧边栏').click()
    assert.equal(await page.locator('[data-slot="conversation.hero.agentPreset"] button:visible').count(), 0)
    assert.equal(await page.getByText('标准模式', { exact: true }).count(), 0)
    await preview('01-goat')
    const a = await newProject('研究甲')
    await heroMark.waitFor()
    assert.equal(await page.locator('[data-slot="conversation.hero.agentPreset"] button:visible').count(), 0)
    const projectBar = page.getByRole('navigation', { name: '研究甲 项目功能' })
    for (const label of ['聊天','动态','点子','目标','资源库']) await projectBar.getByRole('button', { name: label, exact: true }).waitFor()
    assert.equal(await projectBar.locator('xpath=ancestor::*[@data-sidebar-scrollport]').count(), 1)
    await projectBar.getByRole('button', { name: '点子' }).click()
    const ideas = page.getByRole('region', { name: '点子', exact: true })
    await ideas.getByLabel('新点子').fill('仅项目甲可见的想法')
    await ideas.getByRole('button', { name: '添加' }).click()
    await ideas.getByText('仅项目甲可见的想法').waitFor()
    assert.equal(await page.getByRole('main', { name: '研究甲 · 点子' }).count(), 1)
    assert.equal(await page.locator('[data-conversation-content]:visible').count(), 0)
    await preview('02-project-ideas')
    await projectBar.getByRole('button', { name: '聊天', exact: true }).click()
    await page.getByRole('list', { name: '研究甲 的对话列表' }).getByRole('button').first().waitFor()
    await preview('03-project-chats')
    step = '目标、订阅与资源导入'
    await projectBar.getByRole('button', { name: '目标' }).click()
    const goals = page.getByRole('region', { name: '目标', exact: true })
    await goals.getByLabel('新目标').fill('完成对照')
    await goals.getByRole('button', { name: '添加' }).click()
    await goals.getByRole('checkbox', { name: '完成 完成对照' }).click()
    await goals.locator('input[type=checkbox]:checked').waitFor()
    await preview('04-project-goals')
    await projectBar.getByRole('button', { name: '动态' }).click()
    const feed = page.getByRole('region', { name: '动态', exact: true })
    await feed.getByLabel('订阅关键词').fill('fixture')
    await feed.getByRole('button', { name: '保存订阅' }).click()
    await feed.getByPlaceholder('fixture').waitFor()
    await preview('05-project-feed')
    await projectBar.getByRole('button', { name: '资源库' }).click()
    const library = page.getByRole('region', { name: '资源库', exact: true })
    await library.getByLabel('导入文件').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('resource body') })
    await library.getByRole('button', { name: '阅读' }).click()
    await library.getByText('resource body', { exact: true }).waitFor()
    await preview('06-project-library')
    step = 'PDF 阅读和项目论文对比草稿'
    const pdf = fs.readFileSync(path.join(root, 'fixture.pdf'))
    for (const name of ['论文一.pdf', '论文二.pdf']) {
      await library.getByLabel('导入文件').setInputFiles({ name, mimeType: 'application/pdf', buffer: pdf })
      await library.getByRole('listitem').filter({ hasText: name }).waitFor()
    }
    await library.getByRole('listitem').filter({ hasText: '论文一.pdf' }).getByRole('button', { name: '阅读' }).click()
    await library.getByRole('button', { name: '下一页' }).click()
    await library.getByText('2 / 2', { exact: true }).waitFor()
    await library.getByText('论文对比', { exact: true }).click()
    await library.getByRole('checkbox', { name: '论文一.pdf' }).check()
    await library.getByRole('checkbox', { name: '论文二.pdf' }).check()
    await library.getByRole('button', { name: '在项目聊天中对比' }).click()
    const compareDraft = page.locator('[contenteditable=true]:visible').last()
    await page.waitForFunction(() => [...document.querySelectorAll('[contenteditable=true]')].some(el => el.textContent.includes('论文二.pdf')))
    assert.match(await compareDraft.innerText(), /论文一\.pdf/)
    await compareDraft.fill('')
    step = '人工审批实验草案'
    await projectBar.getByRole('button', { name: '目标' }).click()
    await goals.getByText('实验与证据', { exact: true }).click()
    await goals.getByRole('button', { name: '创建算法对照示例草案' }).click()
    await goals.getByText('协议、命令与预算', { exact: true }).click()
    await goals.getByText(/"maxRuns": 45/).waitFor()
    await goals.getByRole('button', { name: '批准计划与预算' }).click()
    await goals.getByRole('button', { name: '运行实验' }).waitFor({ timeout: 120000 })
    step = '更多菜单创建指定项目插件'
    await button('更多').first().click()
    await page.getByRole('menuitem', { name: '创建项目插件' }).click()
    const form = page.getByRole('dialog', { name: '创建项目插件' })
    await form.getByLabel('适用范围').selectOption(a.scope)
    await form.getByLabel('插件名称').fill('核查来源')
    await form.getByLabel('交给项目助手的指令').fill('核对本项目资源的出处。')
    await form.getByRole('button', { name: '创建插件' }).click()
    await projectBar.getByRole('button', { name: '核查来源' }).waitFor()
    assert.equal((await owner('plugin', { requestId: require('node:crypto').randomUUID().replaceAll('-', ''),
      name: '周报', prompt: '总结本项目本周工作。', scope: 'all' })).code, 200)
    step = '项目切换与全局新会话'
    const b = await newProject('研究乙')
    assert.notEqual(a.scope, b.scope)
    assert.equal(b.rails.ideas.length, 0)
    assert.deepEqual(b.plugins.map(p => p.name), ['周报'])
    if (model === 'model') {
      step = '项目内模型工具与功能改名'
      const input = page.locator('[contenteditable=true]:visible').last()
      await input.fill('请调用 labweave_rename_feature，将本项目的 ideas 改名为「灵感」。请实际调用工具并简短确认。')
      await button('发送消息').click()
      const runningIcon = page.locator('[data-chat-running]:not([data-holding]) [class*="runningIcon"]').last()
      await runningIcon.waitFor()
      assert.ok(await runningIcon.evaluate(el => getComputedStyle(el).backgroundImage.includes('labweave-orbit.svg')
        && [...el.children].every(child => getComputedStyle(child).display === 'none')))
      const until = Date.now() + 120000
      let renamed
      do {
        await page.waitForTimeout(800)
        renamed = (await owner('project', { sessionId: b.sessionId, action: 'view' })).data.labels.ideas === '灵感'
      } while (!renamed && Date.now() < until)
      assert.ok(renamed, '项目内真实模型改名没有写入')
      assert.equal(await page.locator('[data-slot="conversation.session.header.actions"]').getByText('标准模式', { exact: true }).count(), 0)
      assert.equal((await owner('project', { sessionId: a.sessionId, action: 'view' })).data.labels.ideas, '点子')
    }
    step = '原生自动化的默认和指定项目'
    await button('自动化任务').click()
    await button('新建自动化任务').click()
    const target = page.getByRole('button', { name: /关联工作区/ })
    assert.match(await target.innerText(), /goat/)
    await target.click()
    await page.getByRole('menu').getByText('研究乙', { exact: true }).click()
    assert.match(await target.innerText(), /研究乙/)
    await page.getByLabel('自动化任务名称').fill('仅乙的定时复盘')
    await page.locator('textarea:visible').fill('查看本项目的目标。')
    await button('创建').click()
    await page.getByText('仅乙的定时复盘', { exact: true }).first().waitFor()
    step = '顶部新会话回到全局'
    await button('goat').last().click()
    const global = await waitView(v => v?.scope === 'global')
    assert.notEqual(global.sessionId, b.sessionId)
    assert.equal((await owner('project', { sessionId: global.sessionId, action: 'idea_create', args: { text: 'unscoped' } })).code, 403)
    assert.equal((await owner('project', { sessionId: a.sessionId, action: 'view', args: { projectId: b.scope } })).code, 400)
    assert.equal((await owner('project', { sessionId: 'unknown', action: 'view' })).code, 403)
    const rows = (await owner('catalog')).data
    fs.writeFileSync(evidence, JSON.stringify({ rows: rows.map(r => r.workspaceId), session: a.sessionId, projectB: b.scope }))
    step = '窄窗口和放大显示'
    await page.setViewportSize({ width: 900, height: 700 })
    await page.evaluate(() => { document.documentElement.style.zoom = '125%' })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1))
    await page.evaluate(() => { document.documentElement.style.zoom = '' })
    const devtools = await context.newCDPSession(page)
    await devtools.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1.25 })
    assert.ok(Math.abs(await page.evaluate(() => window.visualViewport.scale) - 1.25) < .01)
    await devtools.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 })
    await devtools.detach()
    if (model === 'model') {
      step = '真实模型调用'
      const input = page.locator('[contenteditable=true]:visible').last()
      await input.fill('请使用 labweave_project_list 工具列出项目，只回答项目名称。')
      await button('发送消息').click()
      await page.waitForFunction(() => {
        const chat = document.querySelector('[data-chat-following-tail], [data-conversation-content] [data-chat-flow]')
        return chat?.innerText.includes('研究甲') && chat.innerText.includes('研究乙')
          && !chat.querySelector('[data-chat-running]:not([data-holding])')
      }, undefined, { timeout: 120000 })
    }
    console.log('原生侧栏、项目创建、五项功能、项目插件、全局路由及跨项目拒绝通过')
  } catch (e) {
    console.error('失败步骤 ' + step)
    const text = await page.locator('body').innerText({ timeout: 3000 }).catch(() => '')
    console.error(text.slice(0, 1400).replace(/(token=|sk-)[^\s]+/gi, '[redacted]'))
    throw e
  } finally { await context.close() }
}
main().catch(e => { console.error(e.message.replace(/(token=|sk-)[^\s]+/gi, '[redacted]').slice(0, 1600)); process.exitCode = 1 })
