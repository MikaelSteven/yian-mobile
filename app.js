// ============================================================
// 医案 · 手机版：和电脑版通过 GitHub 加密同步，只处理文字（不含照片）
// 数据先保存在手机浏览器里（离线也能看、能记），有网络时自动同步
// ============================================================
(function () {
  'use strict';
  const VERSION = '0.6.2';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const ICON = {
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
    needle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20L16 8"/><path d="M15 5l4 4"/><path d="M17 3l4 4"/><circle cx="4.5" cy="19.5" r="1"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
    sync: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 0 0-14.5-4.5L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.5 4.5L20 16"/><path d="M20 20v-4h-4"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
    plus: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  };

  // ---------------- 本机存储（IndexedDB，不行就退回 localStorage） ----------------
  const KV = (() => {
    let dbp = null;
    function open() {
      if (!dbp)
        dbp = new Promise((res, rej) => {
          if (typeof indexedDB === 'undefined') return rej(new Error('no idb'));
          const r = indexedDB.open('yian-mobile', 1);
          r.onupgradeneeded = () => r.result.createObjectStore('kv');
          r.onsuccess = () => res(r.result);
          r.onerror = () => rej(r.error);
        });
      return dbp;
    }
    const ls = {
      get: (k) => {
        try {
          const t = localStorage.getItem('yian.kv.' + k);
          return t ? JSON.parse(t) : undefined;
        } catch (e) {
          return undefined;
        }
      },
      set: (k, v) => localStorage.setItem('yian.kv.' + k, JSON.stringify(v)),
      del: (k) => localStorage.removeItem('yian.kv.' + k),
    };
    return {
      async get(k) {
        try {
          const db = await open();
          return await new Promise((res, rej) => {
            const q = db.transaction('kv').objectStore('kv').get(k);
            q.onsuccess = () => res(q.result);
            q.onerror = () => rej(q.error);
          });
        } catch (e) {
          return ls.get(k);
        }
      },
      async set(k, v) {
        try {
          const db = await open();
          await new Promise((res, rej) => {
            const tx = db.transaction('kv', 'readwrite');
            tx.objectStore('kv').put(v, k);
            tx.oncomplete = res;
            tx.onerror = () => rej(tx.error);
            tx.onabort = () => rej(tx.error);
          });
        } catch (e) {
          ls.set(k, v);
        }
      },
      async del(k) {
        try {
          const db = await open();
          await new Promise((res, rej) => {
            const tx = db.transaction('kv', 'readwrite');
            tx.objectStore('kv').delete(k);
            tx.oncomplete = res;
            tx.onerror = () => rej(tx.error);
          });
        } catch (e) {
          ls.del(k);
        }
      },
    };
  })();

  const cfgGet = () => {
    try {
      const j = JSON.parse(localStorage.getItem('yian.cfg') || 'null');
      return j && j.repo && j.token && j.password ? j : null;
    } catch (e) {
      return null;
    }
  };
  const cfgSet = (c) => (c ? localStorage.setItem('yian.cfg', JSON.stringify(c)) : localStorage.removeItem('yian.cfg'));

  // ---------------- 状态 ----------------
  const blankDb = () => ({ patients: [], visits: [], templates: [], acu: [], settings: {}, meta: {} });
  const S = {
    db: blankDb(),
    base: null,
    cfg: null,
    rev: 0,
    view: '',
    q: '',
    filter: 'all',
    draft: null, // 正在编辑的医案
    dirty: false,
    pdraft: null,
    depth: 0,
    sync: { state: 'idle', lastAt: null, summary: '', error: '', running: false, again: false, timer: null, asked: false },
  };

  let Acu_ui = null; // 针灸部分（acu-ui.js），在下面「事件」那里创建

  // ---------------- 小工具 ----------------
  let toastTimer;
  function toast(msg, type = '') {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast show ' + type;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.className = 'toast'), 2200);
  }

  // 底部弹层。buttons: [{text, value, primary, danger}]，返回被点按钮的 value（点空白处返回 null）
  function sheet({ title, body, buttons, onOpen }) {
    return new Promise((resolve) => {
      const mask = document.createElement('div');
      mask.className = 'sheet-mask';
      const box = document.createElement('div');
      box.className = 'sheet';
      box.innerHTML = `${title ? `<h2>${esc(title)}</h2>` : ''}<div class="sb"></div><div class="btns"></div>`;
      const sb = $('.sb', box);
      if (typeof body === 'string') sb.innerHTML = body;
      else if (body) sb.appendChild(body);
      const done = (v) => {
        mask.remove();
        resolve(v);
      };
      (buttons || []).forEach((b) => {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'btn' + (b.primary ? ' primary' : '') + (b.danger ? ' danger' : '');
        el.textContent = b.text;
        el.addEventListener('click', () => done(b.value));
        $('.btns', box).appendChild(el);
      });
      if (!(buttons || []).length) $('.btns', box).remove();
      mask.addEventListener('click', (e) => {
        if (e.target === mask) done(null);
      });
      mask.appendChild(box);
      $('#sheetRoot').appendChild(mask);
      if (onOpen) onOpen(box, done);
    });
  }
  const confirmSheet = async (title, text, okText = '确定', danger = false) => (await sheet({ title, body: `<p>${esc(text)}</p>`, buttons: [{ text: '取消', value: false }, { text: okText, value: true, primary: !danger, danger }] })) === true;
  const alertSheet = (title, text) => sheet({ title, body: `<p style="white-space:pre-wrap">${esc(text)}</p>`, buttons: [{ text: '知道了', value: true, primary: true }] });

  function hhmm(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const p = (x) => String(x).padStart(2, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  function fmtWhen(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const p = (x) => String(x).padStart(2, '0');
    return `${d.getMonth() + 1}月${d.getDate()}日 ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  function shortDate(s) {
    const t = String(s || '');
    const y = new Date().getFullYear();
    return t.startsWith(String(y) + '-') ? t.slice(5) : t;
  }

  // ---------------- 数据读写 ----------------
  const patientsActive = () => S.db.patients.filter((p) => !p.deletedAt);
  const getPatient = (id) => S.db.patients.find((p) => p.id === id && !p.deletedAt) || null;
  const visitsOf = (pid) => Logic.sortVisitsAsc(S.db.visits.filter((v) => v.patientId === pid && !v.deletedAt));
  const getVisit = (id) => S.db.visits.find((v) => v.id === id && !v.deletedAt) || null;

  async function persist() {
    await KV.set('db', S.db);
    try {
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
    } catch (e) {
      /* 忽略 */
    }
  }

  // 修改数据并保存到手机。失败会恢复原样
  async function commit(mutate) {
    const snapshot = JSON.stringify(S.db);
    try {
      mutate(S.db);
    } catch (e) {
      S.db = JSON.parse(snapshot);
      await alertSheet('出错了', e.message);
      return false;
    }
    S.rev += 1;
    try {
      await persist();
    } catch (e) {
      S.db = JSON.parse(snapshot);
      S.rev += 1;
      await alertSheet('保存失败', '手机存储空间可能不足，或浏览器禁止了本地存储。' + (e && e.message ? '\n' + e.message : ''));
      return false;
    }
    syncSoon();
    return true;
  }

  // ---------------- 页面框架 ----------------
  const bar = (left, title, right) => `${left || ''}<div class="ttl">${title}</div>${right || ''}`;
  const backBtn = '<button class="ibtn" data-act="back" aria-label="返回">' + ICON.back + '</button>';
  function chipHtml() {
    if (!S.cfg) return '';
    const y = S.sync;
    const label = { syncing: '同步中', ok: y.lastAt ? hhmm(y.lastAt) : '已同步', offline: '离线', error: '出错', idle: y.lastAt ? hhmm(y.lastAt) : '待同步' }[y.state] || '';
    return `<button class="chip-sync ${y.state}" data-act="syncnow" title="${esc(y.error || '点击立即同步')}"><i></i>${label}</button>`;
  }
  function refreshChip() {
    const c = $('.chip-sync');
    if (c) c.outerHTML = chipHtml();
    const st = $('#syncState');
    if (st) st.innerHTML = syncStateHtml();
  }

  // tabs：'list' / 'acu' 时显示底部的「病历 | 针灸」切换
  function tabsHtml(cur) {
    const n = Acu_ui ? Acu_ui.activeCount() : 0;
    return `<nav class="tabs"><button data-act="tab-list" data-tab="list" class="${cur === 'list' ? 'on' : ''}">${ICON.list}<span>病历</span></button><button data-act="tab-acu" data-tab="acu" class="${cur === 'acu' ? 'on' : ''}">${ICON.needle}<span>针灸</span><i class="badge" ${n ? '' : 'hidden'}>${n || ''}</i></button></nav>`;
  }
  function page({ barHtml, html, fab = '', savebar = '', tabs = '' }) {
    $('#bar').innerHTML = barHtml;
    $('#view').innerHTML = html;
    $('#fab').innerHTML = fab;
    const oldTabs = $('.tabs');
    if (oldTabs) oldTabs.remove();
    document.body.classList.toggle('has-tabs', !!tabs);
    if (tabs) document.body.insertAdjacentHTML('beforeend', tabsHtml(tabs));
    const old = $('.savebar');
    if (old) old.remove();
    if (savebar) {
      const d = document.createElement('div');
      d.className = 'savebar';
      d.innerHTML = savebar;
      document.body.appendChild(d);
    }
  }

  // ---------------- 路由 ----------------
  function parseRoute() {
    const h = location.hash.replace(/^#/, '') || '/';
    const parts = h.split('/').filter(Boolean);
    return { name: parts[0] || 'list', a: parts[1] ? decodeURIComponent(parts[1]) : '', b: parts[2] ? decodeURIComponent(parts[2]) : '' };
  }
  function go(hash) {
    S.depth += 1;
    history.pushState({ d: S.depth }, '', '#' + hash);
    render();
  }
  function back(fallback = '/') {
    if (S.depth > 0 && history.state && history.state.d > 0) {
      S.depth -= 1;
      history.back();
    } else {
      S.depth = 0;
      history.replaceState({ d: 0 }, '', '#' + fallback);
      render();
    }
  }
  window.addEventListener('popstate', (e) => {
    S.depth = (e.state && e.state.d) || 0;
    render();
  });

  let renderSeq = 0;
  async function render(opts = {}) {
    const seq = ++renderSeq;
    // 离开正在编辑的医案/档案：有修改就先自动保存，不会丢
    if (!opts.keep && (S.view === 'visit' || S.view === 'pedit' || S.view === 'acuedit') && S.dirty) {
      const ok = S.view === 'visit' ? await saveVisit({ auto: true }) : S.view === 'acuedit' ? await Acu_ui.saveForm({ auto: true }) : await savePatient({ auto: true });
      if (!ok) {
        // 保存不了（比如没写日期）：留在原页面
        history.pushState({ d: S.depth + 1 }, '', S.formHash || '#/');
        S.depth += 1;
        return;
      }
    }
    if (seq !== renderSeq) return;
    const r = parseRoute();
    S.dirty = false;
    if (!S.cfg) {
      S.view = 'setup';
      return viewSetup();
    }
    const scroll = opts.keep ? window.scrollY : 0;
    if (r.name === 'p' && getPatient(r.a)) viewPatient(r.a);
    else if (r.name === 'v' && getVisit(r.a)) viewVisit(r.a, null);
    else if (r.name === 'nv' && getPatient(r.a)) viewVisit(null, r.a);
    else if (r.name === 'pe' && getPatient(r.a)) viewPatientEdit(r.a);
    else if (r.name === 'np') viewPatientEdit(null);
    else if (r.name === 'set') viewSettings();
    else if (Acu_ui && Acu_ui.route(r)) {
      /* 针灸的页面 */
    } else {
      if (r.name !== 'list' && history.state) history.replaceState({ d: S.depth }, '', '#/');
      viewList();
    }
    window.scrollTo(0, scroll);
    if (S.view === 'settings' && Acu_ui) Acu_ui.fillPerm();
  }

  // ---------------- 首次设置 ----------------
  function viewSetup(error = '') {
    S.view = 'setup';
    page({
      barHtml: bar('', '医案 · 手机版'),
      html: `<div class="setup">
        <h1>连接电脑上的医案</h1>
        <p class="lead">填好下面三样，就能在手机上查看、记录医案，并和电脑自动同步。数据加密后存在你自己的私有 GitHub 仓库里。</p>
        ${error ? `<div class="err">${esc(error)}</div>` : ''}
        <form id="setupForm" autocomplete="off">
          <label class="field"><span>数据仓库（用户名/仓库名）</span><input type="text" name="repo" placeholder="MikaelSteven/yian-data" autocapitalize="off" autocorrect="off" spellcheck="false" required /></label>
          <label class="field"><span>GitHub 令牌</span><input type="password" name="token" placeholder="github_pat_…" autocapitalize="off" autocorrect="off" spellcheck="false" required /></label>
          <label class="field"><span>同步密码（和电脑上设的一样）</span><input type="password" name="password" autocapitalize="off" autocorrect="off" spellcheck="false" required /></label>
          <button class="btn primary block" type="submit">连接并同步</button>
        </form>
        <p class="hint">令牌和密码只保存在这部手机的浏览器里。请给手机设置锁屏密码。</p>
        <details><summary>这三样从哪里来？</summary>
          <ol>
            <li>仓库名、令牌：在电脑上设置 GitHub 同步时用的那一份。</li>
            <li>同步密码：电脑上设置同步时自己定的密码，必须一模一样。</li>
            <li>令牌最好只授权给这一个仓库（Contents 读写），万一手机丢了，也不会影响你的其他仓库。</li>
          </ol>
        </details>
      </div>`,
    });
    $('#setupForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const repo = f.repo.value.trim();
      const token = f.token.value.trim();
      const password = f.password.value;
      const btn = $('button[type=submit]', f);
      btn.disabled = true;
      btn.textContent = '正在连接…（第一次要几秒）';
      try {
        const store = new YianSync.GitHubStore({ repo, token, fetch: window.fetch.bind(window) });
        const info = await YianSync.check({ store, password });
        if (info.empty && !(await confirmSheet('云端还是空的', '这个仓库里还没有同步数据。请先在电脑上设置好 GitHub 同步并同步一次，再回到手机上来连接。\n\n仍然要在手机上先开始吗？', '仍然开始'))) {
          btn.disabled = false;
          btn.textContent = '连接并同步';
          return;
        }
        S.cfg = { repo: store.repo, token, password };
        cfgSet(S.cfg);
        S.base = null;
        await KV.del('base');
        history.replaceState({ d: 0 }, '', '#/');
        render();
        await syncNow({ quiet: false });
      } catch (err) {
        viewSetup(SYNC_HELP[err.code] || err.message || String(err));
        const nf = $('#setupForm');
        nf.repo.value = repo;
      }
    });
  }

  const SYNC_HELP = {
    BADPASS: '同步密码不对。必须和电脑上设置的同步密码完全一样。',
  };

  // ---------------- 患者列表 ----------------
  function lastVisitMap() {
    const m = new Map();
    for (const v of S.db.visits) {
      if (v.deletedAt) continue;
      if (!m.has(v.patientId)) m.set(v.patientId, []);
      m.get(v.patientId).push(v);
    }
    for (const [k, arr] of m) m.set(k, Logic.sortVisitsAsc(arr));
    return m;
  }

  function listItemsHtml() {
    const vm = lastVisitMap();
    const rows = patientsActive()
      .filter((p) => Logic.matchPatient(p, S.q))
      .map((p) => {
        const vs = vm.get(p.id) || [];
        return { p, vs, last: vs.length ? vs[vs.length - 1] : null, fu: vs.length ? Logic.followUpInfo(vs) : null };
      })
      .filter((r) => S.filter !== 'due' || (r.fu && r.fu.due))
      .sort((a, b) => ((b.last && b.last.date) || '').localeCompare((a.last && a.last.date) || '') || (a.p.name || '').localeCompare(b.p.name || '', 'zh'));
    if (!rows.length) return `<div class="empty">${S.q || S.filter !== 'all' ? '没有找到' : '还没有患者。<br>点右下角“新建患者”，或在电脑上录入后同步过来。'}</div>`;
    return (
      `<div class="count">共 ${rows.length} 位</div><div class="list">` +
      rows
        .map(({ p, last, fu }) => {
          const age = Logic.ageText(p);
          return `<button class="row" data-act="open-p" data-id="${esc(p.id)}">
          <span class="avatar ${p.gender === '男' ? 'm' : p.gender === '女' ? 'f' : ''}">${esc((p.name || '?').slice(0, 1))}</span>
          <span class="main"><span class="name">${esc(p.name)}<small>${esc([p.gender, age].filter(Boolean).join(' '))}</small></span>
          <span class="sub" style="display:block">${last ? esc(last.chief || last.pattern || '（未写主诉）') : '暂无医案'}</span></span>
          <span class="side">${last ? esc(shortDate(last.date)) : ''}${fu && fu.due ? `<br><span class="tag due">${esc(fu.label)}</span>` : ''}</span>
        </button>`;
        })
        .join('') +
      '</div>'
    );
  }

  function viewList() {
    S.view = 'list';
    const n = patientsActive().length;
    page({
      barHtml: bar('', `医案<small>${n} 位患者</small>`, chipHtml() + `<button class="ibtn" data-act="settings" aria-label="设置">${ICON.gear}</button>`),
      html: `<div class="search"><input id="q" type="search" placeholder="姓名 / 拼音首字母 / 电话" value="${esc(S.q)}" autocomplete="off" autocapitalize="off" spellcheck="false" />
        <div class="filters"><button class="fchip ${S.filter === 'all' ? 'on' : ''}" data-act="filter" data-f="all">全部</button><button class="fchip ${S.filter === 'due' ? 'on' : ''}" data-act="filter" data-f="due">待复诊</button></div></div>
        <div id="plist">${listItemsHtml()}</div>`,
      fab: `<button class="fab" data-act="new-p">${ICON.plus}新建患者</button>`,
      tabs: 'list',
    });
    $('#q').addEventListener('input', (e) => {
      S.q = e.target.value;
      $('#plist').innerHTML = listItemsHtml();
    });
  }

  // ---------------- 患者页 ----------------
  function rxSummary(rx) {
    return Logic.rxLine(rx) || '';
  }

  function viewPatient(id) {
    S.view = 'patient';
    const p = getPatient(id);
    const vs = visitsOf(id);
    const fu = vs.length ? Logic.followUpInfo(vs) : null;
    const kv = (k, v) => (String(v || '').trim() ? `<div class="kv"><b>${k}</b><span>${esc(v)}</span></div>` : '');
    const phone = String(p.phone || '').trim();
    page({
      barHtml: bar(backBtn, `${esc(p.name)}<small>${esc([p.gender, Logic.ageText(p)].filter(Boolean).join(' '))}</small>`, chipHtml() + `<button class="ibtn" data-act="edit-p" data-id="${esc(id)}" aria-label="编辑档案">${ICON.edit}</button>`),
      html: `${fu && fu.due ? `<div class="warn" style="margin:0 0 10px">${esc(fu.label)}（${esc(fu.date)}）</div>` : fu ? `<div class="count">${esc(fu.label)}（${esc(fu.date)}）</div>` : ''}
        ${
          phone || p.allergy || p.history || p.note || (p.tags || []).length
            ? `<div class="card"><h3>档案</h3>${phone ? `<div class="kv"><b>电话</b><span><a href="tel:${esc(phone)}">${esc(phone)}</a></span></div>` : ''}${kv('过敏', p.allergy)}${kv('既往史', p.history)}${kv('备注', p.note)}${(p.tags || []).length ? `<div class="kv"><b>标签</b><span>${p.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join(' ')}</span></div>` : ''}</div>`
            : ''
        }
        <div class="count">就诊记录（${vs.length} 次）</div>
        ${
          vs.length
            ? `<div class="list">${vs
                .map((v, i) => ({ v, i }))
                .map(
                  ({ v, i }) => `<button class="vrow" data-act="open-v" data-id="${esc(v.id)}">
              <div class="h"><b>${esc(v.date)}</b><span style="color:var(--muted)">${esc(Logic.shortVisitLabel(i))}</span>${(v.photos || []).length ? `<span class="tag">照片 ${v.photos.length}</span>` : ''}</div>
              <div class="c">${esc(v.chief || v.pattern || '（未写主诉）')}</div>
              ${rxSummary(v.rx) ? `<div class="r">${esc((v.rx.name ? v.rx.name + '：' : '') + rxSummary(v.rx))}</div>` : ''}
            </button>`
                )
                .join('')}</div>`
            : '<div class="empty">还没有医案</div>'
        }
        ${Acu_ui ? Acu_ui.patientSectionHtml(id) : ''}<div style="height:70px"></div>`,
      fab: `<button class="fab" data-act="new-v" data-id="${esc(id)}">${ICON.plus}新建医案</button>`,
    });
  }

  // ---------------- 患者档案编辑 ----------------
  function viewPatientEdit(id) {
    S.view = 'pedit';
    S.formHash = location.hash;
    const p = id ? getPatient(id) : null;
    S.pdraft = p ? clone(p) : { id: null, name: '', gender: '', birth: '', birthYear: '', phone: '', allergy: '', history: '', note: '', tags: [] };
    const d = S.pdraft;
    const age = Logic.ageOf(d);
    page({
      barHtml: bar(backBtn, id ? '编辑档案' : '新建患者'),
      html: `<form id="pform" class="card" autocomplete="off">
        <label class="field"><span>姓名</span><input type="text" data-f="name" value="${esc(d.name)}" required /></label>
        <div class="field"><span>性别</span><div class="seg">
          <label><input type="radio" name="gender" value="男" ${d.gender === '男' ? 'checked' : ''}><span>男</span></label>
          <label><input type="radio" name="gender" value="女" ${d.gender === '女' ? 'checked' : ''}><span>女</span></label>
        </div></div>
        <div class="two">
          <label class="field"><span>出生日期</span><input type="date" data-f="birth" value="${esc(d.birth)}" /></label>
          <label class="field"><span>或 年龄</span><input type="number" inputmode="numeric" data-f="age" min="0" max="130" value="${d.birth ? '' : age === '' ? '' : age}" placeholder="岁" /></label>
        </div>
        <label class="field"><span>电话</span><input type="tel" data-f="phone" value="${esc(d.phone)}" /></label>
        <label class="field"><span>过敏史</span><input type="text" data-f="allergy" value="${esc(d.allergy)}" /></label>
        <label class="field"><span>既往史（新建医案时自动带入）</span><textarea data-f="history" rows="2">${esc(d.history)}</textarea></label>
        <label class="field"><span>备注</span><textarea data-f="note" rows="2">${esc(d.note)}</textarea></label>
        <label class="field"><span>标签（用空格或顿号分开）</span><input type="text" data-f="tags" value="${esc((d.tags || []).join('、'))}" /></label>
      </form>`,
      savebar: `${id ? '<button class="red" data-act="del-p" type="button">删除患者</button>' : ''}<button data-act="save-p" type="button">保存</button>`,
    });
    autoGrow();
    $('#pform').addEventListener('input', () => (S.dirty = true));
  }

  async function savePatient({ auto = false } = {}) {
    const d = S.pdraft;
    const f = $('#pform');
    if (!d || !f) return true;
    const val = (k) => (f.querySelector(`[data-f="${k}"]`).value || '').trim();
    const name = val('name');
    if (!name) {
      if (auto) return S.dirty ? (toast('请先填写姓名', 'warn'), false) : true;
      toast('请先填写姓名', 'warn');
      return false;
    }
    const g = f.querySelector('input[name=gender]:checked');
    let birth = val('birth');
    let birthYear = '';
    const ageStr = val('age');
    if (!birth && ageStr !== '') {
      const a = parseInt(ageStr, 10);
      if (!isNaN(a) && a >= 0 && a <= 130) birthYear = String(new Date().getFullYear() - a);
    } else if (!birth && d.birthYear) birthYear = d.birthYear;
    const now = new Date().toISOString();
    const data = {
      name,
      gender: g ? g.value : '',
      birth,
      birthYear,
      phone: val('phone'),
      allergy: val('allergy'),
      history: val('history'),
      note: val('note'),
      tags: [...new Set(val('tags').split(/[、,，;；\s]+/).map((t) => t.trim()).filter(Boolean))],
      updatedAt: now,
    };
    let newId = d.id;
    const ok = await commit((db) => {
      if (d.id) {
        const x = db.patients.find((q) => q.id === d.id);
        if (!x) throw new Error('找不到这位患者，可能已被删除');
        if (x.name !== name) Object.assign(x, { py: null, pyFull: null }); // 电脑端打开时会自动补上拼音
        Object.assign(x, data);
      } else {
        newId = Logic.uid('p');
        db.patients.push({ id: newId, ...data, tags: data.tags, py: null, pyFull: null, createdAt: now });
      }
    });
    if (!ok) return false;
    S.dirty = false;
    S.pdraft.id = newId;
    if (auto) toast('已自动保存');
    return true;
  }

  // ---------------- 医案编辑 ----------------
  const FIELDS_A = [
    { key: 'chief', label: '主诉' },
    { key: 'symptoms', label: '症状', ta: true },
    { key: 'past', label: '既往史', ta: true },
    { key: 'sign', label: '舌脉面象', ta: true },
  ];
  const FIELDS_B = [
    { key: 'advice', label: '医嘱', ta: true },
    { key: 'outcome', label: '疗效与随访', ta: true },
  ];
  const FIELDS_C = [
    { key: 'comment', label: '按语', ta: true },
    { key: 'note', label: '备注' },
  ];
  const COPY_KEYS = ['chief', 'symptoms', 'past', 'sign', 'tcmDx', 'pattern', 'advice'];

  function pastDefault(pid) {
    const p = getPatient(pid);
    if (p && String(p.history || '').trim()) return String(p.history).trim();
    const vs = visitsOf(pid);
    for (let i = vs.length - 1; i >= 0; i--) if (String(vs[i].past || '').trim()) return String(vs[i].past).trim();
    return '';
  }
  const defDoses = () => (S.db.settings && S.db.settings.defaultDoses) || '7';
  const defUsage = () => (S.db.settings && S.db.settings.defaultUsage) || '水煎服，日一剂，早中晚饭后半小时';

  const fieldHtml = (d, f) =>
    `<label class="field"><span>${f.label}</span>${f.ta ? `<textarea data-field="${f.key}" rows="2">${esc(d[f.key] || '')}</textarea>` : `<input type="text" data-field="${f.key}" value="${esc(d[f.key] || '')}" />`}</label>`;

  // 药格：一行 4 味，每味一行：药名 克数 g。设了煎法的，右上角显示小字（先煎/后下…）；点「g」可改煎法或删除这味药
  const unitLabel = (doseText) => {
    const v = String(doseText || '').trim();
    return v === '' || /^\d+(\.\d+)?$/.test(v) ? 'g' : '';
  };
  const isLongName = (name) => String(name || '').trim().length >= 4; // 4 字以上的药名、3 位数以上的克数用更小的字，免得被截断
  const isBigDose = (doseText) => String(doseText || '').trim().length >= 3;
  function herbCellHtml(h) {
    const m = (h && h.method) || '';
    const dose = Logic.doseInputText(h);
    return `<div class="hcell${isLongName(h && h.name) ? ' long' : ''}${isBigDose(dose) ? ' bigd' : ''}" data-method="${esc(m)}">
      <input class="h-name" list="herbList" value="${esc((h && h.name) || '')}" placeholder="药名" autocomplete="off" autocapitalize="off" spellcheck="false" />
      <input class="h-dose" value="${esc(dose)}" inputmode="decimal" placeholder="克" autocomplete="off" /><button type="button" class="h-unit" data-act="herb-opts" aria-label="煎法或删除这味药">${esc(unitLabel(dose))}</button><span class="h-tag">${esc(m)}</span></div>`;
  }
  const herbCellsHtml = (herbs) => herbs.map(herbCellHtml).join('') + herbCellHtml(null); // 最后永远留一个空位，相当于自动新增
  function refreshCellUnit(cell) {
    $('.h-unit', cell).textContent = unitLabel($('.h-dose', cell).value);
    $('.h-tag', cell).textContent = cell.dataset.method || '';
    cell.classList.toggle('long', isLongName($('.h-name', cell).value));
    cell.classList.toggle('bigd', isBigDose($('.h-dose', cell).value));
  }

  function fillHerbList() {
    const usage = Logic.herbUsage(S.db);
    const used = [...usage.entries()].sort((a, b) => b[1].count - a[1].count).map((e) => e[0]);
    const seen = new Set(used);
    const lib = typeof S.db.herbLibText === 'string' ? HERBS.parse(S.db.herbLibText) : HERBS.list;
    $('#herbList').innerHTML = [...used, ...lib.filter((n) => !seen.has(n))].map((n) => `<option value="${esc(n)}"></option>`).join('');
    S.usage = usage;
  }

  function viewVisit(id, newPid) {
    S.view = 'visit';
    S.formHash = location.hash;
    const v = id ? getVisit(id) : null;
    const pid = v ? v.patientId : newPid;
    const p = getPatient(pid);
    if (v) S.draft = clone(v);
    else
      S.draft = {
        id: null,
        patientId: pid,
        date: Logic.todayStr(),
        chief: '',
        symptoms: '',
        past: pastDefault(pid),
        sign: '',
        tcmDx: '',
        pattern: '',
        advice: '',
        outcome: '',
        nextDate: '',
        comment: '',
        note: '',
        photos: [],
        rx: { name: '', herbs: [], doses: defDoses(), usage: defUsage() },
      };
    const d = S.draft;
    d.rx = d.rx || { name: '', herbs: [], doses: '', usage: '' };
    const herbs = (d.rx.herbs || []).filter((h) => h.name || h.dose);
    const idx = v ? visitsOf(pid).findIndex((x) => x.id === v.id) : visitsOf(pid).length;
    fillHerbList();
    page({
      barHtml: bar(backBtn, `${esc(p.name)}<small>${esc(Logic.shortVisitLabel(idx))}</small>`, chipHtml()),
      html: `<form id="vform" autocomplete="off">
        <div class="card">
          <label class="field"><span>就诊日期</span><input type="date" data-field="date" value="${esc(d.date)}" required /></label>
          ${FIELDS_A.map((f) => fieldHtml(d, f)).join('')}
          <div class="two">${['tcmDx', 'pattern'].map((k) => `<label class="field"><span>${k === 'tcmDx' ? '诊断' : '证型'}</span><input type="text" data-field="${k}" value="${esc(d[k] || '')}" /></label>`).join('')}</div>
          ${(d.photos || []).length ? `<div class="photo-note">这条医案有 ${d.photos.length} 张照片，保存在电脑上（手机版不同步照片）。</div>` : ''}
          <div class="linkbar"><button type="button" class="lbtn" data-act="copy-prev-case">带入上次病历</button></div>
        </div>
        <div class="card">
          <h3>中药处方</h3>
          <label class="field" style="margin-top:0"><span>方名</span><input type="text" data-rx="name" value="${esc(d.rx.name || '')}" /></label>
          <div class="linkbar">
            <button type="button" class="lbtn" data-act="copy-prev-rx">带入上次处方</button>
            <button type="button" class="lbtn" data-act="paste-rx">粘贴识别</button>
            <button type="button" class="lbtn" data-act="copy-rx">复制方药</button>
            <button type="button" class="lbtn red" data-act="clear-rx">清空</button>
          </div>
          <div class="herbs" id="herbs">${herbCellsHtml(herbs)}</div>
          <p class="hint herb-hint">点克数后面的「g」：设煎法，或删除这味药</p>
          <div class="rx-sum" id="rxSum"></div>
          <div class="warn" id="rxWarn" hidden></div>
          <div class="two">
            <label class="field"><span>剂数</span><input type="text" data-rx="doses" value="${esc(d.rx.doses || '')}" inputmode="numeric" /></label>
            <label class="field" style="flex:3"><span>用法</span><input type="text" data-rx="usage" value="${esc(d.rx.usage || '')}" /></label>
          </div>
        </div>
        <div class="card">
          ${FIELDS_B.map((f) => fieldHtml(d, f)).join('')}
          <label class="field"><span>下次复诊</span><input type="date" data-field="nextDate" value="${esc(d.nextDate || '')}" /></label>
          ${FIELDS_C.map((f) => fieldHtml(d, f)).join('')}
        </div>
      </form>`,
      savebar: `${v ? '<button class="red" data-act="del-v" type="button">删除</button>' : ''}<button class="gray" data-act="discard" type="button" id="btnDiscard" hidden>放弃修改</button><button data-act="save-v" type="button">保存</button>`,
    });
    autoGrow();
    updateRxInfo();
    const form = $('#vform');
    form.addEventListener('input', (e) => {
      if (e.target.matches('.h-name,.h-dose')) {
        ensureBlankCell(); // 在最后的空位里开始写，就自动再留一个空位
        refreshCellUnit(e.target.closest('.hcell'));
        updateRxInfo();
      }
      markDirty();
    });
    // 离开药格区域时，把写空了的格子清掉（最后那个空位除外）
    form.addEventListener('focusout', (e) => {
      if (!e.target.matches('.h-name,.h-dose')) return;
      setTimeout(() => {
        const box = $('#herbs');
        if (!box || box.contains(document.activeElement)) return;
        [...box.children].slice(0, -1).forEach((c) => {
          if (!$('.h-name', c).value.trim()) c.remove();
        });
        ensureBlankCell();
        updateRxInfo();
      }, 0);
    });
    form.addEventListener('change', (e) => {
      if (e.target.matches('.h-name')) fillTypicalDose(e.target);
      markDirty();
    });
  }

  function markDirty() {
    S.dirty = true;
    const b = $('#btnDiscard');
    if (b) b.hidden = false;
  }

  function autoGrow() {
    $$('textarea').forEach((t) => {
      const fit = () => {
        t.style.height = 'auto';
        t.style.height = Math.max(t.scrollHeight + 2, 46) + 'px';
      };
      fit();
      t.addEventListener('input', fit);
    });
  }

  // 保证药格最后有一个空位（最后一格已经有内容就补一个），返回这个空位
  function ensureBlankCell() {
    const box = $('#herbs');
    const last = box.lastElementChild;
    if (!last || $('.h-name', last).value.trim() || $('.h-dose', last).value.trim()) box.insertAdjacentHTML('beforeend', herbCellHtml(null));
    return box.lastElementChild;
  }

  function fillTypicalDose(nameEl) {
    const cell = nameEl.closest('.hcell');
    const dose = $('.h-dose', cell);
    const name = nameEl.value.trim();
    if (!name || dose.value.trim() || !S.usage) return;
    const u = S.usage.get(name);
    if (u && u.topDose) {
      const h = Logic.parseDose(u.topDose);
      dose.value = Logic.doseInputText(h);
      refreshCellUnit(cell);
      updateRxInfo();
    }
  }

  function collectHerbs() {
    return $$('#herbs .hcell')
      .map((c) => {
        const name = $('.h-name', c).value.trim();
        const pd = Logic.parseDose($('.h-dose', c).value);
        return { name, dose: pd.dose, unit: pd.unit, method: c.dataset.method || '' };
      })
      .filter((h) => h.name);
  }

  function updateRxInfo() {
    const herbs = collectHerbs();
    const w = Logic.rxWeight(herbs);
    $('#rxSum').textContent = herbs.length ? `共 ${herbs.length} 味${w.perDose ? `，每剂约 ${w.perDose} g` : ''}${w.others ? `（另 ${w.others} 味非克计量）` : ''}` : '';
    const warn = $('#rxWarn');
    let msgs = [];
    try {
      const r = Logic.checkIncompat(herbs);
      msgs = (r || []).map((x) => (typeof x === 'string' ? x : x.text || x.msg || [x.a, x.b].filter(Boolean).join(' 与 ') + (x.type ? '（' + x.type + '）' : '')));
    } catch (e) {
      msgs = [];
    }
    warn.hidden = !msgs.length;
    warn.textContent = msgs.length ? '⚠ 配伍注意：' + msgs.join('；') : '';
  }

  function collectDraft() {
    const d = S.draft;
    $$('#vform [data-field]').forEach((el) => (d[el.dataset.field] = el.value.trim()));
    d.rx = d.rx || {};
    $$('#vform [data-rx]').forEach((el) => (d.rx[el.dataset.rx] = el.value.trim()));
    d.rx.herbs = collectHerbs();
    return d;
  }

  async function saveVisit({ auto = false } = {}) {
    if (!S.draft || !$('#vform')) return true;
    const d = collectDraft();
    if (!d.date) {
      toast('请先填写就诊日期', 'warn');
      return false;
    }
    const now = new Date().toISOString();
    const isNew = !d.id;
    const newId = isNew ? Logic.uid('v') : d.id;
    const ok = await commit((db) => {
      const rec = clone(d);
      rec.id = newId;
      rec.updatedAt = now;
      if (isNew) {
        rec.createdAt = now;
        db.visits.push(rec);
      } else {
        const i = db.visits.findIndex((v) => v.id === d.id);
        if (i < 0) throw new Error('找不到这条医案，可能已被删除');
        rec.createdAt = db.visits[i].createdAt || now;
        db.visits[i] = rec;
      }
      const p = db.patients.find((x) => x.id === d.patientId);
      if (p) {
        p.updatedAt = now;
        const past = String(d.past || '').trim();
        const newest = !db.visits.some((v) => v.patientId === d.patientId && !v.deletedAt && v.id !== newId && (v.date || '') > (d.date || ''));
        if (past && newest) p.history = past;
      }
    });
    if (!ok) return false;
    d.id = newId;
    S.dirty = false;
    toast(auto ? '已自动保存' : '已保存');
    return true;
  }

  // ---------------- 设置页 ----------------
  function syncStateHtml() {
    const y = S.sync;
    const t = { syncing: '正在同步…', ok: '已同步', idle: '等待同步', offline: '离线，联网后自动同步', error: '出错了' }[y.state] || '';
    return `<span style="color:${y.state === 'error' ? 'var(--red)' : y.state === 'ok' ? 'var(--green)' : 'var(--muted)'}">${esc(t)}</span>`;
  }

  function viewSettings() {
    S.view = 'settings';
    const c = S.cfg || {};
    const nP = patientsActive().length;
    const nV = S.db.visits.filter((v) => !v.deletedAt && getPatient(v.patientId)).length;
    page({
      barHtml: bar(backBtn, '设置'),
      html: `<div class="card"><h3>GitHub 同步</h3>
          <div class="kv"><b>状态</b><span id="syncState">${syncStateHtml()}</span></div>
          <div class="kv"><b>仓库</b><span>${esc(c.repo)}</span></div>
          <div class="kv"><b>上次同步</b><span>${S.sync.lastAt ? esc(fmtWhen(S.sync.lastAt)) + '　' + esc(S.sync.summary || '') : '还没有成功同步过'}</span></div>
          ${S.sync.error ? `<div class="err">${esc(S.sync.error)}</div>` : ''}
          <button class="btn primary block" data-act="syncnow">立即同步</button>
        </div>
        <div class="card"><h3>这部手机上的数据</h3>
          <div class="kv"><b>患者</b><span>${nP} 位</span></div>
          <div class="kv"><b>医案</b><span>${nV} 条</span></div>
          <p class="hint">手机版只同步文字，不含照片；照片请在电脑上查看。</p>
        </div>
        ${Acu_ui ? Acu_ui.settingsCardHtml() : ''}
        <div class="card"><h3>其他</h3>
          <button class="btn block" data-act="install-help">添加到手机桌面</button>
          <button class="btn danger block" data-act="logout">退出并清除这部手机上的数据</button>
          <p class="hint">版本 ${VERSION}。退出只清除这部手机上的数据和令牌，电脑和 GitHub 上的不受影响。</p>
        </div>`,
    });
  }

  // ---------------- 同步 ----------------
  function setSync(state, error = '') {
    S.sync.state = state;
    S.sync.error = error;
    refreshChip();
  }

  function syncSoon() {
    if (!S.cfg) return;
    clearTimeout(S.sync.timer);
    S.sync.timer = setTimeout(() => syncNow({ quiet: true }), 4000);
  }

  function dropSamples(db) {
    const ids = new Set(db.patients.filter((p) => p.sample).map((p) => p.id));
    db.patients = db.patients.filter((p) => !p.sample);
    db.visits = db.visits.filter((v) => !v.sample && !ids.has(v.patientId));
    db.acu = (db.acu || []).filter((a) => !a.sample && !ids.has(a.patientId));
    return db;
  }

  async function syncNow(opts = {}) {
    if (!S.cfg) return null;
    const y = S.sync;
    if (y.running) {
      y.again = true;
      return null;
    }
    if (navigator.onLine === false) {
      setSync('offline');
      if (!opts.quiet) toast('现在没有网络，联网后会自动同步', 'warn');
      return null;
    }
    clearTimeout(y.timer);
    y.running = true;
    setSync('syncing');
    let result = null;
    try {
      const rev0 = S.rev;
      const db0 = S.db;
      const store = new YianSync.GitHubStore({ repo: S.cfg.repo, token: S.cfg.token, fetch: window.fetch.bind(window) });
      const res = await YianSync.run({ db: S.db, base: S.base, store, password: S.cfg.password, deviceName: '手机', deleteGuard: opts.deleteGuard });
      if (S.rev !== rev0 || S.db !== db0) {
        y.again = true; // 同步时你又改了东西：稍后再来一次
        setSync('idle');
        return null;
      }
      if (res.db) {
        S.db = res.db;
        if (res.stats.added > 0) dropSamples(S.db);
        await persist();
      }
      S.base = res.base;
      await KV.set('base', S.base);
      y.lastAt = new Date().toISOString();
      y.summary = res.status === 'nochange' ? '已是最新' : [res.stats.added + res.stats.updated + res.stats.removed ? `更新 ${res.stats.added + res.stats.updated + res.stats.removed} 条` : '', res.stats.pushed ? `上传 ${res.stats.pushed} 条` : ''].filter(Boolean).join('，') || '已是最新';
      localStorage.setItem('yian.lastSync', JSON.stringify({ at: y.lastAt, summary: y.summary }));
      y.asked = false;
      setSync('ok');
      if (res.db) {
        afterPulled();
        if (!opts.quiet) toast('已同步：' + y.summary);
      } else if (!opts.quiet) toast('已同步');
      result = res;
    } catch (e) {
      const code = e && e.code;
      if (code === 'MASSDEL') {
        setSync('error', e.message);
        if (!y.asked) {
          y.asked = true;
          y.running = false;
          const v = await sheet({
            title: '这部手机上的记录少了很多',
            body: `<p>${esc(e.message)}</p><p>如果不是你自己删的，请选“从云端拉回来”。</p>`,
            buttons: [{ text: '先不同步', value: 'no' }, { text: '从云端拉回来', value: 'restore', primary: true }, { text: '确实是我删的', value: 'accept', danger: true }],
          });
          if (v === 'restore' || v === 'accept') result = await syncNow(Object.assign({}, opts, { deleteGuard: v }));
        }
      } else if (code === 'NET') {
        setSync('offline', e.message);
        if (!opts.quiet) toast('连不上 GitHub，稍后自动重试', 'warn');
      } else {
        const msg = SYNC_HELP[code] || (e && e.message) || String(e);
        setSync('error', msg);
        if (!opts.quiet) alertSheet('同步没有成功', msg);
      }
    } finally {
      y.running = false;
      if (y.again) {
        y.again = false;
        clearTimeout(y.timer);
        y.timer = setTimeout(() => syncNow({ quiet: true }), 1500);
      }
    }
    return result;
  }

  // 拉到了新数据：刷新当前页面（正在编辑时不动编辑内容）
  function afterPulled() {
    fillHerbList();
    if (Acu_ui) {
      Acu_ui.reconcile();
      Acu_ui.refresh();
    }
    if (S.view === 'list') {
      const l = $('#plist');
      if (l) l.innerHTML = listItemsHtml();
      const t = $('#bar .ttl small');
      if (t) t.textContent = `${patientsActive().length} 位患者`;
    } else if (S.view === 'patient' || S.view === 'settings' || S.view === 'acuall') {
      render({ keep: true });
    } else if (S.view === 'acu') {
      Acu_ui.refresh();
    } else if ((S.view === 'acuedit' || S.view === 'acunew') && !S.dirty) {
      const r = parseRoute();
      if (r.a === 'e' && !(S.db.acu || []).some((a) => a.id === r.b && !a.deletedAt)) {
        toast('这条记录已在别处被删除', 'warn');
        back('/acu');
      }
    } else if ((S.view === 'visit' || S.view === 'pedit') && !S.dirty) {
      const r = parseRoute();
      if ((r.name === 'v' && !getVisit(r.a)) || (r.name === 'pe' && !getPatient(r.a))) {
        toast('这条记录已在别处被删除', 'warn');
        back('/');
      }
    }
  }

  // ---------------- 事件 ----------------
  const acts = {
    back: () => back(S.view === 'visit' && S.draft ? '/p/' + encodeURIComponent(S.draft.patientId) : S.view === 'pedit' && S.pdraft && S.pdraft.id ? '/p/' + encodeURIComponent(S.pdraft.id) : '/'),
    settings: () => go('/set'),
    syncnow: async () => {
      if (S.view === 'visit' && S.dirty) await saveVisit({ auto: true });
      await syncNow({ quiet: false });
    },
    filter: (el) => {
      S.filter = el.dataset.f;
      viewList();
    },
    'open-p': (el) => go('/p/' + encodeURIComponent(el.dataset.id)),
    'new-p': () => go('/np'),
    'edit-p': (el) => go('/pe/' + encodeURIComponent(el.dataset.id)),
    'open-v': (el) => go('/v/' + encodeURIComponent(el.dataset.id)),
    'new-v': (el) => go('/nv/' + encodeURIComponent(el.dataset.id)),
    'save-p': async () => {
      if (await savePatient()) {
        const id = S.pdraft.id;
        S.dirty = false;
        history.replaceState({ d: S.depth }, '', '#/p/' + encodeURIComponent(id));
        render();
      }
    },
    'del-p': async () => {
      const p = getPatient(S.pdraft.id);
      const n = visitsOf(p.id).length;
      if (!(await confirmSheet('删除患者', `确定删除「${p.name}」${n ? `及其 ${n} 条医案` : ''}吗？删除后可在电脑版的「回收站」恢复。`, '删除', true))) return;
      const now = new Date().toISOString();
      const ok = await commit((db) => {
        const x = db.patients.find((q) => q.id === p.id);
        x.deletedAt = now;
        x.updatedAt = now;
        db.visits.forEach((v) => {
          if (v.patientId === p.id && !v.deletedAt) {
            v.deletedAt = now;
            v.updatedAt = now;
          }
        });
        (db.acu || []).forEach((a) => {
          if (a.patientId === p.id && !a.deletedAt) {
            a.deletedAt = now;
            a.updatedAt = now;
          }
        });
      });
      if (ok) {
        S.dirty = false;
        toast('已删除');
        S.depth = 0;
        history.replaceState({ d: 0 }, '', '#/');
        render();
      }
    },
    'save-v': async () => {
      if (await saveVisit()) {
        const pid = S.draft.patientId;
        S.dirty = false;
        back('/p/' + encodeURIComponent(pid));
      }
    },
    discard: async () => {
      if (!(await confirmSheet('放弃修改', '这次的修改不会保存。', '放弃', true))) return;
      S.dirty = false;
      back('/p/' + encodeURIComponent(S.draft.patientId));
    },
    'del-v': async () => {
      if (!(await confirmSheet('删除医案', `确定删除 ${S.draft.date} 这条医案吗？删除后可在电脑版的「回收站」恢复。`, '删除', true))) return;
      const now = new Date().toISOString();
      const id = S.draft.id;
      const pid = S.draft.patientId;
      const ok = await commit((db) => {
        const v = db.visits.find((x) => x.id === id);
        if (v) {
          v.deletedAt = now;
          v.updatedAt = now;
        }
      });
      if (ok) {
        S.dirty = false;
        toast('已删除');
        back('/p/' + encodeURIComponent(pid));
      }
    },
    // 点药格里的「g」：选煎法，或删除这味药
    'herb-opts': async (el) => {
      const cell = el.closest('.hcell');
      const name = $('.h-name', cell).value.trim();
      if (!name) return $('.h-name', cell).focus(); // 空位上没什么可设置的，先写药名
      const cur = cell.dataset.method || '';
      const body = document.createElement('div');
      body.innerHTML = `<p class="sheet-sub">煎法</p><div class="chips">${Logic.METHODS.map((m) => `<button type="button" class="lbtn${m === cur ? ' on' : ''}" data-pick="m:${esc(m)}">${m || '无'}</button>`).join('')}</div>
        <div class="chips" style="margin-top:14px"><button type="button" class="lbtn red" data-pick="del">删除这味药</button></div>`;
      const v = await sheet({
        title: name,
        body,
        buttons: [{ text: '取消', value: null }],
        onOpen: (box, done) =>
          box.addEventListener('click', (e) => {
            const c = e.target.closest('[data-pick]');
            if (c) done(c.dataset.pick);
          }),
      });
      if (v == null || !cell.isConnected) return;
      if (v === 'del') {
        cell.remove();
        ensureBlankCell();
      } else {
        cell.dataset.method = v.slice(2);
        refreshCellUnit(cell);
      }
      updateRxInfo();
      markDirty();
    },
    'copy-prev-rx': () => {
      const d = collectDraft();
      const vs = visitsOf(d.patientId).filter((v) => v.id !== d.id && (!d.date || (v.date || '') <= d.date));
      const prev = vs[vs.length - 1];
      if (!prev || !(prev.rx && (prev.rx.herbs || []).length)) return toast('没有找到上一次的处方', 'warn');
      setHerbs(clone(prev.rx.herbs));
      if (!d.rx.name) $('[data-rx=name]').value = prev.rx.name || '';
      toast('已带入 ' + prev.date + ' 的处方');
    },
    'copy-prev-case': () => {
      const d = collectDraft();
      const vs = visitsOf(d.patientId).filter((v) => v.id !== d.id && (!d.date || (v.date || '') <= d.date));
      const prev = vs[vs.length - 1];
      if (!prev) return toast('没有找到上一次的病历', 'warn');
      COPY_KEYS.forEach((k) => {
        const el = $(`[data-field="${k}"]`);
        if (el && prev[k]) el.value = prev[k];
      });
      autoGrow();
      markDirty();
      toast('已带入 ' + prev.date + ' 的病历');
    },
    'clear-rx': async () => {
      if (!collectHerbs().length) return;
      if (await confirmSheet('清空处方', '确定清空这张处方里的全部药味吗？', '清空', true)) setHerbs([]);
    },
    'copy-rx': async () => {
      const d = collectDraft();
      const text = (d.rx.name ? d.rx.name + '\n' : '') + Logic.rxLine(d.rx).replace(/、/g, '　') + (d.rx.doses ? `\n共 ${d.rx.doses} 剂` : '') + (d.rx.usage ? '，' + d.rx.usage : '');
      try {
        await navigator.clipboard.writeText(text);
        toast('方药已复制');
      } catch (e) {
        await sheet({ title: '长按复制', body: `<p class="rx-text">${esc(text)}</p>`, buttons: [{ text: '好', value: true, primary: true }] });
      }
    },
    'paste-rx': async () => {
      const ta = document.createElement('div');
      ta.innerHTML = '<p>把医生开的方子文字粘贴到这里（如：柴胡10g 白芍15g 炒白术12g…），自动拆成一味一味的药。</p><textarea id="pasteBox" placeholder="粘贴处方文字"></textarea>';
      const tb = $('textarea', ta);
      const v = await sheet({ title: '粘贴识别', body: ta, buttons: [{ text: '取消', value: false }, { text: '识别并填入', value: true, primary: true }], onOpen: () => setTimeout(() => tb.focus(), 50) });
      if (v !== true) return;
      const herbs = Logic.parsePaste(tb.value || '');
      if (!herbs.length) return toast('没有识别出药名', 'warn');
      const cur = collectHerbs();
      setHerbs(cur.length ? [...cur, ...herbs.filter((h) => !cur.some((c) => c.name === h.name))] : herbs);
      toast(`识别出 ${herbs.length} 味药`);
    },
    'install-help': () =>
      alertSheet(
        '添加到手机桌面',
        'iPhone（Safari）：点底部的“分享”按钮 → “添加到主屏幕”。\n安卓（Chrome）：点右上角“⋮” → “添加到主屏幕”或“安装应用”。\n\n添加后像普通软件一样从桌面打开，没有网络时也能看、能记，联网后自动同步。'
      ),
    logout: async () => {
      if (!(await confirmSheet('退出并清除数据', '会清除这部手机上的医案副本、令牌和同步密码。电脑和 GitHub 上的数据不受影响。\n\n还没同步的修改会丢失，确定吗？', '清除并退出', true))) return;
      await KV.del('db');
      await KV.del('base');
      cfgSet(null);
      localStorage.removeItem('yian.lastSync');
      S.cfg = null;
      S.db = blankDb();
      S.base = null;
      history.replaceState({ d: 0 }, '', '#/');
      render();
    },
  };

  function setHerbs(herbs) {
    const box = $('#herbs');
    box.innerHTML = herbCellsHtml(herbs);
    updateRxInfo();
    markDirty();
  }

  // 针灸部分
  if (window.AcuUIFactory) {
    Acu_ui = window.AcuUIFactory({ S, $, $$, esc, sheet, confirmSheet, alertSheet, toast, commit, page, bar, backBtn, chipHtml, go, back, render, getPatient, patientsActive, hhmm, ICON, Logic });
    Object.assign(acts, Acu_ui.acts);
  }
  acts['tab-list'] = () => {
    try {
      localStorage.setItem('yian.tab', 'list');
    } catch (e) {
      /* 忽略 */
    }
    history.replaceState({ d: 0 }, '', '#/');
    S.depth = 0;
    render();
  };

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || !acts[el.dataset.act]) return;
    e.preventDefault();
    acts[el.dataset.act](el, e);
  });
  // 药名那一栏按回车：跳到剂量；剂量按回车：新增一行
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    if (e.target.matches('.h-name')) {
      e.preventDefault();
      $('.h-dose', e.target.closest('.hcell')).focus();
    } else if (e.target.matches('.h-dose')) {
      e.preventDefault();
      const cell = e.target.closest('.hcell');
      ensureBlankCell();
      const next = cell.nextElementSibling || cell;
      $('.h-name', next).focus();
    }
  });

  window.addEventListener('online', () => S.cfg && syncNow({ quiet: true }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && S.cfg && (!S.sync.lastAt || Date.now() - new Date(S.sync.lastAt).getTime() > 60000)) syncNow({ quiet: true });
  });

  // ---------------- 启动 ----------------
  async function init() {
    S.cfg = cfgGet();
    try {
      const db = await KV.get('db');
      if (db && Array.isArray(db.patients) && Array.isArray(db.visits)) {
        S.db = db;
        if (!Array.isArray(S.db.templates)) S.db.templates = [];
        if (!Array.isArray(S.db.acu)) S.db.acu = [];
        if (!S.db.settings) S.db.settings = {};
      }
      S.base = (await KV.get('base')) || null;
      const ls = JSON.parse(localStorage.getItem('yian.lastSync') || 'null');
      if (ls) {
        S.sync.lastAt = ls.at;
        S.sync.summary = ls.summary;
        S.sync.state = 'idle';
      }
    } catch (e) {
      /* 读不到就当是新的 */
    }
    let startHash = location.hash;
    try {
      if (!startHash && localStorage.getItem('yian.tab') === 'acu') startHash = '#/acu';
    } catch (e) {
      /* 忽略 */
    }
    history.replaceState({ d: 0 }, '', startHash || '#/');
    await render();
    if (Acu_ui) Acu_ui.reconcile();
    if (S.cfg) setTimeout(() => syncNow({ quiet: true }), 600);
    setInterval(() => {
      if (S.cfg && document.visibilityState === 'visible' && !S.dirty) syncNow({ quiet: true });
    }, 3 * 60 * 1000);
    const inApp = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    if (!inApp && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  window.__m = { S, syncNow, go, render, acu: () => Acu_ui };
  init();
})();
