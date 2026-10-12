// Omarchy Browser: window UI (tabs, address bar, Omarchy Store side panel).
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const NEWTAB = new URL('newtab.html', location.href).href;
  const SEARCH = 'https://duckduckgo.com/?q=';

  // ---------------------------------------------------------------- tabs ----
  let tabs = [], active = null, seq = 0;

  function toUrl(text) {
    const t = text.trim();
    if (!t) return null;
    if (/^https?:\/\//i.test(t)) return t;
    if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(t) && !/\s/.test(t)) return 'https://' + t;
    if (/^localhost(:\d+)?(\/.*)?$/.test(t)) return 'http://' + t;
    return SEARCH + encodeURIComponent(t);
  }

  function newTab(url, focus = true) {
    const id = ++seq;
    const wv = document.createElement('webview');
    wv.setAttribute('partition', 'persist:omarchy-browser');
    wv.setAttribute('allowpopups', '');
    wv.src = url || NEWTAB;
    const tab = { id, wv, title: 'New Tab', favicon: '', loading: true };
    wv.addEventListener('page-title-updated', (e) => { tab.title = e.title; renderTabs(); });
    wv.addEventListener('page-favicon-updated', (e) => { tab.favicon = e.favicons[0] || ''; renderTabs(); });
    wv.addEventListener('did-start-loading', () => { tab.loading = true; renderTabs(); });
    wv.addEventListener('did-stop-loading', () => { tab.loading = false; renderTabs(); syncNav(); });
    wv.addEventListener('did-navigate', syncNav);
    wv.addEventListener('did-navigate-in-page', syncNav);
    $('pages').appendChild(wv);
    tabs.push(tab);
    if (focus || !active) select(id);
    renderTabs();
    return tab;
  }

  function closeTab(id) {
    const i = tabs.findIndex((t) => t.id === id);
    if (i < 0) return;
    tabs[i].wv.remove();
    tabs.splice(i, 1);
    if (!tabs.length) return newTab();
    if (active === id) select(tabs[Math.min(i, tabs.length - 1)].id);
    renderTabs();
  }

  function select(id) {
    active = id;
    tabs.forEach((t) => t.wv.classList.toggle('on', t.id === id));
    renderTabs();
    syncNav();
  }

  const cur = () => tabs.find((t) => t.id === active);

  function renderTabs() {
    $('tabs').innerHTML = tabs.map((t) => `
      <button class="tab ${t.id === active ? 'on' : ''} ${t.loading ? 'loading' : ''}" data-id="${t.id}" title="${esc(t.title)}">
        <img src="${esc(t.favicon || 'icons/16x16.png')}" alt="">
        <span class="t">${esc(t.title || 'New Tab')}</span>
        <span class="x" data-close="${t.id}">&#10005;</span>
      </button>`).join('');
  }

  function syncNav() {
    const t = cur();
    if (!t) return;
    let url = '';
    try { url = t.wv.getURL(); } catch (_) { url = t.wv.src; }
    if (document.activeElement !== $('url')) $('url').value = url === NEWTAB ? '' : url;
    try { $('back').disabled = !t.wv.canGoBack(); $('fwd').disabled = !t.wv.canGoForward(); } catch (_) {}
  }

  $('tabs').addEventListener('click', (e) => {
    const x = e.target.closest('[data-close]');
    if (x) { e.stopPropagation(); return closeTab(+x.dataset.close); }
    const b = e.target.closest('.tab');
    if (b) select(+b.dataset.id);
  });
  $('tabs').addEventListener('auxclick', (e) => { const b = e.target.closest('.tab'); if (b && e.button === 1) closeTab(+b.dataset.id); });
  $('tab-new').onclick = () => { newTab(); setTimeout(() => $('url').focus(), 50); };
  $('omni').addEventListener('submit', (e) => {
    e.preventDefault();
    const u = toUrl($('url').value);
    if (u && cur()) { cur().wv.loadURL(u); cur().wv.focus(); }
  });
  $('url').addEventListener('focus', () => $('url').select());
  $('back').onclick = () => cur()?.wv.goBack();
  $('fwd').onclick = () => cur()?.wv.goForward();
  $('reload').onclick = () => cur()?.wv.reload();
  $('w-min').onclick = () => ob.win('min');
  $('w-max').onclick = () => ob.win('max');
  $('w-close').onclick = () => ob.win('close');
  ob.onOpenUrl((url) => newTab(url));

  document.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (e.ctrlKey && k === 't') { e.preventDefault(); $('tab-new').click(); }
    else if (e.ctrlKey && k === 'w') { e.preventDefault(); closeTab(active); }
    else if (e.ctrlKey && k === 'l') { e.preventDefault(); $('url').focus(); }
    else if (e.ctrlKey && k === 'r') { e.preventDefault(); cur()?.wv.reload(); }
    else if (e.ctrlKey && k === 'b') { e.preventDefault(); toggleStore(); }
    else if (e.ctrlKey && k === 'tab') {
      e.preventDefault();
      const i = tabs.findIndex((t) => t.id === active);
      select(tabs[(i + (e.shiftKey ? -1 : 1) + tabs.length) % tabs.length].id);
    } else if (e.altKey && k === 'arrowleft') cur()?.wv.goBack();
    else if (e.altKey && k === 'arrowright') cur()?.wv.goForward();
  });

  // --------------------------------------------------------- store panel ----
  let store = null, cat = 'all';

  function toggleStore(force) {
    const open = force ?? $('store').hidden;
    $('store').hidden = !open;
    $('store-toggle').classList.toggle('on', open);
    if (open && !store) loadStore();
  }
  $('store-toggle').onclick = () => toggleStore();

  async function loadStore() {
    try {
      store = await ob.catalog();
      $('cats').innerHTML = [{ id: 'all', name: 'Discover' }, ...store.categories]
        .map((c) => `<button data-cat="${esc(c.id)}" class="${c.id === cat ? 'on' : ''}">${esc(c.name)}</button>`).join('');
      renderList();
    } catch (e) {
      $('store-list').innerHTML = `<div class="muted pad">Couldn't reach the store. <button class="get" id="retry">Retry</button></div>`;
      $('retry').onclick = loadStore;
    }
  }

  const row = (a) => `
    <div class="row" data-app="${esc(a.id)}">
      <img src="${esc(a.icon)}" alt="" loading="lazy">
      <div class="meta"><div class="n">${esc(a.name)}</div><div class="s">${esc(a.summary)}</div></div>
      <button class="get" data-get="${esc(a.id)}">GET</button>
    </div>`;

  function renderList() {
    const q = $('store-q').value.trim().toLowerCase();
    let html = '';
    if (!q && cat === 'all') {
      const hero = store.hero.map((id) => store.apps.find((a) => a.id === id)).filter(Boolean);
      html += `<div class="section">Featured</div>` + hero.map(row).join('');
      const br = store.apps.filter((a) => a.category === 'browsers' && !store.hero.includes(a.id)).slice(0, 8);
      html += `<div class="section">Browsers</div>` + br.map(row).join('');
      html += `<div class="section">Popular</div>` + store.apps.filter((a) => !store.hero.includes(a.id)).slice(0, 30).map(row).join('');
    } else {
      let list = store.apps;
      if (cat !== 'all') list = list.filter((a) => a.category === cat);
      if (q) list = list.filter((a) => a.name.toLowerCase().includes(q) || a.summary.toLowerCase().includes(q));
      html = list.slice(0, 150).map(row).join('') || `<div class="muted pad">No apps found.</div>`;
    }
    $('store-list').innerHTML = html;
    $('store-list').scrollTop = 0;
  }

  $('cats').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]');
    if (!b) return;
    cat = b.dataset.cat;
    $('cats').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    renderList();
  });
  let qt;
  $('store-q').addEventListener('input', () => { clearTimeout(qt); qt = setTimeout(renderList, 120); });

  async function get(id, btn) {
    try {
      if (btn) { btn.disabled = true; btn.textContent = '…'; }
      const r = await ob.install(id);
      toast(r.via === 'terminal' ? 'Installing in a terminal. Type your password there.' : 'Opening the store page for this app.');
    } catch (e) {
      toast("Couldn't start the install: " + e.message);
    } finally {
      if (btn) setTimeout(() => { btn.disabled = false; btn.textContent = 'GET'; }, 1500);
    }
  }

  function detail(id) {
    const a = store.apps.find((x) => x.id === id);
    if (!a) return;
    const d = $('store-detail');
    d.innerHTML = `
      <button class="back" id="d-back">&#8592; Back</button>
      <div class="d-head"><img src="${esc(a.icon)}" alt=""><div><h2>${esc(a.name)}</h2><div class="dev">${esc(a.developer)}</div></div></div>
      <div class="d-actions">
        <button class="get" data-get="${esc(a.id)}">GET</button>
        <button class="ghost" id="d-page">Open store page</button>
        ${a.homepage ? `<button class="ghost" id="d-web">Website</button>` : ''}
      </div>
      <div class="d-desc">${esc(a.description || a.summary)}</div>`;
    d.hidden = false;
    d.scrollTop = 0;
    $('d-back').onclick = () => { d.hidden = true; };
    $('d-page').onclick = () => newTab('https://omarchystore.com/app/' + encodeURIComponent(a.id) + '/');
    if (a.homepage) $('d-web').onclick = () => newTab(a.homepage);
  }

  $('store').addEventListener('click', (e) => {
    const g = e.target.closest('[data-get]');
    if (g) { e.stopPropagation(); return get(g.dataset.get, g); }
    const r = e.target.closest('[data-app]');
    if (r) detail(r.dataset.app);
  });

  let tt;
  function toast(msg) {
    $('toast').textContent = msg;
    $('toast').hidden = false;
    clearTimeout(tt);
    tt = setTimeout(() => { $('toast').hidden = true; }, 3500);
  }

  newTab();
  toggleStore(true);
})();
