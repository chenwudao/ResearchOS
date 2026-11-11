(() => {
  const SVG = 'http://www.w3.org/2000/svg';
  const labels = { ideas: '点子', feed: '动态', goals: '目标', library: '资源库' };
  const sections = Object.keys(labels);
  const views = new Map();
  const observers = new WeakMap();

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function button(label, onClick, className = 'btn sm') {
    const node = element('button', className, label);
    node.type = 'button';
    node.onclick = onClick;
    return node;
  }

  function goalColumns(goals) {
    const remaining = new Map(goals.map(goal => [goal.id, goal]));
    const columns = [];
    while (remaining.size) {
      const ready = [...remaining.values()].filter(goal =>
        !(goal.dependsOn || []).some(id => remaining.has(id)));
      // Imported records can contain cycles. Keep them visible in the final column.
      const column = ready.length ? ready : [...remaining.values()];
      column.sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
      columns.push(column);
      column.forEach(goal => remaining.delete(goal.id));
    }
    return columns;
  }

  function drawDependencies(board, overlay, cards, goals, selected) {
    overlay.replaceChildren();
    overlay.setAttribute('width', board.offsetWidth);
    overlay.setAttribute('height', board.offsetHeight);
    const rect = board.getBoundingClientRect();
    goals.forEach(goal => {
      const targetCard = cards.get(goal.id);
      const target = targetCard.getBoundingClientRect();
      (goal.dependsOn || []).forEach(id => {
        const sourceCard = cards.get(id);
        if (!sourceCard || id === goal.id) return;
        const source = sourceCard.getBoundingClientRect();
        const x1 = source.right - rect.left;
        const y1 = (source.top + source.bottom) / 2 - rect.top;
        const x2 = target.left - rect.left;
        const y2 = (target.top + target.bottom) / 2 - rect.top;
        const bend = (x1 + x2) / 2;
        const group = document.createElementNS(SVG, 'g');
        group.classList.add('map-dependency');
        if (selected) group.classList.add([id, goal.id].includes(selected) ? 'is-related' : 'is-muted');
        const path = document.createElementNS(SVG, 'path');
        const skip = Number(targetCard.dataset.column) - Number(sourceCard.dataset.column) > 1;
        const route = skip
          ? ' H ' + (x1 + 14) + ' V 11 H ' + (x2 - 14) + ' V ' + y2
          : ' H ' + bend + ' V ' + y2;
        path.setAttribute('d', 'M ' + x1 + ' ' + y1 + route + ' H ' + (x2 - 2));
        const arrow = document.createElementNS(SVG, 'path');
        arrow.setAttribute('d', 'M ' + (x2 - 8) + ' ' + (y2 - 4) + ' L ' + (x2 - 2) + ' ' +
          y2 + ' L ' + (x2 - 8) + ' ' + (y2 + 4));
        group.append(path, arrow);
        overlay.appendChild(group);
      });
    });
  }

  function render(root, project, notes, options) {
    const previous = views.get(project.id) || { rail: 'all', selected: null };
    views.set(project.id, previous);
    observers.get(root)?.disconnect();
    observers.delete(root);

    const oldCanvas = root.querySelector('.project-map-canvas');
    const scroll = oldCanvas && oldCanvas.dataset.view === previous.rail && oldCanvas.dataset.project === project.id
      ? [oldCanvas.scrollLeft, oldCanvas.scrollTop] : [0, 0];
    const toolbar = element('div', 'project-map-toolbar');
    const tabs = element('div', 'project-map-tabs');
    tabs.setAttribute('role', 'group');
    tabs.setAttribute('aria-label', '关系图视图');
    const canvas = element('div', 'project-map-canvas');
    canvas.dataset.view = previous.rail;
    canvas.dataset.project = project.id;
    const details = element('section', 'project-map-details');
    details.setAttribute('aria-label', '节点详情');
    details.hidden = true;
    const cards = new Map();
    let updateEdges = () => {};

    function switchView(rail) {
      previous.rail = rail;
      previous.selected = null;
      render(root, project, notes, options);
      root.querySelector('[data-map-view="' + rail + '"]').focus();
    }

    ['all', ...sections].forEach(rail => {
      const tab = button(rail === 'all' ? '概览' : labels[rail], () => switchView(rail));
      tab.dataset.mapView = rail;
      tab.setAttribute('aria-pressed', String(previous.rail === rail));
      tabs.appendChild(tab);
    });
    const controls = element('div', 'project-map-controls');
    toolbar.append(tabs, controls);
    if (previous.rail !== 'all') {
      controls.appendChild(button('打开' + labels[previous.rail], () => options.open(previous.rail)));
    }

    function select(rail, note, focus = false) {
      previous.selected = { rail, id: note.id };
      showSelection();
      if (focus) cards.get(note.id)?.focus();
    }

    function showSelection() {
      const selection = previous.selected;
      const note = selection && notes[selection.rail].find(item => item.id === selection.id);
      cards.forEach((card, id) => card.setAttribute('aria-pressed', String(id === note?.id)));
      details.replaceChildren();
      details.hidden = !note;
      if (note) {
        const rail = selection.rail;
        const heading = element('div', 'map-detail-heading');
        heading.append(element('strong', '', labels[rail]), button('关闭详情', () => {
          previous.selected = null;
          showSelection();
          cards.get(note.id)?.focus();
        }));
        details.append(heading, element('p', 'map-detail-text', note.text));
        if (rail === 'goals') {
          const goals = notes.goals;
          const before = goals.filter(goal => (note.dependsOn || []).includes(goal.id));
          const after = goals.filter(goal => (goal.dependsOn || []).includes(note.id));
          details.appendChild(element('div', 'map-meta', options.status(note) +
            (note.due ? ' · 截止 ' + note.due : '')));
          [['前置目标', before], ['后续目标', after]].forEach(([label, related]) => {
            if (!related.length) return;
            const row = element('div', 'map-related');
            row.appendChild(element('span', 'map-meta', label));
            related.forEach(goal => row.appendChild(button(goal.text, () => {
              if (!cards.has(goal.id)) {
                previous.rail = 'goals';
                previous.selected = { rail, id: goal.id };
                render(root, project, notes, options);
                [...root.querySelectorAll('[data-map-node]')]
                  .find(card => card.dataset.mapNode === goal.id)?.focus();
              } else select(rail, goal, true);
            })));
            details.appendChild(row);
          });
        }
        const actions = element('div', 'map-related');
        actions.appendChild(button('在' + labels[rail] + '中查看', () => options.open(rail, note.id)));
        if (/^(https?:\/\/|\/api\/workspace\/pdf\/)/i.test(note.url || '')) {
          const link = element('a', 'btn sm', note.kind === 'pdf' ? '下载 PDF' : '打开来源');
          link.href = note.url;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          actions.appendChild(link);
        }
        details.appendChild(actions);
      }
      updateEdges();
    }

    function noteCard(rail, note) {
      const card = button('', () => select(rail, note), 'map-note');
      card.dataset.mapNode = note.id;
      card.title = note.text;
      card.appendChild(element('span', 'map-note-title', note.text));
      const meta = rail === 'goals' ? options.status(note) : note.source;
      if (meta) card.appendChild(element('span', 'map-meta', meta));
      cards.set(note.id, card);
      return card;
    }

    if (previous.rail === 'all') {
      const overview = element('div', 'map-overview');
      const hub = element('div', 'map-hub');
      hub.appendChild(element('strong', '', project.name));
      overview.appendChild(hub);
      const branches = element('div', 'map-branches');
      sections.forEach(rail => {
        const lane = element('section', 'map-lane');
        lane.dataset.rail = rail;
        const heading = button(labels[rail] + ' · ' + notes[rail].length, () => switchView(rail), 'map-lane-title');
        heading.setAttribute('aria-label', '查看' + labels[rail] + '，共 ' + notes[rail].length + ' 条');
        lane.appendChild(heading);
        if (!notes[rail].length) lane.appendChild(element('p', 'map-empty', '暂无条目'));
        notes[rail].slice(0, 4).forEach(note => lane.appendChild(noteCard(rail, note)));
        if (notes[rail].length > 4) {
          lane.appendChild(button('查看全部 ' + notes[rail].length + ' 条', () => switchView(rail)));
        }
        branches.appendChild(lane);
      });
      overview.appendChild(branches);
      canvas.appendChild(overview);
    } else if (!notes[previous.rail].length) {
      canvas.appendChild(element('p', 'map-empty', '暂无' + labels[previous.rail]));
    } else if (previous.rail === 'goals') {
      const board = element('div', 'map-goal-board');
      const overlay = document.createElementNS(SVG, 'svg');
      overlay.classList.add('map-goal-edges');
      overlay.setAttribute('aria-hidden', 'true');
      board.appendChild(overlay);
      goalColumns(notes.goals).forEach((column, index) => {
        const stage = element('div', 'map-goal-column');
        stage.dataset.rail = 'goals';
        column.forEach(goal => {
          const card = noteCard('goals', goal);
          card.dataset.column = index;
          stage.appendChild(card);
        });
        board.appendChild(stage);
      });
      canvas.setAttribute('tabindex', '0');
      canvas.setAttribute('aria-label', '目标依赖图，可横向滚动');
      canvas.appendChild(board);
      const legend = element('span', 'map-meta', '箭头从前置目标指向后续目标');
      controls.prepend(legend);
      updateEdges = () => drawDependencies(board, overlay, cards, notes.goals, previous.selected?.id);
      const observer = new ResizeObserver(updateEdges);
      observer.observe(board);
      observers.set(root, observer);
    } else {
      const list = element('div', 'map-items');
      list.dataset.rail = previous.rail;
      notes[previous.rail].forEach(note => list.appendChild(noteCard(previous.rail, note)));
      canvas.appendChild(list);
    }
    root.replaceChildren(toolbar, canvas, details);
    [canvas.scrollLeft, canvas.scrollTop] = scroll;
    showSelection();
  }

  window.renderProjectMap = render;
})();
