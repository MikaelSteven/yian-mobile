// 外观：亮色 / 暗色 / 跟随系统，主色可选（默认蓝色）。电脑版和手机版共用（mobile/theme.js 是副本）。
// 在页面最开始加载，先按这台电脑上次的选择上色，避免打开时闪一下。
(function () {
  'use strict';
  // [名称, 亮色时的颜色, 暗色时的颜色]（暗色背景上颜色稍微亮一点才看得清）
  const ACCENTS = {
    blue: ['蓝色', '#027fff', '#3d97ff'],
    teal: ['青色', '#0f9488', '#2bb3a6'],
    green: ['绿色', '#23944d', '#3cb36a'],
    purple: ['紫色', '#7346f5', '#9070ff'],
    brown: ['檀色', '#a0612f', '#c98a55'],
    red: ['朱红', '#d23a3a', '#ec5d5d'],
    ink: ['墨色', '#3f4a5a', '#93a1b5'],
  };
  const MODES = { light: '亮色', dark: '暗色', system: '跟随系统' };
  const KEY = 'yian-theme';
  const DEF = { mode: 'light', accent: 'blue' };

  function norm(t) {
    t = t || {};
    return { mode: MODES[t.mode] ? t.mode : DEF.mode, accent: ACCENTS[t.accent] ? t.accent : DEF.accent };
  }
  function read() {
    try {
      return norm(JSON.parse(localStorage.getItem(KEY) || 'null'));
    } catch (e) {
      return norm(null);
    }
  }
  const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  let cur = read();
  function isDark(t) {
    return t.mode === 'dark' || (t.mode === 'system' && !!(mq && mq.matches));
  }
  function apply(t) {
    cur = norm(t);
    const dark = isDark(cur);
    const root = document.documentElement;
    root.dataset.theme = dark ? 'dark' : 'light';
    root.dataset.accent = cur.accent;
    root.style.setProperty('--primary', ACCENTS[cur.accent][dark ? 2 : 1]);
    // 手机：浏览器顶栏颜色；安卓 App：状态栏的字和图标（暗色时用白字）
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#1d2024' : '#ffffff');
    try {
      const C = window.Capacitor;
      const SB = C && C.isNativePlatform && C.isNativePlatform() && C.Plugins && C.Plugins.SystemBars;
      if (SB) SB.setStyle({ style: dark ? 'DARK' : 'LIGHT' }).catch(() => {});
    } catch (e) {}
    return cur;
  }
  function set(t) {
    apply(t);
    try {
      localStorage.setItem(KEY, JSON.stringify(cur));
    } catch (e) {}
    return cur;
  }
  if (mq && mq.addEventListener) mq.addEventListener('change', () => cur.mode === 'system' && apply(cur));
  apply(cur);
  window.YianTheme = { ACCENTS, MODES, get: () => Object.assign({}, cur), apply, set, isDark: () => isDark(cur) };
})();
