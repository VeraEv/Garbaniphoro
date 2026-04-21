/**
 * i18n.mjs - Bilingual (Chinese/English) toggle system
 *
 * Usage:
 *   - Add data-i18n="key" to elements for UI string translation
 *   - Add data-i18n-placeholder="key" for placeholder translation
 *   - Call setLang('ch'|'en') to switch
 *   - Call t('key') to get translated string
 *   - Call getLang() to get current language
 */

const UI_STRINGS = {
  'nav.home':       { ch: '首页', en: 'Home' },
  'nav.stories':    { ch: '公民', en: 'Civic Registry' },
  'nav.search':     { ch: '检索', en: 'Search' },
  'nav.lore':       { ch: '档案', en: 'Archive' },
  'nav.gallery':    { ch: '画廊', en: 'Gallery' },
  'nav.monsters':   { ch: '怪物', en: 'Bestiary' },
  'nav.videos':     { ch: '视频', en: 'Videos' },

  'search.placeholder':   { ch: '检索台词、角色、关键词…', en: 'Search dialogue, characters, keywords…' },
  'search.button':        { ch: '检索', en: 'Search' },
  'search.loading':       { ch: '加载检索数据中…', en: 'Loading search data…' },
  'search.searching':     { ch: '检索中…', en: 'Searching…' },
  'search.results':       { ch: '检索结果', en: 'Results' },
  'search.no_results':    { ch: '未找到结果', en: 'No results found' },
  'search.result_count':  { ch: '找到 {n} 条结果', en: '{n} results found' },
  'search.dialogue':      { ch: '台词', en: 'Dialogue' },
  'search.text':          { ch: '文本', en: 'Text' },

  'stories.title':    { ch: '剧情浏览', en: 'Story Browser' },
  'stories.lines':    { ch: '{n} 行', en: '{n} lines' },

  'lore.title':         { ch: '档案', en: 'Archive' },
  'lore.books':         { ch: '书籍', en: 'Books' },
  'lore.quests':        { ch: '任务', en: 'Quests' },
  'lore.achievements':  { ch: '成就', en: 'Achievements' },
  'lore.items':         { ch: '物品', en: 'Items' },
  'lore.characters':    { ch: '角色', en: 'Characters' },
  'lore.lightcones':    { ch: '光锥', en: 'Light Cones' },
  'lore.monsters':      { ch: '怪物', en: 'Bestiary' },
  'lore.aiwosushu':     { ch: '如我所书', en: "As I've Written" },
  'lore.appendix':      { ch: '附录', en: 'Appendix' },

  'monsters.title':   { ch: '怪物志', en: 'Bestiary' },
  'gallery.title':    { ch: '画廊', en: 'Gallery' },
  'gallery.close':    { ch: '关闭', en: 'Close' },
  'gallery.prev':     { ch: '上一张', en: 'Previous image' },
  'gallery.next':     { ch: '下一张', en: 'Next image' },
  'videos.title':     { ch: '视频', en: 'Videos' },

  'lang.switch':      { ch: 'EN', en: '中文' },
  'common.loading':   { ch: '加载中…', en: 'Loading…' },
  'common.prev':      { ch: '上一段', en: 'Previous' },
  'common.next':      { ch: '下一段', en: 'Next' },
  'common.back':      { ch: '返回', en: 'Back' },
};

let currentLang = localStorage.getItem('kremnos-lang') || 'ch';

export function getLang() {
  return currentLang;
}

export function setLang(lang) {
  currentLang = lang;
  localStorage.setItem('kremnos-lang', lang);
  updateAllI18n();
  document.documentElement.setAttribute('lang', lang === 'ch' ? 'zh-CN' : 'en');
  window.dispatchEvent(new CustomEvent('langchange', { detail: { lang } }));
}

export function toggleLang() {
  setLang(currentLang === 'ch' ? 'en' : 'ch');
}

export function t(key, params = {}) {
  const entry = UI_STRINGS[key];
  if (!entry) return key;
  let str = entry[currentLang] || entry.ch || key;
  for (const [k, v] of Object.entries(params)) {
    str = str.replace(`{${k}}`, v);
  }
  return str;
}

function updateAllI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  document.querySelectorAll('[data-i18n-aria-label]').forEach(el => {
    el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel));
  });
}

// Initialize on import — ES modules are deferred, so the DOM is fully parsed here
document.documentElement.setAttribute('lang', currentLang === 'ch' ? 'zh-CN' : 'en');
if (currentLang !== 'ch') {
  // Static HTML defaults to Chinese; only update when a non-default lang is stored
  updateAllI18n();
}
