window.ClinicTools = function (api) {
  'use strict';
  const { S, $, $$, esc, clone, Logic, page, bar, backBtn, chipHtml, go, getPatient, getVisit, patientsActive, visitsOf, fmtWhen, sheet, confirmSheet, toast, commit, defDoses, defUsage, collectDraft, setHerbs, fillHerbList, reconcile } = api;
  const Acu = window.Acu;
  const titles = { compare: '处方对比', search: '检索', stats: '统计', templates: '协定方', trash: '回收站', similar: '相似医案' };
  const icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>';
  const id = encodeURIComponent;
  const empty = (text) => `<div class="empty">${text}</div>`;
  const opt = (value, label, selected) => `<option value="${esc(value)}" ${value === selected ? 'selected' : ''}>${esc(label)}</option>`;
  const field = (label, html) => `<label class="field"><span>${label}</span>${html}</label>`;
  const dateFields = (key, { from, to }) => `<div class="two">${field('从', `<input id="${key}From" type="date" value="${esc(from)}">`)}${field('到', `<input id="${key}To" type="date" value="${esc(to)}">`)}</div>`;
  function show(view, html, home = false) {
    S.view = view;
    page({ barHtml: bar(home ? '' : backBtn, titles[view] || '工具', chipHtml()), html: `<div class="clinic-tools">${html}</div>`, tabs: home ? 'tools' : '' });
  }
  function home() {
    show('tools', `<div class="list">${Object.entries(titles).map(([route, title]) => `<button class="vrow tool-link" data-act="tool-open" data-route="${route}"><b>${title}</b><span aria-hidden="true">›</span></button>`).join('')}</div>`, true);
  }

  function highlight(text, term) {
    const escaped = esc(text);
    if (!term) return escaped;
    const literal = esc(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return escaped.replace(new RegExp(literal, 'gi'), (m) => `<mark>${m}</mark>`);
  }
  function resultRow({ visit, acu, patient, hits = [], reasons = [] }, term = '') {
    const rx = visit?.rx;
    const sub = visit && [visit.pattern || visit.tcmDx, rx?.name].filter(Boolean).join(' · ');
    return `<button class="vrow" data-act="${acu ? 'acu-open' : 'open-v'}" data-id="${esc((acu || visit).id)}">
      <div class="h"><b>${esc(patient.name)}</b><span>${esc((acu || visit).date || '日期不详')}</span>${acu ? '<span class="tag">针灸</span>' : visit.star ? '<span class="tag">已收藏</span>' : ''}</div>
      ${sub ? `<div class="c">${esc(sub)}</div>` : ''}
      ${hits.map((h) => `<div class="r"><span>${esc(h.label)} </span>${highlight(h.text, term)}</div>`).join('')}
      ${reasons.length ? `<div class="r">${esc(reasons.join(' · '))}</div><div class="c">${esc(visit.chief || '')}</div><div class="r">${esc(Logic.rxLine(rx))}</div>` : ''}
    </button>`;
  }

  const blankSearch = () => ({ q: '', field: 'all', from: '', to: '', star: false });
  let search = blankSearch();
  const searchFields = { ...Logic.SEARCH_FIELDS, point: '穴位' };
  function searchAcu({ q, from, to, star }) {
    if (!q || star) return [];
    const normalize = (point) => Acu.buildLabel(Acu.partsOf(point)).toLowerCase();
    const term = q.toLowerCase();
    const needle = normalize(term);
    const patients = new Map(patientsActive().map((p) => [p.id, p]));
    const results = [];
    for (const acu of S.db.acu || []) {
      const patient = patients.get(acu.patientId);
      if (!patient || acu.deletedAt || (from && (!acu.date || acu.date < from)) || (to && (!acu.date || acu.date > to))) continue;
      const hits = (acu.points || []).filter((p) => String(p).toLowerCase().includes(term) || (needle && normalize(p).includes(needle))).map((text) => ({ label: '穴位', text }));
      if (hits.length) results.push({ acu, patient, hits });
    }
    return results;
  }
  function searchResults() {
    const box = $('#toolSearchResults');
    if (!box) return;
    const q = search.q.trim();
    if (!q && !search.from && !search.to && !search.star) {
      box.innerHTML = empty('输入关键词，或选择日期范围');
      return;
    }
    const visits = search.field === 'point' ? [] : Logic.searchVisits(S.db, search);
    const acu = search.field === 'point' || search.field === 'all' ? searchAcu({ ...search, q }) : [];
    const results = visits.concat(acu).sort((a, b) => ((b.visit || b.acu).date || '').localeCompare((a.visit || a.acu).date || ''));
    const count = new Set(results.map((r) => r.patient.id)).size;
    box.innerHTML = results.length ? `<div class="count">${results.length} 条记录 · ${count} 位患者</div><div class="list">${results.map((r) => resultRow(r, q)).join('')}</div>` : empty('没有找到记录');
  }
  function viewSearch() {
    show('search', `<div class="card tool-filters">
      ${field('关键词', `<input id="toolSearchQ" type="search" value="${esc(search.q)}" placeholder="药名、方名、证型、症状或穴位" autocomplete="off">`)}
      ${field('范围', `<select id="toolSearchField">${Object.entries(searchFields).map(([key, label]) => opt(key, label, search.field)).join('')}</select>`)}
      ${dateFields('toolSearch', search)}
      <div class="tool-actions"><label><input id="toolSearchStar" type="checkbox" ${search.star ? 'checked' : ''}> 只看收藏</label><button class="lbtn" data-act="search-clear">清空</button></div>
    </div><div id="toolSearchResults"></div>`);
    const run = () => {
      search = { q: $('#toolSearchQ').value, field: $('#toolSearchField').value, from: $('#toolSearchFrom').value, to: $('#toolSearchTo').value, star: $('#toolSearchStar').checked };
      searchResults();
    };
    $('#toolSearchQ').addEventListener('input', run);
    for (const key of ['Field', 'From', 'To', 'Star']) $(`#toolSearch${key}`).addEventListener('change', run);
    searchResults();
  }

  function choosePatient(view, minVisits) {
    const counts = new Map();
    for (const v of S.db.visits) if (!v.deletedAt) counts.set(v.patientId, (counts.get(v.patientId) || 0) + 1);
    const patients = patientsActive().filter((p) => counts.get(p.id) >= minVisits);
    show(view, `<div class="search"><input id="toolPatientQ" type="search" placeholder="查找患者" aria-label="查找患者"></div><div id="toolPatients"></div>`);
    const update = () => {
      const list = patients.filter((p) => Logic.matchPatient(p, $('#toolPatientQ').value));
      $('#toolPatients').innerHTML = list.length ? `<div class="list">${list.map((p) => `<button class="vrow tool-link" data-act="tool-patient" data-route="${view}" data-pid="${esc(p.id)}"><b>${esc(p.name)}</b><span>${counts.get(p.id)} 次就诊</span></button>`).join('')}</div>` : empty('没有符合条件的患者');
    };
    $('#toolPatientQ').addEventListener('input', update);
    update();
  }
  const dose = (h) => h ? [Logic.formatDose(h), h.method].filter(Boolean).join(' · ') : '—';
  const visitOptions = (visits, selected) => visits.map((v, i) => opt(v.id, `${v.date || '日期不详'} ${Logic.shortVisitLabel(i)}`, selected)).join('');
  function viewCompare(pid, vid) {
    if (!pid) return choosePatient('compare', 2);
    const p = getPatient(pid);
    if (!p) return show('compare', empty('没有找到患者'));
    const visits = visitsOf(pid);
    if (visits.length < 2) return show('compare', `<div class="card"><h3>${esc(p.name)}</h3><p class="hint">已有 ${visits.length} 次就诊记录，再记录 ${2 - visits.length} 次即可对比。</p></div>`);
    const selected = visits.find((v) => v.id === vid) || visits.at(-1);
    const first = visits[visits.indexOf(selected) - 1] || visits[1];
    show('compare', `<div class="card"><h3>${esc(p.name)}</h3>
      <div class="tool-actions"><button class="lbtn on" id="toolPair" aria-pressed="true">两次对比</button><button class="lbtn" id="toolEvolution" aria-pressed="false">处方演变</button></div>
      <div id="toolCompareSelection" class="two">${field('基准就诊', `<select id="toolCompareA">${visitOptions(visits, first.id)}</select>`)}${field('对比就诊', `<select id="toolCompareB">${visitOptions(visits, selected.id)}</select>`)}</div>
    </div><div id="toolCompareResult"></div>`);
    const update = () => {
      const box = $('#toolCompareResult');
      if ($('#toolEvolution').getAttribute('aria-pressed') === 'true') {
        const evolution = Logic.buildEvolution(visits);
        box.innerHTML = `<div class="card tool-scroll"><table class="tool-table"><thead><tr><th>药名</th>${visits.map((v) => `<th><button class="lbtn" data-act="open-v" data-id="${esc(v.id)}">${esc(v.date || '日期不详')}</button></th>`).join('')}</tr></thead><tbody>${evolution.rows.map((row) => `<tr><th>${esc(row.name)}</th>${row.cells.map((c) => `<td class="${c.status}">${esc(c.herb ? dose(c.herb) : c.status === 'removed' ? '去掉' : '—')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
        return;
      }
      const a = getVisit($('#toolCompareA').value);
      const b = getVisit($('#toolCompareB').value);
      if (!a || !b || a.id === b.id) { box.innerHTML = empty('请选择两次不同的就诊'); return; }
      const diff = Logic.diffRx(a.rx?.herbs, b.rx?.herbs);
      const lines = (rows, key) => rows.map((x) => `<tr class="${x.status}"><th>${esc(x.herb.name)}</th><td>${esc(dose(x.prev || (key === 'removed' ? x.herb : null)))}</td><td>${esc(dose(key === 'removed' ? null : x.herb))}</td><td>${({ added: '新增', removed: '去掉', changed: '调整', same: '不变' })[x.status]}</td></tr>`).join('');
      box.innerHTML = `<div class="card"><div class="two tool-rx-pair">${[a, b].map((v) => `<div><b>${esc(v.rx?.name || '未写方名')}</b><div class="r">${esc(v.chief || '')}</div><div class="r">${esc([v.tcmDx, v.pattern, v.rx?.doses && `${v.rx.doses} 剂`, v.rx?.usage].filter(Boolean).join(' · '))}</div><button class="lbtn" data-act="open-v" data-id="${esc(v.id)}">查看医案</button></div>`).join('')}</div>
        <div class="tool-scroll"><table class="tool-table"><thead><tr><th>药名</th><th>基准</th><th>对比</th><th>变化</th></tr></thead><tbody>${lines(diff.curItems)}${lines(diff.removed, 'removed')}</tbody></table></div></div>`;
    };
    for (const button of [$('#toolPair'), $('#toolEvolution')]) button.addEventListener('click', () => {
      for (const b of [$('#toolPair'), $('#toolEvolution')]) {
        b.classList.toggle('on', b === button);
        b.setAttribute('aria-pressed', b === button);
      }
      $('#toolCompareSelection').hidden = button.id === 'toolEvolution';
      update();
    });
    $('#toolCompareSelection').addEventListener('change', update);
    update();
  }

  function viewSimilar(pid, vid) {
    if (!pid) return choosePatient('similar', 1);
    const p = getPatient(pid);
    const visits = p ? visitsOf(pid) : [];
    if (!visits.length) return show('similar', empty('没有可比较的医案'));
    const selected = visits.find((v) => v.id === vid) || visits.at(-1);
    show('similar', `<div class="card"><h3>${esc(p.name)}</h3>${field('选择医案', `<select id="toolSimilarVisit">${visitOptions(visits, selected.id)}</select>`)}</div><div id="toolSimilarResults"></div>`);
    const update = () => {
      const visit = getVisit($('#toolSimilarVisit').value);
      const matches = visit ? Logic.similarVisits(S.db, visit) : [];
      $('#toolSimilarResults').innerHTML = matches.length ? `<div class="list">${matches.map((r) => resultRow(r)).join('')}</div>` : empty('没有找到相似医案');
    };
    $('#toolSimilarVisit').addEventListener('change', update);
    update();
  }

  const ranges = { '30d': '近30天', '90d': '近3个月', year: '今年', lastyear: '去年', all: '全部', custom: '自选日期' };
  const stats = { range: '90d', from: '', to: '' };
  function setStatsRange(key) {
    stats.range = key;
    const today = Logic.todayStr();
    const year = Number(today.slice(0, 4));
    if (key === 'all' || key === 'custom') [stats.from, stats.to] = ['', ''];
    else if (key === 'year') [stats.from, stats.to] = [`${year}-01-01`, `${year}-12-31`];
    else if (key === 'lastyear') [stats.from, stats.to] = [`${year - 1}-01-01`, `${year - 1}-12-31`];
    else [stats.from, stats.to] = [Logic.addDays(today, key === '30d' ? -29 : -89), today];
  }
  const percent = (p) => `${Math.round(p * 100)}%`;
  const statLink = (item, key) => `<button class="lbtn" data-act="stats-search" data-field="${key}" data-q="${esc(item.name)}">${esc(item.name)}</button>`;
  function statsResults() {
    const r = Logic.clinicStats(S.db, stats);
    const box = $('#toolStatsResults');
    if (!r.visits) { box.innerHTML = empty('这段时间没有医案'); return; }
    const rank = (title, entries, key) => `<div class="card"><h3>${title}</h3>${entries.slice(0, 12).map((x) => `<div class="kv">${statLink(x, key)}<b>${x.n}</b></div>`).join('') || '<p class="hint">没有记录</p>'}</div>`;
    const months = r.months.filter((m) => m.n > 0).slice(-24);
    const max = Math.max(1, ...months.map((m) => m.n));
    box.innerHTML = `<div class="card tool-metrics">${[[r.visits, '就诊人次'], [r.patients, '就诊患者'], [r.newPatients, '初诊'], [r.returnVisits, '复诊'], [r.avgHerbs || '—', '平均每方味数'], [r.avgWeight ? `${r.avgWeight}g` : '—', '平均每剂总重']].map(([n, title]) => `<div><b>${n}</b><span>${title}</span></div>`).join('')}</div>
      ${months.length ? `<div class="card"><h3>每月就诊人次</h3>${months.map((m) => `<div class="tool-month"><span>${esc(m.ym)}</span><meter min="0" max="${max}" value="${m.n}">${m.n}</meter><b>${m.n}</b></div>`).join('')}</div>` : ''}
      ${rank('常见证型', r.patterns, 'pattern')}${rank('常见诊断', r.dx, 'dx')}${rank('常用方', r.formulas, 'rxname')}
      <div class="card"><h3>常用药物 <small>${r.rxCount} 张处方 · ${r.herbs.length} 味</small></h3>
        ${r.herbs.length ? `<div class="tool-scroll"><table class="tool-table"><thead><tr><th>药名</th><th>次数</th><th>占处方</th><th>常用</th><th>平均</th><th>范围</th></tr></thead><tbody>${r.herbs.map((h) => `<tr><th>${statLink(h, 'herb')}</th><td>${h.n}</td><td>${percent(h.pct)}</td><td>${esc(h.commonDose)}</td><td>${h.avgDose == null ? '—' : `${h.avgDose}g`}</td><td>${esc(h.range)}</td></tr>`).join('')}</tbody></table></div><button class="btn block" data-act="stats-export">导出用药统计 CSV</button>` : '<p class="hint">没有处方</p>'}
      </div>`;
  }
  function viewStats() {
    if (!stats.from && !stats.to && stats.range === '90d') setStatsRange(stats.range);
    show('stats', `<div class="card tool-filters">${field('统计时间', `<select id="toolStatsRange">${Object.entries(ranges).map(([key, label]) => opt(key, label, stats.range)).join('')}</select>`)}${dateFields('toolStats', stats)}</div><div id="toolStatsResults"></div>`);
    $('#toolStatsRange').addEventListener('change', (e) => { setStatsRange(e.target.value); viewStats(); });
    for (const key of ['From', 'To']) $(`#toolStats${key}`).addEventListener('change', () => {
      Object.assign(stats, { range: 'custom', from: $('#toolStatsFrom').value, to: $('#toolStatsTo').value });
      $('#toolStatsRange').value = 'custom';
      statsResults();
    });
    statsResults();
  }
  async function exportStats() {
    const r = Logic.clinicStats(S.db, stats);
    const rows = [['药名', '用药次数', '占处方比例', '最常用剂量', '平均剂量(g)', '剂量范围'], ...r.herbs.map((h) => [h.name, h.n, percent(h.pct), h.commonDose, h.avgDose, h.range])];
    const name = `用药统计-${stats.from || '最早'}至${stats.to || '今天'}.csv`;
    const content = '\uFEFF' + Logic.toCSV(rows);
    const native = window.Capacitor?.Plugins?.ClinicExport;
    if (native) {
      try { if ((await native.saveCsv({ name, content })).saved) toast('已导出'); }
      catch (e) { toast('导出失败', 'warn'); }
    } else {
      const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }

  function templateList(q) {
    const term = q.trim().toLowerCase();
    return [...S.db.templates].filter((t) => !term || (t.name || '').toLowerCase().includes(term) || (t.herbs || []).some((h) => String(h.name || '').toLowerCase().includes(term))).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  }
  function templateRows(templates, action) {
    return templates.length ? `<div class="list">${templates.map((t) => `<button class="vrow" data-act="${action}" data-id="${esc(t.id)}"><div class="h"><b>${esc(t.name)}</b><span>${(t.herbs || []).length} 味</span></div><div class="r">${esc(Logic.rxLine(t))}</div>${t.note ? `<div class="c">${esc(t.note)}</div>` : ''}</button>`).join('')}</div>` : empty('没有找到协定方');
  }
  let templateQuery = '';
  function viewTemplates() {
    show('templates', `<div class="search tool-actions"><input id="toolTemplateQ" type="search" placeholder="方名或药名" aria-label="搜索协定方" value="${esc(templateQuery)}"><button class="btn primary" data-act="template-edit">新建</button></div><div id="toolTemplates"></div>`);
    const update = () => { $('#toolTemplates').innerHTML = templateRows(templateList(templateQuery), 'template-edit'); };
    $('#toolTemplateQ').addEventListener('input', (e) => { templateQuery = e.target.value; update(); });
    update();
  }
  const templateHerb = (h = {}) => `<div class="template-herb"><input name="herb" list="herbList" aria-label="药名" placeholder="药名" value="${esc(h.name)}"><input name="dose" aria-label="剂量" placeholder="剂量" value="${esc(Logic.doseInputText(h))}"><select name="method" aria-label="煎法">${[...new Set([...Logic.METHODS, h.method || ''])].map((m) => opt(m, m || '无煎法', h.method || '')).join('')}</select><button type="button" class="lbtn red" data-remove aria-label="移除药味">×</button></div>`;
  async function editTemplate(original, rx) {
    const t = original || { ...rx, doses: rx?.doses ?? defDoses(), usage: rx?.usage ?? defUsage() };
    fillHerbList();
    const html = `<form class="template-form">${field('方名', `<input name="formula" type="text" required value="${esc(t.name)}">`)}${field('备注', `<input name="note" type="text" value="${esc(t.note)}">`)}
      <div class="template-herbs">${(t.herbs?.length ? t.herbs : [{}]).map(templateHerb).join('')}</div>
      <button type="button" class="lbtn" data-add>＋ 添加药味</button>
      <div class="two">${field('剂数', `<input name="doses" type="text" inputmode="numeric" value="${esc(t.doses)}">`)}${field('用法', `<input name="usage" type="text" value="${esc(t.usage)}">`)}</div>
      <div class="tool-actions template-actions">${original ? '<button type="button" class="lbtn red" data-delete>删除</button><button type="button" class="lbtn" data-duplicate>复制为新方</button>' : ''}<button class="btn primary" type="submit">保存协定方</button></div>
    </form>`;
    const result = await sheet({ title: original ? '编辑协定方' : '新建协定方', body: html, buttons: [{ text: '取消', value: null }], onOpen: (box, close) => {
      const form = $('form', box);
      const data = () => ({
        name: form.elements.formula.value.trim(), note: form.elements.note.value.trim(), doses: form.elements.doses.value.trim(), usage: form.elements.usage.value.trim(),
        herbs: $$('.template-herb', form).map((row) => ({ name: $('[name=herb]', row).value.trim(), ...Logic.parseDose($('[name=dose]', row).value), method: $('[name=method]', row).value })).filter((h) => h.name),
      });
      form.addEventListener('click', async (e) => {
        if (e.target.matches('[data-add]')) {
          $('.template-herbs', form).insertAdjacentHTML('beforeend', templateHerb());
          $('.template-herb:last-child input', form).focus();
        } else if (e.target.matches('[data-remove]')) e.target.closest('.template-herb').remove();
        else if (e.target.matches('[data-duplicate]')) {
          const copy = data();
          close({ copy: { ...copy, name: `${copy.name}（副本）` } });
        } else if (e.target.matches('[data-delete]') && await confirmSheet('删除协定方', `删除「${original.name}」？`, '删除', true)) {
          if (!form.isConnected) return;
          if (await commit((db) => { db.templates = db.templates.filter((x) => x.id !== original.id); })) close('deleted');
        }
      });
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const entry = data();
        if (!entry.name || !entry.herbs.length) return toast('请填写方名和药味', 'warn');
        const save = $('button[type=submit]', form);
        save.disabled = true;
        const ok = await commit((db) => {
          if (db.templates.some((x) => x.name === entry.name && x.id !== original?.id)) throw new Error('已存在同名协定方');
          const now = new Date().toISOString();
          if (original) {
            const index = db.templates.findIndex((x) => x.id === original.id);
            if (index < 0) throw new Error('这张协定方已被删除');
            db.templates[index] = { ...db.templates[index], ...entry, updatedAt: now, sample: false };
          } else db.templates.push({ id: Logic.uid('t'), ...entry, createdAt: now, updatedAt: now, sample: false });
        });
        if (ok) close('saved');
        else save.disabled = false;
      });
    } });
    if (result?.copy) return editTemplate(null, result.copy);
    if (result) {
      toast(result === 'deleted' ? '已删除' : '协定方已保存');
      if (S.view === 'templates') viewTemplates();
    }
  }
  async function pickTemplate() {
    const body = document.createElement('div');
    body.innerHTML = '<div class="search"><input type="search" placeholder="方名或药名" aria-label="搜索协定方"></div><div class="template-choices"></div>';
    const q = $('input', body);
    const list = $('.template-choices', body);
    const update = () => { list.innerHTML = templateRows(templateList(q.value), 'template-select'); };
    q.addEventListener('input', update);
    update();
    const t = await sheet({ title: '选择协定方', body, buttons: [{ text: '取消', value: null }], onOpen: (_box, close) => {
      list.addEventListener('click', (e) => {
        const option = e.target.closest('[data-id]');
        const selected = option && S.db.templates.find((x) => x.id === option.dataset.id);
        if (selected) close(clone(selected));
      });
    } });
    if (!t || !$('#vform')) return;
    const d = collectDraft();
    let mode = 'replace';
    if (d.rx.herbs.length) mode = await sheet({ title: t.name, body: `<p>${esc(Logic.rxLine(t))}</p>`, buttons: [{ text: '取消', value: null }, { text: '追加药味', value: 'append' }, { text: '替换处方', value: 'replace', primary: true }] });
    if (!mode || !$('#vform')) return;
    if (mode === 'replace') {
      for (const key of ['name', 'doses', 'usage']) $(`[data-rx="${key}"]`).value = t[key] || '';
      setHerbs(t.herbs || []);
    } else setHerbs(d.rx.herbs.concat((t.herbs || []).filter((h) => !d.rx.herbs.some((x) => x.name === h.name))));
    toast('已套用协定方');
  }

  const trashNames = { patients: '患者', visits: '医案', acu: '扎针记录' };
  function viewTrash() {
    const dead = new Set(S.db.patients.filter((p) => p.deletedAt).map((p) => p.id));
    const names = new Map(S.db.patients.map((p) => [p.id, p.name]));
    const groups = Object.keys(trashNames).map((key) => [key, (S.db[key] || []).filter((r) => r.deletedAt && (key === 'patients' || !dead.has(r.patientId))).sort((a, b) => b.deletedAt.localeCompare(a.deletedAt))]);
    show('trash', `${groups.some(([, rows]) => rows.length) ? '<div class="tool-actions"><button class="btn danger" data-act="trash-empty">清空回收站</button></div>' : ''}${groups.map(([key, rows]) => `<div class="card"><h3>已删除的${trashNames[key]} <small>${rows.length}</small></h3>${rows.map((r) => `<div class="trash-row"><b>${esc(key === 'patients' ? r.name : names.get(r.patientId) || '未知患者')}</b>
      <div class="r">${esc([r.date, r.chief || (r.points || []).join('、')].filter(Boolean).join(' · '))}</div><div class="hint">删除于 ${esc(fmtWhen(r.deletedAt))}</div>
      <div class="tool-actions"><button class="lbtn" data-act="trash-restore" data-kind="${key}" data-id="${esc(r.id)}">恢复</button><button class="lbtn red" data-act="trash-purge" data-kind="${key}" data-id="${esc(r.id)}">彻底删除</button></div></div>`).join('') || '<p class="hint">没有记录</p>'}</div>`).join('')}`);
  }
  async function trashChange(action, kind, recordId) {
    const all = action === 'empty';
    const restore = action === 'restore';
    if (!all && !Object.hasOwn(trashNames, kind)) return;
    if (!restore && !(await confirmSheet(all ? '清空回收站' : '彻底删除', all ? '彻底删除回收站里的全部记录？删除后无法恢复。' : `彻底删除这${kind === 'patients' ? '位患者及其全部记录' : '条记录'}？删除后无法恢复。`, all ? '清空' : '彻底删除', true))) return;
    const ok = await commit((db) => {
      if (restore) {
        const record = db[kind].find((r) => r.id === recordId && r.deletedAt);
        if (!record) throw new Error('这条记录已不存在');
        const stamp = new Date().toISOString();
        const patient = kind === 'patients' ? record : db.patients.find((p) => p.id === record.patientId);
        if (!patient) throw new Error('对应患者已被彻底删除');
        if (patient.deletedAt) {
          const deleted = patient.deletedAt;
          Object.assign(patient, { deletedAt: null, updatedAt: stamp });
          for (const key of ['visits', 'acu']) for (const r of db[key] || []) {
            if (r.patientId === patient.id && r.deletedAt === deleted) Object.assign(r, { deletedAt: null, updatedAt: stamp });
          }
        }
        Object.assign(record, { deletedAt: null, updatedAt: stamp });
      } else {
        const dead = new Set(db.patients.filter((p) => p.deletedAt && (all || (kind === 'patients' && p.id === recordId))).map((p) => p.id));
        db.patients = db.patients.filter((p) => !dead.has(p.id));
        for (const key of ['visits', 'acu']) db[key] = (db[key] || []).filter((r) => !dead.has(r.patientId) && !(r.deletedAt && (all || (kind === key && r.id === recordId))));
      }
    });
    if (ok) {
      await reconcile();
      toast(restore ? '已恢复' : '已删除');
      if (S.view === 'trash') viewTrash();
    }
  }

  const acts = {
    tools: () => { if (S.view !== 'tools') go('/tools'); },
    'tool-open': (el) => {
      if (el.dataset.route === 'search') search = blankSearch();
      go(`/${el.dataset.route}`);
    },
    'tool-patient': (el) => go(`/${el.dataset.route}/${id(el.dataset.pid)}`),
    'search-clear': () => { search = blankSearch(); viewSearch(); },
    compare: (el) => go(`/compare/${id(el.dataset.pid)}/${id(el.dataset.id || '')}`),
    similar: (el) => go(`/similar/${id(S.draft.patientId)}/${id(el.dataset.id)}`),
    'stats-search': (el) => { search = { ...blankSearch(), q: el.dataset.q, field: el.dataset.field, from: stats.from, to: stats.to }; go('/search'); },
    'stats-export': exportStats,
    'template-edit': (el) => editTemplate(S.db.templates.find((t) => t.id === el.dataset.id)),
    'save-template': () => editTemplate(null, clone(collectDraft().rx)),
    'pick-template': pickTemplate,
    'trash-restore': (el) => trashChange('restore', el.dataset.kind, el.dataset.id),
    'trash-purge': (el) => trashChange('purge', el.dataset.kind, el.dataset.id),
    'trash-empty': () => trashChange('empty'),
  };
  const views = { tools: home, search: viewSearch, compare: viewCompare, stats: viewStats, templates: viewTemplates, trash: viewTrash, similar: viewSimilar };
  return { icon, acts, route(r) {
    if (!Object.hasOwn(views, r.name)) return false;
    views[r.name](r.a, r.b);
    return true;
  }, refresh() {
    if (S.view === 'search') searchResults();
    else if (S.view === 'stats') statsResults();
    else if (S.view === 'trash' && !$('#sheetRoot').children.length) viewTrash();
    else return false;
    return true;
  } };
};
