// Mounted in the existing native right-side tab, using its authenticated project API.
const labels = { WAITING_APPROVAL:'等待试跑额度', QUEUED:'排队中', BLOCKED:'执行环境未就绪', RUNNING:'运行中', SUCCEEDED:'已完成', FAILED:'失败',
  CANCELLED:'已取消', INTERRUPTED:'已中断', DRAFT:'待审批', APPROVED:'已批准', PAUSED:'已暂停', REVIEW:'待核查结果', PENDING:'排队中' }

export function createPanel(React, project, openSource) {
  const h=React.createElement
  return function SandboxPanel({row, notice}) {
    const ws=row.workspaceId
    const [data,setData]=React.useState(null), [envs,setEnvs]=React.useState([])
    const [selected,select]=React.useState(notice ? {id:notice.id,kind:notice.kind} : null)
    const [detail,setDetail]=React.useState(null), [file,setFile]=React.useState(null)
    const [cellId,setCell]=React.useState(''), [cellLog,setCellLog]=React.useState('')
    const [error,setError]=React.useState(''), [envError,setEnvError]=React.useState('')
    const [busy,setBusy]=React.useState(false), [fresh,setFresh]=React.useState(0)
    const [budget,setBudget]=React.useState(120),[newEnv,setNewEnv]=React.useState('')
    const api=(action,args={},signal)=>project(ws,action,args,signal)
    React.useEffect(()=>{if(notice){select({id:notice.id,kind:notice.kind});setFile(null)}},[notice?.eventId])
    React.useEffect(()=>{
      const ctrl=new AbortController()
      api('sandbox/environments',{},ctrl.signal).then(value=>{if(!ctrl.signal.aborted){setEnvs(value);setEnvError('')}})
        .catch(e=>{if(!ctrl.signal.aborted)setEnvError(e.message)})
      return ()=>ctrl.abort()
    },[ws,fresh])
    React.useEffect(()=>{
      const ctrl=new AbortController()
      let timer
      async function refresh(){
        try{
          const next=await api('sandbox/list',{},ctrl.signal)
          const choice=selected || (next.runs[0] ? {id:next.runs[0].id,kind:'trial'} :
            next.workflows[0] && {id:next.workflows[0].id,kind:'workflow'})
          if(ctrl.signal.aborted)return
          setData(next)
          if(!selected && choice){select(choice);return}
          if(choice){
            const info=await api(choice.kind==='trial'?'sandbox/detail':'sandbox/flow',{id:choice.id},ctrl.signal)
            if(ctrl.signal.aborted)return
            setDetail(info)
            if(choice.kind==='workflow'){
              const cell=info.runs.find(r=>r.id===cellId) || info.runs.find(r=>r.status==='RUNNING') || info.runs.find(r=>r.attempts.length)
              if(cell?.attempts?.length){
                const args={id:info.id,runId:cell.id,attempt:cell.attempts.length-1}
                const logs=await Promise.all(['stdout.log','stderr.log'].map(file=>api('research/log',{...args,file},ctrl.signal)))
                if(!ctrl.signal.aborted)setCellLog(logs.map((value,i)=>(i?'stderr':'stdout')+'\n'+value.text).join('\n'))
              }else if(!ctrl.signal.aborted)setCellLog('')
            }
          }
        }catch(e){if(!ctrl.signal.aborted)setError(e.message)}
        finally{if(!ctrl.signal.aborted)timer=setTimeout(refresh,1850)}
      }
      refresh()
      return ()=>{ctrl.abort();clearTimeout(timer)}
    },[ws,selected?.id,selected?.kind,cellId,fresh])
    async function act(fn){
      if(busy)return
      setBusy(true);setError('')
      try{await fn();setFresh(n=>n+1)}catch(e){setError(e.message)}finally{setBusy(false)}
    }
    const button=(label,fn,disabled=false,variant='secondary')=>h('button',{type:'button',className:'lw-btn lw-btn-xs lw-btn-'+variant,disabled:disabled||busy,onClick:()=>act(fn)},label)
    function choose(item,kind){select({id:item.id,kind});setDetail(null);setFile(null);setCell('');setCellLog('');setError('')}
    const status=s=>labels[s]||s
    const tone=s=>s==='SUCCEEDED'||s==='APPROVED'?'ok':s==='RUNNING'||s==='WAITING_APPROVAL'?'active':['FAILED','BLOCKED'].includes(s)?'err':'muted'
    function entries(items,kind){
      return items.map(item=>h('button',{key:item.id,type:'button',className:'lw-sandbox-entry',
        'aria-pressed':selected?.id===item.id,onClick:()=>choose(item,kind)},
        h('span',{className:'lw-sandbox-entry-name'},
          h('span',{className:'lw-sandbox-dot','data-tone':tone(item.status),'aria-hidden':true}),
          h('span',null,item.title)),
        h('span',{className:'lw-sandbox-tag','data-tone':tone(item.status)},status(item.status))))
    }
    const info=detail?.id===selected?.id?detail:null
    const trial=selected?.kind==='trial'
    const succeededCount=info && !trial ? info.runs.filter(r=>r.status==='SUCCEEDED').length : 0
    const runPct=info && !trial && info.runs.length ? Math.round((succeededCount/info.runs.length)*100) : 0
    return h('section',{className:'lw-rpane lw-sandbox','aria-label':row.name+' 项目代码沙盒'},
      h('style',null,`
        .lw-sandbox .lw-sandbox-entry{display:flex;width:100%;justify-content:space-between;align-items:center;gap:8px;text-align:start;background:transparent;color:inherit;border:0;border-radius:9px;padding:7px 8px;cursor:pointer;transition:background-color .12s ease}
        .lw-sandbox .lw-sandbox-entry:hover{background:var(--dsw-alias-interactive-bg-hover)}
        .lw-sandbox .lw-sandbox-entry[aria-pressed=true]{background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-interactive-bg-hover));font-weight:500}
        .lw-sandbox .lw-sandbox-entry-name{display:inline-flex;align-items:center;gap:8px;min-width:0}
        .lw-sandbox .lw-sandbox-entry-name>span:last-child{min-width:0;overflow-wrap:anywhere}
        .lw-sandbox-dot{width:7px;height:7px;border-radius:999px;flex:none;background:var(--dsw-alias-label-tertiary,#94a3b8)}
        .lw-sandbox-dot[data-tone=ok]{background:var(--dsw-alias-state-success-primary,#16a34a)}
        .lw-sandbox-dot[data-tone=active]{background:var(--dsw-alias-state-business-primary,#3b82f6)}
        .lw-sandbox-dot[data-tone=err]{background:var(--dsw-alias-state-error-primary,#dc2626)}
        .lw-sandbox-tag{flex:none;font-size:11px;padding:1px 7px;border-radius:999px;background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}
        .lw-sandbox-tag[data-tone=ok]{background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#16a34a) 11%,transparent);color:var(--dsw-alias-state-success-primary,#16a34a)}
        .lw-sandbox-tag[data-tone=err]{background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#dc2626) 11%,transparent);color:var(--dsw-alias-state-error-primary,#dc2626)}
        .lw-sandbox-meter{height:5px;border-radius:999px;background:var(--dsw-alias-border-l1,rgba(128,128,128,.14));overflow:hidden}
        .lw-sandbox-meter>span{display:block;height:100%;border-radius:999px;background:var(--dsw-alias-state-success-primary,#16a34a);transition:width .2s ease}
        .lw-sandbox .lw-input{min-height:34px;padding:5px 10px;border-radius:10px;border:.5px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-layer-1,var(--dsw-alias-bg-base));color:inherit;font:inherit;max-width:100%;min-width:0}
        .lw-sandbox pre{max-height:210px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;margin:4px 0 0;padding:8px 10px;border-radius:8px;background:var(--dsw-alias-bg-layer-1)}
        .lw-sandbox details{margin-top:4px}
        .lw-sandbox summary{cursor:pointer;font-size:var(--lw-ui-sm);color:var(--dsw-alias-label-secondary)}
        .lw-sandbox label{display:grid;gap:5px;font-size:var(--lw-ui-xs);color:var(--dsw-alias-label-secondary)}
        .lw-sandbox .lw-actions{margin-top:6px}
      `),
      h('div',{className:'lw-rpane-card'},
        h('h3',null,row.name+' · 项目代码沙盒',data&&h('span',{className:'lw-sandbox-tag'},data.seconds+'s')),
        h('label',null,'下次试跑环境',h('select',{className:'lw-input','aria-label':'下次试跑环境',value:data?.environment||'default',
          disabled:busy||!data,onChange:e=>{const environment=e.target.value;act(()=>api('sandbox/configure',{environment}))}},
          (envs.length?envs:[{id:data?.environment||'default'}]).map(o=>h('option',{key:o.id,value:o.id},
            (o.label||o.id)+(o.pending?'（首次运行创建）':o.pythonVersion?' · Python '+o.pythonVersion:''))))),
        envError&&h('p',{role:'alert'},envError),
        h('details',null,h('summary',null,'管理环境与试跑预算'),
          envs.find(e=>e.id===data?.environment)?.path&&h('pre',null,envs.find(e=>e.id===data.environment).path),
          h('div',{className:'lw-actions'},h('input',{className:'lw-input',style:{flex:'1 1 120px'},placeholder:'新环境名称','aria-label':'新环境名称',value:newEnv,maxLength:40,onChange:e=>setNewEnv(e.target.value)}),
            button('创建环境',async()=>{await api('sandbox/create-env',{name:newEnv.trim()});await api('sandbox/configure',{environment:newEnv.trim()});setNewEnv('')},!newEnv.trim())),
          h('div',{className:'lw-actions'},
            h('label',{style:{flex:'1 1 100px'}},'增加试跑秒数',h('input',{className:'lw-input',type:'number',min:1,max:3600,value:budget,onChange:e=>setBudget(e.target.value)})),
            button('授权项目试跑',()=>api('sandbox/configure',{grantSeconds:Number(budget),requestId:crypto.randomUUID()}),!Number.isInteger(Number(budget))||budget<1||budget>3600,'primary'))),
        data&&h('p',{className:'lw-hint',style:{margin:0}},'可用试跑预算 '+data.seconds+' 秒 · 项目只读 · 禁网')),
      error&&h('p',{role:'alert'},error),
      h('div',{className:'lw-rpane-card'},h('h3',null,'对话试跑',data&&h('span',{className:'lw-seg-count'},data.runs.length)),data?entries(data.runs,'trial'):h('p',{role:'status'},'读取进程…'),
        data&&!data.runs.length&&h('p',{className:'lw-hint',style:{margin:0}},'暂无试跑记录')),
      data?.workflows.length>0&&h('div',{className:'lw-rpane-card'},h('h3',null,'正式实验',h('span',{className:'lw-seg-count'},data.workflows.length)),entries(data.workflows,'workflow')),
      info&&h('div',{className:'lw-rpane-card'},h('h3',null,trial?info.title:info.plan.question),
        h('p',{className:'lw-hint',style:{margin:0}},status(info.status)+' · '+(trial?info.environment:info.plan.environmentId||'旧版环境')+(trial?' · '+info.sourceBot:'')),
        trial?h(React.Fragment,null,
          h('p',{style:{margin:0}},info.script||'对话生成的 Python',' · 时限 '+info.timeoutSeconds+' 秒',info.exitCode!=null?' · 退出码 '+info.exitCode:''),
          h('div',{className:'lw-actions'},
            info.sourceSession&&button('发起对话',()=>openSource(row,info.sourceSession)),
            info.status==='WAITING_APPROVAL'&&button('批准本次试跑并运行',()=>api('sandbox/approve-trial',{id:info.id}),false,'primary'),
            ['WAITING_APPROVAL','QUEUED','RUNNING'].includes(info.status)&&button('停止试跑',()=>api('sandbox/cancel',{id:info.id})),
            ['BLOCKED','FAILED','INTERRUPTED','CANCELLED'].includes(info.status)&&button('用当前环境重试',async()=>{
              const next=await api('sandbox/retry',{id:info.id,environment:data.environment,requestId:crypto.randomUUID()});choose(next,'trial')})),
          h('details',null,h('summary',null,'代码与参数'),h('pre',null,(info.code||info.script)+'\n'+JSON.stringify(info.args))),
          h('strong',null,'stdout'),h('pre',null,info.stdout||'暂无输出'),
          (info.stderr||info.error)&&h(React.Fragment,null,h('strong',null,'stderr'),h('pre',null,info.stderr||info.error)),
          info.artifacts?.length>0&&h('div',null,h('strong',null,'运行产物'),h('div',{className:'lw-actions'},info.artifacts.map(f=>
            button(f.name,async()=>setFile(await api('sandbox/artifact',{id:info.id,name:f.name})))))),
          file&&h('pre',{'aria-label':'产物内容'},file.text))
        :h(React.Fragment,null,
          h('div',{style:{display:'grid',gap:4}},
            h('div',{style:{display:'flex',justifyContent:'space-between',fontSize:'var(--lw-ui-xs)',color:'var(--dsw-alias-label-secondary)'}},
              h('span',null,'实验进度'),h('span',{className:'lw-mono'},succeededCount+' / '+info.runs.length)),
            h('div',{className:'lw-sandbox-meter','aria-hidden':true},h('span',{style:{width:runPct+'%'}}))),
          h('details',null,h('summary',null,'实验协议与预算'),h('pre',null,JSON.stringify(info.plan,null,2))),
          info.error&&h('p',{role:'alert'},info.error),
          info.reportPath&&h('div',{className:'lw-actions'},['report.md','analysis.json','runs.csv'].map(name=>
            h('span',{key:name},button(name,async()=>setFile(await api('read',{id:'wf_'+info.id+'_'+name.replace('.','_')})))))),
          file&&h('pre',{'aria-label':'实验报告内容'},file.text),
          h('div',{className:'lw-actions'},
            info.status==='DRAFT'&&button('批准计划并运行',()=>api('sandbox/approve-run',{id:info.id,revision:info.revision}),false,'primary'),
            info.status!=='DRAFT'&&!info.plan.environmentId&&button('用当前环境建立修订',async()=>{
              const next=await api('sandbox/revise',{id:info.id,environment:data.environment});choose(next,'workflow')} ),
            info.plan.environmentId&&['APPROVED','PAUSED','FAILED'].includes(info.status)&&button('运行已批准的实验',()=>api('research/run',{id:info.id}),false,'primary'),
            info.status==='RUNNING'&&button('暂停实验',()=>api('research/pause',{id:info.id}))),
          info.runs.some(c=>c.attempts.length)&&h('label',null,'单元日志',h('select',{className:'lw-input',value:cellId,onChange:e=>setCell(e.target.value)},
            h('option',{value:''},'跟随当前单元'),info.runs.filter(c=>c.attempts.length).map(c=>h('option',{key:c.id,value:c.id},c.method+' · '+c.seed+' · '+status(c.status))))),
          cellLog&&h('pre',null,cellLog))))
  }
}
