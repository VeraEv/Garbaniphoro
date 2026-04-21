/**
 * story-reader.mjs - Single story/scene reader page controller
 * Loads a scene from the talk DB by [first_id, last_id] range and renders dialogue.
 * Supports unlimited context expansion (±5 lines at a time) via the same talk DB.
 *
 * Two entry modes:
 *   Scene mode:        #char=SLUG&id=SCENEID[&line=LINEID]   — used from stories page
 *   Single-line mode:  #line=LINEID[&q=QUERY]                — used when clicking a search result
 *
 * Data sources:
 *   - data/character-scenes.json  → scene index (per-character ID ranges)
 *   - data/talk/*.json            → bilingual line store (393 chunks of 500)
 */

import { getLang, t } from './i18n.mjs?v=3';
import { fetchJSON, escapeHTML, highlightText, scrollBehavior } from './app.mjs?v=5';

let charScenes = null;
let currentChar = null;     // {name_ch, name_en, scenes:[]}
let currentSlug = null;
let currentScene = null;    // {id, first_id, last_id, line_count, ...}

/* ── Mode / persistent highlight state ── */
let singleLineMode = false;
let persistentHighlightId = null;   // line id always decorated with .highlight (search target)
let pageQuery = '';                 // search term to <mark> within displayed text

/* ── Expand state ── */
let displayedLines = [];

// Talk DB index for dynamic loading
let talkIndex = null;       // array of {file, first_id, last_id, first_idx, count}
let prevGlobalIdx = -1;     // global index of the entry just before our topmost displayed line
let nextGlobalIdx = -1;     // global index of the entry just after our bottommost displayed line
let totalEntries = 0;
let loading = false;

// Cache loaded chunks: chunkIdx -> array of entries
const chunkCache = new Map();

async function init() {
  const hash = window.location.hash.slice(1);
  const params = new URLSearchParams(hash);
  currentSlug = params.get('char');
  const sceneId = params.get('id');
  const highlightLine = params.get('line');
  const queryParam = params.get('q') || '';

  // Single-line mode (from search): show a single target line with ±5 expansion.
  if (highlightLine && !currentSlug && !sceneId) {
    return initSingleLineMode(parseInt(highlightLine), queryParam);
  }

  if (!currentSlug || !sceneId) {
    document.getElementById('story-content').innerHTML =
      '<p class="loading-text">Missing scene parameters.</p>';
    return;
  }

  try {
    charScenes = await fetchJSON('data/character-scenes.json');
  } catch (e) {
    document.getElementById('story-content').innerHTML =
      '<p class="loading-text">数据加载失败，请刷新重试。</p>';
    return;
  }
  currentChar = charScenes[currentSlug];

  if (!currentChar) {
    document.getElementById('story-content').innerHTML =
      '<p class="loading-text">Character not found.</p>';
    return;
  }

  currentScene = (currentChar.scenes || []).find(s => s.id === sceneId);
  if (!currentScene) {
    document.getElementById('story-content').innerHTML =
      '<p class="loading-text">Scene not found.</p>';
    return;
  }

  // Load talk index
  try {
    talkIndex = await fetchJSON('data/talk/index.json');
  } catch (e) {
    document.getElementById('story-content').innerHTML =
      '<p class="loading-text">对话数据加载失败，请刷新重试。</p>';
    return;
  }
  totalEntries = talkIndex.reduce((sum, c) => sum + c.count, 0);

  // Slice the talk DB for this scene's [first_id, last_id]
  const sceneLines = await loadRange(currentScene.first_id, currentScene.last_id);
  displayedLines = sceneLines.map(l => ({ ...l, _type: 'original' }));

  // Anchor expand cursors to scene boundaries
  if (sceneLines.length > 0) {
    prevGlobalIdx = await findGlobalIdx(sceneLines[0].id) - 1;
    nextGlobalIdx = await findGlobalIdx(sceneLines[sceneLines.length - 1].id) + 1;
  }

  renderHeader();
  renderAll(highlightLine ? parseInt(highlightLine) : null);
  renderNavigation();

  window.addEventListener('langchange', () => {
    renderHeader();
    renderAll(null);
    renderNavigation();
  });
}

/* ── Single-line mode (entered from a search result) ── */

async function initSingleLineMode(lineId, query) {
  if (!Number.isFinite(lineId)) {
    document.getElementById('story-content').innerHTML =
      '<p class="loading-text">Invalid line id.</p>';
    return;
  }

  singleLineMode = true;
  persistentHighlightId = lineId;
  pageQuery = query || '';

  talkIndex = await fetchJSON('data/talk/index.json');
  totalEntries = talkIndex.reduce((sum, c) => sum + c.count, 0);

  const targetIdx = await findGlobalIdx(lineId);
  if (targetIdx < 0) {
    document.getElementById('story-content').innerHTML =
      '<p class="loading-text">Line not found.</p>';
    return;
  }

  const targetEntry = await getEntryAtGlobal(targetIdx);
  displayedLines = targetEntry ? [{ ...targetEntry, _type: 'original' }] : [];
  prevGlobalIdx = targetIdx - 1;
  nextGlobalIdx = targetIdx + 1;

  renderSingleLineHeader();
  renderAll(lineId);
  document.getElementById('story-nav').innerHTML = '';

  window.addEventListener('langchange', () => {
    renderSingleLineHeader();
    renderAll(null);
  });
}

