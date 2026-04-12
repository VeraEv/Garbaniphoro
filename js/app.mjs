/**
 * app.mjs - Shared application initialization
 * Imported by every page. Handles nav, language toggle, and common utilities.
 */

import { getLang, toggleLang, t, setLang } from './i18n.mjs?v=3';

// Initialize navigation highlighting
function initNav() {
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-link').forEach(link => {
    const href = link.getAttribute('href');
    if (href === currentPage || (currentPage === '' && href === 'index.html')) {
      link.classList.add('active');
    }
  });
}

// Initialize language toggle button
function initLangToggle() {
  const btn = document.getElementById('lang-toggle');
  if (!btn) return;

  btn.textContent = t('lang.switch');
  btn.addEventListener('click', () => {
    toggleLang();
    btn.textContent = t('lang.switch');
  });
}

// Utility: fetch JSON with error handling
export async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.json();
}

// Utility: create element with attributes and children
export function el(tag, attrs = {}, ...children) {
  const elem = document.createElement(tag);
  for (const [key, val] of Object.entries(attrs)) {
    if (key === 'className') elem.className = val;
    else if (key === 'dataset') Object.assign(elem.dataset, val);
    else if (key.startsWith('on')) elem.addEventListener(key.slice(2).toLowerCase(), val);
    else elem.setAttribute(key, val);
  }
  for (const child of children) {
    if (typeof child === 'string') elem.appendChild(document.createTextNode(child));
    else if (child) elem.appendChild(child);
  }
  return elem;
}

