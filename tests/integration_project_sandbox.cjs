const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('playwright')

async function main() {
  const {url,nonce,project,other,queueOnly,browserDir}=JSON.parse(fs.readFileSync(0,'utf8'))
  console.log('正在打开临时项目的浏览器。')
  const browser=await chromium.launchPersistentContext(browserDir,{channel:process.env.PLAYWRIGHT_CHANNEL||'msedge',
    headless:true,args:['--disable-gpu','--renderer-process-limit=1','--enable-low-end-device-mode'],
    locale:'zh-CN',viewport:{width:1360,height:850}})
  const page=browser.pages()[0]||await browser.newPage()
  page.setDefaultTimeout(30000)
  const errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  const button=(name)=>page.getByRole('button',{name,exact:true})
  const owner=(route,args)=>page.evaluate(async({route,args})=>{
    const r=await fetch('/api/labweave/'+route,args?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(args)}:{})
    return {status:r.status,body:await r.json()}
  },{route,args})
  let step='打开项目'
  try {
    await page.goto(url)
    await button('打开助理').waitFor()
    const setup = page.getByRole('dialog', {name: '配置模型 API'})
    if (await setup.isVisible()) await setup.getByRole('button', {name: '稍后配置'}).click()
    await button('沙盒验收').click()
    const tree=page.getByRole('navigation',{name:'沙盒验收 项目功能'})
    await tree.getByRole('button',{name:'聊天',exact:true}).click()
    await page.locator('[contenteditable=true]:visible').last().waitFor()
    let bound=false
    const until=Date.now()+30000
    while(!bound&&Date.now()<until){
      const id=await page.locator('[data-conversation-session]:visible').last().getAttribute('data-conversation-session').catch(()=>null)
      if(id)bound=(await owner('project',{sessionId:id,action:'view'})).body.scope===project
      if(!bound)await page.waitForTimeout(200)
    }
    assert.ok(bound,'项目会话未就绪')
    const catalog=(await owner('catalog')).body
    const workspaceId=catalog.find(r=>r.scope===project).workspaceId
    step='让项目对话发起真实实验'
    await page.locator('[contenteditable=true]:visible').last().fill('需要做一次实验。直接把已存在的 check.py 提交到项目代码沙盒（标题“真实沙盒验收”，时限 20 秒），用实际 stdout 回答校验字。文件位置已确定，可立即试跑。')
    await button('发送消息').click()
    console.log('项目消息已发送，等待真实沙盒工具调用。')
    const sandbox=page.getByRole('region',{name:'沙盒验收 项目代码沙盒'})
    await sandbox.waitFor({timeout:140000})
    console.log('右侧已自动打开该项目的沙盒。')
    const latest=async()=>{const res=await owner('workspace-page',{workspaceId,action:'sandbox/list'});assert.equal(res.status,200);return res.body.runs}
    if(queueOnly){
      await sandbox.getByRole('button',{name:'批准本次试跑并运行'}).waitFor()
      const queue=await latest()
      assert.equal(queue.length,1);assert.ok(queue[0].sourceSession);assert.equal(queue[0].status,'WAITING_APPROVAL')
      console.log('真实模型工具调用已在原会话自动打开项目沙盒，未授权预算的实验留在队列。')
      return
    }
    step='自动打开沙盒并回传真实进程结果'
    await sandbox.locator('pre').filter({hasText:nonce}).first().waitFor({timeout:100000})
    console.log('已读取脚本实际输出。')
    const runs=await latest()
    assert.equal(runs.length,1)
    const job=runs[0]
    const sid=await page.locator('[data-conversation-session]:visible').last().getAttribute('data-conversation-session')
    assert.equal(job.environment,'verification');assert.equal(job.sourceSession,sid);assert.equal(job.exitCode,0)
    assert.equal(job.status,'SUCCEEDED');assert.equal(job.artifacts[0].name,'result.json')
    await sandbox.getByRole('button',{name:'result.json',exact:true}).click()
    await sandbox.getByLabel('产物内容').filter({hasText:nonce}).waitFor()
    const otherWs=catalog.find(r=>r.scope===other).workspaceId
    assert.equal((await owner('workspace-page',{workspaceId:otherWs,action:'sandbox/detail',args:{id:job.id}})).status,404)
    await page.locator('[data-conversation-content] [data-chat-flow]').first().getByText(new RegExp(nonce)).last().waitFor({timeout:70000})
    if(process.env.LABWEAVE_PREVIEW_DIR){
      fs.mkdirSync(process.env.LABWEAVE_PREVIEW_DIR,{recursive:true})
      await page.screenshot({path:path.join(process.env.LABWEAVE_PREVIEW_DIR,'项目代码沙盒-真实试跑.png'),animations:'disabled'})
    }
    console.log('真实模型发起试跑、自动打开右侧沙盒、选定 venv、禁网与只读项目、stdout、退出码、产物及跨项目拒绝通过。')
  } catch(e){
    console.error('验证步骤 '+step)
    console.error((await page.locator('[data-rightbar-col]').innerText({timeout:3000}).catch(()=>'' )).slice(-1100).replace(/(?:sk-|token=)\S+/gi,'[redacted]'))
    if(errors.length)console.error(errors.slice(0,3).map(x=>x.replace(/(?:sk-|token=)\S+/gi,'[redacted]')).join('\n').slice(0,400))
    throw e
  } finally{await browser.close()}
}
main().catch(e=>{console.error(e.message.replace(/(?:sk-|token=)\S+/gi,'[redacted]').slice(0,900));process.exitCode=1})