function renderSingleLineHeader() {
  const lang = getLang();
  const headerEl = document.getElementById('story-header');
  const backHref = pageQuery
    ? `search.html#q=${encodeURIComponent(pageQuery)}`
    : 'search.html';
  const label = pageQuery
    ? (lang === 'en' ? `from search · "${pageQuery}"` : `检索结果 ·「${pageQuery}」`)
    : (lang === 'en' ? 'from search' : '检索结果');
  headerEl.innerHTML = `
    <a href="${escapeHTML(backHref)}" class="scene-nav-btn">${t('common.back')}</a>
    <span style="font-family:var(--font-heading);color:var(--gold);font-size:0.85rem;letter-spacing:0.06em;">
      ${escapeHTML(label)}
    </span>
    <span></span>
  `;
  headerEl.style.display = 'flex';
  headerEl.style.alignItems = 'center';
  headerEl.style.justifyContent = 'space-between';
  headerEl.style.marginBottom = '1.5rem';
}

/* ── Talk DB helpers ── */

function chunkIdxForGlobal(globalIdx) {
  let lo = 0, hi = talkIndex.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const c = talkIndex[mid];
    if (globalIdx < c.first_idx) hi = mid - 1;
    else if (globalIdx >= c.first_idx + c.count) lo = mid + 1;
    else return mid;
  }
  return -1;
}

async function loadChunk(ci) {
  if (chunkCache.has(ci)) return chunkCache.get(ci);
  const data = await fetchJSON(`data/talk/${talkIndex[ci].file}`);
  chunkCache.set(ci, data);
  return data;
}

async function getEntryAtGlobal(globalIdx) {
  const ci = chunkIdxForGlobal(globalIdx);
  if (ci < 0) return null;
  const chunk = await loadChunk(ci);
  const localIdx = globalIdx - talkIndex[ci].first_idx;
  return chunk[localIdx] || null;
}

async function findGlobalIdx(lineId) {
  let ci = -1;
  for (let i = 0; i < talkIndex.length; i++) {
    if (lineId >= talkIndex[i].first_id && lineId <= talkIndex[i].last_id) {
      ci = i;
      break;
    }
  }
  if (ci < 0) return -1;
  const chunk = await loadChunk(ci);
  for (let j = 0; j < chunk.length; j++) {
    if (chunk[j].id === lineId) return talkIndex[ci].first_idx + j;
  }
  return -1;
}

// Load all entries with id in [firstId, lastId] (inclusive), sorted by id.
async function loadRange(firstId, lastId) {
  const lines = [];
  for (let i = 0; i < talkIndex.length; i++) {
    const c = talkIndex[i];
    if (c.last_id < firstId || c.first_id > lastId) continue;
    const chunk = await loadChunk(i);
    for (const r of chunk) {
      if (r.id >= firstId && r.id <= lastId) lines.push(r);
    }
  }
  lines.sort((a, b) => a.id - b.id);
  return lines;
}

/* ── Render ── */

function renderHeader() {
  const lang = getLang();
  const headerEl = document.getElementById('story-header');
  const charName = lang === 'en' ? currentChar.name_en : currentChar.name_ch;
  headerEl.innerHTML = `
    <a href="stories.html#char=${escapeHTML(currentSlug)}" class="scene-nav-btn" data-i18n="common.back">${t('common.back')}</a>
    <span style="font-family:var(--font-heading);color:var(--gold);font-size:0.85rem;letter-spacing:0.06em;">
      ${escapeHTML(charName)} &mdash; ${escapeHTML(String(currentScene.id))}
    </span>
    <span style="font-size:0.8rem;color:var(--text-muted);">
      ${escapeHTML(String(currentScene.line_count))} ${lang === 'en' ? 'lines' : '行'}
    </span>
  `;
  headerEl.style.display = 'flex';
  headerEl.style.alignItems = 'center';
  headerEl.style.justifyContent = 'space-between';
  headerEl.style.marginBottom = '1.5rem';
}

