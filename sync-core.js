// ============================================================
// 加密同步核心（电脑软件和手机网页共用同一份代码）
//
// 原理：
//  · 云端只有一个加密文件 yian.sync，放在你自己的私有 GitHub 仓库的 yian-sync 分支里
//  · 用「同步密码」加密（PBKDF2 → AES-256-GCM，先压缩再加密），GitHub 看到的只是乱码
//  · 每条记录（患者 / 医案 / 协定方 / 设置）都带一个「最后修改时间」，
//    两边都改了同一条时，以后改的为准；其它记录互不影响，两边新增的会合并到一起
//  · 删除是一条「墓碑」记录，会同步到别的设备；只靠「缺了」不会删除任何东西
//  · 每次上传都是一个全新的、没有历史的提交，仓库不会越来越大
//  · 只同步文字，不同步照片
// ============================================================
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.YianSync = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const BRANCH = 'yian-sync';
  const FILE = 'yian.sync';
  const FORMAT = 1;
  const DEFAULT_ITER = 600000;
  const EPOCH = '1970-01-01T00:00:00.000Z';
  const TOMB_KEEP_DAYS = 365;
  const HEADER_LEN = 37; // 'YSY' + 版本 + 标志 + 迭代次数 4 + salt 16 + iv 12

  class SyncError extends Error {
    constructor(code, message, extra) {
      super(message);
      this.name = 'SyncError';
      this.code = code;
      if (extra) Object.assign(this, extra);
    }
  }

  const cr = () => globalThis.crypto;
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  // ---------- 字节 / base64 ----------
  function toB64(u8) {
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function fromB64(b64) {
    const s = atob(b64);
    const u8 = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
    return u8;
  }
  function hex(u8) {
    return Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');
  }

  // ---------- 压缩 ----------
  const canGzip = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function' && typeof Response === 'function';
  async function pipeThrough(u8, stream) {
    const out = new Response(new Blob([u8]).stream().pipeThrough(stream));
    return new Uint8Array(await out.arrayBuffer());
  }
  const gzip = (u8) => pipeThrough(u8, new CompressionStream('gzip'));
  const gunzip = (u8) => pipeThrough(u8, new DecompressionStream('gzip'));

  // ---------- 加密 ----------
  let keyCache = null; // 只缓存最近一次：{ pw, iter, salt, key }
  async function getKey(password, salt, iter) {
    const saltHex = hex(salt);
    if (keyCache && keyCache.pw === password && keyCache.iter === iter && keyCache.salt === saltHex) return keyCache.key;
    const base = await cr().subtle.importKey('raw', enc.encode(String(password)), 'PBKDF2', false, ['deriveKey']);
    const key = await cr().subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    keyCache = { pw: password, iter, salt: saltHex, key };
    return key;
  }

  // 把同步数据加密成一段字节。salt 沿用云端已有的，这样各设备只需要算一次密钥
  async function seal(state, password, opts = {}) {
    if (!password) throw new SyncError('NOPASS', '还没有填写同步密码');
    const iter = opts.iterations || DEFAULT_ITER;
    const salt = opts.salt || cr().getRandomValues(new Uint8Array(16));
    const iv = cr().getRandomValues(new Uint8Array(12));
    let body = enc.encode(JSON.stringify(state));
    let flags = 0;
    if (canGzip()) {
      body = await gzip(body);
      flags |= 1;
    }
    const head = new Uint8Array(HEADER_LEN);
    head.set([0x59, 0x53, 0x59, FORMAT, flags]);
    new DataView(head.buffer).setUint32(5, iter);
    head.set(salt, 9);
    head.set(iv, 25);
    const key = await getKey(password, salt, iter);
    const ct = new Uint8Array(await cr().subtle.encrypt({ name: 'AES-GCM', iv, additionalData: head }, key, body));
    const out = new Uint8Array(HEADER_LEN + ct.length);
    out.set(head);
    out.set(ct, HEADER_LEN);
    return out;
  }

  async function open(bytes, password) {
    if (!password) throw new SyncError('NOPASS', '还没有填写同步密码');
    bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (bytes.length < HEADER_LEN + 16 || bytes[0] !== 0x59 || bytes[1] !== 0x53 || bytes[2] !== 0x59) throw new SyncError('NOTSYNC', '云端的文件不是本软件的同步数据');
    if (bytes[3] > FORMAT) throw new SyncError('NEWER', '云端数据来自更新版本的软件，请先把这个软件更新到最新版');
    const flags = bytes[4];
    const iter = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(5);
    if (iter < 1000 || iter > 5000000) throw new SyncError('NOTSYNC', '云端的文件已损坏');
    const salt = bytes.slice(9, 25);
    const iv = bytes.slice(25, 37);
    const head = bytes.slice(0, HEADER_LEN);
    const key = await getKey(password, salt, iter);
    let plain;
    try {
      plain = new Uint8Array(await cr().subtle.decrypt({ name: 'AES-GCM', iv, additionalData: head }, key, bytes.subarray(HEADER_LEN)));
    } catch (e) {
      throw new SyncError('BADPASS', '同步密码不对（或云端文件被改动过）');
    }
    try {
      if (flags & 1) plain = await gunzip(plain);
      const state = JSON.parse(dec.decode(plain));
      if (!state || typeof state !== 'object' || typeof state.e !== 'object') throw new Error('bad');
      return { state, salt, iterations: iter };
    } catch (e) {
      throw new SyncError('BADDATA', '云端数据已损坏，无法读取');
    }
  }

  // ---------- 指纹 ----------
  function stable(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    return (
      '{' +
      Object.keys(v)
        .filter((k) => v[k] !== undefined)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + stable(v[k]))
        .join(',') +
      '}'
    );
  }
  async function hashOf(v) {
    const d = new Uint8Array(await cr().subtle.digest('SHA-256', enc.encode(stable(v))));
    return hex(d).slice(0, 20);
  }

  // ---------- 本机数据 → 同步条目 ----------
  // 键：p:患者id  v:医案id  t:协定方id  s:设置  h:自定义药名库
  // 示例数据不同步
  function collect(db) {
    const out = {};
    const sampleP = new Set();
    for (const p of db.patients || []) {
      if (p.sample) sampleP.add(p.id);
      else out['p:' + p.id] = p;
    }
    for (const v of db.visits || []) if (!v.sample && !sampleP.has(v.patientId)) out['v:' + v.id] = v;
    for (const t of db.templates || []) if (!t.sample) out['t:' + t.id] = t;
    if (db.settings && typeof db.settings === 'object' && Object.keys(db.settings).length) out.s = db.settings;
    if (typeof db.herbLibText === 'string') out.h = { text: db.herbLibText };
    return out;
  }

  const iso = (s) => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(s) ? s : '');
  function stampOf(key, rec) {
    if (key === 's' || key === 'h') return '';
    const a = iso(rec.updatedAt);
    const b = iso(rec.deletedAt);
    return a > b ? a : b;
  }

  // 扫描本机：每条记录的指纹和「最后修改时间」。
  // 和上次同步时（base）一样的，沿用上次的时间；变过的，取记录里的修改时间（没有就用现在）
  async function scanLocal(db, base, now, deleteGuard) {
    const ents = collect(db);
    const baseEnts = (base && base.ents) || {};
    const local = {};
    let changed = 0;
    for (const key of Object.keys(ents)) {
      const rec = ents[key];
      const h = await hashOf(rec);
      const b = baseEnts[key];
      let t;
      if (b && b.h === h) t = b.t;
      else {
        const cand = stampOf(key, rec);
        if (b) t = cand > b.t ? cand : now;
        else t = cand || iso(rec.createdAt) || EPOCH;
        changed++;
      }
      local[key] = { t, h, d: rec };
    }
    // 上次同步过、这次本机没有 → 本机彻底删除了
    const gone = Object.keys(baseEnts).filter((k) => baseEnts[k].h !== 'X' && !(k in ents));
    const live = Object.keys(baseEnts).filter((k) => baseEnts[k].h !== 'X').length;
    let tombs = gone;
    if (gone.length > 10 && gone.length > live * 0.25) {
      if (deleteGuard === 'accept') tombs = gone;
      else if (deleteGuard === 'restore') tombs = [];
      else throw new SyncError('MASSDEL', `本机比上次同步时少了 ${gone.length} 条记录（共 ${live} 条）。为防止误删，已暂停同步。`, { count: gone.length, total: live });
    }
    for (const k of tombs) {
      local[k] = { t: now, h: 'X', d: null };
      changed++;
    }
    return { local, changed };
  }

  // 合并：每条取最后修改的；时间相同但内容不同，按指纹大小取一个（所有设备选择一致）
  function merge(remoteE, local) {
    const merged = {};
    for (const k of Object.keys(remoteE)) merged[k] = remoteE[k];
    let push = 0;
    for (const k of Object.keys(local)) {
      const l = local[k];
      const r = merged[k];
      if (!r || l.t > r.t || (l.t === r.t && l.h !== r.h && l.h > r.h)) {
        merged[k] = { t: l.t, h: l.h, d: l.d };
        push++;
      }
    }
    return { merged, push };
  }

  const clone = (x) => JSON.parse(JSON.stringify(x));

  // 把合并结果应用到本机数据，返回新的数据对象（不修改传入的）和统计
  function applyMerged(db, merged, local) {
    const nd = Object.assign({}, db, { patients: [...db.patients], visits: [...db.visits], templates: [...(db.templates || [])] });
    const stats = { updated: 0, added: 0, removed: 0 };
    const arrOf = { p: 'patients', v: 'visits', t: 'templates' };
    for (const key of Object.keys(merged)) {
      const m = merged[key];
      const l = local[key];
      if (l && l.t === m.t && l.h === m.h) continue; // 本机这条就是最新的
      if (key === 's') {
        if (m.d) {
          nd.settings = clone(m.d);
          stats.updated++;
        }
        continue;
      }
      if (key === 'h') {
        nd.herbLibText = m.d ? m.d.text : null;
        stats.updated++;
        continue;
      }
      const arr = nd[arrOf[key[0]]];
      const id = key.slice(2);
      const i = arr.findIndex((x) => x.id === id);
      if (m.d === null) {
        if (i >= 0) {
          arr.splice(i, 1);
          stats.removed++;
        }
      } else if (i >= 0) {
        arr[i] = clone(m.d);
        stats.updated++;
      } else {
        arr.push(clone(m.d));
        stats.added++;
      }
    }
    return { db: nd, stats };
  }

  // ---------- GitHub ----------
  class GitHubStore {
    // repo: "用户名/仓库名"
    constructor({ repo, token, fetch: f, apiBase = 'https://api.github.com', timeoutMs = 45000 }) {
      const m = /^\s*(?:https?:\/\/github\.com\/)?([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?\s*$/.exec(repo || '');
      if (!m) throw new SyncError('BADREPO', '仓库名格式不对，应该像「MikaelSteven/yian-data」这样');
      this.owner = m[1];
      this.name = m[2];
      this.repo = `${m[1]}/${m[2]}`;
      this.token = String(token || '').trim();
      this.fetch = f || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
      this.apiBase = apiBase;
      this.timeoutMs = timeoutMs;
      if (!this.token) throw new SyncError('NOTOKEN', '还没有填写 GitHub 令牌');
    }

    async req(method, path, { body, raw = false, okStatus = [] } = {}) {
      const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = ctrl ? setTimeout(() => ctrl.abort(), this.timeoutMs) : null;
      let res;
      try {
        res = await this.fetch(this.apiBase + path, {
          method,
          headers: Object.assign(
            {
              Authorization: 'Bearer ' + this.token,
              Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
              'X-GitHub-Api-Version': '2022-11-28',
            },
            body ? { 'Content-Type': 'application/json' } : {}
          ),
          body: body ? JSON.stringify(body) : undefined,
          cache: 'no-store',
          signal: ctrl ? ctrl.signal : undefined,
        });
      } catch (e) {
        throw new SyncError('NET', '连不上 GitHub，请检查网络' + (e && e.name === 'AbortError' ? '（等待超时）' : ''));
      } finally {
        if (timer) clearTimeout(timer);
      }
      if (res.ok || okStatus.includes(res.status)) {
        if (raw) return res.status === 200 ? new Uint8Array(await res.arrayBuffer()) : null;
        if (res.status === 204) return {};
        try {
          return await res.json();
        } catch (e) {
          return {};
        }
      }
      let msg = '';
      try {
        msg = (await res.json()).message || '';
      } catch (e) {
        /* 忽略 */
      }
      const st = res.status;
      if (st === 401) throw new SyncError('BADTOKEN', 'GitHub 令牌无效或已过期，请重新生成一个', { status: st });
      if (st === 403 && /rate limit/i.test(msg)) throw new SyncError('RATE', 'GitHub 请求太频繁，请过几分钟再试', { status: st });
      if (st === 403) throw new SyncError('FORBIDDEN', '这个令牌没有读写这个仓库的权限（要给「Contents」读写权限，并选中这个仓库）', { status: st });
      if (st === 404) throw new SyncError('NOREPO', '找不到这个仓库：名字写错了，或者令牌没有选中它', { status: st, path });
      if (st === 409) throw new SyncError('CONFLICT', msg || '仓库冲突', { status: st });
      if (st === 422) throw new SyncError('REJECTED', 'GitHub 拒绝了这次上传：' + msg, { status: st });
      throw new SyncError('HTTP', `GitHub 返回了错误 ${st}${msg ? '：' + msg : ''}`, { status: st });
    }

    p(rest) {
      return `/repos/${this.owner}/${this.name}${rest}`;
    }

    // 仓库信息（用来确认令牌能用、仓库是私有的）
    async info() {
      const j = await this.req('GET', this.p(''));
      return { private: !!j.private, defaultBranch: j.default_branch || 'main', canPush: !j.permissions || !!j.permissions.push };
    }

    // 云端同步分支现在指向哪个提交（没有就是 null）
    async head() {
      try {
        const j = await this.req('GET', this.p(`/git/ref/heads/${BRANCH}`));
        return (j.object && j.object.sha) || null;
      } catch (e) {
        if (e.code === 'NOREPO') {
          // 分支不存在是 404；仓库本身不存在也是 404，这里再确认一下
          await this.req('GET', this.p(''));
          return null;
        }
        if (e.code === 'CONFLICT') return null; // 空仓库
        throw e;
      }
    }

    async download(ref) {
      const bytes = await this.req('GET', this.p(`/contents/${FILE}?ref=${encodeURIComponent(ref)}`), { raw: true });
      if (!bytes) throw new SyncError('NOTSYNC', '云端没有找到同步文件');
      return bytes;
    }

    // 上传：做一个没有历史的新提交，把分支指过去。expectHead 是我们读到的分支位置，变了说明别的设备刚上传过
    async upload(bytes, expectHead) {
      let blob;
      try {
        blob = await this.req('POST', this.p('/git/blobs'), { body: { content: toB64(bytes), encoding: 'base64' } });
      } catch (e) {
        if (e.code !== 'CONFLICT') throw e;
        // 空仓库：先放一个说明文件，让仓库有第一个提交
        await this.req('PUT', this.p('/contents/README.md'), {
          body: { message: 'init', content: toB64(enc.encode('# 医案加密数据\n\n这里只有加密后的数据，请不要手动修改。\n')) },
        });
        blob = await this.req('POST', this.p('/git/blobs'), { body: { content: toB64(bytes), encoding: 'base64' } });
      }
      const tree = await this.req('POST', this.p('/git/trees'), { body: { tree: [{ path: FILE, mode: '100644', type: 'blob', sha: blob.sha }] } });
      const commit = await this.req('POST', this.p('/git/commits'), { body: { message: 'sync', tree: tree.sha, parents: [] } });
      const cur = await this.head();
      if (cur !== expectHead) throw new SyncError('RACE', '别的设备刚刚同步过');
      if (cur) {
        await this.req('PATCH', this.p(`/git/refs/heads/${BRANCH}`), { body: { sha: commit.sha, force: true } });
      } else {
        try {
          await this.req('POST', this.p('/git/refs'), { body: { ref: `refs/heads/${BRANCH}`, sha: commit.sha } });
        } catch (e) {
          if (e.code === 'REJECTED') throw new SyncError('RACE', '别的设备刚刚同步过');
          throw e;
        }
      }
      return commit.sha;
    }
  }

  // ---------- 同步 ----------
  function emptyBase(repo) {
    return { v: 1, repo, head: null, at: null, ents: {} };
  }

  function pruneTombs(merged, now) {
    const cutoff = new Date(new Date(now).getTime() - TOMB_KEEP_DAYS * 86400000).toISOString();
    const out = {};
    for (const k of Object.keys(merged)) if (!(merged[k].d === null && merged[k].t < cutoff)) out[k] = merged[k];
    return out;
  }

  function countReal(db) {
    return (db.patients || []).filter((p) => !p.sample).length + (db.visits || []).filter((v) => !v.sample).length;
  }

  // 做一次同步。不会修改传入的数据；结果里的 db 是合并后的新数据（本机没变化时为 null），
  // base 是新的「上次同步状态」——调用方确认已把 db 存好之后再保存它
  //   opts: { db, base, store, password, deviceName, now, deleteGuard, iterations, force }
  async function run(opts) {
    const { db, store, password } = opts;
    const now = opts.now || new Date().toISOString();
    let base = opts.base && opts.base.v === 1 && opts.base.repo === store.repo ? opts.base : emptyBase(store.repo);
    if (!password) throw new SyncError('NOPASS', '还没有填写同步密码');
    const { local, changed } = await scanLocal(db, base, now, opts.deleteGuard);

    for (let attempt = 0; ; attempt++) {
      const head = await store.head();
      if (head && head === base.head && !changed && !opts.force && opts.deleteGuard !== 'restore') return { status: 'nochange', db: null, base, stats: { updated: 0, added: 0, removed: 0, pushed: 0 } };

      let remoteE = {};
      let salt = null;
      let iterations = opts.iterations || DEFAULT_ITER;
      if (head) {
        const o = await open(await store.download(head), password);
        remoteE = o.state.e;
        salt = o.salt;
        iterations = o.iterations;
      }
      const { merged, push } = merge(remoteE, local);
      const { db: nd, stats } = applyMerged(db, merged, local);
      const dbChanged = stats.added + stats.updated + stats.removed > 0;

      let newHead = head;
      if (push > 0) {
        const bytes = await seal({ v: FORMAT, savedAt: now, by: opts.deviceName || '', e: pruneTombs(merged, now) }, password, { salt, iterations });
        try {
          newHead = await store.upload(bytes, head);
        } catch (e) {
          if (e.code === 'RACE' && attempt < 3) continue;
          throw e;
        }
      }
      const ents = {};
      for (const k of Object.keys(merged)) ents[k] = { h: merged[k].h, t: merged[k].t };
      return {
        status: 'ok',
        db: dbChanged ? nd : null,
        base: { v: 1, repo: store.repo, head: newHead, at: now, ents },
        stats: Object.assign(stats, { pushed: push }),
      };
    }
  }

  // 设置时检查：令牌能用吗、仓库是私有的吗、密码对吗
  async function check({ store, password }) {
    const info = await store.info();
    if (!info.private) throw new SyncError('PUBLIC', '这个仓库是公开的！病历数据即使加密也不建议放在公开仓库，请到 GitHub 把它改成私有（Private）。');
    if (!info.canPush) throw new SyncError('FORBIDDEN', '这个令牌只能读、不能写。生成令牌时，「Contents」要选 Read and write。');
    const head = await store.head();
    if (!head) return { empty: true };
    const o = await open(await store.download(head), password);
    const e = o.state.e;
    return {
      empty: false,
      patients: Object.keys(e).filter((k) => k[0] === 'p' && e[k].d && !e[k].d.deletedAt).length,
      visits: Object.keys(e).filter((k) => k[0] === 'v' && e[k].d && !e[k].d.deletedAt).length,
      savedAt: o.state.savedAt || null,
    };
  }

  return { run, check, GitHubStore, SyncError, seal, open, hashOf, stable, collect, scanLocal, merge, applyMerged, emptyBase, countReal, BRANCH, FILE, DEFAULT_ITER, EPOCH };
});
