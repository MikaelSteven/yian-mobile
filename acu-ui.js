// ============================================================
// 医案 · 手机版：针灸（床位、留针计时、行针 / 拔针闹钟、拔针核对、记事本文字导入）
// 闹钟：装成安卓 App 时用系统闹钟通知（锁屏、息屏也会响）；
//       在浏览器里打开时只能在页面开着的时候提醒（会提示去装 App）
// ============================================================
window.AcuUIFactory = function (api) {
  'use strict';
  const { S, $, $$, esc, sheet, confirmSheet, alertSheet, toast, commit, page, bar, backBtn, chipHtml, go, back, render, getPatient, patientsActive, hhmm, ICON, Logic } = api;
  const Acu = window.Acu;

  const COMMON = ['百会', '四神聪', '印堂', '太阳', '风池', '合谷', '内关', '神门', '中脘', '天枢', '气海', '关元', '足三里', '三阴交', '太冲', '阳陵泉', '血海', '太溪', '肾俞', '委中'];
  const cfg = () => Acu.settingsOf(S.db.settings);
  const acuList = () => (S.db.acu || []).filter((a) => !a.deletedAt);
  const activeList = () => acuList().filter(Acu.isActive);
  const getAcu = (id) => (S.db.acu || []).find((a) => a.id === id && !a.deletedAt) || null;
  const acuOf = (pid) =>
    acuList()
      .filter((a) => a.patientId === pid)
      .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.startAt || '').localeCompare(a.startAt || ''));
  const onBed = (n) => activeList().find((a) => Number(a.bed) === n) || null;
  const nameOf = (a) => {
    const p = getPatient(a.patientId);
    return p ? p.name : '（患者已删除）';
  };
  const mins = (m) => Math.max(0, Math.floor(m));
  const ptsLine = (pts) => (pts || []).join('、');
  const groups = () => Acu.groupsOf(S.db.settings);
  const customPoints = () => [...Acu.pointUsage(S.db.acu).keys()].filter((k) => !Acu.isKnownPoint(k));
  // 让 Acu 按设置里的自定义穴位来认（补全、标色、导入）
  const useCustom = () => Acu.setCustom(S.db.settings, S.db.acu);

  // ============================================================
  // 闹钟
  // ============================================================
  const Native = (() => {
    const C = window.Capacitor;
    const native = !!(C && C.isNativePlatform && C.isNativePlatform());
    const LN = native && C.Plugins ? C.Plugins.LocalNotifications : null;
    return { native, LN };
  })();
  const isApp = () => !!Native.LN;

  let channelsReady = false;
  async function ensureChannels() {
    if (!isApp() || channelsReady) return;
    try {
      await Native.LN.createChannel({ id: 'acu-manip2', name: '行针提醒', description: '留针期间每隔一段时间提醒行针', importance: 5, visibility: 1, sound: 'manip.wav', vibration: true, lights: true });
      await Native.LN.createChannel({ id: 'acu-remove2', name: '拔针提醒', description: '留针时间到了，提醒拔针', importance: 5, visibility: 1, sound: 'remove.wav', vibration: true, lights: true });
      channelsReady = true;
    } catch (e) {
      /* 旧系统没有渠道，忽略 */
    }
  }

  // 权限：通知 + 精确闹钟（安卓 12 以后要单独允许，不然锁屏时可能晚响）
  async function permState() {
    if (!isApp()) return { app: false, notify: typeof Notification !== 'undefined' ? Notification.permission : 'unsupported' };
    let notify = 'prompt';
    let exact = 'granted';
    try {
      notify = (await Native.LN.checkPermissions()).display;
    } catch (e) {
      /* 忽略 */
    }
    try {
      if (Native.LN.checkExactNotificationSetting) exact = (await Native.LN.checkExactNotificationSetting()).exact_alarm;
    } catch (e) {
      /* 忽略 */
    }
    return { app: true, notify, exact };
  }
  async function askPerms() {
    if (!isApp()) {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') await Notification.requestPermission();
      return permState();
    }
    try {
      const p = await Native.LN.checkPermissions();
      if (p.display !== 'granted') await Native.LN.requestPermissions();
    } catch (e) {
      /* 忽略 */
    }
    try {
      if (Native.LN.checkExactNotificationSetting) {
        const x = await Native.LN.checkExactNotificationSetting();
        if (x.exact_alarm !== 'granted' && (await confirmSheet('允许「闹钟和提醒」', '为了锁屏时也能准时响铃，请在接下来打开的页面里，打开「允许设置闹钟和提醒」，然后返回。', '去打开'))) await Native.LN.changeExactNotificationSetting();
      }
    } catch (e) {
      /* 忽略 */
    }
    return permState();
  }

  function alarmText(a, al) {
    const who = `${a.bed}号床 ${nameOf(a)}`;
    if (al.kind === 'manip') return { title: `行针：${who}`, body: `第 ${al.n} 次行针（已留针 ${al.n * Acu.statusOf(a, cfg()).interval} 分钟）` };
    if (al.n === 0) return { title: `拔针：${who}`, body: `留针 ${Acu.statusOf(a, cfg()).duration} 分钟到了。拔针时逐个核对穴位。` };
    return { title: `还没拔针：${who}`, body: `已超时 ${al.n * 5} 分钟，请尽快拔针` };
  }

  // 应该响的闹钟（所有正在留针的人、还没到点的）
  function wanted(now = Date.now()) {
    const out = [];
    for (const a of activeList()) for (const al of Acu.alarmsOf(a, cfg())) if (al.at > now + 1000) out.push({ a, al, id: Acu.notifId(a.id, al.idx) });
    return out;
  }

  // 网页版：页面开着时用计时器提醒
  const webTimers = new Map();
  function webBeep(kind) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const notes = kind === 'remove' ? [880, 660, 880, 660, 880, 660] : [660, 880];
      notes.forEach((f, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.value = f;
        o.connect(g);
        g.connect(ctx.destination);
        const t = ctx.currentTime + i * 0.35;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.4, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
        o.start(t);
        o.stop(t + 0.32);
      });
    } catch (e) {
      /* 忽略 */
    }
    try {
      if (navigator.vibrate) navigator.vibrate(kind === 'remove' ? [400, 200, 400, 200, 400] : [300, 150, 300]);
    } catch (e) {
      /* 忽略 */
    }
  }

  let lastSched = '';
  async function reconcile() {
    const list = wanted();
    if (isApp()) {
      const sig = list.map((x) => x.id + '@' + x.al.at).join(',');
      if (sig === lastSched) return;
      try {
        await ensureChannels();
        const pend = await Native.LN.getPending();
        const want = new Set(list.map((x) => x.id));
        const cancel = (pend.notifications || []).filter((n) => !want.has(Number(n.id))).map((n) => ({ id: Number(n.id) }));
        if (cancel.length) await Native.LN.cancel({ notifications: cancel });
        const have = new Map((pend.notifications || []).map((n) => [Number(n.id), n]));
        const add = [];
        for (const x of list) {
          const h = have.get(x.id);
          const at = new Date(x.al.at);
          if (h && h.schedule && h.schedule.at && Math.abs(new Date(h.schedule.at).getTime() - x.al.at) < 1500) continue;
          if (h) await Native.LN.cancel({ notifications: [{ id: x.id }] });
          const t = alarmText(x.a, x.al);
          add.push({ id: x.id, title: t.title, body: t.body, channelId: x.al.kind === 'manip' ? 'acu-manip2' : 'acu-remove2', schedule: { at, allowWhileIdle: true }, smallIcon: 'ic_stat_acu', autoCancel: true, extra: { acu: x.a.id, kind: x.al.kind } });
        }
        if (add.length) await Native.LN.schedule({ notifications: add });
        lastSched = sig;
      } catch (e) {
        console.warn('闹钟设置失败', e);
      }
      return;
    }
    // 网页版
    const want = new Set(list.map((x) => x.id));
    for (const [id, t] of webTimers) if (!want.has(id)) (clearTimeout(t), webTimers.delete(id));
    for (const x of list) {
      if (webTimers.has(x.id)) continue;
      const delay = x.al.at - Date.now();
      if (delay > 2147000000) continue;
      webTimers.set(
        x.id,
        setTimeout(() => {
          webTimers.delete(x.id);
          const a = getAcu(x.a.id);
          if (!Acu.isActive(a)) return;
          const t = alarmText(a, x.al);
          webBeep(x.al.kind);
          try {
            if (typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification(t.title, { body: t.body, tag: 'acu' + x.id, requireInteraction: x.al.kind === 'remove' });
          } catch (e) {
            /* 忽略 */
          }
          toast(t.title, x.al.kind === 'remove' ? 'warn' : '');
          refresh();
        }, delay)
      );
    }
  }

  // 测试闹钟：10 秒后响一次
  async function testAlarm(kind) {
    if (isApp()) {
      await ensureChannels();
      await Native.LN.schedule({ notifications: [{ id: 999000 + (kind === 'remove' ? 2 : 1), title: kind === 'remove' ? '测试：拔针提醒' : '测试：行针提醒', body: '闹钟正常。可以现在锁屏试试，10 秒后会响。', channelId: kind === 'remove' ? 'acu-remove2' : 'acu-manip2', schedule: { at: new Date(Date.now() + 10000), allowWhileIdle: true }, smallIcon: 'ic_stat_acu' }] });
    } else {
      setTimeout(() => webBeep(kind), 10000);
    }
    toast('10 秒后响铃，可以锁屏试试');
  }

  // ============================================================
  // 床位页
  // ============================================================
  function bedCardHtml(n) {
    const a = onBed(n);
    if (!a) return `<button class="bed empty" data-act="acu-start" data-bed="${n}"><span class="bn">${n}号床</span><span class="plus">＋</span><span class="em">空床，点这里扎针</span></button>`;
    const st = Acu.statusOf(a, cfg());
    const due = st.due;
    const dots = Array.from({ length: st.plannedManip }, (_, i) => `<i class="${i < st.manipDone ? 'on' : st.lastDue && i < st.lastDue.n ? 'miss' : ''}"></i>`).join('');
    const line = due ? `<b class="red">该拔针了</b>${-st.left >= 1 ? `（超 ${mins(-st.left)} 分）` : ''}` : st.nextManip ? `行针 ${hhmm(new Date(st.nextManip.at).toISOString())}（第${st.nextManip.n}次）` : `拔针 ${hhmm(new Date(st.removeAt).toISOString())}`;
    return `<div class="bed on${due ? ' due' : ''}" data-act="acu-bed" data-id="${esc(a.id)}">
      <span class="bn">${n}号床</span>
      <span class="who">${esc(nameOf(a))}</span>
      <span class="tm"><b>${mins(st.elapsed)}</b> / ${st.duration} 分</span>
      <span class="pg"><i style="width:${Math.round(st.progress * 100)}%"></i></span>
      <span class="nx">${line}</span>
      <span class="dots">${dots}</span>
      <span class="acts"><button type="button" class="mini" data-act="acu-manip" data-id="${esc(a.id)}">行针</button><button type="button" class="mini red" data-act="acu-remove" data-id="${esc(a.id)}">拔针</button></span>
    </div>`;
  }
  function bedsHtml() {
    const c = cfg();
    const L = Acu.bedLayout(c.beds);
    return `<div class="beds" style="grid-template-columns:repeat(${L.cols},minmax(0,1fr))">${L.beds.map((b) => `<div class="bedcell" style="grid-column:${b.col};grid-row:${b.row}">${bedCardHtml(b.bed)}</div>`).join('')}</div>`;
  }
  function todayHtml() {
    const t = Acu.todayStr();
    const list = acuList()
      .filter((a) => a.date === t && a.status !== 'active')
      .sort((a, b) => (b.endAt || '').localeCompare(a.endAt || ''));
    if (!list.length) return '';
    return `<div class="count">今天已拔针（${list.length} 人）</div><div class="list">${list.map(rowHtml).join('')}</div>`;
  }
  function rowHtml(a) {
    const time = a.startAt ? hhmm(a.startAt) + (a.endAt ? '–' + hhmm(a.endAt) : '') : '';
    return `<button class="vrow" data-act="acu-open" data-id="${esc(a.id)}">
      <div class="h"><b>${esc(nameOf(a))}</b><span style="color:var(--muted)">${esc(a.date || '日期不详')}${time ? ' ' + time : ''}${a.bed ? ` · ${a.bed}号床` : ''}</span>${Acu.isActive(a) ? '<span class="tag">留针中</span>' : ''}</div>
      ${a.symptoms ? `<div class="c">${esc(a.symptoms)}</div>` : ''}
      <div class="r">${esc(ptsLine(a.points)) || '（未写穴位）'}</div>
      ${a.feeling ? `<div class="r" style="color:var(--green)">针后：${esc(a.feeling)}</div>` : ''}
    </button>`;
  }

  function webHintHtml() {
    if (isApp()) return '';
    return `<div class="warn" style="margin:0 0 10px">这是网页版：手机锁屏或切到别的应用后，闹钟可能不响。要锁屏也响，请安装「医案」安卓 App（设置 → 针灸 → 下载安卓 App）。</div>`;
  }

  function viewHome() {
    S.view = 'acu';
    const n = activeList().length;
    page({
      barHtml: bar('', `针灸<small>${n ? `${n} 人留针中` : '没有人在留针'}</small>`, chipHtml() + `<button class="ibtn" data-act="settings" aria-label="设置">${ICON.gear}</button>`),
      html: `${webHintHtml()}<div id="bedsBox">${bedsHtml()}</div>
        <div class="acu-tools"><button class="btn" data-act="acu-all">全部扎针记录</button><button class="btn" data-act="acu-import">记事本文字导入</button></div>
        <div id="todayBox">${todayHtml()}</div>`,
      tabs: 'acu',
    });
  }

  function refresh() {
    if (S.view === 'acu') {
      const b = $('#bedsBox');
      if (b) b.innerHTML = bedsHtml();
      const t = $('#todayBox');
      if (t) t.innerHTML = todayHtml();
      const s = $('#bar .ttl small');
      const n = activeList().length;
      if (s) s.textContent = n ? `${n} 人留针中` : '没有人在留针';
    }
    const tb = $('.tabs [data-tab=acu] .badge');
    if (tb) {
      const n = activeList().length;
      tb.textContent = n || '';
      tb.hidden = !n;
    }
  }
  setInterval(() => {
    if (document.visibilityState === 'visible') refresh();
  }, 15000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refresh();
  });

  // ============================================================
  // 穴位输入（小方块 + 补全）
  // ============================================================
  function ptsEditorHtml(points) {
    useCustom();
    return `<div class="pts" id="pts">${(points || []).map((p, i) => `<button type="button" class="pt${Acu.isKnownPoint(p) ? '' : ' unk'}" data-act="acu-pt" data-i="${i}">${esc(p)}</button>`).join('')}<input id="ptIn" type="text" placeholder="${(points || []).length ? '继续加穴位…' : '穴位：名称或拼音首字母（zsl＝足三里）'}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done" /></div>
      <div class="sugg" id="ptSug"></div>`;
  }
  let usageCache = null;
  function usage() {
    if (!usageCache || usageCache.rev !== S.rev) usageCache = { rev: S.rev, m: Acu.pointUsage(S.db.acu) };
    return usageCache.m;
  }
  function bindPts(d, onChange) {
    const box = $('#pts');
    const inp = $('#ptIn');
    const sug = $('#ptSug');
    const redraw = () => {
      const keep = document.activeElement === inp;
      const v = inp.value;
      box.outerHTML = ptsEditorHtml(d.points).replace(/<div class="sugg"[^]*$/, '');
      bindPts(d, onChange);
      $('#ptIn').value = v;
      if (keep) $('#ptIn').focus();
      showSug();
    };
    const add = (txt) => {
      for (const p of Acu.expandGroups(Acu.splitPoints(txt), groups())) Acu.addPoint(d.points, Acu.canonPoint(p));
      inp.value = '';
      onChange();
      redraw();
    };
    function showSug() {
      const s = $('#ptSug');
      const raw = $('#ptIn').value.trim();
      const side = /^(双|左|右)/.exec(raw);
      const q = side ? raw.slice(1) : raw;
      let names;
      if (q) names = Acu.searchPoints(q, usage(), 14, groups());
      else {
        const u = [...usage().entries()].sort((a, b) => b[1] - a[1]).map((x) => x[0]);
        names = [...new Set(u.concat(COMMON))].slice(0, 16);
      }
      names = names.filter((n) => !d.points.some((p) => Acu.pointBase(p) === n));
      const gs = groups();
      s.innerHTML = names.map((n) => (gs[n] ? `<button type="button" class="sg grp" data-name="${esc(n)}" title="${esc(gs[n].join('、'))}">${esc(n)}<small>${gs[n].length}穴</small></button>` : `<button type="button" class="sg${Acu.isCustomPoint(n) ? ' cus' : ''}" data-name="${esc((side ? side[1] : '') + Acu.pickLabel(n))}">${esc((side ? side[1] : '') + Acu.pickLabel(n))}</button>`)).join('') + (q && /[\u4e00-\u9fa5]/.test(q) && !names.includes(q) ? `<button type="button" class="sg raw" data-name="${esc(raw)}">加「${esc(raw)}」</button>` : '');
    }
    $('#ptIn').addEventListener('input', (e) => {
      const v = e.target.value;
      if (/[\s,，、;；]$/.test(v) && v.trim()) return add(v);
      showSug();
    });
    $('#ptIn').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const v = e.target.value.trim();
        if (!v) return;
        const first = $('#ptSug .sg');
        add(first && !first.classList.contains('raw') ? first.dataset.name : v);
      } else if (e.key === 'Backspace' && !e.target.value && d.points.length) {
        d.points.pop();
        onChange();
        redraw();
      }
    });
    $('#ptSug').onclick = (e) => {
      const b = e.target.closest('.sg');
      if (!b) return;
      add(b.dataset.name);
      $('#ptIn').focus();
    };
    box.onclick = async (e) => {
      const b = e.target.closest('.pt');
      if (!b) return $('#ptIn').focus();
      const i = Number(b.dataset.i);
      const p = d.points[i];
      const pr = Acu.partsOf(p);
      const has = (m) => pr.tags.includes(m);
      const unknown = pr.name.split('透').filter((x) => x && !Acu.isKnownPoint(x));
      const v = await sheet({
        title: p,
        body: `<div class="chips">${[
          ['双', '双'],
          ['左', '左'],
          ['右', '右'],
          ['', '不分左右'],
        ]
          .map(([x, t]) => `<button type="button" class="lbtn${pr.side === x ? ' on' : ''}" data-pick="side:${x}">${t}</button>`)
          .join('')}</div>
          <div class="chips" style="margin-top:10px">${['刺血', '灸', '温针'].map((m) => `<button type="button" class="lbtn${has(m) ? ' on' : ''}" data-pick="mod:${m}">${m}</button>`).join('')}</div>
          ${unknown.length ? `<div class="chips" style="margin-top:10px"><button type="button" class="lbtn" data-pick="cust">把「${esc(unknown.join('、'))}」存为自定义穴位</button></div>` : ''}
          <div class="chips" style="margin-top:14px"><button type="button" class="lbtn red" data-pick="del">去掉这个穴位</button></div>`,
        buttons: [{ text: '取消', value: null }],
        onOpen: (bx, done) =>
          bx.addEventListener('click', (ev) => {
            const c = ev.target.closest('[data-pick]');
            if (c) done(c.dataset.pick);
          }),
      });
      if (v == null) return;
      if (v === 'del') d.points.splice(i, 1);
      else if (v === 'cust') {
        const cur = useCustom();
        const add = unknown.filter((n) => !cur.some((c) => c.name === n)).map((name) => ({ name, alias: [], mod: '', py: '' }));
        if ((await saveCustom(cur.concat(add))) >= 0) toast('已存为自定义穴位');
        d.points = d.points.map(Acu.canonPoint);
      } else {
        const [k, val] = v.split(':');
        if (k === 'side') pr.side = val;
        else pr.tags = has(val) ? pr.tags.filter((t) => t !== val) : pr.tags.concat(val);
        d.points[i] = Acu.buildLabel(pr);
      }
      onChange();
      redraw();
    };
    showSug();
  }

  // ============================================================
  // 开始扎针 / 编辑记录
  // ============================================================
  function patientPickHtml(d) {
    if (d.patientId) {
      const p = getPatient(d.patientId);
      return `<div class="picked"><span class="avatar ${p && p.gender === '男' ? 'm' : p && p.gender === '女' ? 'f' : ''}">${esc(((p && p.name) || '?').slice(0, 1))}</span><b>${esc(p ? p.name : '')}</b><small>${esc(p ? [p.gender, Logic.ageText(p)].filter(Boolean).join(' ') : '')}</small>${d.id ? '' : '<button type="button" class="lbtn" data-act="acu-repick">换人</button>'}</div>`;
    }
    if (d.newName) return `<div class="picked"><span class="avatar ${d.newGender === '男' ? 'm' : d.newGender === '女' ? 'f' : ''}">${esc(d.newName.slice(0, 1))}</span><b>${esc(d.newName)}</b><small>新患者${d.newGender ? ' · ' + d.newGender : ''}</small><button type="button" class="lbtn" data-act="acu-repick">换人</button></div>`;
    return `<input id="pq" type="search" placeholder="搜姓名 / 拼音首字母 / 电话" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(d.q || '')}" /><div class="plist" id="pres">${pickResults(d)}</div>`;
  }
  function pickResults(d) {
    const q = (d.q || '').trim();
    let list = patientsActive().filter((p) => Logic.matchPatient(p, q));
    // 没输入时：最近扎过针 / 看过病的排前面
    const recent = new Map();
    for (const a of acuList()) recent.set(a.patientId, Math.max(recent.get(a.patientId) || 0, Date.parse(a.startAt || a.date) || 0) + 1e13);
    for (const v of S.db.visits) if (!v.deletedAt) recent.set(v.patientId, Math.max(recent.get(v.patientId) || 0, Date.parse(v.date) || 0));
    const busy = new Set(activeList().map((a) => a.patientId));
    list.sort((a, b) => (recent.get(b.id) || 0) - (recent.get(a.id) || 0));
    list = list.slice(0, 8);
    const exact = q && patientsActive().some((p) => p.name === q);
    return (
      list.map((p) => `<button type="button" class="prow" data-act="acu-pick" data-id="${esc(p.id)}"><span class="avatar ${p.gender === '男' ? 'm' : p.gender === '女' ? 'f' : ''}">${esc((p.name || '?').slice(0, 1))}</span><b>${esc(p.name)}</b><small>${esc([p.gender, Logic.ageText(p)].filter(Boolean).join(' '))}${busy.has(p.id) ? ' · 正在留针' : ''}</small></button>`).join('') +
      (q && !exact && /^[一-龥·]{1,8}$/.test(q) ? `<button type="button" class="prow new" data-act="acu-newp"><span class="avatar">＋</span><b>新患者「${esc(q)}」</b></button>` : '') +
      (!list.length && !q ? '<div class="empty" style="padding:16px">还没有患者</div>' : '')
    );
  }

  function formHtml(d) {
    const isNew = !d.id;
    const c = cfg();
    const last = d.patientId ? acuOf(d.patientId).find((a) => a.id !== d.id && (a.points || []).length) : null;
    return `<form id="aform" autocomplete="off" onsubmit="return false">
      <div class="card"><h3>患者${d.bed ? `<span class="bedtag">${d.bed}号床</span>` : ''}</h3><div id="pickBox">${patientPickHtml(d)}</div></div>
      <div class="card"><h3 class="hflex">穴位 <small id="ncount">${d.points.length ? `${d.points.length} 穴` : ''}</small>${last ? `<button type="button" class="lbtn right" data-act="acu-last">用上次的（${esc(last.date)}）</button>` : ''}</h3>${ptsEditorHtml(d.points)}</div>
      <div class="card"><h3>症状 <small>选填</small></h3><textarea id="aSym" rows="2" placeholder="这次哪里不舒服">${esc(d.symptoms || '')}</textarea></div>
      ${
        isNew
          ? `<p class="hint" style="margin:0 4px 90px">点「开始留针」开始计时：每 ${c.interval} 分钟提醒行针，${c.duration} 分钟提醒拔针。时长可在设置里改。</p>`
          : `<div class="card"><h3>针后感觉 <small>选填</small></h3><textarea id="aFeel" rows="2">${esc(d.feeling || '')}</textarea></div>
        <div class="card"><h3>时间</h3>
          <div class="two"><label class="field"><span>日期</span><input type="date" id="aDate" value="${esc(d.date || '')}" /></label>
          <label class="field"><span>床位</span><input type="number" id="aBed" inputmode="numeric" min="1" max="12" value="${esc(d.bed || '')}" /></label></div>
          <div class="two"><label class="field"><span>开始</span><input type="time" id="aStart" value="${d.startAt ? hhmm(d.startAt) : ''}" /></label>
          <label class="field"><span>拔针</span><input type="time" id="aEnd" value="${d.endAt ? hhmm(d.endAt) : ''}" ${d.status === 'active' ? 'disabled placeholder="留针中"' : ''} /></label></div>
          ${(d.manip || []).length ? `<div class="kv"><b>行针</b><span>${d.manip.map((t) => hhmm(t)).join('、')}</span></div>` : ''}
        </div><div style="height:80px"></div>`
      }
    </form>`;
  }

  function viewForm(id, bed) {
    const a = id ? getAcu(id) : null;
    S.view = id ? 'acuedit' : 'acunew';
    S.formHash = location.hash;
    if (!S.acuDraft || S.acuDraft._for !== location.hash) {
      S.acuDraft = a ? Object.assign(JSON.parse(JSON.stringify(a)), { _for: location.hash }) : { _for: location.hash, id: null, patientId: S.acuPresetPatient || null, bed: Number(bed) || null, points: [], symptoms: '', q: '' };
      S.acuPresetPatient = null;
    }
    const d = S.acuDraft;
    page({
      barHtml: bar(backBtn, id ? (Acu.isActive(a) ? '留针中' : '扎针记录') : '开始扎针'),
      html: formHtml(d),
      savebar: id ? `<button class="red" data-act="acu-del" type="button">删除</button>${Acu.isActive(a) ? '<button class="gray" data-act="acu-remove" data-id="' + esc(id) + '" type="button">拔针</button>' : ''}<button data-act="acu-save" type="button">保存</button>` : `<button data-act="acu-go" type="button">开始留针</button>`,
    });
    bindForm(d);
  }
  function bindForm(d) {
    const pq = $('#pq');
    if (pq)
      pq.addEventListener('input', (e) => {
        d.q = e.target.value;
        $('#pres').innerHTML = pickResults(d);
      });
    bindPts(d, () => {
      S.dirty = !!d.id;
      const n = $('#ncount');
      if (n) n.textContent = d.points.length ? `${d.points.length} 穴` : '';
    });
    $('#aform').addEventListener('input', (e) => {
      if (e.target.id === 'ptIn' || e.target.id === 'pq') return;
      if (d.id) S.dirty = true;
    });
  }
  function readForm(d) {
    const v = (id) => {
      const el = $('#' + id);
      return el ? el.value : undefined;
    };
    if (v('aSym') !== undefined) d.symptoms = v('aSym').trim();
    if (v('aFeel') !== undefined) d.feeling = v('aFeel').trim();
    const pending = v('ptIn');
    if (pending && pending.trim()) for (const p of Acu.expandGroups(Acu.splitPoints(pending), groups())) Acu.addPoint(d.points, Acu.canonPoint(p));
    d.points = (d.points || []).map(Acu.canonPoint);
    if (v('aDate') !== undefined && v('aDate')) d.date = v('aDate');
    if (v('aBed') !== undefined) d.bed = Number(v('aBed')) || null;
    const setTime = (key, val) => {
      if (!val) return;
      const [h, m] = val.split(':').map(Number);
      const base = new Date((d.date || Acu.todayStr()) + 'T00:00:00');
      base.setHours(h, m, 0, 0);
      d[key] = base.toISOString();
    };
    if (v('aStart') !== undefined) setTime('startAt', v('aStart'));
    if (v('aEnd') !== undefined && d.status !== 'active') setTime('endAt', v('aEnd'));
  }

  function createPatientIfNeeded(db, d, now) {
    if (d.patientId || !d.newName) return;
    const id = Logic.uid('p');
    db.patients.push({ id, name: d.newName, gender: d.newGender || '', birth: '', birthYear: '', phone: '', allergy: '', history: '', note: '', tags: [], py: null, pyFull: null, createdAt: now, updatedAt: now });
    d.patientId = id;
    d.newName = '';
  }

  async function startSession() {
    const d = S.acuDraft;
    readForm(d);
    if (!d.patientId && !d.newName) return toast('先选患者', 'warn');
    if (!d.points.length && !(await confirmSheet('还没写穴位', '不写穴位也可以开始，拔针时就没法逐个核对了。要先加穴位吗？', '直接开始'))) return;
    if (d.bed && onBed(d.bed)) return toast(`${d.bed}号床已经有人了`, 'warn');
    if (d.patientId && activeList().some((a) => a.patientId === d.patientId) && !(await confirmSheet('这位患者正在留针', '还要再开一个床位吗？', '继续'))) return;
    const now = new Date();
    const iso = now.toISOString();
    const c = cfg();
    const id = Acu.uid();
    const ok = await commit((db) => {
      if (!Array.isArray(db.acu)) db.acu = [];
      createPatientIfNeeded(db, d, iso);
      db.acu.push({ id, patientId: d.patientId, date: Acu.todayStr(now), bed: d.bed || null, points: d.points.slice(), symptoms: d.symptoms || '', feeling: '', note: '', status: 'active', startAt: iso, endAt: null, durationMin: c.duration, intervalMin: c.interval, manip: [], createdAt: iso, updatedAt: iso });
    });
    if (!ok) return;
    S.acuDraft = null;
    S.dirty = false;
    await maybeAskPerms();
    await reconcile();
    toast(`开始留针，${hhmm(new Date(now.getTime() + c.duration * 60000).toISOString())} 拔针`);
    back('/acu');
  }

  async function saveForm({ auto = false } = {}) {
    const d = S.acuDraft;
    if (!d || !d.id || !$('#aform')) return true;
    readForm(d);
    const now = new Date().toISOString();
    const ok = await commit((db) => {
      const x = db.acu.find((q) => q.id === d.id);
      if (!x) throw new Error('这条记录已被删除');
      Object.assign(x, { points: d.points.slice(), symptoms: d.symptoms || '', feeling: d.feeling || '', date: d.date || x.date, bed: d.bed, startAt: d.startAt || x.startAt, endAt: x.status === 'active' ? null : d.endAt || x.endAt, updatedAt: now });
    });
    if (!ok) return false;
    S.dirty = false;
    await reconcile();
    toast(auto ? '已自动保存' : '已保存');
    return true;
  }

  let askedPerm = false;
  async function maybeAskPerms() {
    if (askedPerm) return;
    askedPerm = true;
    const p = await permState();
    if (p.app ? p.notify !== 'granted' || p.exact !== 'granted' : p.notify === 'default') await askPerms();
  }

  // ============================================================
  // 行针、拔针
  // ============================================================
  async function recordManip(id) {
    const a = getAcu(id);
    if (!Acu.isActive(a)) return;
    const now = new Date().toISOString();
    const ok = await commit((db) => {
      const x = db.acu.find((q) => q.id === id);
      x.manip = (x.manip || []).concat(now);
      x.updatedAt = now;
    });
    if (ok) toast(`已记录：${nameOf(a)} 第 ${(a.manip || []).length + 1} 次行针`);
    refresh();
  }

  // 拔针：列出所有穴位，一个一个点过才能确认
  async function removeFlow(id) {
    const a = getAcu(id);
    if (!Acu.isActive(a)) return;
    const pts = (a.points || []).filter(Acu.needsRemoval);
    const skip = (a.points || []).filter((p) => !Acu.needsRemoval(p));
    const body = document.createElement('div');
    body.innerHTML = `${pts.length ? `<p class="sheet-sub">拔一个点一个，全部点完才能确认（共 ${pts.length} 处）${skip.length ? `<br>刺血、灸的不用拔：${esc(skip.join('、'))}` : ''}</p>
        <div class="rmv">${pts.map((p, i) => `<button type="button" class="rp" data-i="${i}"><span>${esc(p)}</span>${Acu.needleCount(p) > 1 ? '<small>两侧</small>' : ''}</button>`).join('')}</div>
        <p class="rmv-c" id="rmvC">已核对 0 / ${pts.length}</p>`
      : '<p>这次没有写穴位，无法逐个核对。请自己确认针都拔干净了。</p>'}
      <label class="field" style="margin-top:10px"><span>针后感觉（选填）</span><textarea id="rFeel" rows="2" style="min-height:60px">${esc(a.feeling || '')}</textarea></label>`;
    const done = new Set();
    const v = await sheet({
      title: `拔针：${a.bed ? a.bed + '号床 ' : ''}${nameOf(a)}`,
      body,
      buttons: [
        { text: '取消', value: null },
        { text: '确认已全部拔针', value: 'ok', primary: true },
      ],
      onOpen: (box) => {
        const okBtn = $$('.btns .btn', box)[1];
        const upd = () => {
          okBtn.disabled = done.size < pts.length;
          okBtn.textContent = done.size < pts.length ? `还有 ${pts.length - done.size} 个没核对` : '确认已全部拔针';
          const c = $('#rmvC', box);
          if (c) c.textContent = `已核对 ${done.size} / ${pts.length}`;
        };
        box.addEventListener('click', (e) => {
          const b = e.target.closest('.rp');
          if (!b) return;
          const i = Number(b.dataset.i);
          if (done.has(i)) done.delete(i);
          else done.add(i);
          b.classList.toggle('ok', done.has(i));
          upd();
        });
        upd();
      },
    });
    if (v !== 'ok') return;
    const feel = ($('#rFeel', body) || {}).value || '';
    const now = new Date().toISOString();
    const ok = await commit((db) => {
      const x = db.acu.find((q) => q.id === id);
      Object.assign(x, { status: 'done', endAt: now, feeling: feel.trim(), updatedAt: now });
    });
    if (!ok) return;
    await reconcile();
    toast(`${nameOf(a)} 已拔针`, 'ok');
    if (S.view === 'acuedit') {
      S.acuDraft = null;
      S.dirty = false;
      back('/acu');
    } else refresh();
  }

  async function bedSheet(id) {
    const a = getAcu(id);
    if (!a) return;
    const st = Acu.statusOf(a, cfg());
    const v = await sheet({
      title: `${a.bed}号床 · ${nameOf(a)}`,
      body: `<div class="kv"><b>开始</b><span>${hhmm(a.startAt)}（已留 ${mins(st.elapsed)} 分）</span></div>
        <div class="kv"><b>拔针</b><span>${hhmm(new Date(st.removeAt).toISOString())}${st.due ? ' <b class="red">已到时间</b>' : ''}</span></div>
        <div class="kv"><b>穴位</b><span>${esc(ptsLine(a.points)) || '—'}</span></div>
        ${a.symptoms ? `<div class="kv"><b>症状</b><span>${esc(a.symptoms)}</span></div>` : ''}
        <div class="kv"><b>行针</b><span>${(a.manip || []).length ? a.manip.map((t) => hhmm(t)).join('、') : '还没有'}</span></div>`,
      buttons: [
        { text: '修改', value: 'edit' },
        { text: '记录行针', value: 'manip' },
        { text: '拔针', value: 'remove', primary: true },
      ],
    });
    if (v === 'edit') go('/acu/e/' + encodeURIComponent(id));
    else if (v === 'manip') recordManip(id);
    else if (v === 'remove') removeFlow(id);
  }

  // ============================================================
  // 全部记录
  // ============================================================
  function viewAll() {
    S.view = 'acuall';
    const q = S.acuQ || '';
    const list = acuList()
      .filter((a) => {
        if (!q) return true;
        const p = getPatient(a.patientId);
        return (p && Logic.matchPatient(p, q)) || (a.points || []).some((x) => x.includes(q)) || (a.symptoms || '').includes(q);
      })
      .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.startAt || '').localeCompare(a.startAt || ''));
    const byDate = new Map();
    for (const a of list) {
      if (!byDate.has(a.date)) byDate.set(a.date, []);
      byDate.get(a.date).push(a);
    }
    const body = list.length ? [...byDate].map(([d, arr]) => `<div class="count">${esc(d || '没有日期')}（${arr.length} 人）</div><div class="list">${arr.map(rowHtml).join('')}</div>`).join('') : `<div class="empty">${q ? '没有找到' : '还没有扎针记录'}</div>`;
    page({
      barHtml: bar(backBtn, `扎针记录<small>${acuList().length} 条</small>`),
      html: `<div class="search"><input id="aq" type="search" placeholder="姓名 / 拼音 / 穴位 / 症状" value="${esc(q)}" autocomplete="off" autocapitalize="off" spellcheck="false" /></div><div id="alist">${body}</div>`,
    });
    $('#aq').addEventListener('input', (e) => {
      S.acuQ = e.target.value;
      const pos = e.target.selectionStart;
      viewAll();
      const n = $('#aq');
      n.focus();
      n.setSelectionRange(pos, pos);
    });
  }

  // ============================================================
  // 记事本文字导入
  // ============================================================
  function viewImport() {
    S.view = 'acuimport';
    const st = S.acuImp || (S.acuImp = { text: '', items: null });
    page({
      barHtml: bar(backBtn, '记事本文字导入'),
      html: st.items ? importPreviewHtml(st) : `<div class="card"><h3>把记事本里的扎针记录粘贴到下面</h3>
          <p class="hint">可以一次粘贴很多条。每条以日期开头最好（如「11月8日」「2026.11.8」），没写日期的沿用上一条的日期。<br>能认出：日期、已有患者的名字、穴位（含左右双），其余的当作症状；「针后…」后面的当作针后感觉。识别后可以逐条检查修改再导入。</p>
          <textarea id="impText" rows="12" style="width:100%;min-height:240px;padding:10px;border:1px solid var(--line-2);border-radius:8px;font-size:15px" placeholder="例如：\n11月8日 张三 失眠 百会 四神聪 神门（双）三阴交 针后睡意明显\n11月9日 李四 腰痛 肾俞双侧 委中">${esc(st.text)}</textarea>
          <button class="btn primary block" data-act="acu-parse">识别</button></div>`,
    });
  }
  function importPreviewHtml(st) {
    const items = st.items;
    const nOk = items.filter((x) => x.on).length;
    return `<div class="count">识别出 ${items.length} 条，勾选的会导入。不对的地方直接改。</div>
      ${items
        .map(
          (x, i) => `<div class="card imp${x.on ? '' : ' off'}" data-i="${i}">
        <label class="impchk"><input type="checkbox" data-k="on" ${x.on ? 'checked' : ''}/> 导入这条${x.dup ? ' <span class="tag red">可能重复</span>' : ''}</label>
        <div class="two"><label class="field"><span>日期${x.noDate ? ' <em class="newp">原文没写日期</em>' : ''}</span><input type="date" data-k="date" value="${esc(x.date || '')}" /></label>
        <label class="field"><span>患者${x.patientId ? '' : ` <em class="newp">新建${esc([x.gender, x.age != null ? x.age + '岁' : ''].filter(Boolean).join(' '))}</em>`}</span><input type="text" data-k="name" value="${esc(x.name || '')}" list="impNames" /></label></div>
        <label class="field"><span>穴位（${x.points.length}）</span><input type="text" data-k="points" value="${esc(x.points.join('、'))}" /></label>
        <label class="field"><span>症状</span><input type="text" data-k="symptoms" value="${esc(x.symptoms || '')}" /></label>
        <label class="field"><span>针后感觉</span><input type="text" data-k="feeling" value="${esc(x.feeling || '')}" /></label>
        <details><summary>原文</summary><pre>${esc(x.raw)}</pre></details>
      </div>`
        )
        .join('')}
      <datalist id="impNames">${patientsActive()
        .map((p) => `<option value="${esc(p.name)}"></option>`)
        .join('')}</datalist>
      <div style="height:80px"></div>`;
  }
  function bindImport() {
    const st = S.acuImp;
    if (!st || !st.items) {
      const t = $('#impText');
      if (t) t.addEventListener('input', (e) => (st.text = e.target.value));
      return;
    }
    const sb = document.createElement('div');
    sb.className = 'savebar';
    sb.innerHTML = `<button class="gray" data-act="acu-reparse" type="button">重新粘贴</button><button data-act="acu-doimport" type="button" id="impGo">导入 ${st.items.filter((x) => x.on).length} 条</button>`;
    document.body.appendChild(sb);
    $('#view').addEventListener('input', (e) => {
      const card = e.target.closest('.imp');
      if (!card) return;
      const x = st.items[Number(card.dataset.i)];
      const k = e.target.dataset.k;
      if (k === 'on') {
        x.on = e.target.checked;
        card.classList.toggle('off', !x.on);
        $('#impGo').textContent = `导入 ${st.items.filter((y) => y.on).length} 条`;
      } else if (k === 'points') x.points = Acu.splitPoints(e.target.value);
      else if (k === 'name') {
        x.name = e.target.value.trim();
        const p = patientsActive().find((q) => q.name === x.name);
        x.patientId = p ? p.id : null;
        const em = $('.newp', card);
        if (em) em.hidden = !!x.patientId;
      } else x[k] = e.target.value.trim();
    });
  }
  function parseNow() {
    const st = S.acuImp;
    const t = ($('#impText') || {}).value || st.text;
    st.text = t;
    useCustom();
    const items = Acu.parseImport(t, { patients: patientsActive(), today: Acu.todayStr(), custom: customPoints(), groups: groups() });
    if (!items.length) return toast('没有识别出内容', 'warn');
    const have = new Set(acuList().map((a) => a.patientId + '|' + a.date + '|' + (a.points || []).map(Acu.pointBase).sort().join(',')));
    for (const x of items) {
      x.dup = !!(x.patientId && have.has(x.patientId + '|' + x.date + '|' + x.points.map(Acu.pointBase).sort().join(',')));
      x.on = !x.dup && !!(x.name || x.patientId);
    }
    st.items = items;
    viewImport();
    bindImport();
    window.scrollTo(0, 0);
  }
  async function doImport() {
    const st = S.acuImp;
    const items = st.items.filter((x) => x.on);
    const bad = items.find((x) => !(x.patientId || x.name));
    if (bad) return toast('有一条没有患者，请补上或取消勾选', 'warn');
    const nd = items.filter((x) => !x.date).length;
    if (nd && !(await confirmSheet('有记录没有日期', `有 ${nd} 条没有日期，会记成「日期不详」，以后可以再补。继续吗？`, '继续'))) return;
    const newNames = [...new Set(items.filter((x) => !x.patientId).map((x) => x.name))];
    const infoOf = (name) => items.find((x) => !x.patientId && x.name === name && (x.gender || x.age != null)) || {};
    if (newNames.length && !(await confirmSheet('会新建患者', `下面这些名字在患者列表里没有，会新建档案：\n${newNames.join('、')}`, '继续导入'))) return;
    const now = new Date().toISOString();
    const ok = await commit((db) => {
      if (!Array.isArray(db.acu)) db.acu = [];
      const made = new Map();
      for (const x of items) {
        let pid = x.patientId;
        if (!pid) {
          pid = made.get(x.name);
          if (!pid) {
            pid = Logic.uid('p');
            made.set(x.name, pid);
            const inf = infoOf(x.name);
            const by = inf.age != null ? String(+String(inf.date || Acu.todayStr()).slice(0, 4) - inf.age) : '';
            db.patients.push({ id: pid, name: x.name, gender: inf.gender || '', birth: '', birthYear: by, phone: '', allergy: '', history: '', note: '', tags: [], py: null, pyFull: null, createdAt: now, updatedAt: now });
          }
        }
        db.acu.push({ id: Acu.uid(), patientId: pid, date: x.date || null, bed: null, points: x.points.slice(), symptoms: x.symptoms || '', feeling: x.feeling || '', note: '', status: 'done', startAt: null, endAt: null, manip: [], imported: true, createdAt: now, updatedAt: now });
      }
    });
    if (!ok) return;
    toast(`已导入 ${items.length} 条`, 'ok');
    S.acuImp = null;
    $('.savebar') && $('.savebar').remove();
    history.replaceState({ d: S.depth }, '', '#/acu/all');
    render();
  }

  // ============================================================
  // 患者页里的「扎针记录」、设置页里的「针灸」
  // ============================================================
  function patientSectionHtml(pid) {
    const list = acuOf(pid);
    return `<div class="count" style="display:flex;align-items:center">扎针记录（${list.length} 次）<button class="lbtn right" data-act="acu-startp" data-id="${esc(pid)}">＋ 扎针</button></div>${list.length ? `<div class="list">${list.slice(0, 30).map(rowHtml).join('')}</div>` : ''}`;
  }

  function settingsCardHtml() {
    const c = cfg();
    return `<div class="card"><h3>针灸</h3>
      <div class="kv"><b>床位</b><span class="stepper"><button type="button" class="lbtn" data-act="acu-beds" data-d="-1">－</button><b>${c.beds} 张</b><button type="button" class="lbtn" data-act="acu-beds" data-d="1">＋</button></span></div>
      <div class="kv"><b>留针</b><span class="stepper"><button type="button" class="lbtn" data-act="acu-dur" data-d="-5">－</button><b>${c.duration} 分钟</b><button type="button" class="lbtn" data-act="acu-dur" data-d="5">＋</button></span></div>
      <div class="kv"><b>行针间隔</b><span class="stepper"><button type="button" class="lbtn" data-act="acu-int" data-d="-5">－</button><b>${c.interval ? c.interval + ' 分钟' : '不提醒'}</b><button type="button" class="lbtn" data-act="acu-int" data-d="5">＋</button></span></div>
      <div class="kv"><b>闹钟</b><span id="permBox">检查中…</span></div>
      <label class="field" style="margin-top:8px"><span>穴组（一行一个：名称：穴位、穴位…）</span><textarea id="grpText" rows="3" style="width:100%;padding:8px;border:1px solid var(--line-2);border-radius:8px;font-size:15px">${esc(groupsText())}</textarea></label>
      <button class="btn block" data-act="acu-groups">保存穴组</button>
      <label class="field" style="margin-top:8px"><span>自定义穴位（书上没有的穴位、常刺血的部位，一行一个。别名：间谷=间骨；平时刺血的：脚刺痛处（刺血））</span><textarea id="custText" rows="4" style="width:100%;padding:8px;border:1px solid var(--line-2);border-radius:8px;font-size:15px">${esc(Acu.customText(useCustom()))}</textarea></label>
      <button class="btn block" data-act="acu-custom">保存自定义穴位</button>
      <div class="two"><button class="btn" data-act="acu-test" data-k="manip">试听行针铃</button><button class="btn" data-act="acu-test" data-k="remove">试听拔针铃</button></div>
      <p class="hint">床位排布：右上 1、右下 2、左上 3、左下 4，加的床位继续往左排。改了留针时长只影响之后开始的人。</p>
    </div>`;
  }
  function groupsText() {
    const g = groups();
    return Object.keys(g)
      .map((k) => `${k}：${g[k].join('、')}`)
      .join('\n');
  }
  async function saveGroups() {
    const t = ($('#grpText') || {}).value || '';
    const out = {};
    for (const line of t.split('\n')) {
      const m = /^\s*([^：:]+?)\s*[：:]\s*(.+)$/.exec(line);
      if (!m) continue;
      const pts = Acu.splitPoints(m[2]);
      if (pts.length) out[m[1]] = pts;
    }
    // 默认的穴组被删掉了：记成空，表示不要
    for (const k of Object.keys(Acu.DEFAULT_GROUPS)) if (!out[k]) out[k] = [];
    const ok = await commit((db) => {
      db.settings = db.settings || {};
      db.settings.acu = Object.assign({}, db.settings.acu, { groups: out });
    });
    if (ok) toast('穴组已保存');
  }

  // 存好自定义穴位，并把所有记录里的别名 / 写错的名字换成正式名称。返回改了几条记录（失败 -1）
  // 拼音首字母在电脑上补（手机上没有拼音库），补好后同步回来
  async function saveCustom(list) {
    let n = 0;
    const ok = await commit((db) => {
      db.settings = db.settings || {};
      db.settings.acu = Object.assign({}, db.settings.acu, { custom: list });
      Acu.setCustom(db.settings, db.acu);
      const now = new Date().toISOString();
      for (const a of db.acu || []) {
        if (a.deletedAt || !Array.isArray(a.points)) continue;
        const pts = a.points.map(Acu.canonPoint);
        if (pts.join('|') !== a.points.join('|')) {
          a.points = pts;
          a.updatedAt = now;
          n++;
        }
      }
    });
    useCustom();
    return ok ? n : -1;
  }
  async function saveCustomText() {
    const cur = useCustom();
    const n = await saveCustom(Acu.parseCustomText(($('#custText') || {}).value || '', cur));
    if (n < 0) return;
    toast(n ? `已保存，${n} 条记录里的别名改成了正式名称` : '自定义穴位已保存');
    const t = $('#custText');
    if (t) t.value = Acu.customText(useCustom());
  }

  async function fillPerm() {
    const box = $('#permBox');
    if (!box) return;
    const p = await permState();
    if (!p.app) {
      box.innerHTML = `网页版（锁屏后可能不响）<br><a href="https://mikaelsteven.github.io/yian-mobile/yian.apk" target="_blank" rel="noopener">下载安卓 App</a>`;
      return;
    }
    const ok = p.notify === 'granted' && p.exact === 'granted';
    box.innerHTML = ok ? '<span style="color:var(--green)">已允许，锁屏也会响</span>' : `<span style="color:var(--red)">${p.notify !== 'granted' ? '没有通知权限' : '没有允许「闹钟和提醒」'}</span> <button type="button" class="lbtn" data-act="acu-perm">去允许</button>`;
  }
  async function changeSetting(key, delta) {
    const c = cfg();
    let v = c[key] + delta;
    if (key === 'beds') {
      v = Math.max(1, Math.min(12, v));
      if (v < c.beds && onBed(c.beds)) return toast(`${c.beds}号床有人在留针，先拔针再减少床位`, 'warn');
    } else if (key === 'duration') v = Math.max(10, Math.min(180, v));
    else v = Math.max(0, Math.min(60, v));
    await commit((db) => {
      db.settings = db.settings || {};
      db.settings.acu = Object.assign({}, db.settings.acu, { [key]: v });
    });
    render({ keep: true });
  }

  // ============================================================
  // 路由、事件
  // ============================================================
  function route(r) {
    if (r.name !== 'acu') return false;
    if (r.a === 'new') viewForm(null, r.b);
    else if (r.a === 'e' && getAcu(r.b)) viewForm(r.b);
    else if (r.a === 'all') viewAll();
    else if (r.a === 'import') {
      viewImport();
      bindImport();
    } else viewHome();
    if (S.view === 'settings') fillPerm();
    return true;
  }

  const acts = {
    'tab-acu': () => {
      try {
        localStorage.setItem('yian.tab', 'acu');
      } catch (e) {
        /* 忽略 */
      }
      history.replaceState({ d: 0 }, '', '#/acu');
      S.depth = 0;
      render();
    },
    'acu-start': (el) => go('/acu/new/' + el.dataset.bed),
    'acu-startp': (el) => {
      S.acuPresetPatient = el.dataset.id;
      S.acuDraft = null;
      const free = Acu.bedLayout(cfg().beds).beds.find((b) => !onBed(b.bed));
      go('/acu/new/' + (free ? free.bed : ''));
    },
    'acu-bed': (el, e) => {
      if (e && e.target.closest('.mini')) return;
      bedSheet(el.dataset.id);
    },
    'acu-manip': (el) => recordManip(el.dataset.id),
    'acu-remove': (el) => removeFlow(el.dataset.id),
    'acu-open': (el) => go('/acu/e/' + encodeURIComponent(el.dataset.id)),
    'acu-all': () => go('/acu/all'),
    'acu-import': () => {
      S.acuImp = null;
      go('/acu/import');
    },
    'acu-parse': () => parseNow(),
    'acu-reparse': () => {
      S.acuImp.items = null;
      $('.savebar') && $('.savebar').remove();
      viewImport();
      bindImport();
    },
    'acu-doimport': () => doImport(),
    'acu-pick': (el) => {
      S.acuDraft.patientId = el.dataset.id;
      readForm(S.acuDraft);
      viewForm(null, S.acuDraft.bed);
    },
    'acu-newp': async () => {
      const d = S.acuDraft;
      const name = (d.q || '').trim();
      const g = await sheet({ title: `新患者「${name}」`, body: '<p>性别（之后可以在档案里补全其他信息）</p>', buttons: [{ text: '男', value: '男' }, { text: '女', value: '女' }, { text: '先不填', value: '' }] });
      if (g === null) return;
      d.newName = name;
      d.newGender = g;
      readForm(d);
      viewForm(null, d.bed);
    },
    'acu-repick': () => {
      const d = S.acuDraft;
      readForm(d);
      d.patientId = null;
      d.newName = '';
      viewForm(null, d.bed);
      const pq = $('#pq');
      if (pq) pq.focus();
    },
    'acu-last': () => {
      const d = S.acuDraft;
      readForm(d);
      const last = acuOf(d.patientId).find((a) => a.id !== d.id && (a.points || []).length);
      if (!last) return;
      for (const p of last.points) if (!d.points.includes(p)) d.points.push(p);
      if (!d.symptoms && last.symptoms) d.symptoms = last.symptoms;
      if (d.id) S.dirty = true;
      viewForm(d.id, d.bed);
    },
    'acu-pt': () => {},
    'acu-go': () => startSession(),
    'acu-save': async () => {
      if (await saveForm()) {
        S.acuDraft = null;
        back('/acu');
      }
    },
    'acu-del': async () => {
      const d = S.acuDraft;
      if (!(await confirmSheet('删除这条扎针记录', Acu.isActive(getAcu(d.id)) ? '这个人还在留针，删除后闹钟也会取消。确定删除吗？' : '确定删除吗？', '删除', true))) return;
      const now = new Date().toISOString();
      const ok = await commit((db) => {
        const x = db.acu.find((q) => q.id === d.id);
        if (x) Object.assign(x, { deletedAt: now, updatedAt: now });
      });
      if (!ok) return;
      S.acuDraft = null;
      S.dirty = false;
      await reconcile();
      back('/acu');
    },
    'acu-beds': (el) => changeSetting('beds', Number(el.dataset.d)),
    'acu-dur': (el) => changeSetting('duration', Number(el.dataset.d)),
    'acu-int': (el) => changeSetting('interval', Number(el.dataset.d)),
    'acu-test': async (el) => {
      await askPerms();
      await testAlarm(el.dataset.k);
      fillPerm();
    },
    'acu-groups': () => saveGroups(),
    'acu-custom': () => saveCustomText(),
    'acu-perm': async () => {
      await askPerms();
      fillPerm();
    },
  };

  // 点通知打开 App 时：直接到针灸页
  if (isApp()) {
    try {
      Native.LN.addListener('localNotificationActionPerformed', () => {
        history.replaceState({ d: 0 }, '', '#/acu');
        S.depth = 0;
        render();
      });
    } catch (e) {
      /* 忽略 */
    }
  }

  return {
    route,
    acts,
    refresh,
    reconcile,
    fillPerm,
    patientSectionHtml,
    settingsCardHtml,
    isForm: (v) => v === 'acuedit',
    saveForm,
    activeCount: () => activeList().length,
    isApp,
    _t: { wanted, permState },
  };
};
