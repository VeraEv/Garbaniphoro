/**
 * search.mjs - Search page controller
 * Loads bilingual data chunks in parallel and searches with String.includes().
 * Each chunk doc: [id, type, speaker_ch, speaker_en, text_ch, text_en]
 */

import { getLang, t } from './i18n.mjs?v=3';
import { escapeHTML, highlightText, scrollBehavior } from './app.mjs?v=5';

const RESULTS_PER_PAGE = 50;
const MAX_RESULTS = 500;
const PARALLEL_FETCHES = 6;

let manifest = null;
const chunkCache = new Map();   // persists across searches; language toggle re-searches in memory
let currentSearchId = 0;        // increment to abort any in-flight search
let allResults = [];
let currentResults = [];
let currentPage = 0;
let currentQuery = '';
let selectedSpeakers = new Set();

async function loadManifest() {
  if (manifest) return manifest;
  const res = await fetch('data/search/manifest.json');
  if (!res.ok) throw new Error(`manifest fetch failed: ${res.status}`);
  manifest = await res.json();
  return manifest;
}

function getSpeakerLabel(r) {
  return r.speaker || '';
}

async function doSearch(query) {
  if (!query || query.length < 1) return;

  const myId = ++currentSearchId;
  allResults = [];
  currentResults = [];
  currentPage = 0;
  currentQuery = query;
  selectedSpeakers.clear();

  const statusEl = document.getElementById('search-status');
  const resultsEl = document.getElementById('search-results');
  const paginationEl = document.getElementById('search-pagination');
  const filterEl = document.getElementById('search-filters');
  const sidebarEl = document.getElementById('search-sidebar');

  statusEl.textContent = t('search.searching');
  resultsEl.innerHTML = '';
  paginationEl.innerHTML = '';
  filterEl.innerHTML = '';
  sidebarEl.hidden = true;

  let m;
  try {
    m = await loadManifest();
  } catch (e) {
    if (currentSearchId === myId) statusEl.textContent = '检索数据加载失败，请刷新重试。';
    return;
  }
  if (currentSearchId !== myId) return;

  const lang = getLang();
  const chunks = m.chunks;
  const queryLower = query.toLowerCase();

  const textIdx = lang === 'en' ? 5 : 4;
  const textOtherIdx = lang === 'en' ? 4 : 5;
  const speakerIdx = lang === 'en' ? 3 : 2;
  const speakerOtherIdx = lang === 'en' ? 2 : 3;

  let searched = 0;
  let stopped = false;

  async function processChunk(chunkInfo) {
    if (currentSearchId !== myId || stopped) return;

    let data = chunkCache.get(chunkInfo.file);
    if (!data) {
      const res = await fetch(`data/search/${chunkInfo.file}`);
      data = await res.json();
      chunkCache.set(chunkInfo.file, data);
    }

    for (const doc of data) {
      if (currentSearchId !== myId || stopped) return;
      const text = doc[textIdx] || '';

      const textMatch = lang === 'en'
        ? text.toLowerCase().includes(queryLower)
        : text.includes(query);

      if (textMatch) {
        allResults.push({
          id: doc[0],
          type: doc[1],
          speaker: doc[speakerIdx] || '',
          text,
          textOther: doc[textOtherIdx] || '',
          speakerOther: doc[speakerOtherIdx] || ''
        });

        if (allResults.length >= MAX_RESULTS) {
          stopped = true;
          return;
        }
      }
    }

    searched++;
    if (currentSearchId !== myId) return;

    const pct = Math.round((searched / chunks.length) * 100);
    statusEl.textContent = `${t('search.searching')} ${pct}%`;

    if (searched % 10 === 0 && allResults.length > 0) {
      applyFilter();
      renderResults();
      renderPagination();
    }
  }

  let idx = 0;
  async function next() {
    while (idx < chunks.length && currentSearchId === myId && !stopped) {
      const i = idx++;
      await processChunk(chunks[i]);
    }
  }

  const workers = [];
  for (let i = 0; i < Math.min(PARALLEL_FETCHES, chunks.length); i++) {
    workers.push(next());
  }
  await Promise.all(workers);

  if (currentSearchId !== myId) return;

  applyFilter();
  renderSpeakerFilter();
  updateStatus(stopped);
  renderResults();
  renderPagination();
}

function applyFilter() {
  if (selectedSpeakers.size > 0) {
    currentResults = allResults.filter(r => selectedSpeakers.has(getSpeakerLabel(r)));
  } else {
    currentResults = allResults;
  }
}

function updateStatus(stopped) {
  const statusEl = document.getElementById('search-status');
  if (currentResults.length === 0 && allResults.length === 0) {
    statusEl.textContent = t('search.no_results');
  } else {
    const total = stopped ? '500+' : allResults.length;
    if (selectedSpeakers.size > 0) {
      statusEl.textContent = `${currentResults.length} / ${total}`;
    } else {
      statusEl.textContent = t('search.result_count', { n: total });
    }
  }
}

// Persistent expand state across re-renders
let filterExpanded = false;

