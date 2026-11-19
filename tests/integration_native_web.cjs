// The login URL travels over stdin and is never included in diagnostic output.
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('playwright')

async function main() {
  const [phase, root, model, python] = process.argv.slice(2)
  const url = fs.readFileSync(0, 'utf8').trim()
  const context = await chromium.launchPersistentContext(path.join(root, 'browser'), {
    channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true, locale: 'zh-CN', viewport: { width: 1280, height: 820 },
    deviceScaleFactor: phase === 'restart' ? 1.5 : 1,
  })
  const page = context.pages()[0]
  const netLogs = []
  page.on('requestfailed', req => netLogs.push(`REQFAIL ${req.method()} ${new URL(req.url()).pathname} -> ${req.failure()?.errorText}`))
  page.on('response', res => { if (res.status() >= 500) netLogs.push(`HTTP${res.status()} ${res.url()}`) })
  page.on('pageerror', err => netLogs.push(`PAGEERR ${err.message}`))
  const evidence = path.join(root, 'session-proof.json')
  page.setDefaultTimeout(20000)
  let step = '打开科研工作区'
  async function preview(name) {
    if (process.env.LABWEAVE_PREVIEW_DIR) {
      fs.mkdirSync(process.env.LABWEAVE_PREVIEW_DIR, { recursive: true })
      await page.screenshot({ path: path.join(process.env.LABWEAVE_PREVIEW_DIR, name + '.png'), animations: 'disabled', timeout: 60000 })
    }
  }
  const owner = (route, data) => page.evaluate(async ({ route, data }) => {
    const r = await fetch('/api/labweave/' + route, data === undefined ? {} : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    })
    return { code: r.status, data: await r.json() }
  }, { route, data })
  const button = name => page.getByRole('button', { name, exact: true })
  const assistantHome = button('打开助理')
  async function openQuickEntry(region) {
    await region.getByRole('button', { name: '添加内容或文件', exact: true }).click()
    await region.getByRole('button', { name: '+ 录入', exact: true }).click()
  }
  async function openSettings() {
    await button('设置').click()
  }
  // Only use on fixture screens without user-authored titles or messages.
  async function checkProductCopy(region) {
    const retiredNames = /DeepSeek\s+Harness|LabWeave|\bdsh\b/i
    assert.doesNotMatch(await region.innerText(), retiredNames)
    const labels = await region.locator(':is([title], [placeholder], [aria-label], [alt]):visible').evaluateAll(
      nodes => nodes.flatMap(node => ['title', 'placeholder', 'aria-label', 'alt'].map(attr => node.getAttribute(attr) || ''))
    )
    assert.doesNotMatch(labels.join('\n'), retiredNames)
  }
  const languages = [
    ['en', 'English', 'Configure model API'], ['ja', '日本語', 'モデル API を設定'],
    ['es', 'Español', 'Configurar API del modelo'], ['fr', 'Français', 'Configurer l’API du modèle'],
    ['de', 'Deutsch', 'Modell-API einrichten'], ['ru', 'Русский', 'Настройка API модели'],
    ['pt', 'Português', 'Configurar API do modelo'], ['zh', '中文', '配置模型 API'],
  ]
  async function checkSetupLanguages() {
    for (const [locale, , title] of languages) {
      const guest = await context.browser().newContext({ locale, viewport: { width: 900, height: 700 } })
      try {
        const first = await guest.newPage()
        await first.goto(url)
        const setup = first.getByRole('dialog', { name: title, exact: true })
        await setup.waitFor()
        assert.equal(await first.getByRole('dialog').count(), 1)
        assert.doesNotMatch(await first.locator('body').innerText(), /DeepSeek\s+(?:Account|账号)|LabWeave|\b(?:DSH|DS)\b|预览版|Preview Notice/i)
        assert.equal(await setup.locator('select').count(), 1)
        assert.equal(await setup.locator('input').count(), 1)
        assert.equal(await setup.locator('input[type="password"]').count(), 1)
        assert.equal((await first.locator('html').getAttribute('lang')).split('-')[0], locale)
        await checkProductCopy(first.locator('body'))
      } finally {
        await guest.close()
      }
    }
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
    assert.deepEqual(new Set(icons), new Set(['/favicon.svg', '/favicon-dark.svg']))
    const svg = await fetch(new URL(icons[0], url))
    assert.match(svg.headers.get('content-type'), /image\/svg\+xml/)
    assert.equal(await svg.text(), fs.readFileSync(path.join(__dirname, '../plugins/dsh-labweave-workspace/client/assets/labweave-orbit.svg'), 'utf8'))
    const manifest = await (await fetch(new URL('/manifest.webmanifest', url))).json()
    assert.equal(manifest.name, 'Weave')
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
    await button('新建工作区项目').click()
    const form = page.getByRole('dialog', { name: '新建工作区项目' })
    const create = form.getByRole('button', { name: '创建', exact: true })
    assert.ok(await create.isDisabled())
    await form.getByLabel('项目名称').fill(name)
    assert.ok(await create.isEnabled())
    const styles = await form.locator('.lw-dialog-actions button').evaluateAll(buttons => buttons.map(button => ({
      fill: getComputedStyle(button).backgroundColor,
      left: button.getBoundingClientRect().left,
    })))
    assert.equal(styles[0].fill, 'rgba(0, 0, 0, 0)')
    assert.notEqual(styles[1].fill, styles[0].fill)
    assert.ok(styles[1].left > styles[0].left)
    await create.click()
    await page.getByRole('navigation', { name: name + ' 项目功能' }).waitFor()
    return waitView(v => v?.name === name)
  }
  async function enableLegacyColumns(project) {
    assert.deepEqual(project.features.map(feature => feature.id), ['chat'])
    // Populate the disposable database for the existing-column UI checks.
    execFileSync(python, ['-c', [
      'import sys',
      'from pathlib import Path',
      'sys.path.insert(0, sys.argv[1])',
      'import workspace, features',
      'workspace.DATA = Path(sys.argv[2])',
      'for feature in features.OPTIONAL_BUILTINS: features.enable_builtin(sys.argv[3], feature)',
    ].join('\n'), path.join(__dirname, '..', 'demo', 'api'), path.join(root, 'data'), project.scope])
    assert.equal((await owner('catalog')).code, 200)
    await page.evaluate(() => window.dispatchEvent(new Event('labweave:project-updated')))
  }
  async function checkProjectTools(name) {
    step = '项目聊天右侧栏'
    await button('工具').click()
    await page.locator('[data-sidebar-right-open]').waitFor()
    const right = page.locator('[data-rightbar-col]')
    const entry = label => right.getByText(label, { exact: true })
    for (const label of ['工作区文件', 'Git', '存储空间', '项目代码沙盒', '新建终端', '浏览器']) {
      await entry(label).first().waitFor()
      assert.equal(await entry(label).count(), 1, `工具引导中应只有一个 ${label} 入口`)
    }
    for (const label of ['Git', '存储空间', '项目代码沙盒']) {
      await entry(label).locator('xpath=ancestor::button[1]').locator('svg path').waitFor()
    }
    assert.equal(await right.getByRole('button', { name: '工具', exact: true }).count(), 0)
    assert.equal(await entry('任务详情').count(), 0)
    await preview('10-rightbar-guide')
    await entry('工作区文件').click()
    await entry('空目录').waitFor()
    assert.match(await right.innerText(), /projects[/\\]proj_/)

    async function openTab(label) {
      await right.getByRole('button', { name: '新标签页', exact: true }).click()
      await page.getByRole('button', { name: label, exact: true }).filter({ visible: true }).last().click()
    }
    await openTab('Git')
    await button('刷新 Git 状态').locator('svg path').waitFor()
    await openTab('存储空间')
    await button('刷新存储空间').locator('svg path').waitFor()
    await button('新建类别').locator('svg path').waitFor()
    await openTab('项目代码沙盒')
    const sandbox = page.getByRole('region', { name: name + ' 项目代码沙盒' })
    await sandbox.getByLabel('下次试跑环境').waitFor()
    await sandbox.getByRole('button', { name: '刷新项目代码沙盒' }).locator('svg path').waitFor()
    await sandbox.getByText('还没有试跑记录', { exact: true }).waitFor()
    await sandbox.getByText('管理环境与试跑预算').click()
    await sandbox.getByLabel('增加试跑秒数').fill('30')
    await sandbox.getByRole('button', { name: '授权项目试跑' }).click()
    await sandbox.getByText(/可用试跑预算 30 秒/).waitFor()
    await button('工具').click()
    await page.locator('[data-sidebar-right-open]').waitFor({ state: 'detached' })
  }
  async function assertCollapsedRailAligned(targetBtn, message) {
    await page.locator('[data-sidebar-collapsed="true"]').waitFor()
    await targetBtn.waitFor()
    const handle = await targetBtn.elementHandle()
    await page.waitForFunction(el => {
      if (document.getAnimations().some(a => a.playState === 'running')) return false
      const t = document.querySelector('[data-sidebar-toggle]')?.getBoundingClientRect()
      const r = el?.getBoundingClientRect()
      return t && r && Math.abs(r.x - t.x) <= 2 && Math.abs(r.width - t.width) <= 2
    }, handle, { timeout: 3000 }).catch(() => {})
    const tBox = await page.locator('[data-sidebar-toggle]').boundingBox()
    const rBox = await targetBtn.boundingBox()
    assert.ok(tBox && rBox && Math.abs(rBox.x - tBox.x) <= 2 && Math.abs(rBox.width - tBox.width) <= 2,
      `${message}: toggle=${JSON.stringify(tBox)} rail=${JSON.stringify(rBox)}`)
  }
  try {
    await page.goto(url)
    await page.locator('.lw-wordmark').waitFor()
    await page.waitForFunction(() => /(^| — )Weave$/.test(document.title))
    await checkBrand()
    const setup = page.getByRole('dialog', { name: '配置模型 API', exact: true })
    if (phase === 'initial' && model !== 'model') {
      await setup.waitFor()
      await checkProductCopy(page.locator('body'))
      await checkSetupLanguages()
    }
    if (model !== 'model' && (phase === 'initial' ||
        await setup.waitFor({ timeout: 5000 }).then(() => true, () => false))) {
      await setup.getByRole('button', { name: '稍后配置', exact: true }).click()
      await setup.waitFor({ state: 'hidden' })
    }
    if (phase === 'rightbar') {
      await newProject('右侧栏验收')
      await checkProjectTools('右侧栏验收')
      console.log('工具引导、原生工作区文件、Git 和存储图标、沙盒空态及预算授权通过。')
      return
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
      assert.ok(recovered.data.memories.some(m => m.content === '基线实验固定 seed=42' && m.pinned), '项目置顶记忆应跨越重启持久化')
      assert.deepEqual(recovered.data.plugins.map(p => p.name), ['周报'])
      assert.ok(recovered.data.features.some(f => f.label === '组会速递'), '自定义功能 Bot 应跨越重启持久化')
      const customFeat = recovered.data.features.find(f => f.label === '组会速递')
      assert.equal(recovered.data.rails[customFeat.id]?.[0]?.text, '本周实验进展汇总')
      const schedule = JSON.parse(fs.readFileSync(path.join(root, 'home/storages/schedule.json')))
      const persisted = Object.values(schedule.tables.tasks).find(r => r.record?.title === '仅乙的定时复盘')
      assert.ok(persisted, '指定项目的自动化任务未持久化')
      assert.equal(path.basename(persisted.target.create.cwd), before.projectB)
      assert.ok(persisted.record.prompt.startsWith('[LabWeave '), '查看任务应保留历史任务原始指令')
      step = '原生项目改名与设置'
      assert.equal(await page.evaluate(() => devicePixelRatio), 1.5)
      if (!(await button('重命名研究甲').isVisible())) await button('研究甲').click()
      await button('重命名研究甲').click()
      const rename = page.getByRole('dialog', { name: '重命名项目' })
      await rename.getByRole('textbox').fill('DSH 论文')
      await rename.getByRole('button', { name: '保存' }).click()
      await page.getByText('DSH 论文', { exact: true }).first().waitFor()
      assert.equal((await owner('project', { sessionId: before.session, action: 'view' })).data.name, 'DSH 论文')
      await assistantHome.click()
      const renameEntry = page.getByRole('button', { name: '设置全局助手 Weave 资料', exact: true })
      await renameEntry.waitFor()
      await renameEntry.click()
      const profileRename = page.getByRole('dialog', { name: '全局助手设置' })
      await profileRename.waitFor()
      await profileRename.getByRole('tab', { name: '人设与记忆', exact: true }).click()
      await profileRename.getByRole('button', { name: '编辑', exact: true }).click()
      await profileRename.getByLabel('助手名称').fill('我的研究助手')
      await profileRename.getByRole('button', { name: '保存', exact: true }).click()
      await profileRename.getByText('助手资料已保存。').waitFor()
      assert.equal((await owner('assistant-name')).data.name, '我的研究助手')
      await profileRename.getByRole('button', { name: '关闭助手资料', exact: true }).click()
      await profileRename.waitFor({ state: 'hidden' })
      await openSettings()
      assert.equal(await page.getByLabel('全局助手名称', { exact: true }).count(), 0)
      assert.equal(await page.getByLabel('选择科研项目', { exact: true }).count(), 0)
      await button('深色').click()
      await page.getByRole('button', { name: '深色', pressed: true }).waitFor()
      await page.reload()
      await page.locator('.lw-wordmark').waitFor()
      if (model !== 'model' && await setup.waitFor({ timeout: 5000 }).then(() => true, () => false)) {
        await setup.getByRole('button', { name: '稍后配置', exact: true }).click()
        await setup.waitFor({ state: 'hidden' })
      }
      assert.equal(await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--dsh-content-font-size').trim()), '16px')
      if (!(await button('深色').isVisible())) await openSettings()
      await page.getByRole('button', { name: '深色', pressed: true }).waitFor()
      assert.ok((await page.title()).endsWith('Weave'))
      await page.keyboard.press('Escape')
      await page.locator('[data-shortcut-modal="settings"]').waitFor({ state: 'hidden' })
      step = '验证重启后助手资料、自定义头像、SOUL 与全局记忆持久化'
      await assistantHome.click()
      const persistedEntry = page.getByRole('button', { name: '设置全局助手 我的研究助手 资料', exact: true })
      await persistedEntry.waitFor()
      await persistedEntry.click()
      const persistedProfile = page.getByRole('dialog', { name: '全局助手设置' })
      await persistedProfile.waitFor()
      await persistedProfile.getByRole('tab', { name: '人设与记忆', exact: true }).click()
      await persistedProfile.getByText('专注科研实证与可复现工作流').waitFor()
      await persistedProfile.getByRole('button', { name: '恢复默认图标', exact: true }).waitFor()
      await persistedProfile.getByRole('button', { name: /记忆/ }).click()
      const memList = persistedProfile.getByLabel('全局记忆列表')
      await memList.getByText('优先使用固定随机种子进行对照实验').waitFor()
      await memList.getByText('核心置顶', { exact: true }).waitFor()
      await persistedProfile.getByLabel('搜索记忆').fill('随机种子')
      await memList.getByText('优先使用固定随机种子进行对照实验').waitFor()
      await persistedProfile.getByRole('button', { name: '关闭助手资料', exact: true }).click()
      await persistedProfile.waitFor({ state: 'hidden' })
      step = '验证重启后的自定义功能 Bot 统一界面与右侧分类抽屉跳转'
      const alphaBranch = page.getByRole('navigation', { name: 'DSH 论文 项目功能' })
      if (!(await alphaBranch.isVisible())) await button('DSH 论文').click()
      await alphaBranch.getByRole('button', { name: '组会速递', exact: true }).waitFor()
      assert.equal(await alphaBranch.getByRole('button', { name: '临时栏目', exact: true }).count(), 0)
      await alphaBranch.getByRole('button', { name: '组会速递', exact: true }).click()
      const customRegion = page.getByRole('region', { name: '组会速递', exact: true })
      await customRegion.waitFor()
      assert.equal(await page.locator('aside[aria-label*="分配任务"], button[aria-label*="分配任务"], .lw-fbot-drawer').count(), 0)
      const richCard = customRegion.locator('.lw-fbot-card[data-illustrated="true"]')
      await richCard.waitFor()
      await richCard.getByText('消融实验对比图：Reweight 带来稳定增益', { exact: true }).waitFor()
      await richCard.locator('img[src^="data:image/svg+xml;base64,"]').waitFor()
      const thumbReady = await richCard.locator('img').evaluate(img => img.complete && img.naturalWidth > 0)
      assert.ok(thumbReady, '图文卡片缩略图应成功加载')
      await customRegion.locator('.lw-fbot-card[data-illustrated="false"]').getByText('本周实验进展汇总', { exact: true }).waitFor()
      await preview('11-custom-feature-bot')
      await richCard.click()
      const richDetail = customRegion.locator('.lw-fbot-detail')
      await richDetail.locator('.lw-fbot-detail-title').getByText('消融实验对比图：Reweight 带来稳定增益', { exact: true }).waitFor()
      await richDetail.locator('.lw-fbot-detail-figure img[src^="data:image/svg+xml;base64,"]').waitFor()
      await richDetail.locator('.lw-fbot-detail-caption').getByText('Baseline、+Align 与 +Reweight 验证准确率对比图', { exact: true }).waitFor()
      const detailReady = await richDetail.locator('.lw-fbot-detail-figure img').evaluate(img => img.complete && img.naturalWidth > 0)
      assert.ok(detailReady, '图文详情大图应成功加载')
      await preview('16-illustrated-push-detail')
      await customRegion.getByLabel('向 组会速递 发送消息').waitFor()
      assert.equal(await customRegion.locator('.lw-fbot-tools, .lw-fbot-model-badge, .lw-fbot-model-select').count(), 0)
      await openQuickEntry(customRegion)
      const customQuick = page.getByRole('dialog', { name: '快速录入：组会速递' })
      await customQuick.getByRole('button', { name: '关闭 快速录入：组会速递', exact: true }).waitFor()
      await customQuick.getByRole('button', { name: '取消', exact: true }).waitFor()
      await preview('14-modal-close-dark')
      await customQuick.getByRole('button', { name: '关闭 快速录入：组会速递', exact: true }).click()
      await customQuick.waitFor({ state: 'hidden' })
      console.log('重启后的会话、项目更名、助手名、深色主题、自定义功能 Bot 和自动化目标验证通过')
      return
    }
    step = '原生项目创建与五项功能'
    await assistantHome.click()
    await waitView(v => v.scope === 'global')
    const globalLeading = page.locator('[data-conversation-header-leading]')
    await globalLeading.getByRole('button', { name: '助手历史对话', exact: true }).click()
    const historyDialog = page.getByRole('dialog', { name: '助手历史对话列表', exact: true })
    await historyDialog.waitFor()
    await historyDialog.getByText(/暂无历史对话/).waitFor()
    await historyDialog.getByRole('button', { name: '关闭列表', exact: true }).click()
    await historyDialog.waitFor({ state: 'hidden' })
    assert.equal(await page.locator('.lw-starters, .lw-hero-ctx').count(), 0)
    const heroMark = page.locator('[data-content-phase="hero"] img.lw-brand-mark')
    await heroMark.waitFor()
    const heroLayout = await page.evaluate(async () => {
      const img = document.querySelector('[data-content-phase="hero"] img.lw-brand-mark')
      await img.decode()
      const avatar = document.querySelector('.lw-hero-avatar-frame').getBoundingClientRect()
      const name = document.querySelector('.lw-hero-entry-name').getBoundingClientRect()
      const composer = document.querySelector('[data-composer-card]').getBoundingClientRect()
      return {
        markWidth: img.getBoundingClientRect().width,
        avatarBottom: avatar.bottom,
        nameTop: name.top,
        nameBottom: name.bottom,
        composerTop: composer.top,
        avatarTop: avatar.top,
      }
    })
    assert.ok(heroLayout.markWidth >= 60, '全局助手主区域图标应整体放大')
    assert.ok(heroLayout.avatarBottom <= heroLayout.nameTop + 2, '全局助手图标应在文字上方')
    assert.ok(heroLayout.nameBottom < heroLayout.composerTop, '全局助手入口应位于输入框上方主区域')
    assert.ok(heroLayout.avatarTop < 220, '全局助手入口应处于偏上的位置')
    const heroEntry = page.getByRole('button', { name: '设置全局助手 Weave 资料', exact: true })
    await heroEntry.click()
    const profileModal = page.getByRole('dialog', { name: '全局助手设置' })
    await profileModal.waitFor()
    const profileLayout = await profileModal.evaluate(dialog => {
      const root = dialog.getBoundingClientRect()
      const header = dialog.querySelector('.lw-ap-chrome').getBoundingClientRect()
      const content = dialog.querySelector('.lw-ap-content').getBoundingClientRect()
      return { left: root.left, rightInset: innerWidth - root.right, top: root.top,
        headerBottom: header.bottom, contentTop: content.top }
    })
    assert.ok(profileLayout.left > profileLayout.rightInset && profileLayout.rightInset < 28)
    assert.ok(profileLayout.top >= 0 && profileLayout.headerBottom <= profileLayout.contentTop + 1)
    const profileAvatar = profileModal.locator('.lw-ap-avatar-circle img')
    await profileAvatar.waitFor()
    await profileModal.getByRole('tab', { name: '活动', exact: true }).click()
    await profileModal.getByRole('button',{ name:'查看所有预定任务' }).waitFor()
    await profileModal.getByRole('tab', { name: '审核', exact: true }).click()
    await profileModal.getByText('暂无批准记录', { exact: true }).waitFor()
    await profileAvatar.waitFor()
    await profileModal.getByRole('tab', { name: '人设与记忆', exact: true }).click()
    await profileModal.getByRole('button', { name: '编辑', exact: true }).click()
    await profileModal.getByLabel('一句话简介').fill('专注科研实证与可复现工作流')
    await profileModal.getByRole('button', { name: '保存', exact: true }).click()
    await profileModal.getByText('助手资料已保存。').waitFor()
    const samplePng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAACxJREFUeNpiPHnqFAMDMDAxMDEwMTBiYWIyMDExMjAwMDAyMDAxMDExAgABBgB1nQMx5gY9swAAAABJRU5ErkJggg==', 'base64')
    await profileModal.getByLabel('更换头像').setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: samplePng })
    await profileModal.getByText('头像已更新。').waitFor()
    await profileModal.getByRole('button', { name: /SOUL/ }).click()
    await profileAvatar.waitFor()
    await profileModal.getByLabel('核心准则（SOUL）').fill('1. 一切结论须追溯原始实验证据。')
    await profileModal.getByRole('button', { name: '保存 SOUL', exact: true }).click()
    await profileModal.getByText('SOUL 核心准则已保存。').waitFor()
    await profileModal.getByRole('button', { name: /核心准则/ }).click()
    await profileModal.getByRole('button', { name: /记忆/ }).click()
    await profileAvatar.waitFor()
    await profileModal.getByPlaceholder('输入要让全局助手长期记住的偏好或备忘…').fill('优先使用固定随机种子进行对照实验')
    await profileModal.getByRole('button', { name: '添加记忆', exact: true }).click()
    await profileModal.getByLabel('全局记忆列表').getByText('优先使用固定随机种子进行对照实验').waitFor()
    await profileModal.getByRole('button', { name: '置顶', exact: true }).first().click()
    await profileModal.getByLabel('全局记忆列表').getByText('核心置顶', { exact: true }).waitFor()
    await profileModal.getByLabel('搜索记忆').fill('随机种子')
    await profileModal.getByLabel('全局记忆列表').getByText('优先使用固定随机种子进行对照实验').waitFor()
    await profileModal.getByRole('button', { name: '清空', exact: true }).click()
    const pBox = await profileModal.boundingBox()
    await page.mouse.click(pBox.x + 8, pBox.y + 8)
    await profileModal.waitFor()
    await preview('13-modal-close-profile')
    await profileModal.getByRole('button', { name: '关闭助手资料', exact: true }).click()
    await profileModal.waitFor({ state: 'hidden' })
    await page.getByText('专注科研实证与可复现工作流').waitFor()
    const expandedBrandWidth = await page.locator('[class*="logoRow"] button[class*="brand"]').first().evaluate(el => el.getBoundingClientRect().width)
    const expandedMarkWidth = await page.locator('[class*="logoRow"] .lw-brand-mark').first().evaluate(el => el.getBoundingClientRect().width)
    assert.ok(expandedMarkWidth >= 32 && expandedBrandWidth >= 140, '左上角头像与 Weave 入口应放大并充分利用顶栏空间')
    assert.equal(await page.locator('[data-home-whale]').count(), 0)
    // Verify agent teamwork toggle has been removed from the Composer model options menu
    const modelBtn = page.locator('[data-slot="conversation.input.model"] button:visible').first()
    if (await modelBtn.count()) {
      await modelBtn.click()
      await page.waitForTimeout(250)
      assert.equal(await page.getByText(/智能体团队协作|Agent teamwork/i).count(), 0, '模型菜单中不应再显示启用智能体团队协作')
      await page.keyboard.press('Escape')
    }
    await button('收起侧边栏').click()
    await page.mouse.move(480, 450)
    await page.locator('[data-sidebar-toggle] img.lw-brand-mark').waitFor()
    assert.equal(await page.locator('[class*="newSession"]:visible').count(), 0)
    await assertCollapsedRailAligned(page.locator('nav[aria-label="工作区项目快捷栏"] button').first(), '收起后项目图标应与上方品牌图标纵向对齐')
    await page.locator('nav[aria-label="工作区项目快捷栏"] button').first().click()
    await page.getByRole('dialog', { name: '工作区项目菜单' }).waitFor()
    await page.getByRole('dialog', { name: '工作区项目菜单' }).getByRole('button', { name: /回到全局助手/ }).click()
    await button('打开侧边栏').click()
    assert.equal(await page.locator('[data-slot="conversation.hero.agentPreset"] button:visible').count(), 0)
    assert.equal(await page.getByText('标准模式', { exact: true }).count(), 0)
    assert.equal(await button('更多').count(), 0)
    assert.equal(await button('账号').count(), 0)
    assert.equal(await button('项目插件').count(), 0)
    assert.equal(await button('助手对话').count(), 0)
    assert.equal(await button('部署插件').count(), 0)
    assert.equal(await button('插件').count(), 0)
    assert.equal(await button('自动化任务').count(), 0)
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--dsh-content-font-size').trim()), '16px')
    const footerBoxes = []
    for (const label of ['模型与 API', '设置']) {
      const btn = button(label)
      await btn.waitFor()
      const box = await btn.boundingBox()
      assert.ok(box && box.width > 120, `${label} 应为整行并列按钮`)
      footerBoxes.push(box)
    }
    assert.ok(footerBoxes[0].y < footerBoxes[1].y, '左下角两项应纵向并列排列')
    assert.ok(Math.abs(footerBoxes[0].x - footerBoxes[1].x) < 4)
    await button('模型与 API').click()
    const settingsModal = page.locator('[data-shortcut-modal="settings"]')
    await settingsModal.waitFor()
    await settingsModal.locator('nav button[aria-current="true"]').waitFor()
    await checkProductCopy(settingsModal)
    assert.equal(await settingsModal.locator('nav button', { hasText: /Agent\s*预设|preset|插件|plugin/i }).count(), 0)
    await settingsModal.getByRole('button', { name: '通用设置', exact: true }).click()
    await checkProductCopy(settingsModal)
    let activeLanguage = '中文'
    for (const [locale, label] of languages) {
      await settingsModal.getByRole('button', { name: activeLanguage, exact: true }).click()
      await page.getByRole('menu').getByText(label, { exact: true }).click()
      await page.waitForFunction(lang => document.documentElement.lang.split('-')[0] === lang, locale)
      await settingsModal.getByRole('button', { name: label, exact: true }).waitFor()
      await checkProductCopy(settingsModal)
      activeLanguage = label
    }
    assert.equal(await settingsModal.getByRole('button', { name: /打开配置文件|Open config/i }).count(), 0)
    assert.doesNotMatch(await settingsModal.innerText(), /Agent\s*预设|性能与用量|Session Log|打开配置文件/)
    const baseTreePx = await page.locator('.lw-tree').first().evaluate(el => Number.parseFloat(getComputedStyle(el).fontSize))
    await settingsModal.getByRole('button', { name: '增大字号', exact: true }).click({ force: true })
    await page.waitForFunction(() => getComputedStyle(document.body).getPropertyValue('--dsh-content-font-size').trim() === '17px')
    const biggerTreePx = await page.locator('.lw-tree').first().evaluate(el => Number.parseFloat(getComputedStyle(el).fontSize))
    assert.ok(biggerTreePx > baseTreePx, '在通用设置调大字号应同步放大界面字体')
    await settingsModal.getByRole('button', { name: '减小字号', exact: true }).click({ force: true })
    await page.waitForFunction(() => getComputedStyle(document.body).getPropertyValue('--dsh-content-font-size').trim() === '16px')
    assert.equal(await settingsModal.getByLabel('全局助手名称', { exact: true }).count(), 0)
    assert.equal(await settingsModal.getByLabel('选择科研项目', { exact: true }).count(), 0)
    await page.keyboard.press('Escape')
    await settingsModal.waitFor({ state: 'hidden' })
    assert.equal(await page.locator('[data-conversation-header-corner]').getByRole('button', { name: '工具', exact: true }).count(), 0)
    assert.equal(await page.locator('[data-sidebar-right-open]').count(), 0)
    await preview('01-Weave')
    const a = await newProject('研究甲')
    await enableLegacyColumns(a)
    await heroMark.waitFor()
    assert.equal(await page.locator('.lw-starters, .lw-hero-ctx').count(), 0)
    assert.equal(await page.locator('[data-slot="conversation.hero.agentPreset"] button:visible').count(), 0)
    assert.equal(await page.locator('[data-conversation-header-leading] button').count(), 0)
    const projectTools = page.locator('[data-conversation-header-corner]')
    await projectTools.getByRole('button', { name: '项目任务', exact: true }).waitFor()
    await projectTools.getByRole('button', { name: '工具', exact: true }).waitFor()
    assert.equal(await projectTools.getByRole('button', { name: /课题关系图|背景与记忆/ }).count(), 0)
    const projectBar = page.getByRole('navigation', { name: '研究甲 项目功能' })
    for (const label of ['聊天','动态','点子','目标','资源库']) await projectBar.getByRole('button', { name: label, exact: true }).waitFor()
    assert.equal(await projectBar.locator('xpath=ancestor::*[@data-sidebar-scrollport]').count(), 1)
    await button('收起侧边栏').click()
    const collapsedProjectBtn = page.locator('nav[aria-label="工作区项目快捷栏"]').getByRole('button', { name: '研究甲', exact: true })
    await assertCollapsedRailAligned(collapsedProjectBtn, '收起后项目图标尺寸与水平位置应与顶部对齐')
    await collapsedProjectBtn.click()
    const projectPopover = page.getByRole('dialog', { name: '研究甲 项目菜单' })
    await projectPopover.waitFor()
    await button('打开侧边栏').waitFor()
    await preview('09-collapsed-rail')
    await projectPopover.getByRole('button', { name: '点子', exact: true }).click()
    await page.getByRole('region', { name: '点子', exact: true }).waitFor()
    await button('打开侧边栏').click()
    const ideas = page.getByRole('region', { name: '点子', exact: true })
    await ideas.getByText('还没有收集任何点子', { exact: true }).waitFor()
    assert.equal(await page.locator('aside[aria-label*="分配任务"], button[aria-label*="分配任务"], .lw-fbot-drawer').count(), 0)
    await ideas.getByLabel('向 点子 发送消息').waitFor()
    await ideas.getByRole('button', { name: '发送', exact: true }).waitFor()
    await ideas.locator('.lw-empty-emblem').waitFor()
    await ideas.locator('.lw-empty-chips').waitFor()
    assert.equal(await ideas.locator('.lw-fbot-tools, .lw-fbot-model-badge, .lw-fbot-model-select').count(), 0)
    const composerBox = await ideas.locator('.lw-fbot-composer').boundingBox()
    assert.ok(composerBox && composerBox.height <= 68, '胶囊型单行底部对话框应保持精简高度，实际高度=' + composerBox?.height)
    await openQuickEntry(ideas)
    const quickDialog = page.getByRole('dialog', { name: '快速录入：点子' })
    await quickDialog.getByLabel('新点子').fill('仅项目甲可见的想法')
    await quickDialog.getByRole('button', { name: '添加', exact: true }).click()
    await ideas.locator('.lw-fbot-stats').waitFor()
    await ideas.getByText('仅项目甲可见的想法').first().waitFor()
    await ideas.getByText('仅项目甲可见的想法',{exact:true}).first().click()
    await ideas.locator('.lw-fbot-detail').getByRole('button', { name: '转为目标', exact: true }).waitFor()
    assert.equal(await page.getByRole('main', { name: '研究甲的点子' }).count(), 1)
    assert.equal(await page.getByRole('tablist', { name: '项目栏目切换' }).count(), 0)
    assert.equal(await page.locator('[data-conversation-content]:visible').count(), 0)
    await preview('02-project-ideas')
    await page.getByRole('button', { name: '展开项目聊天', exact: true }).click()
    await page.locator('[data-conversation-content]:visible').waitFor()
    await ideas.waitFor()
    await preview('07-split-companion')
    await page.getByRole('button', { name: '收起项目聊天', exact: true }).click()
    assert.equal(await page.locator('[data-conversation-content]:visible').count(), 0)
    await projectBar.getByRole('button', { name: '分屏打开目标', exact: true }).click()
    await page.getByRole('region', { name: '目标', exact: true }).waitFor()
    await ideas.waitFor()
    assert.equal(await page.getByRole('button', { name: '独占视图', exact: true }).count(), 0)
    const closeGoalPane = page.getByRole('button', { name: '关闭分栏 目标', exact: true })
    await closeGoalPane.locator('svg').waitFor()
    await closeGoalPane.click()
    await projectBar.getByRole('button', { name: '在研究甲中新建对话', exact: true }).click()
    await waitView(v => v?.name === '研究甲')
    await checkProjectTools('研究甲')
    assert.equal(await projectBar.getByLabel('研究甲 对话').count(), 0)
    await projectBar.getByRole('button', { name: '在研究甲中新建对话' }).click()
    await waitView(v => v?.name === '研究甲')
    assert.equal(await projectBar.getByLabel('研究甲 对话').count(), 0)
    await projectTools.getByRole('button', { name: '工具', exact: true }).waitFor()
    await preview('03-project-chats')
    await button('项目设置 研究甲').click()
    const projectSettings = page.getByRole('dialog', { name: '项目设置', exact: true })
    await projectSettings.getByLabel('项目名称').waitFor()
    assert.equal(await projectSettings.getByLabel('项目名称').inputValue(), '研究甲')
    await projectSettings.getByRole('button', { name: '来源文件夹', exact: true }).click()
    await projectSettings.getByRole('button', { name: '添加文件夹', exact: true }).waitFor()
    await projectSettings.getByRole('button', { name: '关闭 项目设置', exact: true }).click()
    await projectSettings.waitFor({ state: 'hidden' })
    const legacyMemory = await owner('project', {
      sessionId: a.sessionId, action: 'memory_write', args: { text: '基线实验固定 seed=42', pinned: true },
    })
    assert.equal(legacyMemory.code, 200)
    step = '目标、订阅与资源导入'
    await projectBar.getByRole('button', { name: '目标', exact: true }).click()
    const goals = page.getByRole('region', { name: '目标', exact: true })
    await goals.getByText('还没有设定任何目标', { exact: true }).waitFor()
    assert.equal(await page.locator('aside[aria-label*="分配任务"], button[aria-label*="分配任务"], .lw-fbot-drawer').count(), 0)
    assert.equal(await goals.locator('.lw-fbot-tools, .lw-fbot-model-badge, .lw-fbot-model-select').count(), 0)
    await openQuickEntry(goals)
    const goalDialog = page.getByRole('dialog', { name: '快速录入：目标' })
    await goalDialog.getByLabel('新目标').fill('完成对照')
    await goalDialog.getByRole('button', { name: '添加', exact: true }).click()
    await goals.getByRole('checkbox', { name: '完成 完成对照' }).click()
    await goals.locator('input[type=checkbox]:checked').waitFor()
    await goals.locator('.lw-goal-ring').waitFor()
    await preview('04-project-goals')
    await projectBar.getByRole('button', { name: '动态', exact: true }).click()
    const feed = page.getByRole('region', { name: '动态', exact: true })
    await feed.getByText('还没有收到任何动态推送', { exact: true }).waitFor()
    assert.equal(await page.locator('aside[aria-label*="分配任务"], button[aria-label*="分配任务"], .lw-fbot-drawer').count(), 0)
    assert.equal(await feed.locator('.lw-fbot-tools, .lw-fbot-model-badge, .lw-fbot-model-select').count(), 0)
    await openQuickEntry(feed)
    const feedDialog = page.getByRole('dialog', { name: '快速录入：动态' })
    await feedDialog.getByRole('button', { name: '关闭 快速录入：动态', exact: true }).waitFor()
    await feedDialog.getByRole('button', { name: '取消', exact: true }).waitFor()
    await preview('12-modal-close-feed')
    await feedDialog.getByLabel('订阅关键词').fill('fixture')
    await feedDialog.getByRole('button', { name: '保存订阅' }).click()
    await feed.getByText('主题已保存。', { exact: true }).waitFor()
    await openQuickEntry(feed)
    await feed.getByPlaceholder('fixture').waitFor()
    await feedDialog.getByRole('button', { name: '关闭 快速录入：动态', exact: true }).click()
    await feedDialog.waitFor({ state: 'hidden' })
    await preview('05-project-feed')
    await projectBar.getByRole('button', { name: '资源库', exact: true }).click()
    const library = page.getByRole('region', { name: '资源库', exact: true })
    await library.getByText('还没有收录任何资源', { exact: true }).waitFor()
    assert.equal(await library.locator('.lw-fbot-tools, .lw-fbot-model-badge, .lw-fbot-model-select').count(), 0)
    await openQuickEntry(library)
    const libDialog = page.getByRole('dialog', { name: '快速录入：资源库' })
    await libDialog.getByRole('button', { name: '关闭 快速录入：资源库', exact: true }).waitFor()
    await libDialog.getByRole('button', { name: '取消', exact: true }).click()
    await libDialog.waitFor({ state: 'hidden' })
    assert.equal(await page.locator('aside[aria-label*="分配任务"], button[aria-label*="分配任务"], .lw-fbot-drawer').count(), 0)
    const originalNote = 'DSH 论文：示例命令 echo "$DSH_HOME"'
    await library.getByLabel('导入文件').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from(originalNote) })
    await library.getByText(originalNote, { exact: true }).waitFor()
    await library.locator('.lw-doc-card').waitFor()
    await preview('06-project-library')
    step = 'PDF 阅读与点击打开'
    const pdf = fs.readFileSync(path.join(root, 'fixture.pdf'))
    for (const name of ['论文一.pdf', '论文二.pdf']) {
      await library.getByLabel('导入文件').setInputFiles({ name, mimeType: 'application/pdf', buffer: pdf })
      await library.getByText(name,{exact:false}).first().waitFor()
    }
    await library.getByText(/论文一\.pdf/).first().click()
    await library.getByRole('button', { name: '下一页' }).click()
    await library.getByText('2 / 2', { exact: true }).waitFor()
    await library.getByRole('button', { name: '填入提问' }).click()
    const readingDraft = await library.getByLabel('向 资源库 发送消息').inputValue()
    assert.doesNotMatch(readingDraft, /labweave|\bdsh\b/i)
    assert.match(readingDraft, /第\s*2\s*页/)
    step = '目标栏检查与正式实验草案创建'
    await projectBar.getByRole('button', { name: '目标', exact: true }).click()
    assert.equal(await page.locator('aside[aria-label*="分配任务"], button[aria-label*="分配任务"], .lw-fbot-drawer').count(), 0)
    assert.equal((await owner('project', { sessionId: a.sessionId, action: 'research/example' })).code, 200)
    step = '记录项目作用域用于持久化与动态功能测试'
    assert.ok(a.scope, '研究甲作用域应存在')
    step = '接口级项目插件隔离验证与右侧栏项目工作台'
    assert.equal((await owner('plugin', { requestId: require('node:crypto').randomUUID().replaceAll('-', ''),
      name: '周报', prompt: '总结本项目本周工作。', scope: 'all' })).code, 200)
    await projectBar.getByRole('button', { name: '在研究甲中新建对话', exact: true }).click()
    await waitView(v => v?.name === '研究甲')
    await page.getByRole('button', { name: '工具', exact: true }).click()
    await page.locator('[data-sidebar-right-open]').waitFor()
    const rightCol = page.locator('[data-rightbar-col]')
    const rightPane = page.getByRole('region', { name: '研究甲 项目代码沙盒' })
    if (!(await rightPane.isVisible().catch(() => false))) {
      await rightCol.getByRole('button', { name: '新标签页', exact: true }).click()
      await button('项目代码沙盒').filter({ visible: true }).last().click()
    }
    await rightPane.getByText(/可用试跑预算 30 秒/).waitFor()
    await rightPane.getByRole('tab', { name: /正式实验/ }).click()
    await rightPane.getByRole('button', { name: /待审批/ }).first().click()
    await rightPane.getByRole('button', { name: '批准计划并运行', exact: true }).waitFor()
    await preview('08-project-rightbar')
    await page.getByRole('button', { name: '工具', exact: true }).click()
    await page.locator('[data-sidebar-right-open]').waitFor({ state: 'detached' })
    step = '项目切换与全局新会话'
    const b = await newProject('研究乙')
    await enableLegacyColumns(b)
    assert.notEqual(a.scope, b.scope)
    assert.equal(b.rails.ideas.length, 0)
    assert.deepEqual(b.plugins.map(p => p.name), ['周报'])
    step = '侧栏与右侧功能 Bot 抽屉单项目改名及隔离验证'
    await button('设置').click()
    await settingsModal.waitFor()
    await settingsModal.getByRole('button', { name: '通用设置', exact: true }).click()
    assert.equal(await settingsModal.getByLabel('选择科研项目').count(), 0)
    assert.equal(await settingsModal.getByLabel('全局助手名称').count(), 0)
    await page.keyboard.press('Escape')
    await settingsModal.waitFor({ state: 'hidden' })
    const projectBarB = page.getByRole('navigation', { name: '研究乙 项目功能' })
    await projectBar.getByRole('button', { name: '重命名功能 目标', exact: true }).click()
    const renameGoalDialog = page.getByRole('dialog', { name: '重命名项目功能' })
    await renameGoalDialog.getByLabel('功能显示名称').fill('里程碑')
    await renameGoalDialog.getByRole('button', { name: '保存', exact: true }).click()
    await renameGoalDialog.waitFor({ state: 'hidden' })
    await projectBar.getByRole('button', { name: '里程碑', exact: true }).waitFor()
    assert.equal(await projectBar.getByRole('button', { name: '目标', exact: true }).count(), 0)
    await projectBarB.getByRole('button', { name: '目标', exact: true }).waitFor()
    await projectBar.getByRole('button', { name: '重命名功能 聊天', exact: true }).click()
    const renameFeatureDialog = page.getByRole('dialog', { name: '重命名项目功能' })
    await renameFeatureDialog.getByLabel('功能显示名称').fill('课题讨论')
    await renameFeatureDialog.getByRole('button', { name: '保存', exact: true }).click()
    await renameFeatureDialog.waitFor({ state: 'hidden' })
    await projectBar.getByRole('button', { name: '课题讨论', exact: true }).waitFor()
    await projectBarB.getByRole('button', { name: '聊天', exact: true }).waitFor()
    await projectBar.getByRole('button', { name: '里程碑', exact: true }).click()
    const milestoneRegion = page.getByRole('region', { name: '里程碑', exact: true })
    await milestoneRegion.waitFor()
    assert.equal(await milestoneRegion.locator('.lw-bot-project-tag, .lw-head-desc, .lw-bot-keywords').count(), 0)
    const centeredCheck = await milestoneRegion.evaluate(el => {
      const head = el.querySelector('.lw-fbot-head')?.getBoundingClientRect()
      const pill = el.querySelector('.lw-bot-pill')?.getBoundingClientRect()
      if (!head || !pill) return null
      return Math.abs((pill.left + pill.width / 2) - (head.left + head.width / 2))
    })
    assert.ok(centeredCheck !== null && centeredCheck < 12, '功能 Bot 入口应居中显示，实际偏移=' + centeredCheck)
    await milestoneRegion.getByRole('button', { name: '修改功能 Bot 信息 里程碑', exact: true }).click()
    const editBotDialog = page.getByRole('dialog', { name: '修改功能 Bot 信息' })
    await editBotDialog.waitFor()
    const sheetPos = await editBotDialog.evaluate(el => {
      const r = el.getBoundingClientRect()
      return { left: r.left, right: r.right, width: r.width, vw: window.innerWidth }
    })
    assert.ok(sheetPos.left > sheetPos.vw * 0.5 && sheetPos.right >= sheetPos.vw - 24, 'Bot 信息弹窗应靠右展示')
    await preview('15-right-bot-sheet')
    await editBotDialog.getByRole('button', { name: '符号 ◎', exact: true }).click()
    await editBotDialog.getByLabel('名字').fill('研究目标')
    await editBotDialog.getByLabel('备注').fill('跟踪关键实验里程碑')
    await editBotDialog.getByLabel('关键词').fill('里程碑、实验')
    await editBotDialog.getByRole('button', { name: '保存', exact: true }).click()
    await editBotDialog.waitFor({ state: 'hidden' })
    const goalsRegion = page.getByRole('region', { name: '研究目标', exact: true })
    await goalsRegion.waitFor()
    await projectBar.getByRole('button', { name: '研究目标', exact: true }).waitFor()
    await goalsRegion.getByRole('button', { name: '修改功能 Bot 信息 研究目标', exact: true }).click()
    await editBotDialog.waitFor()
    assert.equal(await editBotDialog.getByLabel('备注').inputValue(), '跟踪关键实验里程碑')
    await editBotDialog.getByText('实验', { exact: true }).first().waitFor()
    await editBotDialog.getByRole('button', { name: '关闭功能 Bot 信息', exact: true }).click()
    await editBotDialog.waitFor({ state: 'hidden' })
    await projectBarB.getByRole('button', { name: '在研究乙中新建对话', exact: true }).click()
    await waitView(v => v?.scope === b.scope)
    if (model === 'model') {
      step = '项目内模型工具与功能改名'
      const input = page.locator('[contenteditable=true]:visible').last()
      await input.fill('请调用 labweave_rename_feature，将本项目的 ideas 改名为「灵感」。请实际调用工具并简短确认。')
      await button('发送消息').click()
      const running = page.locator('[data-chat-running]:not([data-holding])').last()
      assert.equal(await running.getByRole('status').textContent(), '深度思考中')
      await running.getByText(/^深度思考中，用时 /).waitFor()
      const runningIcon = running.locator('[class*="runningIcon"]')
      await runningIcon.waitFor()
      assert.ok(await runningIcon.evaluate(el => getComputedStyle(el).backgroundImage.includes('weave-orbit.svg')
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
    step = '项目删除验证'
    await newProject('待删除项目')
    await button('删除待删除项目').click()
    await page.getByRole('dialog', { name: '删除项目' }).getByRole('button', { name: '确认删除' }).click()
    await button('待删除项目').waitFor({ state: 'hidden' })
    step = '顶部新会话回到全局并验证取消右侧栏与自动化队列'
    await assistantHome.click()
    await waitView(v => v?.scope === 'global')
    assert.equal(await page.locator('[data-conversation-header-corner]').getByRole('button', { name: '工具', exact: true }).count(), 0)
    await page.getByRole('button', { name: '设置全局助手 Weave 资料', exact: true }).click()
    const schedProfile = page.getByRole('dialog', { name: '全局助手设置' })
    await schedProfile.waitFor()
    await schedProfile.getByRole('tab', { name: '活动', exact: true }).click()
    await schedProfile.getByRole('button', { name: '查看所有预定任务', exact: true }).click()
    await schedProfile.waitFor({ state: 'hidden' })
    await button('新建自动化任务').click()
    await checkProductCopy(page.locator('body'))
    const target = page.getByRole('button', { name: /关联工作区/ })
    assert.match(await target.innerText(), /Weave/)
    await target.click()
    await page.getByRole('menu').getByText('研究乙', { exact: true }).click()
    assert.match(await target.innerText(), /研究乙/)
    await page.getByLabel('自动化任务名称').fill('仅乙的定时复盘')
    const savedInstruction = '查看 DSH 论文里的 $DSH_HOME 示例。'
    const legacyTask = `[LabWeave ${b.scope}/ideas]\n${savedInstruction}\n任务归属：${JSON.stringify({ projectId: b.scope, featureId: 'ideas' })}。先读取此 Bot 的分配任务，按存储要求将结果写入对应功能。`
    await page.locator('textarea:visible').fill(legacyTask)
    await button('创建').click()
    await page.getByText('仅乙的定时复盘', { exact: true }).first().waitFor()
    await page.waitForFunction(expected => [...document.querySelectorAll('textarea')].some(el => el.value === expected),
      legacyTask.replace('[LabWeave ', '[Weave '))
    step = '顶部新会话回到全局并隔离检查'
    await assistantHome.click()
    const global = await waitView(v => v?.scope === 'global')
    assert.notEqual(global.sessionId, b.sessionId)
    assert.equal((await owner('project', { sessionId: global.sessionId, action: 'idea_create', args: { text: 'unscoped' } })).code, 403)
    assert.equal((await owner('project', { sessionId: a.sessionId, action: 'view', args: { projectId: b.scope } })).code, 400)
    assert.equal((await owner('project', { sessionId: 'unknown', action: 'view' })).code, 403)
    const rows = (await owner('catalog')).data
    fs.writeFileSync(evidence, JSON.stringify({ rows: rows.map(r => r.workspaceId), session: a.sessionId, projectA: a.scope, projectB: b.scope }))
    step = '窄窗口和放大显示'
    await page.setViewportSize({ width: 900, height: 700 })
    await page.evaluate(() => { document.documentElement.style.zoom = '125%' })
    await globalLeading.getByRole('button', { name: '助手历史对话', exact: true }).click()
    await historyDialog.waitFor()
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1))
    await page.keyboard.press('Escape')
    await historyDialog.waitFor({ state: 'hidden' })
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
    if (netLogs.length) console.error('NET_LOGS:', netLogs.slice(-10).join(' | '))
    const text = await page.locator('body').innerText({ timeout: 3000 }).catch(() => '')
    console.error(text.slice(0, 1400).replace(/(token=|sk-)[^\s]+/gi, '[redacted]'))
    throw e
  } finally { await context.close() }
}
main().catch(e => { console.error(e.message.replace(/(token=|sk-)[^\s]+/gi, '[redacted]').slice(0, 1600)); process.exitCode = 1 })
