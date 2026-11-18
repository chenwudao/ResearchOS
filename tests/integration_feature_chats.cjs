const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('playwright')

async function main() {
  const cfg = JSON.parse(fs.readFileSync(0, 'utf8'))
  const browser = await chromium.launchPersistentContext(cfg.browser, {
    channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true, locale: 'zh-CN',
    args: ['--disable-gpu', '--renderer-process-limit=1', '--enable-low-end-device-mode'],
    viewport: { width: 1360, height: 850 },
  })
  const page = browser.pages()[0] || await browser.newPage()
  page.setDefaultTimeout(30000)
  const button = name => page.getByRole('button', { name, exact: true })
  const nav = name => page.getByRole('navigation', { name: name + ' 项目功能' })
  const owner = (route, data) => page.evaluate(async ({route,data}) => {
    const res = await fetch('/api/labweave/' + route, data === undefined ? {} : {
      method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data),
    })
    return { code: res.status, data: await res.json() }
  }, {route,data})
  async function until(check, description, duration = 30000) {
    const end = Date.now() + duration
    do {
      const value = await check()
      if (value) return value
      await page.waitForTimeout(350)
    } while (Date.now() < end)
    throw new Error(description)
  }
  async function chatScope(scope) {
    return until(async () => {
      const id = await page.locator('[data-conversation-session]:visible').last()
        .getAttribute('data-conversation-session', {timeout:1200}).catch(()=>null)
      return id && (await owner('project', {sessionId:id,action:'view'})).data.scope === scope
    }, '目标对话没有就绪')
  }
  async function send(prompt) {
    await page.locator('[contenteditable=true]:visible').last().fill(prompt)
    await button('发送消息').click()
  }
  async function openNav(label) {
    if (!await nav(label).isVisible()) await button(label).click()
    await nav(label).waitFor()
  }
  const view = async workspaceId => {
    return until(async()=>{
      const r=await owner('workspace-page',{workspaceId,action:'view'})
      if(r.code===503)return false
      assert.equal(r.code,200)
      return r.data
    },'读取项目数据未恢复')
  }
  async function created(workspaceId,label,note) {
    return until(async()=>{
      const v=await view(workspaceId)
      const matches=v.features.filter(f=>f.label===label && !f.builtin)
      if(!matches.length)return false
      assert.equal(matches.length,1)
      const f=matches[0]
      return v.rails[f.id]?.some(e=>e.text.includes(note)) && f
    }, '模型创建功能或写入首条记录未完成：'+label, 170000)
  }
  async function openChatSandbox(global) {
    if(global && await page.getByLabel('沙盒目标项目').isVisible())return
    if(!global && await page.locator('.lw-sandbox:visible').count())return
    if(!await page.locator('[data-sidebar-right-open]').isVisible())await button('右侧栏').click()
    const right=page.locator('[data-rightbar-col]')
    if(global && await page.getByLabel('沙盒目标项目').isVisible())return
    if(!global && await page.locator('.lw-sandbox:visible').count())return
    await right.getByText('项目代码沙盒',{exact:true}).last().click()
    if(global)await page.getByLabel('沙盒目标项目').waitFor()
    else await page.locator('.lw-sandbox:visible').first().waitFor()
  }
  async function featurePage(project,label,note) {
    await nav(project).getByRole('button',{name:label,exact:true}).click()
    const main=page.getByRole('main',{name:project+' · '+label,exact:true})
    await main.waitFor()
    assert.equal(await page.locator('aside[aria-label*="分配任务"], button[aria-label*="分配任务"], .lw-fbot-drawer').count(),0)
    if(note)await main.getByText(note,{exact:false}).first().waitFor()
    assert.equal(await main.getByRole('button',{name:/^(项目)?代码沙盒$/}).count(),0)
    assert.equal(await page.locator('.lw-sandbox:visible').count(),0)
    assert.equal(await page.getByLabel('沙盒目标项目').filter({visible:true}).count(),0)
    assert.equal(await main.getByRole('textbox',{name:'向 '+label+' 发送消息'}).count(),1)
  }
  async function screenshot(name) {
    if(!process.env.LABWEAVE_PREVIEW_DIR)return
    fs.mkdirSync(process.env.LABWEAVE_PREVIEW_DIR,{recursive:true})
    await page.screenshot({path:path.join(process.env.LABWEAVE_PREVIEW_DIR,name+'.png'),animations:'disabled'})
  }
  async function sharedAndNested(a,b) {
    console.log('全局对话为所有项目创建共享功能')
    const common='项目简报', local='证据索引', aNote='核对本周取样', localNote='登记证据出处'
    await send('请给全部科研项目创建同一个共享功能 Bot「项目简报」（作用范围为全部项目），用于整理项目周报。创建成功后，仅在「文献梳理」项目的这个功能里写一条「核对本周取样」，归入「本周」。方法复现项目保持空白。请实际执行。')
    const shared=await created(a,common,aNote)
    const other=await view(b)
    assert.equal(other.features.find(f=>f.label===common)?.id,shared.id)
    assert.ok(!(other.rails[shared.id]||[]).length)
    await nav('方法复现').getByRole('button',{name:common,exact:true}).waitFor()
    await featurePage('文献梳理',common,aNote)
    const main=page.getByRole('main',{name:'文献梳理 · '+common,exact:true})
    console.log('从功能 Bot 自己的对话创建项目专属功能并归档')
    await main.getByRole('textbox',{name:'向 '+common+' 发送消息'}).fill('请在当前项目实际新建一个功能 Bot「证据索引」，职责是按材料来源整理证据。创建后请把「登记证据出处」作为一条记录写入新功能，分类为「待核对」。只用于本项目。')
    await main.getByRole('button',{name:'发送',exact:true}).click()
    const nested=await created(a,local,localNote)
    assert.ok(!(await view(b)).features.some(f=>f.id===nested.id))
    const feature= (await view(a)).features.find(f=>f.id===shared.id)
    assert.ok(feature.botSessionId,'发起创建的功能应使用其专属对话')
    assert.equal(await page.locator('.lw-sandbox:visible').count(),0)
    await nav('文献梳理').getByRole('button',{name:local,exact:true}).waitFor({timeout:18000})
    await featurePage('文献梳理',local,localNote)
    await screenshot('功能创建-功能Bot对话')
    console.log('从已打开沙盒的项目聊天切入功能分屏')
    await nav('文献梳理').getByRole('button',{name:'聊天',exact:true}).click()
    await chatScope(cfg.alpha);await openChatSandbox(false)
    await nav('文献梳理').getByRole('button',{name:'分屏打开资源库',exact:true}).click()
    await page.getByRole('main',{name:'文献梳理 · 资源库',exact:true}).waitFor()
    await until(async()=>await page.locator('.lw-sandbox:visible').count()===0,'分屏后仍显示沙盒')
    assert.equal(await page.getByRole('main',{name:'文献梳理 · 资源库'}).getByRole('button',{name:/^(项目)?代码沙盒$/}).count(),0)
    await nav('文献梳理').getByRole('button',{name:'聊天',exact:true}).click()
    await chatScope(cfg.alpha);await openChatSandbox(false)
    fs.writeFileSync(cfg.proof,JSON.stringify({a,b,sharedId:shared.id,localId:nested.id}))
    console.log('真实全局共享、功能 Bot 对话创建、记录项目隔离、分屏收起与聊天重新打开沙盒均通过。')
  }
  let step='打开全局助手'
  try {
    await page.goto(cfg.url)
    await button('继续').click(); await button('继续').waitFor({state:'hidden'})
    await button(cfg.assistant).last().click()
    await openNav('文献梳理'); await openNav('方法复现'); await chatScope('global')
    const catalog=(await owner('catalog')).data
    const a=catalog.find(r=>r.scope===cfg.alpha).workspaceId,b=catalog.find(r=>r.scope===cfg.beta).workspaceId
    if(cfg.messaging){
      console.log('已打开全局会话，开始验证完整消息。')
      async function partialVisible(){
        return page.locator('[data-conversation-session]:visible').last().evaluate(el=>{
          const sample=document.createElement('div')
          sample.dataset.streaming='true'
          el.append(sample)
          const visible=getComputedStyle(sample).display!=='none'
          sample.remove()
          return visible
        })
      }
      step='全局助理整条回复'
      await page.locator('style[data-lw-messenger]').first().waitFor({state:'attached'})
      assert.equal(await partialVisible(),false)
      await send('请只用一句话回答，以“叶绿素”开头，说明叶片为什么通常是绿色的。')
      await until(async()=>page.locator('[data-conversation-session]:visible').last()
        .locator('p:visible').evaluateAll(ps=>ps.some(p=>p.textContent.trim().startsWith('叶绿素'))),step,140000)
      step='项目聊天保留逐字回复'
      console.log('全局助理已回复。')
      await nav('文献梳理').getByRole('button',{name:'聊天',exact:true}).click()
      await chatScope(cfg.alpha)
      assert.equal(await partialVisible(),true)
      step='点子 Bot 保存后给出独立回话'
      console.log('项目聊天已保留流式渲染。')
      await nav('文献梳理').getByRole('button',{name:'点子',exact:true}).click()
      const main=page.getByRole('main',{name:'文献梳理 · 点子',exact:true})
      await main.getByRole('textbox',{name:'向 点子 发送消息'}).fill('请帮我把「比较两种叶片取样时间」记进本项目的点子，完成后一句话告诉我。')
      await main.getByRole('button',{name:'发送',exact:true}).click()
      await until(async()=>(await view(a)).rails.ideas.some(x=>x.text.includes('叶片取样时间')),step,150000)
      const answers=main.locator('.lw-bot-msg[data-role="assistant"]')
      await answers.last().waitFor({timeout:120000})
      const answer=(await answers.last().innerText()).trim()
      await nav('文献梳理').getByRole('button',{name:'聊天',exact:true}).click()
      await nav('文献梳理').getByRole('button',{name:'点子',exact:true}).click()
      await answers.last().waitFor()
      assert.equal((await answers.last().innerText()).trim(),answer)
      assert.equal(await answers.allTextContents().then(list=>new Set(list).size===list.length),true)
      assert.equal((await view(b)).rails.ideas.some(x=>x.text.includes('叶片取样时间')),false)
      const sessionId=(await view(a)).features.find(f=>f.id==='ideas').botSessionId
      assert.deepEqual(await owner('dialog-delivery',{sessionId}),{code:200,data:[]})
      assert.equal((await owner('dialog-delivery',{sessionId:'missing-session'})).code,403)
      // Exercise receipt rendering with a predictable log and artifact, without reserving compute.
      await page.route('**/api/labweave/dialog-delivery', async route=>{
        const request=route.request().postDataJSON()
        if(request.sessionId!==sessionId)return route.continue()
        const json=request.file ? {text:'7'} : request.runId ?
          {stdout:'七个样本',artifacts:[{name:'sample.txt'}]} : [{id:'trial-ui',title:'检查样本',status:'SUCCEEDED'}]
        return route.fulfill({json})
      })
      await page.evaluate(()=>window.dispatchEvent(new Event('labweave:project-updated')))
      await main.getByRole('button',{name:/检查样本.*已完成/}).click()
      await main.getByText('七个样本',{exact:true}).waitFor()
      await main.getByRole('button',{name:'sample.txt'}).click()
      await main.locator('.lw-receipt-detail pre').filter({hasText:/^7$/}).waitFor()
      console.log('已验证全局短回复、项目流式显示、功能 Bot 的真实写入和切回后的完整回话。')
      return
    }
    if(cfg.assign){
      step='真实对话为一个功能 Bot 分配工作'
      await nav('文献梳理').getByRole('button',{name:'聊天',exact:true}).click()
      await chatScope(cfg.alpha)
      await send('请实际给当前项目的点子 Bot 分配三项工作。职责叫“筛选假设”，说明是核对可验证性；存储要求叫“保留出处”，说明是保留原文页码；定时任务叫“每周点子回顾”，每周一上午九点汇总待验证点子。请用功能 Bot 的任务分配工具分别保存这三项，不要只写进聊天。')
      const assigned=async ws=>(await owner('workspace-page',{workspaceId:ws,action:'bot_assignments',args:{featureId:'ideas'}})).data
      const tasks=await until(async()=>{const ts=await assigned(a);return Array.isArray(ts)&&new Set(ts.map(t=>t.kind)).size===3&&ts},'三类任务未全部写入',190000)
      assert.deepEqual(await assigned(b),[])
      const job=tasks.find(t=>t.kind==='schedule');assert.ok(job.next&&job.id)
      await featurePage('文献梳理','点子')
      assert.equal(await page.locator('aside[aria-label*="分配任务"], button[aria-label*="分配任务"], .lw-fbot-drawer').count(),0)
      await screenshot('功能Bot-无分配任务右栏')
      assert.equal(await nav('文献梳理').getByRole('button',{name:'删除功能 聊天'}).count(),0)
      await nav('文献梳理').getByRole('button',{name:'删除功能 点子'}).click()
      await page.getByRole('dialog',{name:'删除功能 Bot'}).getByRole('button',{name:'取消'}).click()
      await page.getByRole('region',{name:'点子',exact:true}).waitFor()
      await nav('文献梳理').getByRole('button',{name:'删除功能 点子'}).click()
      await page.getByRole('dialog',{name:'删除功能 Bot'}).getByRole('button',{name:'确认删除'}).click()
      await nav('文献梳理').getByRole('button',{name:'点子',exact:true}).waitFor({state:'hidden'})
      assert.ok((await view(b)).features.some(f=>f.id==='ideas'))
      await page.reload();await button(cfg.assistant).last().waitFor()
      assert.ok(!(await view(a)).features.some(f=>f.id==='ideas'))
      const ledger=(await owner('assistant-history')).data
      assert.ok(!ledger.schedules.some(s=>s.id===job.id))
      console.log('真实模型分配职责、存储要求和 DSH 周期任务；右栏、删除取消与确认、定时任务清理及项目隔离通过。')
      return
    }
    if(cfg.form){
      step='项目行的加号创建功能 Bot'
      await button('文献梳理').click()
      await button('在文献梳理创建功能 Bot').click()
      const dialog=page.getByRole('dialog',{name:'创建功能 Bot'})
      await dialog.getByRole('button',{name:'符号 Σ'}).click()
      await dialog.getByLabel('搜索头像').fill('microscope')
      await dialog.getByRole('button',{name:'头像 显微镜 生物'}).click()
      await dialog.getByLabel('头像分类').selectOption('科研')
      await page.waitForFunction(()=>document.querySelector('.lw-bot-symbols use')?.getBBox().width>0)
      await dialog.getByLabel('名字',{exact:true}).fill('统计复核')
      await dialog.getByLabel('备注',{exact:true}).fill('核查对照实验的统计口径。')
      await dialog.getByLabel('关键词',{exact:true}).fill('对照，统计、对照')
      await screenshot('项目创建Bot-表单')
      await dialog.getByRole('button',{name:'创建',exact:true}).click()
      const main=page.getByRole('main',{name:'文献梳理 · 统计复核'})
      await main.waitFor()
      const bot=(await view(a)).features.find(f=>f.label==='统计复核')
      assert.equal(bot.symbol,'lucide:microscope');assert.deepEqual(bot.keywords,['对照','统计'])
      assert.ok(!(await view(b)).features.some(f=>f.id===bot.id))
      await page.reload();await openNav('文献梳理')
      const entry=nav('文献梳理').getByRole('button',{name:'统计复核',exact:true})
      await entry.waitFor();assert.match(await entry.locator('use').getAttribute('href'),/#microscope$/)
      await entry.click()
      await main.getByRole('button',{name:'修改功能 Bot 信息 统计复核'}).click()
      const editor=page.getByRole('dialog',{name:'修改功能 Bot 信息'})
      await editor.waitFor()
      await editor.getByText('统计',{exact:true}).first().waitFor()
      await screenshot('项目创建Bot-详情')
      await editor.getByLabel('头像分类').selectOption('Emoji')
      await editor.getByRole('button',{name:'头像 火箭',exact:true}).click()
      await editor.getByRole('button',{name:'保存',exact:true}).click()
      await editor.waitFor({state:'hidden'})
      assert.equal((await view(a)).features.find(f=>f.id===bot.id).symbol,'🚀')
      console.log('项目折叠行加号、符号选择、备注关键词、自动打开、刷新持久化和项目隔离通过。')
      return
    }
    if(cfg.shared){step='共享功能、功能 Bot 与分屏';await sharedAndNested(a,b);return}
    const aLabel='文献核查', bLabel='复现清单', aNote='核对样例文献页码', bNote='固定随机种子'
    step='全局助手创建指定项目功能'; console.log(step)
    await send('请实际给已有项目「文献梳理」单独新建一个功能 Bot，名称为「文献核查」，职责是核对引用和原文。创建后，请在它的「待核查」分类写入一条内容为「核对样例文献页码」的记录。完成后简短回复。')
    const aFeature=await created(a,aLabel,aNote)
    await nav('文献梳理').getByRole('button',{name:aLabel,exact:true}).waitFor({timeout:18000})
    assert.ok(!(await view(b)).features.some(f=>f.id===aFeature.id))
    await openChatSandbox(true)
    await featurePage('文献梳理',aLabel,aNote)
    await screenshot('功能创建-全局助手')
    step='项目聊天创建本项目功能'; console.log(step)
    await nav('方法复现').getByRole('button',{name:'聊天',exact:true}).click()
    await chatScope(cfg.beta)
    await send('请在当前项目实际新建一个名为「复现清单」的功能 Bot，用来整理复现实验的准备事项。创建后在它的「准备」分类写入一条内容为「固定随机种子」的记录，完成后简短回复。')
    const bFeature=await created(b,bLabel,bNote)
    await nav('方法复现').getByRole('button',{name:bLabel,exact:true}).waitFor({timeout:18000})
    assert.ok(!(await view(a)).features.some(f=>f.id===bFeature.id))
    await openChatSandbox(false)
    await featurePage('方法复现',bLabel,bNote)
    await screenshot('功能创建-项目聊天')
    for(const builtin of ['动态','点子','目标','资源库'])await featurePage('方法复现',builtin)
    step='刷新后复查稳定标识、记录与分类栏'; console.log(step)
    await page.reload()
    await openNav('文献梳理');await openNav('方法复现')
    assert.equal((await created(a,aLabel,aNote)).id,aFeature.id)
    assert.equal((await created(b,bLabel,bNote)).id,bFeature.id)
    await featurePage('方法复现',bLabel,bNote)
    console.log('真实全局与项目对话均成功创建新功能、归类首条记录、即时显示并在刷新后恢复。两项目互不串写。只有两类主聊天有右侧沙盒。')
  } catch(e){
    console.error('失败步骤 '+step)
    console.error('已显示的功能按钮：'+(await page.getByRole('navigation').getByRole('button').allTextContents().catch(()=>[])).join(' ').slice(0,400))
    throw e
  } finally{await browser.close()}
}
main().catch(e=>{console.error(e.message.replace(/(?:token=|sk-)\S+/gi,'[redacted]').slice(0,900));process.exitCode=1})