function renderSpeakerFilter() {
  const filterEl = document.getElementById('search-filters');
  const sidebarEl = document.getElementById('search-sidebar');
  filterEl.innerHTML = '';

  const speakerCounts = new Map();
  for (const r of allResults) {
    const label = getSpeakerLabel(r);
    if (!label) continue;
    speakerCounts.set(label, (speakerCounts.get(label) || 0) + 1);
  }

  if (speakerCounts.size < 2) {
    sidebarEl.hidden = true;
    return;
  }

  sidebarEl.hidden = false;
  const sorted = [...speakerCounts.entries()].sort((a, b) => b[1] - a[1]);

  function onToggle(speaker) {
    if (selectedSpeakers.has(speaker)) {
      selectedSpeakers.delete(speaker);
    } else {
      selectedSpeakers.add(speaker);
    }
    currentPage = 0;
    applyFilter();
    updateStatus(allResults.length >= MAX_RESULTS);
    renderResults();
    renderPagination();
    rebuildItems();
  }

  function onClearAll() {
    selectedSpeakers.clear();
    currentPage = 0;
    applyFilter();
    updateStatus(allResults.length >= MAX_RESULTS);
    renderResults();
    renderPagination();
    rebuildItems();
  }

  const INITIAL_SHOW = 5;

  function rebuildItems() {
    filterEl.innerHTML = '';

    // "All" item — acts as clear selection
    const allLi = document.createElement('li');
    allLi.className = `sidebar-item${selectedSpeakers.size === 0 ? ' active' : ''}`;
    allLi.setAttribute('tabindex', '0');
    allLi.setAttribute('role', 'button');
    allLi.innerHTML = `<span class="sidebar-check"></span><span class="sidebar-label">全部</span><span class="sidebar-count">${allResults.length}</span>`;
    allLi.addEventListener('click', onClearAll);
    allLi.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClearAll(); } });
    filterEl.appendChild(allLi);

    const visible = filterExpanded ? sorted : sorted.slice(0, INITIAL_SHOW);
    for (const [speaker, count] of visible) {
      const li = document.createElement('li');
      li.className = `sidebar-item${selectedSpeakers.has(speaker) ? ' active' : ''}`;
      li.setAttribute('tabindex', '0');
      li.setAttribute('role', 'button');
      li.innerHTML = `<span class="sidebar-check"></span><span class="sidebar-label">${escapeHTML(speaker)}</span><span class="sidebar-count">${count}</span>`;
      li.addEventListener('click', () => onToggle(speaker));
      li.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(speaker); } });
      filterEl.appendChild(li);
    }

    if (sorted.length > INITIAL_SHOW) {
      const toggle = document.createElement('li');
      toggle.className = 'sidebar-toggle';
      toggle.setAttribute('tabindex', '0');
      toggle.setAttribute('role', 'button');
      toggle.textContent = filterExpanded ? '收起' : `更多 (${sorted.length - INITIAL_SHOW})`;
      toggle.addEventListener('click', () => {
        filterExpanded = !filterExpanded;
        rebuildItems();
      });
      toggle.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); filterExpanded = !filterExpanded; rebuildItems(); }
      });
      filterEl.appendChild(toggle);
    }
  }

  rebuildItems();
}

function renderResults() {
  const container = document.getElementById('search-results');
  const start = currentPage * RESULTS_PER_PAGE;
  const end = Math.min(start + RESULTS_PER_PAGE, currentResults.length);
  const pageResults = currentResults.slice(start, end);

  container.innerHTML = '';

  for (const r of pageResults) {
    // id format: "TYPE_LINEID" (e.g. "0_30403551"); take the last underscore-delimited segment.
    const lineId = String(r.id).split('_').pop();
    const href = `story.html#line=${encodeURIComponent(lineId)}&q=${encodeURIComponent(currentQuery)}`;

    const a = document.createElement('a');
    a.className = 'search-result';
    a.href = href;

    const speakerCh = r.speaker ? escapeHTML(r.speaker) : '';
    const speakerEn = r.speakerOther ? escapeHTML(r.speakerOther) : '';
    const text = highlightText(r.text, currentQuery);
    const textOther = r.textOther ? escapeHTML(r.textOther) : '';

    a.innerHTML = `
      ${speakerCh ? `<div class="search-result-speaker">${speakerCh}${speakerEn ? `<span class="search-result-speaker-en">${speakerEn.toUpperCase()}</span>` : ''}</div>` : ''}
      <div class="search-result-text">${text}</div>
      ${textOther ? `<div class="search-result-text-other">${textOther}</div>` : ''}
    `;

    container.appendChild(a);
  }
}

function renderPagination() {
  const container = document.getElementById('search-pagination');
  const totalPages = Math.ceil(currentResults.length / RESULTS_PER_PAGE);

  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = '';
  const maxButtons = Math.min(totalPages, 10);
  for (let i = 0; i < maxButtons; i++) {
    const btn = document.createElement('button');
    btn.className = `page-btn${i === currentPage ? ' active' : ''}`;
    btn.textContent = i + 1;
    btn.addEventListener('click', () => {
      currentPage = i;
      renderResults();
      renderPagination();
      window.scrollTo({ top: 0, behavior: scrollBehavior() });
    });
    container.appendChild(btn);
  }
}

function init() {
  const input = document.getElementById('search-input');
  const btn = document.getElementById('search-btn');

  if (!input || !btn) return;

  const triggerSearch = () => doSearch(input.value.trim());

  btn.addEventListener('click', triggerSearch);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') triggerSearch();
  });

  const hash = window.location.hash.slice(1);
  const params = new URLSearchParams(hash);
  const q = params.get('q');
  const qParam = new URLSearchParams(window.location.search).get('q');
  const query = q || qParam;
  if (query) {
    input.value = query;
    doSearch(query);
  }

  window.addEventListener('langchange', () => {
    if (currentQuery) doSearch(currentQuery);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
