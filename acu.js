// ============================================================
// 针灸（电脑软件和手机共用同一份代码）：穴位库、留针计时 / 闹钟时间、床位排布、记事本文字导入
//
// 一条扎针记录（db.acu 里的一项）：
//   { id, patientId, date: '2026-11-13', bed: 1, points: ['百会', '足三里（双）'],
//     symptoms: '症状（选填）', feeling: '针后感觉（选填）', note: '',
//     status: 'active' 正在留针 | 'done' 已拔针,
//     startAt / endAt: 开始、拔针的时间, durationMin: 留针分钟, intervalMin: 行针间隔分钟,
//     manip: [每次行针的时间], createdAt, updatedAt, deletedAt }
// ============================================================
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Acu = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 穴位库：按经络分组。「名|拼音首字母」，多音字有几种读法就列几种
  const GROUPS = [
    ["手太阴肺经", "中府|zf 云门|ym 天府|tf 侠白|xb 尺泽|cz,cs 孔最|kz 列缺|lq 经渠|jq,jj 太渊|ty 鱼际|yj 少商|ss"],
    ["手阳明大肠经", "商阳|sy 二间|ej 三间|sj 合谷|hg,hy,gg,gy 阳溪|yx 偏历|pl 温溜|wl 下廉|xl 上廉|sl 手三里|ssl 曲池|qc 肘髎|zl 手五里|swl 臂臑|bn 肩髃|jy 巨骨|jg 天鼎|td 扶突|ft 口禾髎|khl 迎香|yx"],
    ["足阳明胃经", "承泣|cq 四白|sb 巨髎|jl 地仓|dc 大迎|dy 颊车|jc,jj 下关|xg 头维|tw 人迎|ry 水突|st 气舍|qs 缺盆|qp 气户|qh 库房|kf 屋翳|wy 膺窗|yc 乳中|rz 乳根|rg 不容|br,fr 承满|cm 梁门|lm 关门|gm 太乙|ty 滑肉门|hrm 天枢|ts 外陵|wl 大巨|dj 水道|sd 归来|gl 气冲|qc 髀关|bg 伏兔|ft 阴市|ys 梁丘|lq 犊鼻|db 足三里|zsl 上巨虚|sjx 条口|tk 下巨虚|xjx 丰隆|fl 解溪|jx,xx 冲阳|cy 陷谷|xg,xy 内庭|nt 厉兑|ld,lr,ly"],
    ["足太阴脾经", "隐白|yb 大都|dd 太白|tb 公孙|gs,gx 商丘|sq 三阴交|syj 漏谷|lg,ly 地机|dj 阴陵泉|ylq 血海|xh 箕门|jm 冲门|cm 府舍|fs 腹结|fj 大横|dh 腹哀|fa 食窦|sd,yd 天溪|tx 胸乡|xx 周荣|zr 大包|db"],
    ["手少阴心经", "极泉|jq 青灵|ql 少海|sh 灵道|ld 通里|tl 阴郄|yx,yq 神门|sm 少府|sf 少冲|sc"],
    ["手太阳小肠经", "少泽|sz,ss 前谷|qg,qy 后溪|hx 腕骨|wg 阳谷|yg,yy 养老|yl 支正|zz 小海|xh 肩贞|jz 臑俞|ny,ns 天宗|tz 秉风|bf 曲垣|qy 肩外俞|jwy,jws 肩中俞|jzy,jzs 天窗|tc 天容|tr 颧髎|ql 听宫|tg"],
    ["足太阳膀胱经", "睛明|jm 攒竹|zz,cz 眉冲|mc 曲差|qc 五处|wc 承光|cg 通天|tt 络却|lq 玉枕|yz 天柱|tz 大杼|dz 风门|fm 肺俞|fy,fs 厥阴俞|jyy,jys 心俞|xy,xs 督俞|dy,ds 膈俞|gy,gs 肝俞|gy,gs 胆俞|dy,ds 脾俞|py,ps 胃俞|wy,ws 三焦俞|sjy,sjs 肾俞|sy,ss 气海俞|qhy,qhs 大肠俞|dcy,dcs 关元俞|gyy,gys 小肠俞|xcy,xcs 膀胱俞|pgy,bgy,bgs,pgs 中膂俞|zly,zls 白环俞|bhy,bhs 上髎|sl 次髎|cl 中髎|zl 下髎|xl 会阳|hy,ky 承扶|cf 殷门|ym 浮郄|fx,fq 委阳|wy 委中|wz 附分|ff 魄户|ph 膏肓|gh 神堂|st 譩譆|yx 膈关|gg 魂门|hm 阳纲|yg 意舍|ys 胃仓|wc 肓门|hm 志室|zs 胞肓|bh 秩边|zb 合阳|hy,gy 承筋|cj 承山|cs 飞扬|fy 跗阳|fy 昆仑|kl 仆参|pc,ps 申脉|sm 金门|jm 京骨|jg 束骨|sg 足通谷|ztg,zty 至阴|zy"],
    ["足少阴肾经", "涌泉|yq,cq 然谷|rg,ry 太溪|tx 大钟|dz 水泉|sq 照海|zh 复溜|fl 交信|jx,js 筑宾|zb 阴谷|yg,yy 横骨|hg 大赫|dh 气穴|qx 四满|sm 中注|zz 肓俞|hy,hs 商曲|sq 石关|sg,dg 阴都|yd 腹通谷|ftg,fty 幽门|ym 步廊|bl 神封|sf 灵墟|lx 神藏|sc,sz 彧中|yz 俞府|yf,sf"],
    ["手厥阴心包经", "天池|tc 天泉|tq 曲泽|qz,qs 郄门|xm,qm 间使|js 内关|ng 大陵|dl 劳宫|lg 中冲|zc"],
    ["手少阳三焦经", "关冲|gc 液门|ym 中渚|zz 阳池|yc 外关|wg 支沟|zg 会宗|hz,kz 三阳络|syl 四渎|sd 天井|tj 清冷渊|qly 消泺|xl,xp 臑会|nh,nk 肩髎|jl 天髎|tl 天牖|ty 翳风|yf 瘛脉|cm 颅息|lx 角孙|js,jx 耳门|em 耳和髎|ehl 丝竹空|szk"],
    ["足少阳胆经", "瞳子髎|tzl 听会|th,tk 上关|sg 颔厌|hy 悬颅|xl 悬厘|xl 曲鬓|qb 率谷|lg,ly,sg,sy 天冲|tc 浮白|fb 头窍阴|tqy 完骨|wg 本神|bs 阳白|yb 头临泣|tlq 目窗|mc 正营|zy 承灵|cl 脑空|nk 风池|fc 肩井|jj 渊腋|yy 辄筋|zj 日月|ry 京门|jm 带脉|dm 五枢|ws 维道|wd 居髎|jl 环跳|ht 风市|fs 中渎|zd 膝阳关|xyg 阳陵泉|ylq 阳交|yj 外丘|wq 光明|gm 阳辅|yf 悬钟|xz 丘墟|qx 足临泣|zlq 地五会|dwh,dwk 侠溪|xx 足窍阴|zqy"],
    ["足厥阴肝经", "大敦|dd 行间|xj,hj 太冲|tc 中封|zf 蠡沟|lg 中都|zd 膝关|xg 曲泉|qq 阴包|yb 足五里|zwl 阴廉|yl 急脉|jm 章门|zm 期门|qm,jm"],
    ["督脉", "长强|cq,cj,zq,zj 腰俞|yy,ys 腰阳关|yyg 命门|mm 悬枢|xs 脊中|jz 中枢|zs 筋缩|js 至阳|zy 灵台|lt 神道|sd 身柱|sz 陶道|td,yd 大椎|dz,dc 哑门|ym 风府|ff 脑户|nh 强间|qj,jj 后顶|hd 百会|bh,bk 前顶|qd 囟会|xh,xk 上星|sx 神庭|st 素髎|sl 水沟|sg 兑端|dd,rd,yd 龈交|yj,kj 印堂|yt"],
    ["任脉", "会阴|hy,ky 曲骨|qg 中极|zj 关元|gy 石门|sm,dm 气海|qh 阴交|yj 神阙|sq 水分|sf 下脘|xw 建里|jl 中脘|zw 上脘|sw 巨阙|jq 鸠尾|jw,jy 中庭|zt 膻中|sz,dz 玉堂|yt 紫宫|zg 华盖|hg,hh 璇玑|xj 天突|tt 廉泉|lq 承浆|cj"],
    ["经外奇穴", "四神聪|ssc 当阳|dy 鱼腰|yy 太阳|ty 耳尖|ej 球后|qh 上迎香|syx 内迎香|nyx 聚泉|jq 海泉|hq 金津|jj 玉液|yy 翳明|ym 颈百劳|jbl,gbl 安眠|am 牵正|qz 夹承浆|jcj,gcj,xcj 子宫|zg 三角灸|sjj 提托|tt,dt 定喘|dc 夹脊|jj,gj,xj 胃脘下俞|wwxy,wwxs 痞根|pg 下极俞|xjy,xjs 腰宜|yy 腰眼|yy 十七椎|sqz,sqc 腰奇|yq,yj 肘尖|zj 二白|eb 中泉|zq 中魁|zk 大骨空|dgk 小骨空|xgk 腰痛点|ytd 外劳宫|wlg 落枕|lz 八邪|bx,by 四缝|sf 十宣|sx 髋骨|kg 鹤顶|hd 百虫窝|bcw 内膝眼|nxy 外膝眼|wxy 膝眼|xy 胆囊|dn 阑尾|lw,ly 内踝尖|nhj 外踝尖|whj 八风|bf 独阴|dy 气端|qd 人中|rz"],
  ];

  const POINTS = [];
  const PY = new Map(); // 穴名 → [首字母…]
  const MERIDIAN = new Map();
  for (const [g, s] of GROUPS) {
    for (const item of s.split(' ')) {
      const [name, ini] = item.split('|');
      POINTS.push(name);
      PY.set(name, ini.split(','));
      MERIDIAN.set(name, g);
    }
  }
  const ALIAS = { 人中: '水沟', 外膝眼: '犊鼻' };
  // 以前写错的穴名，自动改成对的
  const FIX = { 间骨: '间谷' };
  // 自定义穴位（书上没有的穴位、刺血部位…）：名称 → { py:[首字母], mod:'刺血'… }；别名 → 名称
  let CUSTOM = new Map();
  let CUSTOM_ALIAS = {};
  let customKey = '';
  // 从长到短，导入时先匹配长的（「足三里」不会被认成「三里」）
  const BY_LEN = [...POINTS].sort((a, b) => b.length - a.length);

  const pad = (n) => String(n).padStart(2, '0');
  const todayStr = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const uid = () => `a_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

  // ---------- 设置 ----------
  const DEFAULTS = { beds: 4, duration: 60, interval: 15 };
  function settingsOf(settings) {
    const a = (settings && settings.acu) || {};
    const int = (v, d, lo, hi) => {
      const n = Math.round(Number(v));
      return Number.isFinite(n) && n >= lo && n <= hi ? n : d;
    };
    return { beds: int(a.beds, DEFAULTS.beds, 1, 12), duration: int(a.duration, DEFAULTS.duration, 5, 240), interval: int(a.interval, DEFAULTS.interval, 0, 120) };
  }

  // ---------- 穴位 ----------
  // 拆开一串穴位：「百会，四神聪、双足三里 内关(双)」→ 数组（去掉重复）
  function splitPoints(text) {
    const out = [];
    String(text || '')
      .replace(/[（(]\s*(双|双侧|左|右|左侧|右侧)\s*[)）]/g, '（$1）')
      .split(/[\s,，、;；。.\/|+＋]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((p) => {
        if (!out.includes(p)) out.push(p);
      });
    return out;
  }
  // 去掉左右双的标记，得到穴名本身
  function pointBase(p) {
    const s = String(p || '')
      .replace(/[（(][^)）]*[)）]/g, '')
      .replace(/^(双侧|双|左侧|右侧|左|右|两侧)/, '')
      .replace(/(双侧|双|两侧)$/, '')
      .trim();
    return ALIAS[s] || CUSTOM_ALIAS[s] || FIX[s] || s;
  }
  // 这个写法代表几根针：标了「双」的算 2 根，其余 1 根
  // 刺血、点刺、单纯灸的不留针，拔针时不用核对（温针要拔）
  function needleCount(p) {
    const s = String(p || '');
    if (/刺血|放血|点刺|拔罐/.test(s)) return 0;
    if (/灸/.test(s) && !/温针/.test(s)) return 0;
    if (pointBase(s) === '神阙') return 0;
    return /双|两侧/.test(s) ? 2 : 1;
  }
  // 拔针时要核对的（留着针的）
  const needsRemoval = (p) => needleCount(p) > 0;
  const resolve = (x) => ALIAS[x] || CUSTOM_ALIAS[x] || FIX[x] || (x === '三里' ? '足三里' : x);
  const isKnownPoint = (p) =>
    pointBase(p)
      .split('透')
      .every((x) => PY.has(resolve(x)) || CUSTOM.has(resolve(x)));
  const isCustomPoint = (p) => {
    const b = pointBase(p);
    return !PY.has(b) && CUSTOM.has(b);
  };

  // ---------- 自定义穴位 ----------
  // 存在 settings.acu.custom：[{ name:'仙骨', alias:['仙骨穴'], mod:'', py:'xg' }]
  //   mod：默认刺法，如「刺血」（选它时自动写成「脚刺痛处（刺血）」，拔针时不用核对）
  //   py：拼音首字母，电脑上自动算（手机上新加的，下次电脑打开时补上）
  const cleanName = (n) =>
    String(n || '')
      .replace(/[（(][^)）]*[)）]/g, '')
      .replace(/[\s,，、;；。.\/|+＋=＝:：]/g, '')
      .trim();
  function normCustom(arr) {
    const out = [];
    const seen = new Set();
    for (const x of Array.isArray(arr) ? arr : []) {
      const o = typeof x === 'string' ? { name: x } : x || {};
      const name = cleanName(o.name);
      if (!name || seen.has(name) || PY.has(name) || ALIAS[name]) continue;
      seen.add(name);
      const alias = [...new Set((Array.isArray(o.alias) ? o.alias : []).map(cleanName))].filter((a) => a && a !== name && !PY.has(a) && !ALIAS[a]);
      out.push({ name, alias, mod: String(o.mod || '').trim(), py: String(o.py || '').toLowerCase().replace(/[^a-z,]/g, '') });
    }
    return out;
  }
  const hasCustom = (settings) => !!(settings && settings.acu && Array.isArray(settings.acu.custom));
  const customOf = (settings) => normCustom(hasCustom(settings) ? settings.acu.custom : []);
  // 用设置里的自定义穴位（显示、补全、导入都按这个认）。没设置过时，用记录里用过的
  function setCustom(settings, acuList) {
    const list = hasCustom(settings) ? customOf(settings) : initialCustom(acuList);
    const key = JSON.stringify(list);
    if (key === customKey) return list;
    customKey = key;
    CUSTOM = new Map();
    CUSTOM_ALIAS = {};
    for (const c of list) {
      CUSTOM.set(c.name, { py: c.py ? c.py.split(',') : [], mod: c.mod, alias: c.alias });
      for (const a of c.alias) if (!CUSTOM.has(a)) CUSTOM_ALIAS[a] = c.name;
    }
    return list;
  }
  // 第一次：把记录里用过的、书上没有的穴位都列进自定义穴位（间骨 → 间谷 的别名）
  function initialCustom(acuList) {
    const m = new Map();
    for (const a of acuList || []) {
      if (a.deletedAt) continue;
      for (const p of a.points || []) {
        for (let x of pointBase(p).split('透')) {
          x = FIX[x] || x;
          if (!x || PY.has(resolve(x))) continue;
          m.set(x, (m.get(x) || 0) + 1);
        }
      }
    }
    const list = [...m.keys()].sort((a, b) => m.get(b) - m.get(a)).map((name) => ({ name, alias: [], mod: '', py: '' }));
    for (const [wrong, right] of Object.entries(FIX)) {
      const c = list.find((x) => x.name === right);
      if (c && !c.alias.includes(wrong)) c.alias.push(wrong);
    }
    return normCustom(list);
  }
  // 一行一个：「仙骨」「间谷=间骨」「脚刺痛处（刺血）」「疏肝=疏肝穴、疏肝点」
  function parseCustomText(text, old) {
    const prev = new Map(normCustom(old).map((c) => [c.name, c]));
    const out = [];
    for (const line of String(text || '').split(/\n/)) {
      if (!line.trim()) continue;
      const mm = /[（(]\s*([^)）]+?)\s*[)）]/.exec(line);
      const rest = line.replace(/[（(][^)）]*[)）]/g, '');
      const [l, r] = rest.split(/[=＝]/);
      const name = cleanName(l);
      if (!name) continue;
      const alias = splitPoints(r || '').map(cleanName).filter(Boolean);
      out.push({ name, alias, mod: mm ? mm[1] : '', py: name === (prev.get(name) || {}).name ? prev.get(name).py : '' });
    }
    return normCustom(out);
  }
  const customText = (list) => normCustom(list).map((c) => c.name + (c.mod ? `（${c.mod}）` : '') + (c.alias.length ? '=' + c.alias.join('、') : '')).join('\n');
  // 从补全里选了一个穴位：自定义穴位有默认刺法的，带上
  const pickLabel = (name) => {
    const c = CUSTOM.get(name);
    return c && c.mod ? `${name}（${c.mod}）` : name;
  };
  // 把写错的 / 别名换成正式的名字（左右双、括号里的说明都保留）
  function canonPoint(p) {
    const s = String(p || '');
    const m = /^(双侧|双|左侧|右侧|左|右|两侧)?([^（(]*)([\s\S]*)$/.exec(s);
    const tail = /(双侧|双|两侧)$/.exec(m[2]);
    const core = tail ? m[2].slice(0, -tail[0].length) : m[2];
    const fixed = core
      .split('透')
      .map((x) => FIX[x.trim()] || CUSTOM_ALIAS[x.trim()] || x)
      .join('透');
    return (m[1] || '') + fixed + (tail ? tail[0] : '') + m[3];
  }
  // 拆开 / 拼回一个穴位的写法：「右仙骨（刺血，胃）」⇄ { side:'右', name:'仙骨', tags:['刺血','胃'] }
  function partsOf(p) {
    let s = String(p || '').trim();
    const tags = [];
    let side = '';
    s = s.replace(/[（(]([^)）]*)[)）]/g, (_, t) => {
      for (const x of t.split(/[，,、]/).map((y) => y.trim()).filter(Boolean)) {
        if (/^(双|双侧|两侧)$/.test(x)) side = '双';
        else if (/^(左|左侧)$/.test(x)) side = '左';
        else if (/^(右|右侧)$/.test(x)) side = '右';
        else tags.push(x);
      }
      return '';
    });
    const pre = /^(双侧|两侧|双|左侧|右侧|左|右)/.exec(s);
    if (pre) {
      side = pre[1][0] === '两' ? '双' : pre[1][0];
      s = s.slice(pre[0].length);
    }
    const post = /(双侧|两侧|双)$/.exec(s);
    if (post) {
      side = '双';
      s = s.slice(0, -post[0].length);
    }
    return { side, name: s.trim(), tags };
  }
  function buildLabel({ side, name, tags }) {
    const t = tags || [];
    const l = (side || '') + name;
    return t.length ? `${l}（${t.join('，')}）` : l;
  }

  // 统计用过的穴位次数（用得多的排在补全前面）
  function pointUsage(acuList) {
    const m = new Map();
    for (const a of acuList || []) {
      if (a.deletedAt) continue;
      for (const p of a.points || []) {
        const b = pointBase(p);
        if (b) m.set(b, (m.get(b) || 0) + 1);
      }
    }
    return m;
  }

  // 补全：输入穴名的一部分或拼音首字母（zsl → 足三里）
  const GROUP_PY = { 老十针: 'lsz', 上中下脘: 'szxw' };
  function searchPoints(q, usage, limit = 12, groups) {
    q = String(q || '').trim().toLowerCase();
    if (!q) return [];
    // 穴组（老十针…）排最前
    const gs = groups ? Object.keys(groups).filter((g) => g.startsWith(q) || g.includes(q) || (GROUP_PY[g] || '').startsWith(q)) : [];
    const cust = [...CUSTOM.keys()].filter((k) => !PY.has(k));
    const extra = usage ? [...usage.keys()].filter((k) => !PY.has(k) && !CUSTOM.has(k) && !CUSTOM_ALIAS[k] && !FIX[k]) : [];
    const res = [];
    for (const name of POINTS.concat(cust, extra)) {
      let score = -1;
      const c = CUSTOM.get(name);
      const inis = PY.get(name) || (c && c.py) || [];
      if (name === q) score = 100;
      else if (name.startsWith(q)) score = 80;
      else if (inis.some((i) => i === q)) score = 70;
      else if (inis.some((i) => i.startsWith(q))) score = 60;
      else if (c && c.alias.some((a) => a.startsWith(q))) score = 55;
      else if (name.includes(q)) score = 40;
      if (score < 0) continue;
      score += Math.min(30, (usage && usage.get(name)) || 0);
      res.push({ name, score });
    }
    res.sort((a, b) => b.score - a.score || a.name.length - b.name.length);
    return gs.concat(res.map((r) => r.name).filter((n) => !gs.includes(n))).slice(0, limit);
  }

  // ---------- 留针计时 ----------
  const isActive = (a) => !!a && !a.deletedAt && a.status === 'active';
  const durOf = (a, cfg) => (a && a.durationMin) || (cfg && cfg.duration) || DEFAULTS.duration;
  const intOf = (a, cfg) => {
    const v = a && a.intervalMin != null ? a.intervalMin : cfg && cfg.interval != null ? cfg.interval : DEFAULTS.interval;
    return v;
  };

  // 这条留针的所有闹钟：行针固定在开始后 15、30、45 分钟（去没去都不改），到时间拔针；
  // 拔针到了还没点「拔针」，再过 5、10 分钟各提醒一次
  function alarmsOf(a, cfg) {
    if (!isActive(a)) return [];
    const t0 = new Date(a.startAt).getTime();
    if (!Number.isFinite(t0)) return [];
    const dur = durOf(a, cfg);
    const iv = intOf(a, cfg);
    const out = [];
    if (iv > 0) for (let k = 1; k * iv < dur; k++) out.push({ idx: k, kind: 'manip', n: k, at: t0 + k * iv * 60000 });
    out.push({ idx: 50, kind: 'remove', n: 0, at: t0 + dur * 60000 });
    out.push({ idx: 51, kind: 'remove', n: 1, at: t0 + (dur + 5) * 60000 });
    out.push({ idx: 52, kind: 'remove', n: 2, at: t0 + (dur + 10) * 60000 });
    return out;
  }

  // 给手机通知用的数字编号：同一条记录、同一个闹钟永远是同一个号，方便取消、重排
  function notifId(sessionId, idx) {
    let h = 2166136261;
    const s = String(sessionId);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 20000000) * 64 + (idx % 64) + 1;
  }

  // 现在的状态：留了多久、下一次行针、几点拔针、是否已到时间
  function statusOf(a, cfg, now = Date.now()) {
    const t0 = new Date(a.startAt).getTime();
    const dur = durOf(a, cfg);
    const iv = intOf(a, cfg);
    const elapsed = Math.max(0, (now - t0) / 60000);
    const removeAt = t0 + dur * 60000;
    const al = alarmsOf(a, cfg).filter((x) => x.kind === 'manip');
    const next = al.find((x) => x.at > now) || null;
    const lastDue = [...al].reverse().find((x) => x.at <= now) || null;
    return {
      elapsed,
      left: (removeAt - now) / 60000,
      removeAt,
      due: now >= removeAt,
      nextManip: next,
      lastDue, // 最近一次已经到点的行针（第几次）
      plannedManip: al.length,
      manipDone: (a.manip || []).length,
      progress: Math.min(1, elapsed / dur),
      interval: iv,
      duration: dur,
    };
  }

  // ---------- 床位排布 ----------
  // 每两张床一列，从右往左：右上 1、右下 2，左上 3、左下 4；再多就继续往左
  function bedLayout(count) {
    const cols = Math.ceil(count / 2);
    const out = [];
    for (let n = 1; n <= count; n++) {
      const c = Math.floor((n - 1) / 2);
      out.push({ bed: n, col: cols - c, row: ((n - 1) % 2) + 1 });
    }
    return { cols, beds: out };
  }

  // ---------- 穴组（一个名字代表一组穴位，如「老十针」） ----------
  const DEFAULT_GROUPS = { 老十针: ['上脘', '中脘', '下脘', '天枢', '气海', '足三里', '太冲', '内关', '关元'], 上中下脘: ['上脘', '中脘', '下脘'] };
  // 设置里写的穴组：{ 名称: [穴位…] }，和默认的合在一起
  function groupsOf(settings) {
    const g = Object.assign({}, DEFAULT_GROUPS);
    const u = settings && settings.acu && settings.acu.groups;
    if (u && typeof u === 'object')
      for (const k of Object.keys(u)) {
        if (!Array.isArray(u[k])) continue;
        if (u[k].length) g[k] = u[k].slice();
        else delete g[k]; // 设置里删掉了
      }
    return g;
  }
  // 「老十针」→ 展开成 9 个穴位；同一个穴位后面写了刺法（「中脘（温针）」）的，用后面的
  function expandGroups(points, groups) {
    const out = [];
    for (const p of points || []) {
      const list = groups && groups[p] ? groups[p] : [p];
      for (const x of list) addPoint(out, x);
    }
    return out;
  }
  function addPoint(list, p) {
    const base = pointBase(p);
    const i = list.findIndex((x) => pointBase(x) === base && pointSide(x) === pointSide(p));
    if (i < 0) list.push(p);
    else if (p.length > list[i].length) list[i] = p; // 后写的带刺法 / 方位，更具体
  }
  const pointSide = (p) => {
    const m = /^(双|左|右)/.exec(String(p || '')) || /[（(](双|左|右)[)）]/.exec(String(p || ''));
    return m ? m[1] : '';
  };

  // ---------- 文字导入（手机记事本里的旧记录） ----------
  // 支持两种写法：
  //  A. 一位患者一段：「洪芸，女，47：失眠，腰突。10.31委中刺血，太冲，…。11.12加右仙骨」
  //     段里按日期分成多次；「一样」＝和上次一样；「加…」＝上次的基础上再加；其余的话当作感觉、备注
  //  B. 一次一行：「11月8日 张三 失眠 百会 四神聪 针后睡意明显」
  const ALIAS2 = Object.assign({ 三里: '足三里', 大棱: '大陵', 仙骨穴: '仙骨' }, ALIAS);
  // 书上没有、但常写的穴位 / 部位 / 董氏奇穴（导入时当作穴位）。用过的自定义穴位也会自动加进来
  const SEED_CUSTOM = [
    '仙骨', '足三重', '侧头', '火土', '间谷', '疏肝', '咽痛点', '四指尖', '灵骨', '大白', '中白', '下白', '腕顺', '重子', '重仙', '叉三', '三叉一', '三叉二', '三叉三',
    '门金', '木穴', '正筋', '正宗', '三重', '驷马', '制污', '妇科', '还巢', '龙眼', '暖宫', '护宫', '子门', '子户', '中指', '小指', '中指小指', '耳尖', '肘窝',
    '八髎', '肩', '颈', '背', '脖子', '肩颈', '肩膀', '肩周', '颈背', '颈肩', '颈肩臂', '肩颈背', '脖子头', '脖子肩', '后脑勺', '屁股', '三角肌', '胳膊', '压痛点',
    '血海上压痛点', '血海上面压痛点', '合谷下面',
  ];
  // 刺法、用法（写在穴位后面）
  const MODS = ['温针灸', '温针', '刺血', '放血', '点刺', '艾灸', '加灸', '灸', '电针', '火针', '拔罐', '浅扎', '深扎', '降压', '强腰', '消肿', '疏肝利胆', '利胆', '止痒'];
  const MOD_NORM = { 温针灸: '温针', 放血: '刺血', 艾灸: '灸', 加灸: '灸' };
  // 写在穴位前面的用途 / 说明（「止痒血海」「噩梦商丘」）
  const PRE_NOTE = /^(止痒|痛经|噩梦|害怕|不怕冷|腿肿加|腿肿|前列腺加|前列腺|月经不尽灸|月经不尽|先|再|只扎了|只扎|只|扎了|扎|又扎|还扎|灸)/;
  // 穴位后面跟的这些字，说明是在讲感觉，不是穴位备注
  const FEEL_CH = /[没不了好感觉痛疼胀舒服轻松凉气动出冒热暖酸麻瘤病炎症结节肿脱垂药难受晕后息增生囊术]/;
  // 身体部位（「脖子好些」是在说效果，不是扎了脖子）
  const AREAS = new Set(['肩', '颈', '背', '脖子', '肩颈', '肩膀', '肩周', '颈背', '颈肩', '颈肩臂', '肩颈背', '脖子头', '脖子肩', '后脑勺', '屁股', '三角肌', '胳膊', '腰', '头']);
  const EVAL_TAIL = /^(没感觉|没啥感觉|没效果?|不明显|好些|好多了|好一点|好了|舒服了|舒服|轻松了|轻松|不胀痛了|不疼了|不痛了|没那么.+)$/;
  const DATE_ANY = /(?:(20\d{2})\s*[年.\-\/]\s*)?(?<!\d)(\d{1,2})\s*(?:[月.\-\/])\s*(\d{1,2})(?!\d)\s*[日号]?/g;

  function makeDict(custom, groups) {
    const names = new Set(POINTS.concat(Object.keys(ALIAS2), Object.keys(FIX), SEED_CUSTOM, [...CUSTOM.keys()], Object.keys(CUSTOM_ALIAS), custom || [], Object.keys(groups || {})));
    return [...names].filter(Boolean).sort((a, b) => b.length - a.length);
  }
  const canon = (n) => FIX[n] || CUSTOM_ALIAS[n] || ALIAS2[n] || n;
  const normMod = (m) => MOD_NORM[m] || m;

  // 把「双手 / 左手 / 两只手」这种写法统一成「双 / 左 / 右」
  function normText(t) {
    return String(t || '')
      .replace(/两只手|双手手|双手|两手/g, '双')
      .replace(/([左右])手手?(?!三里|五里)/g, '$1')
      .replace(/两(?=[一-龥]{1,4}透)/g, '双')
      .replace(/两(?=仙骨|液门|三叉)/g, '双');
  }

  // 把一小段（逗号之间）认成穴位；认不出返回 null
  // 「天枢气海足三里」「老十针加阳陵泉」「右液门透中渚」「委中刺血」「关元温针」「丰隆穴」「肾俞双侧」「门金（陷谷）」
  function tokenizePoints(seg, dict) {
    const s = String(seg).replace(/穴(?=$|[双左右透刺温灸（(，、])/g, '');
    const out = [];
    let i = 0;
    while (i < s.length) {
      const rest = s.slice(i);
      const conn = /^(加了|加上|加|和|及|还有|配|、)/.exec(rest);
      if (conn && out.length) {
        i += conn[0].length;
        continue;
      }
      let side = '';
      const sm = /^(双侧|两侧|左侧|右侧|双|左|右)/.exec(rest);
      if (sm) {
        side = sm[1].replace(/侧$/, '').replace('两', '双');
        i += sm[0].length;
      }
      const r2 = s.slice(i);
      const name = dict.find((n) => r2.startsWith(n));
      if (!name) {
        // 穴位后面跟着的几个字的说明（「中脘胃寒」）：算作这个穴位的备注
        if (out.length && !side && r2.length <= 4 && /^[一-龥]+$/.test(r2) && !FEEL_CH.test(r2) && !AREAS.has(out[out.length - 1].name)) {
          const last = out[out.length - 1];
          last.note = [last.note, r2].filter(Boolean).join('，');
          return out;
        }
        return null;
      }
      i += name.length;
      let label = canon(name);
      const tm = /^透/.exec(s.slice(i));
      if (tm) {
        const r3 = s.slice(i + 1);
        const n2 = dict.find((n) => r3.startsWith(n));
        if (n2) {
          label = label + '透' + canon(n2);
          i += 1 + n2.length;
        }
      }
      const t = { name: label, side, mod: '', note: '' };
      // 后面的「（双）」「双侧」「（陷谷）」「（右很疼）」、刺法，可以有好几个
      for (;;) {
        const r4 = s.slice(i);
        const pm = /^(?:[（(](双|左|右)(?:侧)?[)）]|(双侧|两侧))/.exec(r4);
        if (pm) {
          t.side = (pm[1] || pm[2]).replace(/侧$/, '').replace('两', '双');
          i += pm[0].length;
          continue;
        }
        const md = MODS.find((m) => r4.startsWith(m));
        if (md) {
          t.mod = [t.mod, normMod(md)].filter(Boolean).join('，');
          i += md.length;
          continue;
        }
        const nm = /^[（(]([^)）]*)[)）]/.exec(r4);
        if (nm) {
          t.note = [t.note, nm[1]].filter(Boolean).join('，');
          i += nm[0].length;
          continue;
        }
        break;
      }
      out.push(t);
    }
    // 「肝俞八髎刺血」「少商和商阳刺血」：刺血写在最后，前面的也是
    const lastMod = out.length > 1 && out[out.length - 1].mod;
    if (lastMod === '刺血' && out.slice(0, -1).every((x) => !x.mod)) out.forEach((x) => (x.mod = '刺血'));
    return out.length ? out : null;
  }
  function labelOf(t) {
    let l = t.name;
    const tags = [];
    if (t.side === '双') tags.push('双');
    else if (t.side) l = t.side + l;
    if (t.mod) tags.push(t.mod);
    if (t.note) tags.push(t.note.replace(/\u2063/g, '、'));
    return tags.length ? `${l}（${tags.join('，')}）` : l;
  }

  // 一段文字（一次就诊）→ 写出来的穴位和各种说法
  //   points：这次写出来的穴位；same：「一样 / 加… / 其他一样」（在上次的基础上）；first：「按第一次来」
  //   remove：「不要… / 去…」；noBlood：「不刺血」；noMoxa：「没灸 / 关元不灸」（true 或穴位名）；moxaTo：「灸换到中脘」
  //   only：「只扎了…」；pre / post：穴位前 / 后的话；feel：「针后…」
  function parseSession(text, dict, groups) {
    const res = { added: [], points: [], same: false, first: false, only: false, remove: [], noBlood: false, noMoxa: [], moxaTo: '', pre: [], post: [], feel: [] };
    const addTok = (toks, pre, isAdd) => {
      if (isAdd) toks.forEach((t) => res.added.push(t.name));
      toks.forEach((t, k) => {
        if (k === 0 && pre) {
          if (/灸$/.test(pre)) t.mod = [t.mod, '灸'].filter(Boolean).join('，');
          const note = pre.replace(/^(先|再|只扎了|只扎|只|扎|又扎|还扎)$/, '').replace(/(加|灸)$/, '');
          if (note && note.length >= 3) res.pre.push(note); // 「月经不尽灸隐白」：前面那几个字是病症
          else if (note && !/^(先|再|只|扎)/.test(pre)) t.note = [note, t.note].filter(Boolean).join('，');
        }
        if (groups[t.name] && !t.side && !t.mod && !t.note) for (const x of groups[t.name]) addPoint(res.points, x);
        else addPoint(res.points, labelOf(t));
      });
    };
    const remark = (seg) => (res.points.length || res.same ? res.post : res.pre).push(seg);
    // 括号里的逗号不算分隔
    const clean = normText(text).replace(/[（(][^)）]*[)）]/g, (m) => m.replace(/[，,、]/g, '\u2063'));
    for (const big of clean.split(/[，,。；;：:\n\s]+/).filter(Boolean)) {
      const subs = big
        .split('、')
        .map((x) => x.trim())
        .filter(Boolean);
      let mode = ''; // remove：这一串都是去掉的
      // 「少商、商阳、咽痛点刺血」：刺血写在最后，前面几个也是刺血
      const lm = subs.length > 1 && /(刺血|放血|点刺)$/.exec(subs[subs.length - 1]);
      for (let si = 0; si < subs.length; si++) {
        let seg = subs[si];
        if (lm && si < subs.length - 1 && !MODS.some((m) => seg.endsWith(m)) && tokenizePoints(seg, dict)) seg += lm[1];
        if (/^(一样|同上|同前|同上次|和上次一样|跟上次一样|同前方|其他一样|其余一样|别的一样|其它一样)$/.test(seg)) {
          res.same = true;
          continue;
        }
        if (/^(刺血|放血|还刺血|也刺血)$/.test(seg)) {
          res.same = true; // 「刺血，加合谷」：照上次刺血
          continue;
        }
        if (/^按第一次(来|的)?$/.test(seg)) {
          res.first = true;
          continue;
        }
        if (/^(不|没|未|停)(刺血|放血)$/.test(seg)) {
          res.noBlood = true;
          res.same = true;
          remark(seg);
          continue;
        }
        if (/^下次/.test(seg)) {
          remark(seg);
          continue;
        }
        const fm = /^(针后|扎后|扎完|拔针后|起针后|反馈)(.*)$/.exec(seg);
        if (fm) {
          if (fm[2]) res.feel.push(fm[2]);
          continue;
        }
        // 不灸：「没灸」「关元不灸」「不灸暖宫」
        const nm1 = /^(没|不|未|停)(灸|温针)(.*)$/.exec(seg);
        const nm2 = /^(.+?)(不灸|没灸|不温针)$/.exec(seg);
        if (nm1 || nm2) {
          const who = nm1 ? nm1[3] : nm2[1];
          const tk = who && tokenizePoints(who, dict);
          res.noMoxa.push(tk ? canon(tk[0].name) : '*');
          res.same = true;
          remark(seg);
          continue;
        }
        const mx = /(?:灸|温针)(?:换到|改到|换成|改成|移到|挪到)([一-龥]{2,4})/.exec(seg);
        if (mx && dict.includes(mx[1])) {
          res.moxaTo = canon(mx[1]);
          res.same = true;
          remark(seg);
          continue;
        }
        // 去掉：「不要疏肝」「疏肝不要」「去阴陵泉、曲池」「去仙骨加阳陵泉」
        let rm = /^(不要|去掉|去|减去|拿掉|不扎)(.+)$/.exec(seg);
        const rm2 = /^(.+?)(不要|去掉|不扎了?)$/.exec(seg);
        if (!rm && rm2 && tokenizePoints(rm2[1], dict)) rm = [seg, '去', rm2[1]];
        if (rm || (mode === 'remove' && tokenizePoints(seg, dict))) {
          let body = rm ? rm[2] : seg;
          let addPart = '';
          const ap = /^(.+?)加(.+)$/.exec(body);
          if (ap && tokenizePoints(ap[1], dict) && tokenizePoints(ap[2], dict)) (body = ap[1]), (addPart = ap[2]);
          const tk = tokenizePoints(body, dict);
          if (tk) {
            for (const t of tk) res.remove.push(labelOf(t));
            res.same = true;
            mode = 'remove';
            if (addPart) {
              addTok(tokenizePoints(addPart, dict), '', true);
              mode = '';
            }
            continue;
          }
        }
        mode = mode === 'remove' && !/^加/.test(seg) ? mode : '';
        let add = false;
        const am = /^(加了|加上|加)(.+)$/.exec(seg);
        if (am && tokenizePoints(am[2], dict)) {
          add = true;
          seg = am[2];
        }
        let toks = tokenizePoints(seg, dict);
        let pre = '';
        if (!toks) {
          // 前面有用途说明：「止痒血海」「噩梦商丘」「只扎了三里和疏肝」「灸隐白」「腿肿加太溪」
          const pm = PRE_NOTE.exec(seg) || /^([一-龥]{1,4}?)(加|灸)(?=[一-龥])/.exec(seg);
          if (pm) {
            const t2 = tokenizePoints(seg.slice(pm[0].length), dict);
            if (t2) {
              toks = t2;
              pre = pm[0];
              if (/^只/.test(pre)) res.only = true;
              if (/加$/.test(pre)) add = true;
            }
          }
        }
        let tail = '';
        if (!toks) {
          // 「疏肝没感觉」「颈背不胀痛了」：前面是穴位，后面是效果
          for (let k = seg.length - 1; k > 0; k--) {
            if (!EVAL_TAIL.test(seg.slice(k))) continue;
            const t3 = tokenizePoints(seg.slice(0, k), dict);
            if (t3 && !(t3.length === 1 && AREAS.has(t3[0].name))) {
              toks = t3;
              tail = seg.slice(k);
              break;
            }
          }
        }
        if (toks) {
          if (add) res.same = true;
          addTok(toks, pre, add);
          if (tail) res.post.push(tail);
        } else remark(seg.replace(/\u2063/g, '，'));
      }
    }
    if (res.only) res.same = false;
    return res;
  }

  // 日期：「10.31」「2026.11.8」「11月8日」；没写年份按今年，比今天还晚就算去年
  function dateOf(m, today) {
    const mo = +m[2];
    const d = +m[3];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    let y;
    if (m[1]) y = +m[1];
    else {
      const t = today || todayStr();
      y = +t.slice(0, 4);
      if (`${y}-${pad(mo)}-${pad(d)}` > t) y -= 1;
    }
    return `${y}-${pad(mo)}-${pad(d)}`;
  }
  function findDate(s, today) {
    DATE_ANY.lastIndex = 0;
    let m;
    while ((m = DATE_ANY.exec(s))) {
      const date = dateOf(m, today);
      if (date) return { date, index: m.index, text: m[0] };
    }
    return null;
  }
  // 一段里所有的日期位置
  function allDates(s, today) {
    const out = [];
    DATE_ANY.lastIndex = 0;
    let m;
    while ((m = DATE_ANY.exec(s))) {
      const date = dateOf(m, today);
      // 「47.5」这种不是日期：前面紧挨着数字或小数点的不算
      if (date) out.push({ date, index: m.index, end: m.index + m[0].length });
    }
    return out;
  }

  function looksLikePoints(x, dict) {
    if (tokenizePoints(x, dict)) return true;
    const pm = PRE_NOTE.exec(x);
    if (pm && tokenizePoints(x.slice(pm[0].length), dict)) return true;
    for (let k = x.length - 1; k > 0; k--) if (EVAL_TAIL.test(x.slice(k)) && tokenizePoints(x.slice(0, k), dict)) return true;
    return false;
  }

  // 开头的「姓名，女，47：主诉」
  function parseHeader(h, dict, names) {
    const r = { name: '', patientId: null, gender: '', age: null, complaint: [], rest: '' };
    let s = h.trim();
    const known = names.find((p) => s.startsWith(p.name));
    if (known) {
      r.name = known.name;
      r.patientId = known.id;
      s = s.slice(known.name.length);
    } else {
      const nm = /^([一-龥·]{2,4})(?=$|[，,：:。.\s、（(])/.exec(s);
      if (!nm) return null;
      r.name = nm[1];
      s = s.slice(nm[1].length);
    }
    const segs = s.split(/[，,：:。；;、\s]+|\.(?!\d)/).filter(Boolean);
    let k = 0;
    for (; k < segs.length; k++) {
      const x = segs[k];
      if (/^[男女]$/.test(x) && !r.gender) r.gender = x;
      else if (/^(\d{1,3})(岁)?$/.test(x) && r.age == null) r.age = +/\d+/.exec(x)[0];
      else if (/^(男|女)(\d{1,3})岁?$/.test(x)) {
        r.gender = x[0];
        r.age = +/\d+/.exec(x)[0];
      } else if (looksLikePoints(normText(x), dict)) break;
      else r.complaint.push(x);
    }
    // 从第一个穴位开始（没写日期的第一次）
    if (k < segs.length) {
      const first = segs[k];
      r.rest = s.slice(s.indexOf(first));
    }
    return r;
  }

  // patients：已有患者 [{id, name}]；custom：用过的自定义穴位；groups：穴组
  // 返回 [{date, patientId, name, gender, age, points, symptoms, feeling, raw}]，每次扎针一条
  function parseImport(text, { patients = [], today, custom = [], groups } = {}) {
    groups = groups || DEFAULT_GROUPS;
    const dict = makeDict(custom, groups);
    const names = patients
      .filter((p) => p && p.name && !p.deletedAt)
      .map((p) => ({ id: p.id, name: String(p.name).trim() }))
      .filter((p) => p.name)
      .sort((a, b) => b.name.length - a.name.length);
    const lines = String(text || '')
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const items = [];
    let cur = null; // 当前患者 { name, patientId, gender, age, complaint, lastPoints, lastDate }

    const isMoxa = (p) => /（[^）]*(灸|温针)[^）]*）/.test(p);
    const stripMoxa = (p) => p.replace(/（([^）]*)）/, (m, inner) => {
      const rest = inner.split('，').filter((x) => !/^(灸|温针)$/.test(x));
      return rest.length ? `（${rest.join('，')}）` : '';
    });
    const sameSide = (a, b) => pointBase(a) === pointBase(b) && (!pointSide(b) || pointSide(a) === pointSide(b));
    const pushSession = (date, body, raw) => {
      const ps = parseSession(body, dict, groups);
      let pts = ps.points;
      const base0 = ps.first && cur && cur.firstPoints ? cur.firstPoints : cur && cur.lastPoints;
      // 「8.18脖子」：只写了部位，是在上次的基础上加
      if (pts.length && pts.every((p) => AREAS.has(pointBase(p).replace(/（.*$/, '')))) ps.same = true;
      if (base0 && !ps.only && (ps.same || ps.first || !pts.length)) {
        const base = base0.slice();
        for (const p of pts) {
          // 「左还巢、右妇科」：原来是右还巢、左妇科 → 换边
          const sd = pointSide(p);
          const j = sd && sd !== '双' && !ps.added.includes(pointBase(p)) ? base.findIndex((x) => pointBase(x) === pointBase(p) && ['左', '右'].includes(pointSide(x)) && pointSide(x) !== sd) : -1;
          if (j >= 0) base[j] = p;
          else addPoint(base, p);
        }
        pts = base;
      }
      // 「不刺血」：这次起不刺血了（以后写了刺血再加回来）
      if (ps.noBlood) pts = pts.filter((p) => !/刺血|放血|点刺/.test(p));
      // 「不要疏肝」「去仙骨」
      if (ps.remove.length) pts = pts.filter((p) => !ps.remove.some((r) => sameSide(p, r)));
      // 「灸换到中脘」：原来灸的地方不灸了，改灸中脘（以后也照这样）
      if (ps.moxaTo) {
        pts = pts.filter((p) => !(isMoxa(p) && pointBase(p) === '神阙')).map(stripMoxa);
        const i = pts.findIndex((p) => pointBase(p) === ps.moxaTo);
        const mod = /温针/.test(body) ? '温针' : '灸';
        if (i >= 0) pts[i] = labelOf({ name: pts[i].replace(/（.*$/, ''), side: pointSide(pts[i]) === '双' ? '双' : '', mod, note: '' });
        else pts.push(`${ps.moxaTo}（${mod}）`);
      }
      const keep = pts.slice();
      // 这一次「没灸」（下次写「一样」时还按原来的）
      if (ps.noMoxa.length)
        pts = pts
          .filter((p) => !(isMoxa(p) && pointBase(p) === '神阙'))
          .map((p) => (ps.noMoxa.includes('*') || ps.noMoxa.includes(pointBase(p)) ? stripMoxa(p) : p));
      // 刺血不会一直「一样」下去：上次刺血、这次没写刺血但写了「一样」的，照上次（原文就是这么记的）
      const remarks = (list) => list.join('，');
      const complaint = cur && cur.complaint ? cur.complaint : '';
      const sym = ps.pre.length && ps.points.length ? [complaint, remarks(ps.pre)].filter(Boolean).join('；') : complaint;
      const feel = [ps.points.length ? '' : remarks(ps.pre), remarks(ps.post), remarks(ps.feel)].filter(Boolean).join('，');
      const it = { date: date || null, noDate: !date, patientId: cur ? cur.patientId : null, name: cur ? cur.name : '', gender: cur ? cur.gender : '', age: cur ? cur.age : null, points: pts, symptoms: sym, feeling: feel, raw };
      items.push(it);
      if (cur) {
        if (keep.length) cur.lastPoints = keep;
        if (keep.length && !cur.firstPoints) cur.firstPoints = keep;
        if (date) cur.lastDate = date;
      }
    };

    for (const line of lines) {
      const ds = allDates(line, today);
      const startsWithDate = ds.length && ds[0].index === 0;
      let head = startsWithDate ? '' : line.slice(0, ds.length ? ds[0].index : line.length);
      let hdr = null;
      if (head) {
        hdr = parseHeader(head, dict, names);
        // 没有日期、也不像「姓名，性别…」开头的：接在上一位患者后面
        if (hdr && !ds.length && !hdr.gender && hdr.age == null && !hdr.rest && !hdr.patientId && !/[：:]/.test(head) && cur) hdr = null;
        if (hdr && !hdr.patientId && !ds.length && !hdr.gender && hdr.age == null && !/[：:，,]/.test(head.slice(hdr.name.length, hdr.name.length + 1)) && cur) hdr = null;
      }
      if (hdr) {
        cur = { name: hdr.name, patientId: hdr.patientId, gender: hdr.gender, age: hdr.age, complaint: hdr.complaint.join('，'), lastPoints: null, lastDate: null };
        if (hdr.rest) pushSession(null, hdr.rest, line);
      } else if (head && cur) {
        // 接着上一次写的（换行了）
        const last = items[items.length - 1];
        const ps = parseSession(head, dict, groups);
        if (last && last.patientId === cur.patientId && last.name === cur.name) {
          for (const p of ps.points) addPoint(last.points, p);
          const more = ps.pre.concat(ps.post, ps.feel).join('，');
          if (more) last.feeling = [last.feeling, more].filter(Boolean).join('，');
          if (ps.points.length) cur.lastPoints = last.points.slice();
        }
      }
      // 每个日期一次
      for (let i = 0; i < ds.length; i++) {
        let body = line.slice(ds[i].end, i + 1 < ds.length ? ds[i + 1].index : line.length);
        if (startsWithDate && i === 0) {
          // 「11月8日 张三 …」：日期后面是患者
          const b = body.replace(/^[\s，,：:]+/, '').replace(/(星期|周|礼拜)[一二三四五六日天]/, '').replace(/^\s+/, '');
          const known = names.find((p) => b.startsWith(p.name));
          const nm = known ? known.name : (/^([一-龥·]{2,4})(?=[\s，,：:])/.exec(b) || [])[1];
          if (nm && !(dict.includes(nm) || dict.some((d) => nm.startsWith(d)))) {
            cur = { name: nm, patientId: known ? known.id : null, gender: '', age: null, complaint: '', lastPoints: cur && cur.name === nm ? cur.lastPoints : null, lastDate: null };
            body = b.slice(nm.length);
          }
        }
        pushSession(ds[i].date, body, line.slice(ds[i].index, i + 1 < ds.length ? ds[i + 1].index : line.length).trim());
      }
    }
    return items;
  }

  // 旧的找穴位（保留给别处用）：一段文字里所有认得的穴位
  function findPoints(s) {
    const ps = parseSession(s, makeDict([], DEFAULT_GROUPS), DEFAULT_GROUPS);
    return { points: ps.points, spans: [] };
  }

  return {
    GROUPS,
    POINTS,
    MERIDIAN,
    DEFAULTS,
    settingsOf,
    splitPoints,
    pointBase,
    needleCount,
    needsRemoval,
    isKnownPoint,
    isCustomPoint,
    customOf,
    setCustom,
    initialCustom,
    parseCustomText,
    customText,
    pickLabel,
    canonPoint,
    partsOf,
    buildLabel,
    pointUsage,
    searchPoints,
    isActive,
    alarmsOf,
    notifId,
    statusOf,
    bedLayout,
    findDate,
    findPoints,
    parseImport,
    groupsOf,
    expandGroups,
    addPoint,
    DEFAULT_GROUPS,
    todayStr,
    uid,
  };
});
