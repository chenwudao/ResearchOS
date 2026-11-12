const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL || 'msedge',headless:true});
 try {
  const page=await browser.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:'+process.argv[2]);
  await page.locator('#workspace-status').getByText('已保存到本机').waitFor();
  await page.locator('#btn-new-project').click();
  await page.locator('#modal-input').fill('运行测试');
  await page.locator('#modal-ok').click();
  await page.locator('#btn-open-chat').click();
  await page.locator('#composer-input').fill('Reply TASK_OK only.');
  await page.locator('#btn-task').click();
  await page.getByRole('button',{name:'确认执行',exact:true}).click();
  await page.locator('#task-list .n-body').filter({hasText:'TASK_OK'}).waitFor();
  await page.getByRole('button',{name:'保存到资源库',exact:true}).click();
  await page.locator('#nav-library').click();
  await page.locator('#note-list').getByText('DSH 执行结果',{exact:true}).waitFor();
  await page.locator('#nav-ideas').click();
  await page.locator('#note-input').fill('测试想法');
  await page.locator('#btn-add-note').click();
  await page.getByRole('button',{name:'转为目标',exact:true}).click();
  await page.locator('#nav-goals').click();
  await page.locator('#note-list').getByText('测试想法',{exact:true}).waitFor();
  await page.locator('#workspace-status').getByText('已保存到本机').waitFor();
  await page.reload();
  await page.locator('#task-section > summary').click();
  await page.locator('#task-list .n-body').filter({hasText:'TASK_OK'}).waitFor();

 await page.locator('#nav-library').click();
 await page.getByRole('button',{name:'实验跟踪',exact:true}).click();
 await page.getByRole('button',{name:'记录实验',exact:true}).click();
 await page.getByLabel('实验名称',{exact:true}).fill('Browser experiment');
 await page.getByLabel('参数（JSON）').fill('{"rank":8}');
 await page.getByLabel('指标（JSON）').fill('{"parameters":8192}');
 await page.getByLabel('实验日志').fill('Recorded from browser');
 await page.getByRole('button',{name:'保存记录',exact:true}).click();
 await page.getByRole('table').getByText('8192',{exact:true}).waitFor();
 await page.screenshot({path:'demo/.local/ui-experiments.png',fullPage:true});
 await page.locator('#resource-close').click();
 await page.getByRole('button',{name:'任务质量评估',exact:true}).click();
 await page.getByRole('button',{name:'新增评估',exact:true}).click();
 for(const label of ['完整性','正确性','证据质量','可复现性']) await page.getByLabel(label+'（0–5）',{exact:true}).fill('4');
 await page.getByLabel('评分依据与局限').fill('The task returned TASK_OK as requested. No scientific claim evaluated.');
 await page.getByRole('button',{name:'保存记录',exact:true}).click();
 await page.getByText('总分 80 / 100 · 用户',{exact:true}).waitFor();
 await page.screenshot({path:'demo/.local/ui-benchmark.png',fullPage:true});
 await page.locator('#resource-close').click();
 await page.getByLabel('上传本地资源',{exact:true}).setInputFiles({name:'fixture.txt',mimeType:'text/plain',buffer:Buffer.from('RESOURCE_BROWSER_TEST')});
 await page.locator('#note-list').getByText('fixture.txt',{exact:true}).waitFor();
 const resource=page.locator('#note-list .note').filter({hasText:'fixture.txt'});
 await resource.getByRole('button',{name:'阅读资源',exact:true}).click();
 await page.locator('#resource-content').getByText('RESOURCE_BROWSER_TEST',{exact:true}).waitFor();
 await page.locator('#resource-close').click();
 await page.locator('#nav-space').click();
 await page.locator('#btn-open-chat').click();
 await page.locator('#composer-input').fill('Reply CHAT_NATIVE_OK only.');
 await page.locator('#btn-send').click();
 await page.locator('#task-list .n-body').filter({hasText:'CHAT_NATIVE_OK'}).waitFor({timeout:90000});
 await page.reload();
 await page.locator('#task-section > summary').click();
 await page.locator('#task-list .n-body').filter({hasText:'CHAT_NATIVE_OK'}).waitFor();
 await page.locator('#nav-ideas').click();
 await page.locator('#workspace-status').getByText('已保存到本机').waitFor();
 let injected=false;
 await page.route('**/api/workspace/state',async route=>{
   if(route.request().method()==='POST' && !injected){
     injected=true;
     const current=await (await page.request.get('http://127.0.0.1:'+process.argv[2]+'/api/workspace/state')).json();
     const response=await page.request.post('http://127.0.0.1:'+process.argv[2]+'/api/workspace/project/tool',{
       data:{projectId:current.state.projects[0].id,tool:'idea_create',args:{text:'Concurrent remote idea'}}});
     assert.equal(response.status(),200);
   }
   await route.continue();
 });
 await page.locator('#note-input').fill('Concurrent local idea');
 await page.locator('#btn-add-note').click();
 await page.locator('#workspace-status').getByText('已保存到本机').waitFor();
 await page.locator('#note-list').getByText('Concurrent remote idea',{exact:true}).waitFor();
 await page.locator('#note-list').getByText('Concurrent local idea',{exact:true}).waitFor();
 assert.equal(injected,true);
 await page.unroute('**/api/workspace/state');
 await page.screenshot({path:'demo/.local/ui-final.png',fullPage:true});
 assert.deepEqual(errors,[]);

  console.log('Real browser task flow and reload passed');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
