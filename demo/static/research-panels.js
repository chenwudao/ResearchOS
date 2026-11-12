(() => {
  const labels = {completeness:'完整性',correctness:'正确性',evidence:'证据质量',reproducibility:'可复现性'};
  let api;
  function node(tag, text) { const n=document.createElement(tag); if(text) n.textContent=text; return n; }
  function button(text, action) {
    const n=node('button',text); n.type='button'; n.className='btn sm';
    n.onclick=async()=>{n.disabled=true;try{await action();}catch(e){alert(e.message);}finally{n.disabled=false;}};
    return n;
  }
  async function call(project,tool,args={}) {return api('project/tool',{projectId:project.id,tool,args});}
  async function open(project,kind) {
    const dialog=document.getElementById('resource-dialog'),root=document.getElementById('resource-content');
    if(!dialog.open)dialog.showModal();
    root.textContent='正在读取…';
    const rows=await call(project,kind+'_list');
    root.replaceChildren(node('h3',kind==='experiment'?'实验跟踪':'科研任务质量评估'));
    const tasks=(await api('tasks')).filter(t=>t.projectId===project.id && t.status==='SUCCEEDED');
    root.append(button(kind==='experiment'?'记录实验':'新增评估',()=>editor(project,kind,{},tasks)));
    if(kind==='benchmark') {
      root.append(node('p','按完整性、正确性、证据质量、可复现性各 0–5 分记录评分依据。DSH 评分标明评估来源，可人工复核。'));
      const select=node('select');select.setAttribute('aria-label','待评估任务');
      tasks.forEach(t=>{const o=node('option',t.prompt.slice(0,80));o.value=t.id;select.append(o);});
      root.append(select,button('让 DSH 评估',async()=>{
        if(!select.value)throw Error('请先完成一个项目任务。');
        await window.researchTasks.create(project.id,'评估任务 '+select.value+'。先调用 task_get 阅读任务原始要求、结果和事件，并检查资源产物和实验记录。按 completeness、correctness、evidence、reproducibility 各 0–5 分评分，无法核实的内容不能视为正确。调用 benchmark_record 保存 scores、包含具体证据及局限的 rationale，evaluator 填 DSH。');
        dialog.close();
      }));
    }
    if(!rows.length)root.append(node('p','尚无记录。'));
    if(kind==='experiment' && rows.length) {
      const metrics=[...new Set(rows.flatMap(r=>Object.keys(r.metrics)))];
      const table=node('table'); table.style.cssText='width:100%;border-collapse:collapse;margin:16px 0;text-align:left';
      const head=node('tr');['实验','状态',...metrics].forEach(v=>head.append(node('th',v)));table.append(head);
      rows.forEach(r=>{const tr=node('tr');[r.name,r.status,...metrics.map(k=>JSON.stringify(r.metrics[k])??'—')].forEach(v=>tr.append(node('td',v)));table.append(tr);});
      const scroll=node('div');scroll.style.overflowX='auto';scroll.append(table);root.append(scroll);
    }
    rows.forEach(r=>{
      const card=node('article');card.className='note';
      card.append(node('strong',kind==='experiment'?r.name:('总分 '+r.score+' / 100 · '+r.evaluator)));
      const pre=node('pre');pre.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere';
      pre.textContent=kind==='experiment'?
        '参数：'+JSON.stringify(r.parameters,null,2)+'\n指标：'+JSON.stringify(r.metrics,null,2)+'\n日志：'+r.logs:
        Object.entries(r.scores).map(([k,v])=>labels[k]+' '+v+'/5').join(' · ')+'\n'+r.rationale;
      card.append(pre,node('small',r.updated),button('编辑',()=>editor(project,kind,r,tasks)),button('删除',async()=>{
        if(confirm('删除这条记录？')){await call(project,kind+'_delete',{id:r.id});await open(project,kind);}
      }));
      root.append(card);
    });
  }
  function editor(project,kind,row,tasks) {
    const root=document.getElementById('resource-content');root.replaceChildren(node('h3',kind==='experiment'?'实验记录':'任务评估'));
    const form=node('form'),fields={};
    function field(key,label,value,area=false) {
      const wrap=node('label',label);wrap.style.cssText='display:block;margin:12px 0';
      const input=node(area?'textarea':'input');input.value=value??'';input.setAttribute('aria-label',label);input.style.cssText='display:block;width:100%;box-sizing:border-box;padding:8px';
      if(area)input.rows=5;wrap.append(input);form.append(wrap);fields[key]=input;return input;
    }
    if(kind==='experiment'){
      field('name','实验名称',row.name).required=true;
      field('parameters','参数（JSON）',JSON.stringify(row.parameters||{},null,2),true);
      field('metrics','指标（JSON）',JSON.stringify(row.metrics||{},null,2),true);
      const status=field('status','状态：planned / running / completed / failed',row.status||'planned');
      status.required=true;field('logs','实验日志',row.logs||'',true);
    }else{
      Object.entries(labels).forEach(([key,label])=>{const input=field(key,label+'（0–5）',row.scores?.[key]??'');input.type='number';input.min=0;input.max=5;input.step='.5';input.required=true;});
      field('rationale','评分依据与局限',row.rationale||'',true).required=true;
    }
    const select=node('select');select.setAttribute('aria-label','关联任务');
    if(kind==='experiment')select.append(node('option','不关联任务')),select.firstChild.value='';
    tasks.forEach(t=>{const o=node('option',t.prompt.slice(0,80));o.value=t.id;select.append(o);});
    if(row.taskId)select.value=row.taskId;form.append(node('label','关联任务 '),select);
    const save=node('button','保存记录');save.type='submit';save.className='btn sm';form.append(save,button('返回',()=>open(project,kind)));
    form.onsubmit=async event=>{
      event.preventDefault();save.disabled=true;
      try{
        const args={...(row.id?{id:row.id}:{}),taskId:select.value};
        if(kind==='experiment')Object.assign(args,{name:fields.name.value,parameters:JSON.parse(fields.parameters.value),metrics:JSON.parse(fields.metrics.value),status:fields.status.value,logs:fields.logs.value});
        else Object.assign(args,{scores:Object.fromEntries(Object.keys(labels).map(k=>[k,Number(fields[k].value)])),rationale:fields.rationale.value,evaluator:'用户'});
        await call(project,kind+'_record',args);await open(project,kind);
      }catch(e){alert(e.message);}finally{save.disabled=false;}
    };
    root.append(form);
  }
  function graph(root,result) {
    const refs=result.references.slice(0,24),ns='http://www.w3.org/2000/svg';
    const height=130+Math.ceil(refs.length/3)*85;
    const svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 780 '+height);svg.setAttribute('role','img');svg.setAttribute('aria-label','论文引用关系图');
    function shape(name,attrs,text){const e=document.createElementNS(ns,name);Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,v));if(text)e.textContent=text;svg.append(e);return e;}
    refs.forEach((r,i)=>{const x=130+(i%3)*260,y=160+Math.floor(i/3)*85;shape('path',{d:'M390 64 Q390 '+(y-40)+' '+x+' '+(y-25),fill:'none',stroke:'#b6c2dd','stroke-width':1.2});});
    function box(x,y,text,url) {
      const rect=shape('rect',{x:x-118,y:y-24,width:236,height:48,rx:9,fill:'#edf2ff',stroke:'#93a8df'});
      const title=document.createElementNS(ns,'title');title.textContent=text;rect.append(title);
      shape('text',{x,y:y+4,'text-anchor':'middle',fill:'#263650','font-size':12},text.length>29?text.slice(0,28)+'…':text);
      if(url){rect.style.cursor='pointer';rect.onclick=()=>window.open(url,'_blank','noopener');}
    }
    box(390,40,result.doi,'https://doi.org/'+encodeURIComponent(result.doi));
    refs.forEach((r,i)=>box(130+(i%3)*260,160+Math.floor(i/3)*85,r['article-title']||r.DOI||r.unstructured||r.key,r.DOI?'https://doi.org/'+encodeURIComponent(r.DOI):null));
    root.append(svg);
    if(result.references.length>24)root.append(node('p','图中显示前 24 条，完整引用见下方列表。'));
  }
  window.researchPanels={init(options){api=options.api;},open,graph};
})();