function renderAll(highlightLineId) {
  const container = document.getElementById('story-content');
  const lang = getLang();
  container.innerHTML = '';

  // Expand-up button
  if (talkIndex && prevGlobalIdx >= 0) {
    const upBtn = document.createElement('button');
    upBtn.className = 'expand-btn expand-up';
    upBtn.innerHTML = '<svg class="expand-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/><polyline points="18 9 12 3 6 9"/></svg>';
    upBtn.title = lang === 'en' ? 'Load previous lines' : '加载前文';
    upBtn.addEventListener('click', expandUp);
    container.appendChild(upBtn);
  }

  for (const line of displayedLines) {
    container.appendChild(createLineEl(line, lang, highlightLineId));
  }

  // Expand-down button
  if (talkIndex && nextGlobalIdx < totalEntries) {
    const downBtn = document.createElement('button');
    downBtn.className = 'expand-btn expand-down';
    downBtn.innerHTML = '<svg class="expand-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/><polyline points="6 15 12 21 18 15"/></svg>';
    downBtn.title = lang === 'en' ? 'Load next lines' : '加载后文';
    downBtn.addEventListener('click', expandDown);
    container.appendChild(downBtn);
  }

  if (highlightLineId) {
    const el = document.getElementById('highlight-line');
    if (el) setTimeout(() => el.scrollIntoView({ behavior: scrollBehavior(), block: 'center' }), 100);
  }
}

function createLineEl(line, lang, highlightLineId) {
  const div = document.createElement('div');
  div.className = 'dialogue-line';
  if (line._type === 'context') div.className += ' expanded-line';
  // Persistent highlight (survives expand re-renders in single-line mode).
  const isTarget = persistentHighlightId != null && line.id === persistentHighlightId;
  if (isTarget) div.className += ' highlight';
  // One-shot scroll anchor (scene mode, or first render of single-line mode).
  if (line.id === highlightLineId) {
    if (!isTarget) div.className += ' highlight';
    div.id = 'highlight-line';
  }
  const speaker = lang === 'en' ? line.s_en : line.s_ch;
  const primaryText = lang === 'en' ? line.t_en : line.t_ch;
  const secondaryText = lang === 'en' ? line.t_ch : line.t_en;
  const primaryHTML = pageQuery
    ? highlightText(primaryText || '', pageQuery)
    : escapeHTML(primaryText || '');
  const secondaryHTML = pageQuery
    ? highlightText(secondaryText || '', pageQuery)
    : escapeHTML(secondaryText || '');
  div.innerHTML = `
    <div class="dialogue-speaker">${escapeHTML(speaker || '')}</div>
    <div>
      <div class="dialogue-text">${primaryHTML}</div>
      ${secondaryText ? `<div class="dialogue-text-secondary">${secondaryHTML}</div>` : ''}
    </div>
  `;
  return div;
}

/* ── Expand ── */

async function expandUp() {
  if (loading || prevGlobalIdx < 0) return;
  loading = true;

  const count = Math.min(5, prevGlobalIdx + 1);
  const newLines = [];
  for (let i = 0; i < count; i++) {
    const entry = await getEntryAtGlobal(prevGlobalIdx - i);
    if (entry) newLines.unshift({ ...entry, _type: 'context' });
  }
  prevGlobalIdx -= count;

  const container = document.getElementById('story-content');
  const firstLine = container.querySelector('.dialogue-line');
  const prevTop = firstLine ? firstLine.getBoundingClientRect().top : 0;

  displayedLines = newLines.concat(displayedLines);
  renderAll(null);

  const allLines = container.querySelectorAll('.dialogue-line');
  const target = allLines[newLines.length];
  if (target) {
    const newTop = target.getBoundingClientRect().top;
    window.scrollBy(0, newTop - prevTop);
  }

  loading = false;
}

async function expandDown() {
  if (loading || nextGlobalIdx >= totalEntries) return;
  loading = true;

  const count = Math.min(5, totalEntries - nextGlobalIdx);
  const newLines = [];
  for (let i = 0; i < count; i++) {
    const entry = await getEntryAtGlobal(nextGlobalIdx + i);
    if (entry) newLines.push({ ...entry, _type: 'context' });
  }
  nextGlobalIdx += count;

  displayedLines = displayedLines.concat(newLines);
  renderAll(null);

  loading = false;
}

/* ── Navigation ── */

function renderNavigation() {
  const navEl = document.getElementById('story-nav');
  const allScenes = currentChar.scenes || [];
  const currentIdx = allScenes.findIndex(s => s.id === currentScene.id);
  const prevScene = currentIdx > 0 ? allScenes[currentIdx - 1] : null;
  const nextScene = currentIdx < allScenes.length - 1 ? allScenes[currentIdx + 1] : null;
  const prevHref = prevScene ? `story.html#char=${escapeHTML(currentSlug)}&id=${prevScene.id}` : null;
  const nextHref = nextScene ? `story.html#char=${escapeHTML(currentSlug)}&id=${nextScene.id}` : null;
  navEl.innerHTML = `
    ${prevHref
      ? `<a href="${prevHref}" class="scene-nav-btn" data-i18n="common.prev">${t('common.prev')}</a>`
      : `<span class="scene-nav-btn disabled" aria-disabled="true">${t('common.prev')}</span>`}
    <span style="font-size:0.8rem;color:var(--text-muted);">
      ${currentIdx + 1} / ${allScenes.length}
    </span>
    ${nextHref
      ? `<a href="${nextHref}" class="scene-nav-btn" data-i18n="common.next">${t('common.next')}</a>`
      : `<span class="scene-nav-btn disabled" aria-disabled="true">${t('common.next')}</span>`}
  `;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
