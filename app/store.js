// Omarchy Store side panel: live catalog from omarchystore.com, Installed badges, one-click install.
(() => {
  const $ = (s) => document.querySelector(s);
  const S = window.OBUI; const OB = window.ob;
  let apps = [], cats = [], hero = [], cat = 'all', q = '';
  let installed = new Set();
  S.installedIds = installed;

  const esc = (s) => String(s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  const catName = (id) => (cats.find((c) => c.id === id) || {}).name || id;

  async function load(force) {
    try {
      const d = await OB.catalog(force);
      apps = d.apps; cats = d.categories; hero = d.hero;
      S.catalogApps = apps;
      renderCats(); renderList();
      installed = new Set(await OB.installed()); S.installedIds = installed; renderList();
      S.detectGitHub();
    } catch (e) {
      $('#store-list').innerHTML = `<div class="pad muted">Couldn't reach the Omarchy Store.<br><br><button class="ghost" id="retry">Try again</button></div>`;
      $('#retry').onclick = () => load(true);
    }
  }
  function renderCats() {
    const el = $('#cats');
    el.innerHTML = `<button data-id="all" class="on">All</button>` + cats.map((c) => `<button data-id="${c.id}"></button>`).join('');
    [...el.children].forEach((b, i) => { if (i) b.textContent = cats[i - 1].name; b.onclick = () => { cat = b.dataset.id; [...el.children].forEach((x) => x.classList.toggle('on', x === b)); renderList(); }; });
  }
  function row(a) {
    const on = installed.has(a.id);
    const d = document.createElement('div'); d.className = 'row';
    d.innerHTML = `<img src="${a.icon}" alt=""><div class="meta"><div class="n"></div><div class="s"></div></div><button class="get${on ? ' open' : ''}">${on ? 'Open' : a.available ? 'Get' : 'Soon'}</button>`;
    d.querySelector('.n').textContent = a.name;
    d.querySelector('.s').textContent = esc(a.summary) || catName(a.category);
    d.onclick = (e) => (e.target.classList.contains('get') ? act(a) : detail(a));
    return d;
  }
  function renderList() {
    const el = $('#store-list'); el.innerHTML = '';
    const qq = q.toLowerCase();
    let list = apps.filter((a) => (cat === 'all' || a.category === cat) && (!qq || (a.name + ' ' + a.summary + ' ' + a.developer).toLowerCase().includes(qq)));
    if (!list.length) { el.innerHTML = '<div class="pad muted">No apps match.</div>'; return; }
    if (cat === 'all' && !qq) {
      const mine = list.filter((a) => installed.has(a.id));
      if (mine.length) { el.insertAdjacentHTML('beforeend', `<div class="section">On this computer · ${mine.length}</div>`); mine.forEach((a) => el.appendChild(row(a))); }
      const feat = hero.map((id) => list.find((a) => a.id === id)).filter((a) => a && !installed.has(a.id));
      if (feat.length) { el.insertAdjacentHTML('beforeend', '<div class="section">Featured</div>'); feat.forEach((a) => el.appendChild(row(a))); }
      el.insertAdjacentHTML('beforeend', '<div class="section">All apps</div>');
      list = list.filter((a) => !installed.has(a.id) && !feat.includes(a));
    }
    list.forEach((a) => el.appendChild(row(a)));
  }
  async function act(a) {
    if (installed.has(a.id)) { try { await OB.openApp(a.id); S.toast('Opening ' + a.name); } catch (_) { S.toast(a.name + ' is installed'); } return; }
    if (!a.available) return S.toast(a.name + ' is coming soon');
    try {
      const r = await OB.install(a.id);
      S.toast(r.via === 'terminal' ? 'Installing ' + a.name + ' in a terminal…' : 'Opened ' + a.name + ' in the store');
      if (r.via === 'terminal') setTimeout(async () => { installed = new Set(await OB.installed()); S.installedIds = installed; renderList(); }, 30000);
    } catch (e) { S.toast('Could not install: ' + e.message); }
  }
  function detail(a) {
    const d = $('#store-detail'); const on = installed.has(a.id);
    d.innerHTML = `<button class="back">&#8592; Back</button>
      <div class="d-head"><img src="${a.icon}" alt=""><div><h2></h2><div class="dev"></div></div></div>
      <div class="d-actions"><button class="get${on ? ' open' : ''}">${on ? 'Open' : a.available ? 'Get' : 'Soon'}</button><button class="ghost web">Store page</button>${a.github ? '<button class="ghost gh">GitHub</button>' : ''}${a.homepage && a.homepage !== a.github ? '<button class="ghost home">Website</button>' : ''}</div>
      <div class="d-desc"></div>`;
    d.querySelector('h2').innerHTML = '' ; d.querySelector('h2').textContent = a.name;
    if (on) d.querySelector('h2').insertAdjacentHTML('beforeend', '<span class="installed-pill">Installed</span>');
    d.querySelector('.dev').textContent = [a.developer, catName(a.category), a.license].filter(Boolean).join(' · ');
    d.querySelector('.d-desc').textContent = esc(a.description) || esc(a.summary);
    d.querySelector('.back').onclick = () => (d.hidden = true);
    d.querySelector('.get').onclick = () => act(a);
    d.querySelector('.web').onclick = () => S.open('https://omarchystore.com/app/' + encodeURIComponent(a.id) + '/', true);
    const gh = d.querySelector('.gh'); if (gh) gh.onclick = () => S.open(/^https?:/.test(a.github) ? a.github : 'https://github.com/' + a.github, true);
    const hm = d.querySelector('.home'); if (hm) hm.onclick = () => S.open(a.homepage, true);
    d.hidden = false;
  }
  S.openStoreApp = (id) => { const a = apps.find((x) => x.id === id); if (!a) return; if ($('#store').hidden) S.storeToggle(); detail(a); };
  S.installApp = act;

  S.storeToggle = () => { const h = !$('#store').hidden; $('#store').hidden = h; $('#store-toggle').classList.toggle('on', !h); if (!h) $('#store-q').focus(); };
  $('#store-toggle').onclick = S.storeToggle;
  $('#store-q').oninput = (e) => { q = e.target.value; renderList(); };
  load(false);
  setInterval(() => load(true), 3600e3);
})();
