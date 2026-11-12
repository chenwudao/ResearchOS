(() => {
  const names = {WAITING_APPROVAL:'待确认',QUEUED:'排队中',RUNNING:'执行中',SUCCEEDED:'已完成',FAILED:'失败',CANCELLED:'已取消'};
  let records = [];
  let options;
  let busy = false;
  const terminal = new Set(['SUCCEEDED', 'FAILED', 'CANCELLED']);
  function button(label, action) {
    const node = document.createElement('button');
    node.type = 'button'; node.className = 'btn sm'; node.textContent = label;
    node.onclick = async () => {
      node.disabled = true;
      try { await action(); } catch (error) { options.error(error.message); }
      finally { node.disabled = false; }
    };
    return node;
  }
  async function refresh() {
    if (!options || busy) return;
    busy = true;
    try {
      const next = await options.api('tasks');
      if (JSON.stringify(next) !== JSON.stringify(records)) {
        records = next;
        render();
        options.changed();
      }
    } catch (_) { /* Preserve prior results when the local server is unavailable. */ }
    finally { busy = false; }
  }
  function render() {
    if (!options) return;
    const root = document.getElementById('task-list');
    const project = options.project();
    const visible = records.filter(task => !project || task.projectId === project.id);
    const prior=new Map([...root.querySelectorAll('[data-task-id]')].map(card=>[card.dataset.taskId,{
      expanded:card.querySelector('details')?.open,
      answers:Object.fromEntries([...card.querySelectorAll('textarea[data-question-id]')].map(input=>[input.dataset.questionId,input.value])),
    }]));
    root.replaceChildren();
    if (!visible.length) {
      root.textContent = '任务的执行进度和结果会显示在这里。';
      return;
    }
    visible.forEach(task => {
      const card = document.createElement('article');
      card.className = 'note';
      card.dataset.taskId = task.id;
      const heading = document.createElement('strong');
      heading.textContent = names[task.status] + ' · ' + task.prompt;
      card.appendChild(heading);
      if (task.result || task.error) {
        const body = document.createElement('p');
        body.className = 'n-body';
        body.textContent = task.error || task.result;
        card.appendChild(body);
      }
      if (task.status === 'WAITING_APPROVAL' && task.pending) {
        const detail = document.createElement('pre');
        detail.style.cssText = 'white-space:pre-wrap;word-break:break-word';
        detail.textContent = JSON.stringify(task.pending.detail || task.pending.questions, null, 2);
        card.appendChild(detail);
        if (task.pending.kind === 'approval') {
          ['允许本次操作', '拒绝本次操作'].forEach((label, index) => card.appendChild(button(label, async () => {
            await options.api('tasks/respond', {id:task.id, answer:{outcome:index ? 'rejected' : 'allowed-once'}});
            await refresh();
          })));
        } else {
          const inputs=task.pending.questions.map(question => {
            const label=document.createElement('label');
            label.textContent=question.question;
            const input=document.createElement('textarea');
            input.dataset.questionId=question.id;
            input.placeholder='请输入答复';
            input.setAttribute('aria-label',question.question);
            input.value=prior.get(task.id)?.answers?.[question.id] || '';
            input.style.cssText='display:block;width:100%;box-sizing:border-box;margin:8px 0';
            label.appendChild(input);
            const choices=document.createElement('div');
            (question.options || []).forEach(option => {
              const text=typeof option==='string'?option:option.label;
              if(text)choices.appendChild(button(text,()=>{input.value=text;}));
            });
            card.append(label,choices);
            return {question,input};
          });
          card.appendChild(button('提交答复', async () => {
            if(inputs.some(({input})=>!input.value.trim()))throw Error('请回答每一个问题。');
            const answers=inputs.map(({question,input})=>({id:question.id,selected:[],custom:input.value}));
            await options.api('tasks/respond', {id:task.id, answer:{answers}});
            await refresh();
          }));
        }
      } else if (task.status === 'WAITING_APPROVAL') {
        const hint = document.createElement('p');
        hint.textContent = '确认后 DSH 将调用模型和本机工具执行此任务。';
        card.append(hint, button('确认执行', async () => {
          await options.api('tasks/approve', {id:task.id}); await refresh();
        }));
      }
      if (!terminal.has(task.status)) {
        card.appendChild(button(task.status === 'WAITING_APPROVAL' ? '拒绝' : '取消任务', async () => {
          await options.api('tasks/cancel', {id:task.id}); await refresh();
        }));
      } else {
        card.appendChild(button('继续此任务', async () => {
          const prompt = window.prompt('继续任务的要求', '继续上次任务，先核对已经完成的工作。');
          if (prompt?.trim()) await create(task.projectId, prompt.trim(), {resume:task.id});
        }));
      }
      if (task.result) card.appendChild(button('保存到资源库', () => options.saveResult(task)));
      const log = document.createElement('details');
      log.open = !!prior.get(task.id)?.expanded;
      const summary = document.createElement('summary');
      summary.textContent = '执行事件 · ' + task.events.length;
      const text = document.createElement('pre');
      text.style.cssText = 'max-height:220px;overflow:auto;white-space:pre-wrap;word-break:break-word';
      text.textContent = task.events.slice(-12).map(event => JSON.stringify(event, null, 2)).join('\n');
      log.append(summary, text);
      card.appendChild(log);
      root.appendChild(card);
    });
  }
  async function create(projectId, prompt, extra = {}) {
    await options.save();
    await options.api('tasks/create', {projectId, prompt, ...extra});
    await refresh();
    document.getElementById('task-section').open = true;
    document.getElementById('task-section').scrollIntoView({block:'nearest'});
  }
  window.researchTasks = {
    init(config) { options = config; refresh(); setInterval(refresh, 1500); },
    render, create,
    isBusy(projectId, threadId) { return records.some(task => task.projectId === projectId && task.threadId === threadId && !terminal.has(task.status)); },
    results(projectId) {
      return records.filter(task => task.projectId === projectId && task.status === 'SUCCEEDED').map(task => ({
        id:'task_' + task.id, taskId:task.id, source:'DSH 执行结果', ts:task.updated,
        text:task.prompt + '\n\n' + task.result,
      }));
    },
  };
})();
