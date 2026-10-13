// Ctrl+K command palette: commands, open tabs, store apps, bookmarks, history, web search.
(() => {
  const $ = (s) => document.querySelector(s);
  const S = window.OBUI; const OB = window.ob;
  const pal = $('#palette'), input = $('#pal-q'), list = $('#pal-list');
  let items = [], idx = 0;

  const commands = () => [
    { n: 'New tab', k: 'Ctrl+T', go: () => S.newTab(), ic: '+' },
    { n: 'Close tab', k: 'Ctrl+W', go: () => S.close(S.active()), ic: '×' },
    { n: 'Toggle Omarchy Store panel', k: 'Ctrl+B', go: () => S.storeToggle(), ic: '🛍' },
    { n: 'Split view', k: 'Ctrl+\\', go: () => S.toggleSplit(), ic: '▯▯' },
    { n: 'Reader view', k: 'Ctrl+Shift+R', go: () => S.toggleReader(), ic: '☰' },
    { n: 'Find in page', k: 'Ctrl+F', go: () => S.findOpen(), ic: '🔍' },
    { n: 'New workspace', k: 'Ctrl+Shift+W', go: () => S.addWorkspace(), ic: '◉' },
    ...S.workspaces().map((w) => ({ n: 'Switch to workspace: ' + w.name, go: () => S.switchWs(w.id), ic: '◉' })),
    { n: (S.db().settings.shield ? 'Turn shield off' : 'Turn shield on') + ' (tracker & ad blocking)', go: () => S.shieldToggle(), ic: '🛡' },
    { n: 'Search engine: DuckDuckGo', go: () => setSearch('duckduckgo'), ic: '🔎' },
    { n: 'Search engine: Google', go: () => setSearch('google'), ic: '🔎' },
    { n: 'Search engine: Brave', go: () => setSearch('brave'), ic: '🔎' },
    { n: 'Set Omarchy Browser as default browser', go: () => { OB.setDefault(); S.toast('Omarchy Browser is now your default browser'); }, ic: '★' },
    { n: 'Clear browsing history', go: () => { OB.historyClear(); S.db().history = []; S.toast('History cleared'); }, ic: '🧹' },
    { n: 'Install local AI (Ollama) for page summaries', go: () => { OB.aiInstall(); S.toast('Installing Ollama in a terminal…'); }, ic: '✦' },
    { n: 'Open omarchystore.com', go: () => S.open('https://omarchystore.com/', true), ic: '🛍' },
    { n: 'Developer tools', k: 'F12', go: () => S.active().view.openDevTools(), ic: '{}' },
  ];
  function setSearch(id) { S.db().settings.search = id; OB.set('settings', S.db().settings); S.toast('Search engine: ' + id); }

  function build(q) {
    const raw = q; q = q.trim(); const qq = q.toLowerCase();
    const mode = raw[0] === '>' ? 'cmd' : raw[0] === '@' ? 'app' : raw[0] === '/' ? 'tab' : 'all';
    const term = mode === 'all' ? qq : qq.slice(1).trim();
    const hit = (s) => !term || String(s).toLowerCase().includes(term);
    items = [];
    if (mode === 'tab' || mode === 'all') for (const t of S.tabs()) if (hit(t.title + ' ' + t.url)) items.push({ n: t.title || t.url, s: t.url, k: 'Tab', ic: '▭', go: () => S.show(t) });
    if (mode === 'cmd' || mode === 'all') for (const c of commands()) if (hit(c.n)) items.push({ n: c.n, k: c.k || 'Command', ic: c.ic, go: c.go });
    if (mode === 'app' || mode === 'all') for (const a of (S.catalogApps || [])) if (hit(a.name + ' ' + a.summary)) items.push({ n: a.name, s: (S.installedIds && S.installedIds.has(a.id) ? 'Installed · ' : '') + a.summary, k: S.installedIds && S.installedIds.has(a.id) ? 'Open' : 'Get', img: a.icon, go: () => S.installApp(a) });
    if (mode === 'all') {
      for (const b of S.db().bookmarks) if (hit(b.title + ' ' + b.url)) items.push({ n: b.title, s: b.url, k: 'Bookmark', ic: '★', go: () => S.open(b.url) });
      for (const h of S.db().history.slice(0, 400)) if (term && hit(h.title + ' ' + h.url)) items.push({ n: h.title, s: h.url, k: 'History', ic: '◷', go: () => S.open(h.url) });
      if (term) items.push({ n: 'Search the web for “' + q + '”', k: 'Enter', ic: '🔎', go: () => S.open(q) });
    }
    if (mode === 'all' && !term) items = items.slice(0, 14); else items = items.slice(0, 40);
    idx = 0; render();
  }
  function render() {
    list.innerHTML = items.map((it, i) => `<div class="pal-item${i === idx ? ' on' : ''}"><span class="ic">${it.img ? `<img src="${it.img}" alt="">` : it.ic || '›'}</span><span class="n"><span></span>${it.s ? '<small></small>' : ''}</span><span class="k">${it.k || ''}</span></div>`).join('') || '<div class="pad muted">Nothing found</div>';
    [...list.children].forEach((el, i) => { if (!items[i]) return; el.querySelector('.n > span').textContent = items[i].n; const sm = el.querySelector('small'); if (sm) sm.textContent = items[i].s; el.onmousedown = (e) => { e.preventDefault(); go(i); }; el.onmousemove = () => { if (idx !== i) { idx = i; [...list.children].forEach((x, j) => x.classList.toggle('on', j === i)); } }; });
    const on = list.children[idx]; if (on) on.scrollIntoView({ block: 'nearest' });
  }
  function go(i) { const it = items[i]; closePal(); if (it) it.go(); }
  function openPal(prefill = '') { pal.hidden = false; input.value = prefill; build(prefill); input.focus(); }
  function closePal() { pal.hidden = true; }
  S.palette = () => (pal.hidden ? openPal() : closePal());
  $('#palette-btn').onclick = () => openPal();
  input.oninput = () => build(input.value);
  input.onkeydown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); idx = (idx + 1) % items.length; render(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); idx = (idx - 1 + items.length) % items.length; render(); }
    else if (e.key === 'Enter') { e.preventDefault(); go(idx); }
    else if (e.key === 'Escape') closePal();
  };
  pal.onmousedown = (e) => { if (e.target === pal) closePal(); };
})();
