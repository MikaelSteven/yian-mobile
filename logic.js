// ============================================================
// 计算逻辑（不涉及界面）：剂量解析、处方对比、演变表、检索
// ============================================================
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Logic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // 煎法选项（第一个是"无"）
  const METHODS = ['', '先煎', '后下', '包煎', '烊化', '另煎', '冲服'];

  // 除了克以外，剂量格里可以直接写的单位
  const OTHER_UNITS = ['枚', '片', '个', '只', '条', '茎', '根', '粒', '对', '段', '寸', '支', 'ml', '毫升', 'cm'];

  // ---------- 小工具 ----------
  function uid(prefix) {
    return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  }

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function todayStr(d = new Date()) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  // ---------- 剂量 ----------
  // 把剂量格里的文字拆成"数字 + 单位"。
  // "10" → 10 g；"10克" → 10 g；"3片" → 3 片；"适量" → 原样保留
  function parseDose(text) {
    const t = String(text == null ? '' : text).trim().replace(/\s+/g, '');
    if (!t) return { dose: '', unit: 'g' };
    let m = t.match(/^(\d+(?:\.\d+)?)(g|G|克)?$/);
    if (m) return { dose: m[1], unit: 'g' };
    m = t.match(/^(\d+(?:\.\d+)?)(.+)$/);
    if (m && OTHER_UNITS.includes(m[2])) return { dose: m[1], unit: m[2] };
    return { dose: t, unit: '' };
  }

  // 剂量格里显示的文字（克不写单位，旁边会显示 g）
  function doseInputText(h) {
    if (!h || h.dose === '' || h.dose == null) return '';
    return h.unit === 'g' ? String(h.dose) : String(h.dose) + (h.unit || '');
  }

  // 完整剂量文字，如 "10g"、"3片"
  function formatDose(h) {
    if (!h || h.dose === '' || h.dose == null) return '';
    return String(h.dose) + (h.unit || '');
  }

  function sameDose(a, b) {
    const ua = a.unit || '';
    const ub = b.unit || '';
    const da = String(a.dose == null ? '' : a.dose).trim();
    const db = String(b.dose == null ? '' : b.dose).trim();
    const isNum = (s) => /^\d+(\.\d+)?$/.test(s);
    if (isNum(da) && isNum(db)) return parseFloat(da) === parseFloat(db) && ua === ub;
    return da === db && ua === ub;
  }

  function herbKey(name) {
    return String(name || '').trim();
  }

  // ---------- 处方对比 ----------
  // prev、cur 都是药味数组。返回每味药的变化情况。
  function diffRx(prevHerbs, curHerbs) {
    const prev = (prevHerbs || []).filter((h) => herbKey(h.name));
    const cur = (curHerbs || []).filter((h) => herbKey(h.name));
    const prevMap = new Map(prev.map((h) => [herbKey(h.name), h]));
    const curMap = new Map(cur.map((h) => [herbKey(h.name), h]));

    const curItems = cur.map((h) => {
      const p = prevMap.get(herbKey(h.name));
      if (!p) return { herb: h, status: 'added' };
      const doseChanged = !sameDose(p, h);
      const methodChanged = (p.method || '') !== (h.method || '');
      if (doseChanged || methodChanged) {
        return { herb: h, prev: p, status: 'changed', doseChanged, methodChanged };
      }
      return { herb: h, prev: p, status: 'same' };
    });

    const prevItems = prev.map((h) => {
      const c = curMap.get(herbKey(h.name));
      if (!c) return { herb: h, status: 'removed' };
      const doseChanged = !sameDose(h, c);
      const methodChanged = (h.method || '') !== (c.method || '');
      return { herb: h, next: c, status: doseChanged || methodChanged ? 'changed' : 'same', doseChanged, methodChanged };
    });

    return {
      prevItems,
      curItems,
      added: curItems.filter((x) => x.status === 'added'),
      removed: prevItems.filter((x) => x.status === 'removed'),
      changed: curItems.filter((x) => x.status === 'changed'),
      same: curItems.filter((x) => x.status === 'same'),
    };
  }

  // ---------- 处方演变表 ----------
  // visits：同一患者的医案，按日期从早到晚排好。
  // 返回：每一行一味药，每一列一次就诊。
  function buildEvolution(visits) {
    const info = new Map(); // 药名 → {firstIndex, count, firstPos}
    visits.forEach((v, vi) => {
      ((v.rx && v.rx.herbs) || []).forEach((h, pos) => {
        const k = herbKey(h.name);
        if (!k) return;
        if (!info.has(k)) info.set(k, { name: k, firstIndex: vi, count: 0, firstPos: pos });
        info.get(k).count += 1;
      });
    });

    // 排序：先出现的在上；同时出现的，用得次数多的在上；再按原处方顺序
    const names = [...info.values()]
      .sort((a, b) => a.firstIndex - b.firstIndex || b.count - a.count || a.firstPos - b.firstPos)
      .map((x) => x.name);

    const maps = visits.map((v) => {
      const m = new Map();
      ((v.rx && v.rx.herbs) || []).forEach((h) => {
        const k = herbKey(h.name);
        if (k) m.set(k, h);
      });
      return m;
    });

    const rows = names.map((name) => {
      const cells = visits.map((v, vi) => {
        const h = maps[vi].get(name);
        const prev = vi > 0 ? maps[vi - 1].get(name) : null;
        if (h) {
          let status = 'same';
          if (vi > 0 && !prev) status = 'added';
          else if (prev && (!sameDose(prev, h) || (prev.method || '') !== (h.method || ''))) status = 'changed';
          return { status, herb: h, text: formatDose(h), method: h.method || '' };
        }
        if (prev) return { status: 'removed', herb: null, text: '', method: '' };
        return { status: 'none', herb: null, text: '', method: '' };
      });
      return { name, cells, count: info.get(name).count };
    });

    return { visits, rows };
  }

  // ---------- 患者 ----------
  function ageOf(p, ref = new Date()) {
    if (p.birth) {
      const b = new Date(p.birth + 'T00:00:00');
      if (!isNaN(b)) {
        let age = ref.getFullYear() - b.getFullYear();
        const m = ref.getMonth() - b.getMonth();
        if (m < 0 || (m === 0 && ref.getDate() < b.getDate())) age -= 1;
        return age >= 0 ? age : '';
      }
    }
    if (p.birthYear) {
      const y = parseInt(p.birthYear, 10);
      if (!isNaN(y)) return ref.getFullYear() - y;
    }
    return '';
  }

  function ageText(p) {
    const a = ageOf(p);
    return a === '' ? '' : `${a}岁`;
  }

  // 患者搜索：姓名、拼音首字母、全拼开头、电话
  function matchPatient(p, query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return true;
    if (/^\d+$/.test(q)) return String(p.phone || '').includes(q);
    if ((p.name || '').toLowerCase().includes(q)) return true;
    if ((p.py || '').startsWith(q) || (p.py || '').includes(q)) return true;
    if ((p.pyFull || '').startsWith(q)) return true;
    if ((p.tags || []).some((t) => String(t).toLowerCase().includes(q))) return true;
    return false;
  }

  // 就诊次序标签
  function visitLabel(index) {
    return index === 0 ? '初诊' : `第${index}次复诊`;
  }

  function shortVisitLabel(index) {
    return index === 0 ? '初诊' : `复诊${index}`;
  }

  // 按日期从早到晚排序（同一天按创建时间）
  function sortVisitsAsc(visits) {
    return [...visits].sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.createdAt || '').localeCompare(b.createdAt || ''));
  }

  // ---------- 检索 ----------
  const SEARCH_FIELDS = {
    all: '全部',
    herb: '药名',
    rxname: '方名',
    pattern: '证型',
    dx: '诊断',
    symptom: '症状',
  };

  const TEXT_FIELDS = [
    ['chief', '主诉'],
    ['symptoms', '症状'],
    ['past', '既往史'],
    ['sign', '舌脉面象'],
    ['tcmDx', '诊断'],
    ['pattern', '证型'],
    ['advice', '医嘱'],
    ['outcome', '疗效与随访'],
    ['comment', '按语'],
    ['note', '备注'],
  ];

  const FIELD_GROUPS = {
    pattern: ['pattern'],
    dx: ['tcmDx'],
    symptom: ['chief', 'symptoms', 'sign'],
  };

  function snippet(text, q, radius = 18) {
    const t = String(text || '');
    const i = t.toLowerCase().indexOf(q.toLowerCase());
    if (i < 0) return t.slice(0, radius * 2);
    const start = Math.max(0, i - radius);
    const end = Math.min(t.length, i + q.length + radius);
    return (start > 0 ? '…' : '') + t.slice(start, end) + (end < t.length ? '…' : '');
  }

  // opts: {q, field, from, to, star}　star：只看收藏的典型医案
  function searchVisits(db, opts) {
    const q = String(opts.q || '').trim();
    const field = opts.field || 'all';
    const from = opts.from || '';
    const to = opts.to || '';
    const star = !!opts.star;
    const patients = new Map(db.patients.filter((p) => !p.deletedAt).map((p) => [p.id, p]));
    const results = [];
    if (!q && !from && !to && !star) return results;

    for (const v of db.visits) {
      if (v.deletedAt) continue;
      if (star && !v.star) continue;
      const p = patients.get(v.patientId);
      if (!p) continue;
      if (from && (v.date || '') < from) continue;
      if (to && (v.date || '') > to) continue;

      const hits = [];
      if (q) {
        const ql = q.toLowerCase();
        const has = (s) => String(s || '').toLowerCase().includes(ql);

        if (field === 'all' || field === 'herb') {
          const herbs = ((v.rx && v.rx.herbs) || []).filter((h) => has(h.name));
          herbs.forEach((h) => hits.push({ label: '药味', text: h.name + ' ' + formatDose(h) + (h.method ? `（${h.method}）` : ''), herb: true }));
        }
        if (field === 'all' || field === 'rxname') {
          if (has(v.rx && v.rx.name)) hits.push({ label: '方名', text: v.rx.name });
        }
        const fields = field === 'all' ? TEXT_FIELDS.map((f) => f[0]) : FIELD_GROUPS[field] || [];
        for (const key of fields) {
          if (has(v[key])) {
            const label = (TEXT_FIELDS.find((f) => f[0] === key) || [key, key])[1];
            hits.push({ label, text: snippet(v[key], q) });
          }
        }
        if (!hits.length) continue;
      }
      results.push({ visit: v, patient: p, hits });
    }
    results.sort((a, b) => (b.visit.date || '').localeCompare(a.visit.date || ''));
    return results;
  }

  // ============================================================
  // 第二期：药名搜索、粘贴识别、十八反十九畏
  // ============================================================

  // ---------- 药名索引 ----------
  // names：药名数组；pinyinFn：pinyin-pro 的 pinyin 函数
  // 每味药生成：拼音首字母（含多音字的各种读法）、全拼
  function buildHerbIndex(names, pinyinFn) {
    const cache = new Map();
    const charInitials = (ch) => {
      if (cache.has(ch)) return cache.get(ch);
      let ini = [];
      try {
        ini = [...new Set(pinyinFn(ch, { toneType: 'none', type: 'array', multiple: true }).map((p) => (p || '')[0]).filter((c) => c && /[a-z]/.test(c)))];
      } catch (e) {
        ini = [];
      }
      cache.set(ch, ini);
      return ini;
    };
    return names.map((name, order) => {
      let main = '';
      let full = '';
      try {
        const arr = pinyinFn(name, { toneType: 'none', type: 'array' });
        main = arr.map((s) => (s || '')[0] || '').join('').toLowerCase();
        full = arr.join('').toLowerCase();
      } catch (e) {
        /* 忽略 */
      }
      const variants = (str) => {
        let acc = [''];
        for (const ch of str) {
          const ini = charInitials(ch);
          const opts = ini.length ? ini : [ch];
          const next = [];
          for (const a of acc) for (const o of opts) next.push(a + o);
          acc = next.slice(0, 32);
        }
        return acc;
      };
      const inis = [...new Set([main, ...variants(name)].filter(Boolean))];
      // 炮制品：去掉"炒、麸炒、酒、醋……"后的原药名，用来让 bz 也能找到 炒白术
      const base = baseHerbName(name);
      let baseMain = '';
      if (base !== name) {
        try {
          baseMain = pinyinFn(base, { toneType: 'none', type: 'array' }).map((s) => (s || '')[0] || '').join('').toLowerCase();
        } catch (e) {
          baseMain = '';
        }
      }
      return { name, main, inis, full, order, base: base !== name ? base : '', baseMain };
    });
  }

  // 炮制方法前缀（用于把 炒白术 归到 白术 名下）
  const PROC_PREFIX = /^(麸炒|土炒|米炒|蜜炙|酒炙|醋炙|盐炙|姜炙|炒焦|生|炙|炒|焦|制|酒|醋|盐|蜜|姜|煅|烫|燀|煨|炮|鲜|净|熟|法|清)/;
  function baseHerbName(name) {
    const b = String(name || '').replace(PROC_PREFIX, '');
    return b.length >= 2 ? b : name;
  }

  // 搜索药名。usage：Map(药名 → {count, topDose})，用得多的排前面
  function searchHerbs(index, query, usage, limit = 10) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return [];
    const isLatin = /^[a-z]+$/.test(q);
    const out = [];
    for (const h of index) {
      let score = -1;
      if (isLatin) {
        // 常用读音优先；炮制品紧跟原药；多音字的其他读音排后面
        if (h.main === q) score = 95;
        else if (h.baseMain && h.baseMain === q) score = 75;
        else if (h.main.startsWith(q)) score = 70;
        else if (h.inis.includes(q)) score = 65;
        else if (h.full && h.full.startsWith(q)) score = 60;
        else if (h.baseMain && h.baseMain.startsWith(q)) score = 55;
        else if (h.inis.some((s) => s.startsWith(q))) score = 50;
      } else {
        if (h.name === q) score = 100;
        else if (h.name.startsWith(q)) score = 80;
        else if (h.base === q) score = 75;
        else if (h.name.includes(q)) score = 50;
      }
      if (score < 0) continue;
      const u = usage && usage.get(h.name);
      out.push({ name: h.name, ini: h.main, score, count: u ? u.count : 0, topDose: u ? u.topDose : '', order: h.order, len: h.name.length });
    }
    out.sort((a, b) => b.score - a.score || b.count - a.count || a.len - b.len || a.order - b.order);
    return out.slice(0, limit);
  }

  // 统计每味药用过几次、最常用的剂量
  function herbUsage(db) {
    const map = new Map();
    const dead = new Set((db.patients || []).filter((p) => p.deletedAt).map((p) => p.id));
    for (const v of db.visits || []) {
      if (v.deletedAt || dead.has(v.patientId)) continue;
      for (const h of (v.rx && v.rx.herbs) || []) {
        const k = herbKey(h.name);
        if (!k) continue;
        if (!map.has(k)) map.set(k, { count: 0, doses: new Map() });
        const m = map.get(k);
        m.count += 1;
        const d = formatDose(h);
        if (d) m.doses.set(d, (m.doses.get(d) || 0) + 1);
      }
    }
    for (const m of map.values()) {
      let best = '';
      let n = 0;
      for (const [d, c] of m.doses) if (c > n) [best, n] = [d, c];
      m.topDose = best;
    }
    return map;
  }

  // ---------- 粘贴识别 ----------
  const PASTE_UNITS = ['g', '克', '枚', '片', '个', '只', '条', '茎', '根', '粒', '对', '段', '寸', '支', 'ml', '毫升', 'cm'];
  const METHOD_WORDS = { 先煎: '先煎', 先下: '先煎', 后下: '后下', 后入: '后下', 包煎: '包煎', 布包: '包煎', 烊化: '烊化', 烊服: '烊化', 另煎: '另煎', 另炖: '另煎', 冲服: '冲服', 兑服: '冲服' };
  const SKIP_WORDS = /煎服|分服|温服|顿服|水煎|每日|日服|一日|剂|处方|方药|组成|药物|用法|医嘱|服法|^药$|^方$|^共$|^各$/;
  const CN_NUM = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };

  function toHalfWidth(s) {
    return s.replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/　/g, ' ');
  }

  function parsePaste(input) {
    let s = toHalfWidth(String(input || ''));
    s = s.replace(/[×xX*]\s*\d+\s*剂/g, ' ').replace(/共\s*\d+\s*剂/g, ' ').replace(/\d+\s*剂/g, ' ');
    // 去掉行首的"处方："这类标签
    s = s.replace(/(^|\n)\s*(处方|方药|组成|药物|中药|用药|Rx|RP|Rp|R)\s*[:：.]?\s*/g, '$1 ');
    const re = /([一-龥]+)\s*(?:[(\[]\s*([一-龥]+)\s*[)\]])?\s*[:]?\s*(\d+(?:\.\d+)?)?\s*(g|G|克|枚|片|个|只|条|茎|根|粒|对|段|寸|支|ml|毫升|cm)?\s*(?:[(\[]\s*([一-龥]+)\s*[)\]])?/g;
    const out = [];
    let m;
    let pendingGe = []; // "龙骨、牡蛎各30g"
    while ((m = re.exec(s))) {
      if (!m[0].trim()) {
        re.lastIndex += 1;
        continue;
      }
      let name = m[1];
      let dose = m[3] || '';
      let unit = m[4] || '';
      let method = METHOD_WORDS[m[2]] || METHOD_WORDS[m[5]] || '';
      // 单独的煎法词：挂到上一味药上
      if (METHOD_WORDS[name]) {
        if (out.length) out[out.length - 1].method = METHOD_WORDS[name];
        continue;
      }
      // 药名后面直接跟着煎法，如"薄荷后下"
      for (const w of Object.keys(METHOD_WORDS)) {
        if (name.length > w.length && name.endsWith(w)) {
          method = METHOD_WORDS[w];
          name = name.slice(0, -w.length);
          break;
        }
      }
      // 中文数字的剂量，如"生姜三片""大枣五枚"
      const cn = name.match(/^(.+?)([一二两三四五六七八九十]+)(片|枚|个|粒|根|段|只|条)$/);
      if (cn && !dose) {
        name = cn[1];
        const t = cn[2];
        dose = String(t.length === 1 ? CN_NUM[t] : t === '十' ? 10 : t.startsWith('十') ? 10 + CN_NUM[t[1]] : CN_NUM[t[0]] * 10 + (CN_NUM[t[2]] || 0));
        unit = cn[3];
      }
      let ge = false;
      if (name.length > 1 && name.endsWith('各')) {
        name = name.slice(0, -1);
        ge = true;
      }
      if (!name || SKIP_WORDS.test(name)) continue;
      if (unit === 'G' || unit === '克') unit = 'g';
      if (dose && !unit) unit = 'g';
      if (!dose) unit = 'g';
      const herb = { name, dose, unit, method };
      out.push(herb);
      if (!dose) pendingGe.push(herb);
      else {
        if (ge) pendingGe.forEach((h) => Object.assign(h, { dose, unit }));
        pendingGe = [];
      }
    }
    // 合并重复（保留第一次）
    const seen = new Set();
    return out.filter((h) => {
      if (seen.has(h.name)) return false;
      seen.add(h.name);
      return true;
    });
  }

  // ---------- 十八反、十九畏 ----------
  const G = {
    甘草: ['甘草', '生甘草', '炙甘草', '甘草梢', '甘草节'],
    甘遂: ['甘遂', '醋甘遂'],
    大戟: ['大戟', '京大戟', '红大戟', '醋京大戟'],
    海藻: ['海藻'],
    芫花: ['芫花', '醋芫花'],
    乌头: ['乌头', '川乌', '制川乌', '生川乌', '草乌', '制草乌', '生草乌', '附子', '制附子', '熟附子', '炮附子', '盐附子', '附片', '黑顺片', '白附片', '淡附片', '炮附片'],
    半夏: ['半夏', '法半夏', '姜半夏', '清半夏', '生半夏', '制半夏', '半夏曲'],
    瓜蒌: ['瓜蒌', '全瓜蒌', '瓜蒌皮', '瓜蒌子', '瓜蒌仁', '炒瓜蒌子', '天花粉', '栝楼', '栝楼根', '栝楼子'],
    贝母: ['贝母', '川贝母', '浙贝母', '平贝母', '伊贝母', '湖北贝母', '川贝', '浙贝', '川贝粉'],
    白蔹: ['白蔹'],
    白及: ['白及'],
    藜芦: ['藜芦'],
    参类: ['人参', '红参', '生晒参', '白参', '高丽参', '西洋参', '党参', '北沙参', '南沙参', '沙参', '丹参', '玄参', '元参', '苦参'],
    细辛: ['细辛'],
    芍药: ['芍药', '白芍', '赤芍', '炒白芍', '酒白芍', '炒赤芍'],
    硫黄: ['硫黄'],
    朴硝: ['朴硝', '芒硝', '玄明粉', '牙硝'],
    水银: ['水银'],
    砒霜: ['砒霜', '砒石', '信石'],
    狼毒: ['狼毒'],
    密陀僧: ['密陀僧'],
    巴豆: ['巴豆', '巴豆霜'],
    牵牛: ['牵牛子', '黑丑', '白丑', '二丑', '牵牛'],
    丁香: ['丁香', '公丁香', '母丁香'],
    郁金: ['郁金'],
    川草乌: ['川乌', '制川乌', '生川乌', '草乌', '制草乌', '生草乌', '乌头'],
    犀角: ['犀角'],
    三棱: ['三棱', '醋三棱'],
    官桂: ['官桂', '肉桂'],
    赤石脂: ['赤石脂'],
    人参: ['人参', '红参', '生晒参', '白参', '高丽参'],
    五灵脂: ['五灵脂', '醋五灵脂'],
  };

  const INCOMPAT_RULES = [
    { type: '十八反', a: '甘草', b: ['甘遂', '大戟', '海藻', '芫花'] },
    { type: '十八反', a: '乌头', b: ['半夏', '瓜蒌', '贝母', '白蔹', '白及'] },
    { type: '十八反', a: '藜芦', b: ['参类', '细辛', '芍药'] },
    { type: '十九畏', a: '硫黄', b: ['朴硝'] },
    { type: '十九畏', a: '水银', b: ['砒霜'] },
    { type: '十九畏', a: '狼毒', b: ['密陀僧'] },
    { type: '十九畏', a: '巴豆', b: ['牵牛'] },
    { type: '十九畏', a: '丁香', b: ['郁金'] },
    { type: '十九畏', a: '川草乌', b: ['犀角'] },
    { type: '十九畏', a: '朴硝', b: ['三棱'] },
    { type: '十九畏', a: '官桂', b: ['赤石脂'] },
    { type: '十九畏', a: '人参', b: ['五灵脂'] },
  ];

  const PREFIX = /^(麸炒|土炒|米炒|蜜炙|酒炙|醋炙|盐炙|姜炙|炒焦|生|炙|炒|制|焦|酒|醋|盐|蜜|煅|烫|燀|煨|炮|鲜|法|清|姜|熟|净|淡)/;
  function inGroup(name, g) {
    const list = G[g] || [];
    if (list.includes(name)) return true;
    const base = name.replace(PREFIX, '');
    return base !== name && list.includes(base);
  }

  // 返回提醒列表：[{type, names:[甲, 乙], text}]
  function checkIncompat(herbs) {
    const names = (herbs || []).map((h) => herbKey(h.name)).filter(Boolean);
    const warnings = [];
    const seenPair = new Set();
    for (const r of INCOMPAT_RULES) {
      const as = names.filter((n) => inGroup(n, r.a));
      if (!as.length) continue;
      for (const bg of r.b) {
        const bs = names.filter((n) => inGroup(n, bg));
        for (const a of as)
          for (const b of bs) {
            if (a === b) continue;
            const key = [a, b].sort().join('|');
            if (seenPair.has(key)) continue;
            seenPair.add(key);
            warnings.push({ type: r.type, names: [a, b], text: `${a} ${r.type === '十八反' ? '反' : '畏'} ${b}` });
          }
      }
    }
    const count = new Map();
    names.forEach((n) => count.set(n, (count.get(n) || 0) + 1));
    for (const [n, c] of count) if (c > 1) warnings.push({ type: '重复', names: [n], text: `${n} 出现了 ${c} 次` });
    return warnings;
  }

  // ---------- 旧数据升级 ----------
  // · 现病史、刻下症合并为「症状」，「其他四诊」并入症状（原有内容不丢）
  // · 舌象、脉象合并为「舌脉面象」
  function mergeSymptoms(v) {
    const parts = [v.present, v.symptoms, v.otherExam].map((x) => String(x || '').trim()).filter(Boolean);
    const changed = !!(String(v.present || '').trim() || String(v.otherExam || '').trim());
    if (changed) v.symptoms = parts.join('\n');
    delete v.present;
    delete v.otherExam;
    return changed;
  }

  function migrateVisit(v) {
    let changed = mergeSymptoms(v);
    const tp = [v.sign, v.tongue, v.pulse].map((x) => String(x || '').trim()).filter(Boolean);
    if (String(v.tongue || '').trim() || String(v.pulse || '').trim()) {
      v.sign = tp.join('，');
      changed = true;
    }
    delete v.tongue;
    delete v.pulse;
    if (!Array.isArray(v.photos)) v.photos = [];
    return changed;
  }

  // ---------- 处方总重 ----------
  // 只累加以克为单位的药；返回 {perDose, others}，others＝不是克的药（如 3片）
  function rxWeight(herbs) {
    let sum = 0;
    let others = 0;
    for (const h of herbs || []) {
      if (!herbKey(h.name)) continue;
      const n = parseFloat(h.dose);
      if (h.unit === 'g' && !isNaN(n) && /^\d+(\.\d+)?$/.test(String(h.dose).trim())) sum += n;
      else others += 1;
    }
    return { perDose: Math.round(sum * 10) / 10, others };
  }

  // ---------- 复诊提醒 ----------
  function daysBetween(a, b) {
    const da = new Date(a + 'T00:00:00');
    const dbb = new Date(b + 'T00:00:00');
    return Math.round((dbb - da) / 86400000);
  }
  function addDays(dateStr, n) {
    const d = new Date((dateStr || todayStr()) + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return todayStr(d);
  }
  // 根据该患者最后一次就诊的「下次复诊」日期，算出还剩几天（负数＝已过期）
  function followUpInfo(visitsAsc, today = todayStr()) {
    const last = visitsAsc[visitsAsc.length - 1];
    if (!last || !last.nextDate) return null;
    const days = daysBetween(today, last.nextDate);
    let label;
    if (days < 0) label = `复诊逾期 ${-days} 天`;
    else if (days === 0) label = '今天复诊';
    else if (days === 1) label = '明天复诊';
    else label = `${days} 天后复诊`;
    return { date: last.nextDate, days, label, due: days <= 0 };
  }

  // ---------- 生成给 AI 看的病例文字（Markdown） ----------
  function rxLine(rx) {
    return ((rx && rx.herbs) || [])
      .filter((h) => herbKey(h.name))
      .map((h) => h.name + formatDose(h) + (h.method ? `（${h.method}）` : ''))
      .join('、');
  }
  function changeLine(prevHerbs, curHerbs) {
    const d = diffRx(prevHerbs, curHerbs);
    const parts = [];
    if (d.added.length) parts.push('加 ' + d.added.map((x) => x.herb.name + formatDose(x.herb)).join('、'));
    if (d.removed.length) parts.push('去 ' + d.removed.map((x) => x.herb.name).join('、'));
    if (d.changed.length)
      parts.push(
        '调 ' +
          d.changed
            .map((x) => `${x.herb.name} ${formatDose(x.prev)}→${formatDose(x.herb)}` + (x.methodChanged ? `（煎法 ${x.prev.method || '无'}→${x.herb.method || '无'}）` : ''))
            .join('、')
      );
    return parts.length ? parts.join('；') : '与上诊相同';
  }
  const MD_FIELDS = [
    ['chief', '主诉'],
    ['symptoms', '症状'],
    ['past', '既往史'],
    ['sign', '舌脉面象'],
    ['tcmDx', '诊断'],
    ['pattern', '证型'],
  ];
  const MD_AFTER = [
    ['advice', '医嘱'],
    ['outcome', '疗效与随访'],
    ['comment', '按语'],
    ['note', '备注'],
  ];
  // opts: { hideIdentity (默认 true), withIds, currentId }
  function visitMarkdown(v, i, prev, opts = {}) {
    const L = [];
    L.push(`## ${visitLabel(i)}　${v.date || ''}${opts.currentId && opts.currentId === v.id ? '（本次）' : ''}${opts.withIds && v.id ? `　〔visit_id: ${v.id}〕` : ''}`);
    for (const [k, label] of MD_FIELDS) if (String(v[k] || '').trim()) L.push(`- ${label}：${String(v[k]).trim().replace(/([。；，、])?\n+/g, (m, p1) => p1 || '；')}`);
    const rx = v.rx || {};
    const n = ((rx.herbs || []).filter((h) => herbKey(h.name))).length;
    if (n) {
      L.push(`- 处方${rx.name ? `（${rx.name}）` : ''}：${rxLine(rx)}；共${n}味${rx.doses ? `，${rx.doses}剂` : ''}${rx.usage ? `，${rx.usage}` : ''}`);
      if (prev) L.push(`- 较上诊：${changeLine((prev.rx || {}).herbs, rx.herbs)}`);
    } else L.push('- 处方：无');
    const ph = v.photos || [];
    const tn = ph.filter((x) => x.kind === 'tongue').length;
    const on = ph.length - tn;
    if (ph.length) L.push(`- 照片：${[tn ? `舌象 ${tn} 张` : '', on ? `其他 ${on} 张` : ''].filter(Boolean).join('，')}`);
    for (const [k, label] of MD_AFTER) {
      if (k === 'note' && opts.hideIdentity !== false) continue; // 备注里可能有住址等，隐去
      if (String(v[k] || '').trim()) L.push(`- ${label}：${String(v[k]).trim().replace(/([。；，、])?\n+/g, (m, p1) => p1 || '；')}`);
    }
    if (v.nextDate) L.push(`- 约下次复诊：${v.nextDate}`);
    return L.join('\n');
  }
  function caseMarkdown(p, visitsAsc, opts = {}) {
    const hide = opts.hideIdentity !== false;
    const L = [];
    L.push(hide ? '# 中医医案（已隐去姓名、电话等身份信息）' : `# 中医医案：${p.name}`);
    const info = [p.gender, ageText(p)].filter(Boolean).join('，');
    L.push(`- 患者：${hide ? '' : p.name + '，'}${info || '性别年龄未填'}${opts.withIds && p.id ? `　〔patient_id: ${p.id}〕` : ''}`);
    if (!hide && p.phone) L.push(`- 电话：${p.phone}`);
    if (p.allergy) L.push(`- 过敏史：${p.allergy}`);
    if (p.history) L.push(`- 既往史：${p.history}`);
    if ((p.tags || []).length) L.push(`- 标签：${p.tags.join('、')}`);
    if (!hide && p.note) L.push(`- 备注：${p.note}`);
    L.push(`- 共 ${visitsAsc.length} 次就诊${visitsAsc.length ? `（${visitsAsc[0].date} 至 ${visitsAsc[visitsAsc.length - 1].date}）` : ''}`);
    visitsAsc.forEach((v, i) => {
      L.push('');
      L.push(visitMarkdown(v, i, i > 0 ? visitsAsc[i - 1] : null, opts));
    });
    return L.join('\n');
  }

  // ============================================================
  // 第三期：相似医案、门诊统计
  // ============================================================
  function splitTerms(t) {
    return String(t || '')
      .split(/[，,、；;。\s/|]+/)
      .map((s) => s.trim().replace(/^(兼|伴|夹|并)/, ''))
      .filter((s) => s.length >= 2);
  }
  function bigrams(t) {
    const s = String(t || '').replace(/[\s，,、；;。：:（）()【】[\]0-9a-zA-Z.%\-]/g, '');
    const set = new Set();
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
  }
  function dice(a, b) {
    if (!a.size || !b.size) return 0;
    let n = 0;
    for (const x of a) if (b.has(x)) n++;
    return (2 * n) / (a.size + b.size);
  }
  // 两组词（证型或诊断）有多像：完全相同 1，互相包含 0.8，否则按二字片段比较
  function termSim(a, b) {
    const A = splitTerms(a);
    const B = splitTerms(b);
    let best = 0;
    for (const x of A)
      for (const y of B) {
        const s = x === y ? 1 : x.includes(y) || y.includes(x) ? 0.8 : dice(bigrams(x), bigrams(y));
        if (s > best) best = s;
      }
    return best;
  }
  function herbBaseSet(rx) {
    return new Set(((rx && rx.herbs) || []).map((h) => baseHerbName(h.name)).filter(Boolean));
  }

  // 找其他患者里和当前医案相似的医案（同证型、同诊断、主诉相似、处方重合多）
  // 每位患者只取最像的一次。返回 [{visit, patient, score, reasons, common}]
  function similarVisits(db, target, opts = {}) {
    const limit = opts.limit || 12;
    const patients = new Map((db.patients || []).filter((p) => !p.deletedAt).map((p) => [p.id, p]));
    const tHerbs = herbBaseSet(target.rx);
    const tChief = bigrams(target.chief);
    const enough = splitTerms(target.pattern).length || splitTerms(target.tcmDx).length || tHerbs.size >= 3 || tChief.size >= 2;
    if (!enough) return [];
    const best = new Map();
    for (const v of db.visits || []) {
      if (v.deletedAt || v.patientId === target.patientId || (target.id && v.id === target.id)) continue;
      const p = patients.get(v.patientId);
      if (!p) continue;
      const reasons = [];
      let score = 0;
      const pt = termSim(target.pattern, v.pattern);
      if (pt >= 0.5) {
        score += 4 * pt;
        reasons.push(pt >= 0.99 ? '同证型' : '证型相近');
      }
      const dx = termSim(target.tcmDx, v.tcmDx);
      if (dx >= 0.5) {
        score += 3 * dx;
        reasons.push(dx >= 0.99 ? '同诊断' : '诊断相近');
      }
      const ch = dice(tChief, bigrams(v.chief));
      if (ch >= 0.3) {
        score += 2 * ch;
        reasons.push('主诉相似');
      }
      let common = 0;
      const vh = herbBaseSet(v.rx);
      if (tHerbs.size && vh.size) {
        for (const h of tHerbs) if (vh.has(h)) common++;
        const jac = common / (tHerbs.size + vh.size - common);
        if (common >= 3 && jac >= 0.2) {
          score += 5 * jac;
          reasons.push(`处方重合 ${common} 味`);
        }
      }
      if (score < 2) continue;
      const r = { visit: v, patient: p, score: Math.round(score * 100) / 100, reasons, common };
      const old = best.get(v.patientId);
      if (!old || r.score > old.score || (r.score === old.score && (v.date || '') > (old.visit.date || ''))) best.set(v.patientId, r);
    }
    return [...best.values()].sort((a, b) => b.score - a.score || (b.visit.date || '').localeCompare(a.visit.date || '')).slice(0, limit);
  }

  // 方名归类：「逍遥散加减」「逍遥散化裁」都算「逍遥散」
  function formulaBase(name) {
    return String(name || '')
      .trim()
      .replace(/(加减|加味|化裁|原方|合方|方加减)$/, '')
      .trim();
  }

  // 门诊统计。opts: {from, to}（含两端，空＝不限）
  function clinicStats(db, opts = {}) {
    const from = opts.from || '';
    const to = opts.to || '';
    const patients = new Map((db.patients || []).filter((p) => !p.deletedAt).map((p) => [p.id, p]));
    const all = (db.visits || []).filter((v) => !v.deletedAt && patients.has(v.patientId));
    // 每位患者的初诊（按全部时间算）
    const byPatient = new Map();
    for (const v of all) {
      if (!byPatient.has(v.patientId)) byPatient.set(v.patientId, []);
      byPatient.get(v.patientId).push(v);
    }
    const firstIds = new Set();
    for (const list of byPatient.values()) firstIds.add(sortVisitsAsc(list)[0].id);
    const inRange = (d) => (!from || (d || '') >= from) && (!to || (d || '') <= to);
    const vs = all.filter((v) => inRange(v.date));
    const pts = new Set(vs.map((v) => v.patientId));
    const firstInRange = vs.filter((v) => firstIds.has(v.id)).length;

    // 每月就诊人次（中间没有就诊的月份补 0）
    const mm = new Map();
    for (const v of vs) {
      const ym = (v.date || '').slice(0, 7);
      if (/^\d{4}-\d{2}$/.test(ym)) mm.set(ym, (mm.get(ym) || 0) + 1);
    }
    const months = [];
    const keys = [...mm.keys()].sort();
    if (keys.length) {
      let [y, m] = keys[0].split('-').map(Number);
      const [y2, m2] = keys[keys.length - 1].split('-').map(Number);
      while (y < y2 || (y === y2 && m <= m2)) {
        const ym = `${y}-${pad(m)}`;
        months.push({ ym, n: mm.get(ym) || 0 });
        m++;
        if (m > 12) {
          m = 1;
          y++;
        }
      }
    }

    // 用药
    const hm = new Map();
    let rxCount = 0;
    let herbTotal = 0;
    let wSum = 0;
    let wN = 0;
    for (const v of vs) {
      const herbs = ((v.rx && v.rx.herbs) || []).filter((h) => herbKey(h.name));
      if (!herbs.length) continue;
      rxCount++;
      herbTotal += herbs.length;
      const w = rxWeight(herbs);
      if (w.perDose) {
        wSum += w.perDose;
        wN++;
      }
      const seen = new Set();
      for (const h of herbs) {
        const k = herbKey(h.name);
        if (seen.has(k)) continue;
        seen.add(k);
        if (!hm.has(k)) hm.set(k, { name: k, n: 0, doses: new Map(), gSum: 0, gN: 0, min: Infinity, max: 0 });
        const m = hm.get(k);
        m.n++;
        const d = formatDose(h);
        if (d) m.doses.set(d, (m.doses.get(d) || 0) + 1);
        const x = parseFloat(h.dose);
        if (h.unit === 'g' && x > 0) {
          m.gSum += x;
          m.gN++;
          m.min = Math.min(m.min, x);
          m.max = Math.max(m.max, x);
        }
      }
    }
    const herbs = [...hm.values()]
      .map((m) => {
        let top = '';
        let c = 0;
        for (const [d, k] of m.doses) if (k > c) [top, c] = [d, k];
        return {
          name: m.name,
          n: m.n,
          pct: rxCount ? m.n / rxCount : 0,
          commonDose: top,
          avgDose: m.gN ? Math.round((m.gSum / m.gN) * 10) / 10 : null,
          range: m.gN ? (m.min === m.max ? `${m.min}g` : `${m.min}～${m.max}g`) : '',
        };
      })
      .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'zh'));

    const countTerms = (pick) => {
      const c = new Map();
      for (const v of vs) {
        const terms = new Set(pick(v));
        for (const t of terms) c.set(t, (c.get(t) || 0) + 1);
      }
      return [...c.entries()].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'zh'));
    };
    return {
      from,
      to,
      visits: vs.length,
      patients: pts.size,
      newPatients: firstInRange,
      returnVisits: vs.length - firstInRange,
      rxCount,
      avgHerbs: rxCount ? Math.round((herbTotal / rxCount) * 10) / 10 : 0,
      avgWeight: wN ? Math.round((wSum / wN) * 10) / 10 : 0,
      months,
      herbs,
      patterns: countTerms((v) => splitTerms(v.pattern)),
      dx: countTerms((v) => splitTerms(v.tcmDx)),
      formulas: countTerms((v) => (formulaBase(v.rx && v.rx.name) ? [formulaBase(v.rx && v.rx.name)] : [])),
    };
  }

  // ============================================================
  // AI 开方：从 AI 的回答里取出处方（方名、药物、剂数、用法）
  // 回答按「【方名】…【药物】…【剂数用法】…」的格式写；格式乱了也尽量认出来
  // ============================================================
  const AI_TITLES = ['方名', '方剂', '药物', '处方', '组成', '药味', '方药', '剂数用法', '剂数', '用法', '服法', '方解', '加减', '较上诊', '调方', '注意', '提示', '说明'];
  function stripMd(s) {
    return String(s || '')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/^\s*(?:#{1,6}|[-*•])\s+/gm, '');
  }
  function splitSections(text) {
    const secs = [];
    let cur = { title: '', text: '' };
    for (const raw of stripMd(text).split(/\r?\n/)) {
      const m = raw.match(/^\s*【([^】]{1,8})】\s*[:：]?\s*(.*)$/) || raw.match(new RegExp('^\\s*(' + AI_TITLES.join('|') + ')\\s*(?:[:：]\\s*(.*)|)$'));
      if (m) {
        secs.push(cur);
        cur = { title: m[1].trim(), text: m[2] || '' };
      } else cur.text += (cur.text ? '\n' : '') + raw;
    }
    secs.push(cur);
    return secs.filter((x) => x.title || x.text.trim());
  }

  function parseAiRx(text) {
    // 「白术（炒）」「甘草（炙）」→「炒白术」「炙甘草」
    text = String(text || '').replace(/([一-龥]{1,6})[（(]\s*(炒|炙|制|酒|醋|盐|蜜|煅|焦|生|麸炒|土炒)\s*[）)]/g, '$2$1');
    const secs = splitSections(text);
    const find = (names) => secs.find((x) => names.includes(x.title));
    let herbs = [];
    const hs = find(['药物', '处方', '组成', '药味', '方药']);
    if (hs) herbs = parsePaste(hs.text);
    // 没有按格式写：找连续几行都是「药名＋剂量」的
    if (herbs.length < 3) {
      const lines = stripMd(text).split(/\r?\n/);
      let run = [];
      let best = [];
      const flush = () => {
        const got = run.length ? parsePaste(run.join('\n')).filter((h) => h.dose) : [];
        if (got.length > best.length) best = got;
        run = [];
      };
      const oneHerb = /^\s*[一-龥]{1,6}\s*[:：]?\s*\d+(?:\.\d+)?\s*(?:g|G|克|枚|片|个|只|条|茎|根|粒|对|段|寸|支|ml|毫升|cm)?\s*(?:[（(][一-龥]{1,4}[）)])?\s*[。；;，,、]?\s*$/;
      const notRx = /^\s*(?:较上诊|加减|调整|调方|加|去|减|方解|注意)/;
      for (const ln of lines) {
        if (notRx.test(ln)) {
          if (run.length) flush();
          continue;
        }
        const n = parsePaste(ln).filter((h) => h.dose).length;
        // 一行好几味，或者一行就是「药名 剂量」，都算处方的一部分
        if (n >= 3 || oneHerb.test(ln)) run.push(ln);
        else if (ln.trim()) flush();
      }
      flush();
      if (best.length >= 4) herbs = best;
    }
    const clean = (t) => String(t || '').split('\n')[0].replace(/[「」"“”]/g, '').replace(/[。；;\s]+$/, '').trim();
    const nameSec = find(['方名', '方剂']);
    let name = nameSec ? clean(nameSec.text) : '';
    if (name.length > 24) name = '';
    let doses = '';
    let usage = '';
    const us = find(['剂数用法', '剂数', '用法', '服法']);
    const ut = us ? us.text.trim() : '';
    if (ut) {
      const dm = ut.match(/(?:共\s*)?(\d+)\s*剂/);
      if (dm) doses = dm[1];
      usage = clean(ut.replace(/^[\s，,、；;]*(?:共\s*)?\d+\s*剂[，,、；;\s]*/, ''));
      if (usage.length > 60) usage = '';
    }
    if (!doses) {
      const dm = stripMd(text).match(/(?:共|予|开|拟)\s*(\d+)\s*剂/);
      if (dm) doses = dm[1];
    }
    return { ok: herbs.length >= 3, name, herbs, doses, usage };
  }

  // ---------- CSV ----------
  function csvCell(v) {
    const s = String(v == null ? '' : v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function toCSV(rows) {
    return rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
  }

  return {
    METHODS,
    OTHER_UNITS,
    SEARCH_FIELDS,
    TEXT_FIELDS,
    uid,
    todayStr,
    parseDose,
    doseInputText,
    formatDose,
    sameDose,
    diffRx,
    buildEvolution,
    ageOf,
    ageText,
    matchPatient,
    visitLabel,
    shortVisitLabel,
    sortVisitsAsc,
    searchVisits,
    snippet,
    toCSV,
    buildHerbIndex,
    searchHerbs,
    herbUsage,
    parsePaste,
    checkIncompat,
    INCOMPAT_RULES,
    baseHerbName,
    mergeSymptoms,
    migrateVisit,
    rxWeight,
    daysBetween,
    addDays,
    followUpInfo,
    rxLine,
    changeLine,
    visitMarkdown,
    caseMarkdown,
    splitTerms,
    termSim,
    similarVisits,
    formulaBase,
    clinicStats,
    parseAiRx,
  };
});