// Utility: clean game markup tags and convert {RUBY_B#annotation}text{RUBY_E#} to HTML ruby
export function cleanGameText(str) {
  if (!str) return '';
  return str
    .replace(/<unbreak>[^<]*<\/unbreak>/g, (m) => m.replace(/<\/?unbreak>/g, ''))
    .replace(/<\/?[bi]>/g, '')
    .replace(/\{M#([^}]*)}\{F#([^}]*)}/g, '$1/$2')
    .replace(/\{[MF]#([^}]*)}/g, '$1');
}

// Utility: escape HTML, preserving ruby annotations as <ruby> tags
export function escapeHTML(str) {
  if (!str) return '';
  const cleaned = cleanGameText(str);
  // Extract ruby pairs before escaping
  const rubyParts = [];
  const placeholder = '\x00RUBY';
  const withRubyPlaceholders = cleaned.replace(
    /\{RUBY_B#([^}]*)\}([^{]*)\{RUBY_E#\}/g,
    (_, annotation, text) => {
      rubyParts.push({ annotation, text });
      return placeholder + (rubyParts.length - 1);
    }
  );
  // Extract <color=#hex>text</color> pairs
  const colorParts = [];
  const colorPlaceholder = '\x00CLR';
  const withAllPlaceholders = withRubyPlaceholders.replace(
    /<color=(#[0-9a-fA-F]{6,8})>([\s\S]*?)<\/color>/gi,
    (_, color, text) => {
      // Trim alpha channel if 8-char hex (e.g. #dbc291ff -> #dbc291)
      let cssColor = color.length === 9 ? color.slice(0, 7) : color;
      // Remap game colors to contrast-safe equivalents on warm parchment background
      const lc = cssColor.toLowerCase();
      if      (lc === '#dbc291') cssColor = '#8b5e2f'; // titan name gold → dark amber
      else if (lc === '#8790ab') cssColor = '#5a6380'; // muted slate → darker slate
      else if (lc === '#73b0f4') cssColor = '#2a5d9e'; // light blue → dark blue
      else if (lc === '#f29e38') cssColor = '#8a5c00'; // bright orange → dark amber
      else if (lc === '#b9effff' || lc === '#b9efff') cssColor = '#1a7080'; // pale cyan → dark teal
      colorParts.push({ color: cssColor, text });
      return colorPlaceholder + (colorParts.length - 1);
    }
  );
  // Replace literal \n with a placeholder before escaping
  const BR_PLACEHOLDER = '\x00BR\x00';
  const withBr = withAllPlaceholders
    .replace(/\\n/g, BR_PLACEHOLDER)
    .replace(/\n/g, BR_PLACEHOLDER);
  // Remove any remaining unpaired RUBY tags
  const stripped = withBr
    .replace(/\{RUBY_B#[^}]*\}/g, '')
    .replace(/\{RUBY_E#\}/g, '');
  // Escape HTML
  const div = document.createElement('div');
  div.textContent = stripped;
  let result = div.innerHTML.replace(new RegExp(BR_PLACEHOLDER, 'g'), '<br>');
  // Restore ruby tags
  for (let i = 0; i < rubyParts.length; i++) {
    const { annotation, text } = rubyParts[i];
    div.textContent = text;
    const safeText = div.innerHTML;
    div.textContent = annotation;
    const safeAnnotation = div.innerHTML;
    result = result.replace(
      placeholder + i,
      `<ruby>${safeText}<rp>(</rp><rt>${safeAnnotation}</rt><rp>)</rp></ruby>`
    );
  }
  // Restore color tags
  for (let i = 0; i < colorParts.length; i++) {
    const { color, text } = colorParts[i];
    div.textContent = text;
    const safeText = div.innerHTML;
    result = result.replace(
      colorPlaceholder + i,
      `<span style="color:${color}">${safeText}</span>`
    );
  }
  return result;
}

// Utility: highlight search term in text
export function highlightText(text, query) {
  if (!query) return escapeHTML(text);
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  return escapeHTML(text).replace(regex, '<mark>$1</mark>');
}

// Sticky header: transparent at top, frosted on scroll
function initHeaderScroll() {
  const header = document.querySelector('.site-header');
  if (!header) return;
  const update = () => header.classList.toggle('scrolled', window.scrollY > 8);
  update();
  window.addEventListener('scroll', update, { passive: true });
}

// Theme switcher
const THEMES = [
  { key: 'terra',   label: 'A' },
  { key: 'kremnos', label: 'B' },
];

function getTheme() {
  return new URLSearchParams(location.search).get('theme')
    || localStorage.getItem('gl-theme')
    || 'terra';
}

function applyTheme(key) {
  localStorage.setItem('gl-theme', key);
  document.documentElement.dataset.theme = key;
  // Swap the theme stylesheet in-place (no reload)
  let link = document.querySelector('link[href*="css/themes/theme-"]');
  if (link) {
    link.href = `css/themes/theme-${key}.css`;
  }
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === key);
  });
}

function initThemeSwitcher() {
  const nav = document.querySelector('.main-nav');
  if (!nav) return;
  const current = getTheme();
  const currentLabel = THEMES.find(t => t.key === current)?.label || current;

  const wrap = document.createElement('div');
  wrap.className = 'theme-switcher';

  const trigger = document.createElement('button');
  trigger.className = 'theme-trigger';
  trigger.textContent = currentLabel;
  trigger.addEventListener('click', e => {
    e.stopPropagation();
    wrap.classList.toggle('open');
  });

  const dropdown = document.createElement('div');
  dropdown.className = 'theme-dropdown';

  for (const th of THEMES) {
    const opt = document.createElement('button');
    opt.className = 'theme-option' + (th.key === current ? ' active' : '');
    opt.dataset.theme = th.key;
    opt.textContent = th.label;
    opt.addEventListener('click', () => {
      applyTheme(th.key);
      trigger.textContent = th.label;
      dropdown.querySelectorAll('.theme-option').forEach(o =>
        o.classList.toggle('active', o.dataset.theme === th.key)
      );
      wrap.classList.remove('open');
    });
    dropdown.appendChild(opt);
  }

  document.addEventListener('click', () => wrap.classList.remove('open'));

  wrap.appendChild(trigger);
  wrap.appendChild(dropdown);
  nav.appendChild(wrap);
}

// Initialize - handle both pre and post DOMContentLoaded
function initApp() {
  initNav();
  initLangToggle();
  initHeaderScroll();
  initThemeSwitcher();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
