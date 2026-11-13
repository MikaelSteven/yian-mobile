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
    return ALIAS[s] || s;
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
  const isKnownPoint = (p) => pointBase(p).split('透').every((x) => PY.has(ALIAS[x] || (x === '三里' ? '足三里' : x)));

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
    const extra = usage ? [...usage.keys()].filter((k) => !PY.has(k)) : [];
    const res = [];
    for (const name of POINTS.concat(extra)) {
      let score = -1;
      const inis = PY.get(name) || [];
      if (name === q) score = 100;
      else if (name.startsWith(q)) score = 80;
      else if (inis.some((i) => i === q)) score = 70;
      else if (inis.some((i) => i.startsWith(q))) score = 60;
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
  const ALIAS2 = Object.assign({ 三里: '足三里' }, ALIAS);
  // 书上没有、但常写的穴位 / 部位（导入时当作穴位）。用过的自定义穴位也会自动加进来
  const SEED_CUSTOM = ['仙骨', '足三重', '侧头', '火土', '间谷', '肩颈', '疏肝', '咽痛点', '四指尖', '灵骨', '大白', '肩中', '中白', '下白', '腕顺', '重子', '重仙', '叉三', '门金', '木穴', '正筋', '正宗', '三重', '驷马'];
  const MODS = ['温针灸', '温针', '刺血', '放血', '点刺', '艾灸', '灸', '电针', '火针', '拔罐'];
  const REMARK = /[了好疼痛不没觉得想胀麻热酸重轻样些晕吐醒肚说很太又还再才就也都能会要过时后前天次分钟小半但反胃病症咳嗽睡眠梦便尿汗饿渴累困拔扎往事啊吧呢吗的]/;
  const DATE_ANY = /(?:(20\d{2})\s*[年.\-\/]\s*)?(?<!\d)(\d{1,2})\s*(?:[月.\-\/])\s*(\d{1,2})(?!\d)\s*[日号]?/g;

  function makeDict(custom, groups) {
    const names = new Set(POINTS.concat(Object.keys(ALIAS2), SEED_CUSTOM, custom || [], Object.keys(groups || {})));
    return [...names].filter(Boolean).sort((a, b) => b.length - a.length);
  }
  const canon = (n) => ALIAS2[n] || n;

  // 把一小段（逗号之间）认成穴位；认不出返回 null
  // 「天枢气海足三里」「老十针加阳陵泉」「右液门透中渚」「委中刺血」「关元温针」「丰隆穴」「肾俞双侧」
  function tokenizePoints(seg, dict) {
    let s = seg.replace(/穴(?=$|[双左右透刺温灸])/g, '');
    const out = [];
    let i = 0;
    while (i < s.length) {
      const rest = s.slice(i);
      const conn = /^(加了|加上|加|和|及|还有|配)/.exec(rest);
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
        // 前一个穴位后面跟着刺法：「咽痛点刺血」的「刺血」已在下面处理；这里是认不出的字
        return null;
      }
      i += name.length;
      let label = canon(name);
      // 透刺：「液门透中渚」
      const tm = /^透/.exec(s.slice(i));
      if (tm) {
        const r3 = s.slice(i + 1);
        const n2 = dict.find((n) => r3.startsWith(n));
        if (n2) {
          label = label + '透' + canon(n2);
          i += 1 + n2.length;
        }
      }
      // 后面的「（双）」「双侧」
      const pm = /^(?:[（(](双|左|右)[)）]|(双侧|两侧))/.exec(s.slice(i));
      if (pm) {
        side = (pm[1] || pm[2]).replace(/侧$/, '').replace('两', '双');
        i += pm[0].length;
      }
      // 刺法：温针、刺血、灸…
      let mod = '';
      const r4 = s.slice(i);
      const md = MODS.find((m) => r4.startsWith(m));
      if (md) {
        mod = md === '温针灸' ? '温针' : md === '放血' ? '刺血' : md;
        i += md.length;
      }
      out.push({ name: label, side, mod });
    }
    return out.length ? out : null;
  }
  function labelOf(t) {
    let l = t.name;
    if (t.side) l = t.side === '双' ? `${l}（双）` : t.side + l;
    if (t.mod) l = `${l}（${t.mod}）`.replace('）（', '，');
    return l;
  }

  // 一段文字（一次就诊）→ { points（写出来的穴位）, same（写了「一样」或「加…」）, pre（穴位前的话）, post（穴位后的话） }
  function parseSession(text, dict, groups) {
    const segs = [];
    for (const big of String(text || '').split(/[，,。；;：:\n\s]+/)) {
      const parts = big
        .split('、')
        .map((x) => x.trim())
        .filter(Boolean);
      // 「少商、商阳、咽痛点刺血」：刺血写在最后，前面几个也是刺血
      const lm = parts.length > 1 && /(刺血|放血|点刺)$/.exec(parts[parts.length - 1]);
      for (let i = 0; i < parts.length; i++) segs.push(lm && i < parts.length - 1 && !MODS.some((m) => parts[i].endsWith(m)) && tokenizePoints(parts[i], dict) ? parts[i] + lm[1] : parts[i]);
    }
    const res = { points: [], same: false, pre: [], post: [], feel: [], noMoxa: false, moxaTo: '' };
    for (let seg of segs) {
      if (/^(一样|同上|同前|同上次|和上次一样|跟上次一样|同前方)$/.test(seg)) {
        res.same = true;
        continue;
      }
      if (/(没|不|未|停)(灸|温针)/.test(seg)) res.noMoxa = true;
      const mx = /(?:灸|温针)(?:换到|改到|换成|改成|移到|挪到)([\u4e00-\u9fa5]{2,4})/.exec(seg);
      if (mx && dict.includes(mx[1])) res.moxaTo = canon(mx[1]);
      const fm = /^(针后|扎后|扎完|拔针后|起针后|反馈)(.*)$/.exec(seg);
      if (fm) {
        if (fm[2]) res.feel.push(fm[2]);
        continue;
      }
      let add = false;
      const am = /^(加了|加上|加)(.+)$/.exec(seg);
      if (am && tokenizePoints(am[2], dict)) {
        add = true;
        seg = am[2];
      }
      let toks = tokenizePoints(seg, dict);
      if (!toks) {
        // 书上没有的短名字（2~4 个字、不像一句话）当作穴位
        let core = seg.replace(/穴$/, '');
        let side = '';
        let mod = '';
        const sm = /^(双|左|右)/.exec(core);
        if (sm) (side = sm[1]), (core = core.slice(1));
        const md = MODS.find((m) => core.endsWith(m) && core.length > m.length);
        if (md) (mod = md === '温针灸' ? '温针' : md === '放血' ? '刺血' : md), (core = core.slice(0, -md.length));
        if (/^[一-龥]{1,4}$/.test(core) && (!REMARK.test(core) || SEED_CUSTOM.includes(core)) && (res.points.length || side || mod || segs.length > 2)) toks = [{ name: core, side, mod }];
      }
      if (toks) {
        if (add) res.same = true;
        for (const t of toks) {
          const lab = labelOf(t);
          if (groups[t.name] && !t.side && !t.mod) for (const x of groups[t.name]) addPoint(res.points, x);
          else addPoint(res.points, lab);
        }
      } else (res.points.length || res.same ? res.post : res.pre).push(seg);
    }
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
      } else if (parseSession(x, dict, {}).points.length && !REMARK.test(x.replace(/[刺血温针灸]/g, ''))) break;
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

    const pushSession = (date, body, raw) => {
      const ps = parseSession(body, dict, groups);
      let pts = ps.points;
      if (cur && cur.lastPoints && (ps.same || !pts.length)) {
        const base = cur.lastPoints.slice();
        for (const p of pts) addPoint(base, p);
        pts = base;
      }
      // 「灸换到中脘」：原来灸的地方不灸了，改灸中脘（以后也照这样）
      if (ps.moxaTo) {
        pts = pts.filter((p) => !(/（[^）]*灸[^）]*）/.test(p) && pointBase(p.replace(/（[^）]*）/g, '')) === '神阙')).map((p) => p.replace(/（(灸|温针)）/, ''));
        const i = pts.findIndex((p) => pointBase(p) === ps.moxaTo);
        const mod = /温针/.test(body) ? '温针' : '灸';
        if (i >= 0) pts[i] = `${pts[i]}（${mod}）`;
        else pts.push(`${ps.moxaTo}（${mod}）`);
      }
      const keep = pts.slice();
      // 「没灸」：这一次不灸（下次写「一样」时还按原来的）
      if (ps.noMoxa) pts = pts.filter((p) => pointBase(p.replace(/（[^）]*）/g, '')) !== '神阙' || !/灸/.test(p)).map((p) => p.replace(/（(灸|温针)）/, ''));
      const remarks = (list) => list.join('，');
      const sym = ps.pre.length && ps.points.length ? remarks(ps.pre) : cur && cur.complaint ? cur.complaint : '';
      const feel = [ps.points.length ? '' : remarks(ps.pre), remarks(ps.post), remarks(ps.feel)].filter(Boolean).join('，');
      const it = { date: date || (cur && cur.lastDate) || null, noDate: !date, patientId: cur ? cur.patientId : null, name: cur ? cur.name : '', gender: cur ? cur.gender : '', age: cur ? cur.age : null, points: pts, symptoms: sym, feeling: feel, raw };
      items.push(it);
      if (cur) {
        if (keep.length) cur.lastPoints = keep;
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
