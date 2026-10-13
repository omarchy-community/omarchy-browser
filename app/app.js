// Omarchy Browser 2.0: window UI (tabs, omnibox, workspaces, split view, find, downloads, theme).
const $ = (s) => document.querySelector(s);
const NEWTAB = new URL('newtab.html', location.href).href;
const READER = new URL('reader.html', location.href).href;
const PARTITION = 'persist:omarchy-browser';
const SEARCH = { duckduckgo: 'https://duckduckgo.com/?q=', google: 'https://www.google.com/search?q=', brave: 'https://search.brave.com/search?q=', bing: 'https://www.bing.com/search?q=' };

const OB = window.ob;
let DB = { bookmarks: [], history: [], workspaces: [], settings: { shield: true, search: 'duckduckgo' }, downloads: [] };
let tabs = []; let active = null; let splitTab = null; let zoom = {};
let wsId = 'main';
const S = {}; // shared with store.js / palette.js
window.OBUI = S;

// ---------------------------------------------------------------- toast ----
let toastT;
S.toast = (msg) => { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 2600); };

// ---------------------------------------------------------------- theme ----
function hex2rgba(h, a) { const n = parseInt(h.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
function applyTheme(t) {
  if (!t || !t.background) return;
  const r = document.documentElement.style;
  r.setProperty('--bg', t.background);
  r.setProperty('--bar', t.dark_background || t.background);
  r.setProperty('--panel', t.lighter_background || t.background);
  r.setProperty('--hover', t.selection || t.lighter_background || '#20202d');
  r.setProperty('--fg', t.foreground || '#e8e8ed');
  r.setProperty('--muted', t.muted || t.dark_foreground || '#8a8fa8');
  r.setProperty('--accent', t.accent || t.blue || '#7aa2f7');
  r.setProperty('--accent2', t.green || t.cyan || '#9ece6a');
  r.setProperty('--red', t.red || '#f7768e');
  r.setProperty('--border', hex2rgba(t.foreground || '#ffffff', 0.12));
  r.setProperty('--accent-a', hex2rgba(t.accent || t.blue || '#7aa2f7', 0.18));
  S.theme = t;
  for (const tb of tabs) if (tb.view.getURL().startsWith(NEWTAB) || tb.view.getURL().startsWith(READER)) tb.view.send && 0; // local pages read theme on load
}

// ----------------------------------------------------------------- tabs ----
function favicon(url) { try { const u = new URL(url); return /^https?:/.test(u.protocol) ? `https://icons.duckduckgo.com/ip3/${u.hostname}.ico` : ''; } catch (_) { return ''; } }
function titleOf(t) { return t.title || (t.url.startsWith(NEWTAB) ? 'New tab' : t.url.replace(/^https?:\/\//, '') || 'New tab'); }

function newTab(url = NEWTAB, { activate = true, ws = wsId } = {}) {
  const view = document.createElement('webview');
  view.setAttribute('partition', PARTITION);
  view.setAttribute('allowpopups', '');
  view.setAttribute('preload', new URL('page-preload.js', location.href).href);
  view.src = url;
  $('#pages').appendChild(view);
  const t = { id: Math.random().toString(36).slice(2), view, url, title: '', loading: true, ws, blocked: 0 };
  tabs.push(t);
  view.addEventListener('did-start-loading', () => { t.loading = true; render(); if (t === active) { const b = $('.gh-banner'); if (b) b.remove(); } });
  view.addEventListener('did-stop-loading', () => { t.loading = false; t.url = view.getURL(); render(); if (t === active) syncNav(); detectGitHub(t); });
  view.addEventListener('did-navigate', (e) => { t.url = e.url; t.blocked = 0; if (t === active && document.activeElement === $('#url') && !$('#url').value) $('#url').blur(); try { OB.shieldReset(view.getWebContentsId()); } catch (_) {} render(); if (t === active) syncNav(); });
  view.addEventListener('did-navigate-in-page', (e) => { if (e.isMainFrame) { t.url = e.url; render(); if (t === active) syncNav(); } });
  view.addEventListener('page-title-updated', (e) => { t.title = e.title; render(); OB.historyAdd(t.url, e.title); if (t === active) document.title = e.title + ' — Omarchy Browser'; });
  view.addEventListener('dom-ready', () => { t.wc = view.getWebContentsId(); if (zoom[hostOf(t.url)]) view.setZoomLevel(zoom[hostOf(t.url)]); });
  view.addEventListener('found-in-page', (e) => { $('#find-n').textContent = e.result.matches ? `${e.result.activeMatchOrdinal}/${e.result.matches}` : 'No matches'; });
  view.addEventListener('ipc-message', (e) => {
    if (e.channel === 'open') open(e.args[0]);
    if (e.channel === 'reader-ready') { const r = S.readerHtml; view.send('reader-html', r && r.url === e.args[0] ? r.html : null); S.readerHtml = null; }
  });
  if (activate) show(t);
  render();
  return t;
}
function show(t) {
  if (!t) return;
  active = t;
  for (const x of tabs) x.view.classList.toggle('on', x === t || x === splitTab);
  { const b = $('.gh-banner'); if (b) b.remove(); }
  if (!t.loading) detectGitHub(t);
  t.view.classList.toggle('right', false);
  if (splitTab) splitTab.view.classList.add('right');
  render(); syncNav();
  document.title = (t.title || 'Omarchy Browser') + (t.title ? ' — Omarchy Browser' : '');
  if (t.url.startsWith(NEWTAB)) { $('#url').value = ''; setTimeout(() => $('#url').focus(), 30); }
}
function close(t) {
  if (!t) return;
  const i = tabs.indexOf(t);
  if (t === splitTab) splitTab = null;
  t.view.remove();
  tabs.splice(i, 1);
  const inWs = tabs.filter((x) => x.ws === wsId);
  if (!inWs.length) return newTab();
  if (t === active) show(inWs[Math.min(i, inWs.length - 1)] || inWs[inWs.length - 1]);
  render();
}
function render() {
  const el = $('#tabs'); el.innerHTML = '';
  for (const t of tabs.filter((x) => x.ws === wsId)) {
    const b = document.createElement('button');
    b.className = 'tab' + (t === active ? ' on' : '') + (t.loading ? ' loading' : '') + (t === splitTab ? ' split' : '');
    const ic = favicon(t.url);
    b.innerHTML = `${ic ? `<img src="${ic}" onerror="this.remove()">` : ''}<span class="t"></span><span class="x" title="Close">&#10005;</span>`;
    b.querySelector('.t').textContent = titleOf(t);
    b.title = t.url;
    b.onclick = (e) => (e.target.classList.contains('x') ? close(t) : show(t));
    b.onauxclick = (e) => { if (e.button === 1) close(t); };
    el.appendChild(b);
  }
  $('#pages').classList.toggle('split', !!splitTab);
  $('#split-btn').classList.toggle('on', !!splitTab);
  saveSession();
}
function syncNav() {
  const v = active.view;
  try { $('#back').disabled = !v.canGoBack(); $('#fwd').disabled = !v.canGoForward(); } catch (_) {}
  const u = active.url;
  if (document.activeElement !== $('#url')) $('#url').value = u.startsWith(NEWTAB) ? '' : u.startsWith(READER) ? decodeURIComponent(new URL(u).hash.slice(1)) : u;
  $('#star').textContent = isBookmarked(u) ? '★' : '☆';
  $('#star').classList.toggle('on', isBookmarked(u));
  $('#reader-btn').hidden = !/^https?:/.test(u);
  $('#reader-btn').classList.toggle('on', u.startsWith(READER));
  $('#shield-n').textContent = active.blocked;
  $('#shield').className = 'shield ' + (!DB.settings.shield ? 'off' : active.blocked ? 'active' : '');
}
function hostOf(u) { try { return new URL(u).host; } catch (_) { return ''; } }

// --------------------------------------------------------------- navigate ----
function toUrl(q) {
  q = q.trim(); if (!q) return NEWTAB;
  if (/^(https?|file):\/\//i.test(q)) return q;
  if (/^[\w.-]+\.[a-z]{2,}(:\d+)?(\/.*)?$/i.test(q) && !/\s/.test(q)) return 'http://' + q;
  if (/^localhost(:\d+)?/.test(q)) return 'http://' + q;
  return (SEARCH[DB.settings.search] || SEARCH.duckduckgo) + encodeURIComponent(q);
}
function open(url, inNew) {
  url = toUrl(url);
  if (inNew || !active) return newTab(url);
  try { active.view.loadURL(url); } catch (_) { active.view.src = url; }
}
S.open = open; S.newTab = newTab; S.tabs = () => tabs.filter((x) => x.ws === wsId); S.show = show; S.close = close; S.active = () => active;

$('#omni').addEventListener('submit', (e) => { e.preventDefault(); hideSuggest(); open($('#url').value); $('#url').blur(); });
$('#back').onclick = () => active.view.goBack();
$('#fwd').onclick = () => active.view.goForward();
$('#reload').onclick = () => active.view.reload();
$('#tab-new').onclick = () => newTab();
$('#w-min').onclick = () => OB.win('min');
$('#w-max').onclick = () => OB.win('max');
$('#w-close').onclick = () => OB.win('close');
OB.onOpenUrl((u) => newTab(u));
$('#url').addEventListener('focus', () => $('#url').select());

// ------------------------------------------------------------ suggestions ----
let sugIdx = -1, sugItems = [];
function hideSuggest() { $('#suggest').hidden = true; sugIdx = -1; }
function suggest(q) {
  q = q.trim().toLowerCase();
  const box = $('#suggest');
  if (!q) return hideSuggest();
  const seen = new Set(); sugItems = [];
  for (const b of DB.bookmarks) if ((b.title + b.url).toLowerCase().includes(q) && !seen.has(b.url)) { seen.add(b.url); sugItems.push({ k: 'Bookmark', n: b.title, u: b.url }); }
  for (const h of DB.history) if ((h.title + h.url).toLowerCase().includes(q) && !seen.has(h.url)) { seen.add(h.url); sugItems.push({ k: 'History', n: h.title, u: h.url }); }
  sugItems = sugItems.slice(0, 6);
  sugItems.push({ k: 'Search', n: q, u: toUrl(q) });
  box.innerHTML = sugItems.map((s) => `<div><span class="k">${s.k}</span><span class="n"></span><span class="u"></span></div>`).join('');
  [...box.children].forEach((el, i) => { el.children[1].textContent = sugItems[i].n; el.children[2].textContent = sugItems[i].k === 'Search' ? '' : sugItems[i].u; el.onmousedown = () => { open(sugItems[i].u); hideSuggest(); }; });
  box.hidden = false; sugIdx = -1;
}
$('#url').addEventListener('input', (e) => suggest(e.target.value));
$('#url').addEventListener('blur', () => setTimeout(hideSuggest, 150));
$('#url').addEventListener('keydown', (e) => {
  if ($('#suggest').hidden) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    sugIdx = (sugIdx + (e.key === 'ArrowDown' ? 1 : -1) + sugItems.length) % sugItems.length;
    [...$('#suggest').children].forEach((el, i) => el.classList.toggle('on', i === sugIdx));
    $('#url').value = sugItems[sugIdx].k === 'Search' ? sugItems[sugIdx].n : sugItems[sugIdx].u;
  } else if (e.key === 'Escape') hideSuggest();
});

// -------------------------------------------------------------- bookmarks ----
function isBookmarked(u) { return DB.bookmarks.some((b) => b.url === u); }
function toggleBookmark() {
  const u = active.url; if (!/^https?:/.test(u)) return;
  if (isBookmarked(u)) { DB.bookmarks = DB.bookmarks.filter((b) => b.url !== u); S.toast('Bookmark removed'); }
  else { DB.bookmarks.unshift({ url: u, title: active.title || u, at: Date.now() }); S.toast('Bookmarked'); }
  OB.set('bookmarks', DB.bookmarks); syncNav();
}
$('#star').onclick = toggleBookmark;

// ------------------------------------------------------------- workspaces ----
function wsList() { return DB.workspaces.length ? DB.workspaces : (DB.workspaces = [{ id: 'main', name: 'Main' }]); }
function switchWs(id) {
  wsId = id; splitTab = null;
  $('#ws-name').textContent = (wsList().find((w) => w.id === id) || {}).name || 'Main';
  const inWs = tabs.filter((x) => x.ws === wsId);
  for (const x of tabs) x.view.classList.remove('on', 'right');
  if (inWs.length) show(inWs[0]); else newTab();
  OB.set('settings', Object.assign(DB.settings, { ws: wsId }));
  renderWs(); $('#ws-pop').hidden = true;
}
function renderWs() {
  $('#ws-list').innerHTML = wsList().map((w) => `<div class="ws-item${w.id === wsId ? ' on' : ''}" data-id="${w.id}"><span class="ws-dot"></span><span class="n"></span><span class="c">${(n => n + (n === 1 ? ' tab' : ' tabs'))(tabs.filter((t) => t.ws === w.id).length)}</span>${w.id !== 'main' ? '<button class="x" title="Delete workspace">&#10005;</button>' : ''}</div>`).join('');
  [...$('#ws-list').children].forEach((el, i) => {
    el.querySelector('.n').textContent = wsList()[i].name;
    el.onclick = (e) => {
      if (e.target.classList.contains('x')) { const id = wsList()[i].id; tabs.filter((t) => t.ws === id).forEach((t) => t.view.remove()); tabs = tabs.filter((t) => t.ws !== id); DB.workspaces = wsList().filter((w) => w.id !== id); OB.set('workspaces', DB.workspaces); if (wsId === id) switchWs('main'); else renderWs(); return; }
      switchWs(wsList()[i].id);
    };
  });
}
S.addWorkspace = (name) => { name = name || prompt('Workspace name', 'Work'); if (!name) return; const w = { id: Math.random().toString(36).slice(2), name }; wsList().push(w); OB.set('workspaces', DB.workspaces); switchWs(w.id); };
S.switchWs = switchWs; S.workspaces = wsList;
$('#ws-btn').onclick = () => { renderWs(); $('#ws-pop').hidden = !$('#ws-pop').hidden; $('#dl-pop').hidden = true; };
$('#ws-add').onclick = () => S.addWorkspace();

// ---------------------------------------------------------------- session ----
let sessT;
function saveSession() { clearTimeout(sessT); sessT = setTimeout(() => OB.set('session', tabs.filter((t) => /^https?:/.test(t.url)).map((t) => ({ url: t.url, title: t.title, ws: t.ws }))), 800); }

// ------------------------------------------------------------- split view ----
function toggleSplit() {
  if (splitTab) { splitTab.view.classList.remove('on', 'right'); splitTab = null; show(active); S.toast('Split view off'); return; }
  const others = tabs.filter((t) => t.ws === wsId && t !== active);
  splitTab = others[0] || newTab(NEWTAB, { activate: false });
  show(active); S.toast('Split view: ' + titleOf(splitTab));
}
S.toggleSplit = toggleSplit;
$('#split-btn').onclick = toggleSplit;

// ------------------------------------------------------------------- find ----
function findOpen() { $('#findbar').hidden = false; $('#find-q').focus(); $('#find-q').select(); }
function findClose() { $('#findbar').hidden = true; try { active.view.stopFindInPage('clearSelection'); } catch (_) {} $('#find-n').textContent = ''; }
function findGo(fwd = true) { const q = $('#find-q').value; if (q) active.view.findInPage(q, { forward: fwd, findNext: true }); }
$('#find-q').oninput = () => findGo(true);
$('#find-q').onkeydown = (e) => { if (e.key === 'Enter') findGo(!e.shiftKey); if (e.key === 'Escape') findClose(); };
$('#find-next').onclick = () => findGo(true); $('#find-prev').onclick = () => findGo(false); $('#find-x').onclick = findClose;
S.findOpen = findOpen;

// ----------------------------------------------------------------- reader ----
function toggleReader() {
  const u = active.url;
  if (u.startsWith(READER)) { active.view.loadURL(decodeURIComponent(new URL(u).hash.slice(1))); return; }
  if (!/^https?:/.test(u)) return;
  // Take the HTML from the live tab (already rendered, works for JS-heavy sites) and hand it to the reader.
  active.view.executeJavaScript('document.documentElement.outerHTML').then((html) => { S.readerHtml = { url: u, html }; active.view.loadURL(READER + '#' + encodeURIComponent(u)); }).catch(() => active.view.loadURL(READER + '#' + encodeURIComponent(u)));
}
S.toggleReader = toggleReader;
$('#reader-btn').onclick = toggleReader;

// ----------------------------------------------------------------- shield ----
OB.onShield(({ wc, n }) => { const t = tabs.find((x) => x.wc === wc); if (t) { t.blocked = n; if (t === active) syncNav(); } });
$('#shield').onclick = () => { DB.settings.shield = !DB.settings.shield; OB.set('settings', DB.settings); syncNav(); S.toast(DB.settings.shield ? 'Shield on: trackers and ads blocked' : 'Shield off for all sites'); };
S.shieldToggle = () => $('#shield').onclick();

// -------------------------------------------------------------- downloads ----
function fmt(b) { return b > 1e9 ? (b / 1e9).toFixed(1) + ' GB' : b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : b > 1e3 ? (b / 1e3).toFixed(0) + ' KB' : b + ' B'; }
function renderDl() {
  const l = $('#dl-list');
  if (!DB.downloads.length) { l.innerHTML = '<div class="muted pad">Nothing downloaded yet.</div>'; return; }
  l.innerHTML = DB.downloads.slice(0, 30).map((d) => `<div class="dl-item"><div class="meta"><div class="n"></div><div class="s">${d.state === 'completed' ? fmt(d.total) + ' · done' : d.state === 'progressing' ? fmt(d.got) + ' / ' + fmt(d.total) : d.state}</div>${d.state === 'progressing' ? `<div class="bar2"><i style="width:${d.total ? (100 * d.got / d.total) : 0}%"></i></div>` : ''}</div>${d.state === 'completed' ? '<button class="ghost sm o">Open</button><button class="ghost sm f">Folder</button>' : ''}</div>`).join('');
  [...l.children].forEach((el, i) => { const d = DB.downloads[i]; el.querySelector('.n').textContent = d.name; const o = el.querySelector('.o'), f = el.querySelector('.f'); if (o) o.onclick = () => OB.downloadOpen(d.path); if (f) f.onclick = () => OB.downloadShow(d.path); });
}
OB.onDownload((d) => {
  const i = DB.downloads.findIndex((x) => x.id === d.id);
  if (i >= 0) DB.downloads[i] = d; else DB.downloads.unshift(d);
  $('#dl-dot').hidden = false; renderDl();
  if (d.state === 'completed') S.toast('Downloaded ' + d.name);
});
$('#dl-btn').onclick = () => { renderDl(); $('#dl-dot').hidden = true; $('#dl-pop').hidden = !$('#dl-pop').hidden; $('#ws-pop').hidden = true; };
$('#dl-clear').onclick = () => { DB.downloads = []; OB.set('downloads', []); renderDl(); };

// ------------------------------------------------------------ context menu ----
OB.onPageMenu((m) => {
  const t = tabs.find((x) => x.wc === m.wc) || active;
  const c = $('#ctx'); const items = [];
  if (m.link) items.push(['Open link in new tab', () => newTab(m.link, { activate: false })], ['Copy link', () => navigator.clipboard.writeText(m.link)], ['Open link in split view', () => { splitTab = newTab(m.link, { activate: false }); show(active); }], null);
  if (m.img) items.push(['Open image in new tab', () => newTab(m.img, { activate: false })], ['Copy image address', () => navigator.clipboard.writeText(m.img)], null);
  if (m.text) items.push(['Copy', () => t.view.copy()], ['Search for “' + m.text.slice(0, 24) + (m.text.length > 24 ? '…' : '') + '”', () => newTab(toUrl(m.text), { activate: false })], null);
  if (m.editable) items.push(['Cut', () => t.view.cut()], ['Paste', () => t.view.paste()], ['Select all', () => t.view.selectAll()], null);
  items.push(['Back', () => t.view.goBack(), !m.canBack], ['Forward', () => t.view.goForward(), !m.canFwd], ['Reload', () => t.view.reload()], null, ['Reader view', () => { show(t); toggleReader(); }], ['Bookmark page', () => { show(t); toggleBookmark(); }], null, ['Inspect', () => t.view.openDevTools()]);
  c.innerHTML = items.map((it) => it ? `<button${it[2] ? ' disabled' : ''}><span></span></button>` : '<hr>').join('');
  let k = 0; [...c.children].forEach((el) => { if (el.tagName === 'HR') return; while (!items[k]) k++; el.firstChild.textContent = items[k][0]; const fn = items[k][1]; el.onclick = () => { fn(); c.hidden = true; }; k++; });
  const r = t.view.getBoundingClientRect();
  c.style.left = Math.min(r.left + m.x, innerWidth - 230) + 'px'; c.style.top = Math.min(r.top + m.y, innerHeight - 20 - items.length * 30) + 'px'; c.hidden = false;
});
addEventListener('mousedown', (e) => { if (!e.target.closest('#ctx')) $('#ctx').hidden = true; if (!e.target.closest('.pop,#ws-btn,#dl-btn')) { $('#ws-pop').hidden = true; $('#dl-pop').hidden = true; } });

// --------------------------------------------- GitHub ↔ Omarchy Store banner ----
// Browsing a GitHub repo that is in the Omarchy Store? Offer the one-click install.
function detectGitHub(t) {
  if (t !== active) return;
  const old = $('.gh-banner'); if (old) old.remove();
  const m = t.url.match(/^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)/);
  if (!m || !S.catalogApps) return;
  const repo = m[1].toLowerCase().replace(/\.git$/, '');
  const app = S.catalogApps.find((a) => { const g = (a.github || '').toLowerCase().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, ''); return g === repo || (a.homepage || '').toLowerCase().includes('github.com/' + repo); });
  if (!app) return;
  const b = document.createElement('div'); b.className = 'gh-banner';
  b.innerHTML = `<img src="${app.icon}" alt=""><div><b></b><div class="muted" style="font-size:11px">This project is in the Omarchy Store</div></div><button class="get">${S.installedIds && S.installedIds.has(app.id) ? 'Installed' : 'Get'}</button><button class="x">&#10005;</button>`;
  b.querySelector('b').textContent = app.name;
  b.querySelector('.get').onclick = () => S.openStoreApp(app.id);
  b.querySelector('.x').onclick = () => b.remove();
  $('#pages').appendChild(b);
}
S.detectGitHub = () => active && detectGitHub(active);

// --------------------------------------------------------------- shortcuts ----
addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase(); const c = e.ctrlKey || e.metaKey;
  if (c && k === 't') { e.preventDefault(); newTab(); }
  else if (c && k === 'w' && e.shiftKey) { e.preventDefault(); $('#ws-btn').click(); }
  else if (c && k === 'w') { e.preventDefault(); close(active); }
  else if (c && k === 'l') { e.preventDefault(); $('#url').focus(); $('#url').select(); }
  else if (c && k === 'k') { e.preventDefault(); S.palette && S.palette(); }
  else if (c && k === 'b') { e.preventDefault(); S.storeToggle && S.storeToggle(); }
  else if (c && k === 'd') { e.preventDefault(); toggleBookmark(); }
  else if (c && k === 'f') { e.preventDefault(); findOpen(); }
  else if (c && k === '\\') { e.preventDefault(); toggleSplit(); }
  else if (c && k === 'r' && e.shiftKey) { e.preventDefault(); toggleReader(); }
  else if (c && k === 'r') { e.preventDefault(); active.view.reload(); }
  else if (c && (k === '=' || k === '+')) { e.preventDefault(); setZoom(0.5); }
  else if (c && k === '-') { e.preventDefault(); setZoom(-0.5); }
  else if (c && k === '0') { e.preventDefault(); setZoom(null); }
  else if (c && k === 'tab') { e.preventDefault(); const l = S.tabs(); show(l[(l.indexOf(active) + (e.shiftKey ? -1 : 1) + l.length) % l.length]); }
  else if (c && /^[1-9]$/.test(k)) { e.preventDefault(); const l = S.tabs(); show(k === '9' ? l[l.length - 1] : l[+k - 1] || active); }
  else if (c && e.shiftKey && k === 'i') { e.preventDefault(); active.view.openDevTools(); }
  else if (e.altKey && e.key === 'ArrowLeft') active.view.goBack();
  else if (e.altKey && e.key === 'ArrowRight') active.view.goForward();
  else if (e.key === 'F5') active.view.reload();
  else if (e.key === 'F12') active.view.openDevTools();
  else if (e.key === 'Escape') { $('#ctx').hidden = true; $('#ws-pop').hidden = true; $('#dl-pop').hidden = true; if (!$('#findbar').hidden) findClose(); }
});
function setZoom(d) { const h = hostOf(active.url); zoom[h] = d === null ? 0 : (zoom[h] || 0) + d; active.view.setZoomLevel(zoom[h]); S.toast('Zoom ' + Math.round(100 * Math.pow(1.2, zoom[h])) + '%'); }

// Mouse back/forward buttons.
addEventListener('mouseup', (e) => { if (e.button === 3) active.view.goBack(); if (e.button === 4) active.view.goForward(); });

// ------------------------------------------------------------------- boot ----
(async () => {
  OB.onWinState((max) => ($('#w-max').textContent = max ? '❐' : '◻'));
  applyTheme(await OB.theme());
  OB.onTheme((t) => { applyTheme(t); S.toast('Theme: ' + (t.name || 'Omarchy')); for (const tb of tabs) if (tb.url.startsWith(NEWTAB) || tb.url.startsWith(READER)) tb.view.reload(); });
  DB = Object.assign(DB, await OB.db());
  S.db = () => DB;
  wsList(); wsId = (DB.settings.ws && wsList().some((w) => w.id === DB.settings.ws)) ? DB.settings.ws : 'main';
  $('#ws-name').textContent = (wsList().find((w) => w.id === wsId) || {}).name || 'Main';
  const sess = Array.isArray(DB.session) ? DB.session : [];
  const argUrl = null;
  if (sess.length) { for (const s of sess) { const t = newTab(s.url, { activate: false, ws: s.ws || 'main' }); t.title = s.title || ''; } const first = tabs.find((t) => t.ws === wsId); first ? show(first) : newTab(); }
  else newTab(argUrl || NEWTAB);
  renderDl();
})();
