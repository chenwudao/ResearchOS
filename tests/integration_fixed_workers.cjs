const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const fixture=JSON.parse(fs.readFileSync(0,'utf8'));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
 const page=await browser.newPage({locale:'zh-CN',reducedMotion:'reduce',viewport:{width:1440,height:950}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(20000);
 await page.goto(fixture.url);
 await page.addStyleTag({content:'*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important}'});
 const setup=page.getByRole('dialog',{name:'配置模型 API',exact:true});
 await setup.waitFor();await page.screenshot({path:'demo/.local/fixed-setup.png',timeout:10000});await setup.getByRole('button',{name:'稍后配置',exact:true}).click({force:true});
 const owner=(route,data)=>page.evaluate(async({route,data})=>{
  const r=await fetch('/api/labweave/'+route,data?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{});
  return {status:r.status,data:await r.json()};
 },{route,data});
 const rows=(await owner('catalog')).data;
 const row=rows.find(r=>r.scope===fixture.project);assert.ok(row);
 assert.equal(row.features.filter(f=>f.fixed).length,5);
 const nav=page.getByRole('navigation',{name:'固定工作组 项目功能',exact:true});
 if(!await nav.isVisible())await page.getByRole('button',{name:'固定工作组',exact:true}).click();
 for(const label of ['目标','笔记','思维导图','点子','工程台']){
   await nav.getByRole('button',{name:label,exact:true}).click();
   await page.getByRole('button',{name:'固定 Worker '+label,exact:true}).waitFor();
   assert.equal(await nav.getByRole('button',{name:'删除功能 '+label,exact:true}).count(),0);
   assert.equal(await nav.getByRole('button',{name:'重命名功能 '+label,exact:true}).count(),0);
 }
 assert.equal(await page.getByRole('button',{name:'在固定工作组创建功能 Bot',exact:true}).count(),0);
 const blocked=await owner('workspace-page',{workspaceId:row.workspaceId,action:'remove_feature_bot',args:{featureId:'ideas'}});
 assert.equal(blocked.status,409);
 await nav.getByText('历史 Bot',{exact:false}).click();
 await nav.getByRole('button',{name:'旧资料追踪',exact:true}).click();
 await page.getByText('历史资料仍然保留',{exact:false}).first().waitFor();
 await nav.getByRole('button',{name:'目标',exact:true}).click();
 await page.screenshot({path:'demo/.local/fixed-workers-desktop.png'});
 await page.evaluate(()=>document.documentElement.style.zoom='125%');
 await nav.getByRole('button',{name:'笔记',exact:true}).click();
 await page.getByRole('button',{name:'固定 Worker 笔记',exact:true}).waitFor();
 await page.screenshot({path:'demo/.local/fixed-workers-zoom.png'});
 await page.evaluate(()=>document.documentElement.style.zoom='');
 await page.setViewportSize({width:900,height:720});
 await page.reload();
 await setup.waitFor();await setup.getByRole('button',{name:'稍后配置',exact:true}).click({force:true});
 if(!await nav.isVisible())await page.getByRole('button',{name:'固定工作组',exact:true}).click();
 await nav.getByRole('button',{name:'笔记',exact:true}).click();
 await page.getByRole('button',{name:'固定 Worker 笔记',exact:true}).waitFor();
 await page.screenshot({path:'demo/.local/fixed-workers-compact.png'});
 const refreshed=(await owner('catalog')).data.find(r=>r.scope===fixture.project);
 assert.deepEqual(refreshed.features.filter(f=>f.fixed).map(f=>f.id),row.features.filter(f=>f.fixed).map(f=>f.id));
 assert.deepEqual(errors,[]);
 console.log('Five persistent Worker views, history, deletion guard, reload and 125%/compact layout passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
