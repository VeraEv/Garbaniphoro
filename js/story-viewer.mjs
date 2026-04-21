/**
 * story-viewer.mjs - Stories list page controller
 * Two views:
 *   1. Character selection grid (A-Z pinyin index)
 *   2. Profile + flat scene list for a chosen character
 *
 * URL scheme:
 *   stories.html           → character selection
 *   stories.html#char=mydei → scenes for that character
 *
 * Data source: data/character-scenes.json (auto-generated from talk DB)
 */

import { getLang, t } from './i18n.mjs?v=3';
import { fetchJSON, escapeHTML, scrollBehavior } from './app.mjs?v=5';

let charScenes = null;  // {slug: {name_ch, name_en, note, quote_ch, quote_en, scenes:[]}}
let charList = null;

// Pinyin initial lookup for Kremnos named characters
const PINYIN = {
  '万敌': 'W', '歌耳戈': 'G', '欧利庞': 'O', '克拉特鲁斯': 'K',
  '哈托努斯': 'H', '托勒密': 'T', '帕狄卡斯': 'P', '莱昂': 'L',
  '赫菲斯辛': 'H', '朴塞塔': 'P', '德米特里': 'D', '格奈乌斯': 'G',
  '尼卡多利': 'N', '黄金狮首': 'H', '安德里斯库斯': 'A', '马耳叙阿斯': 'M',
  '尤利克赛斯': 'Y', '赫克鲁斯': 'H', '厄里倪厄斯': 'E', '奥卢斯': 'A',
  '乔治斯': 'Q', '恩普莎': 'E', '武器商人': 'W', '悬锋报名官': 'X',
  '急躁的斗士': 'J', '天谴先锋': 'T', '腼腆的新兵': 'M', '天谴猎手': 'T',
  '十敌': 'S',
  '神官': 'S', '督政官': 'D', '伊格尼斯': 'Y', '裁判官': 'C',
  '悬锋城统帅': 'X', '悬锋的大学者': 'X', '尼卡多利的眷属': 'N',
  '无畏的战士': 'W', '科可波三世': 'K', '蜜果羹': 'M'
};

async function init() {
  try {
    [charScenes, charList] = await Promise.all([
      fetchJSON('data/character-scenes.json'),
      fetchJSON('data/character-list.json')
    ]);
  } catch (e) {
    document.getElementById('char-select-view').innerHTML =
      '<p class="loading-text">数据加载失败，请刷新重试。</p>';
    return;
  }

  route();
  window.addEventListener('hashchange', route);
  window.addEventListener('langchange', () => {
    route();
  });
}

function route() {
  const hash = location.hash;
  const match = hash.match(/char=([^&]+)/);

  const selectView = document.getElementById('char-select-view');
  const scenesView = document.getElementById('char-scenes-view');

  if (match) {
    selectView.style.display = 'none';
    scenesView.style.display = '';
    renderCharacterScenes(match[1]);
  } else {
    selectView.style.display = '';
    scenesView.style.display = 'none';
    renderCharacterSelect();
  }
}

/* ========== View 1: Character Selection ========== */

function renderCharacterSelect() {
  const lang = getLang();
  const named = charList.kremnos.named;

  // Build list with pinyin initial
  const entries = named.map(c => ({
    ch: c.ch,
    en: c.en,
    note: c.note || '',
    initial: PINYIN[c.ch] || '?',
    slug: c.en.toLowerCase().replace(/\s+/g, '-')
  }));

  // Sort by pinyin initial, then by ch name
  entries.sort((a, b) => {
    if (a.initial !== b.initial) return a.initial.localeCompare(b.initial);
    return a.ch.localeCompare(b.ch, 'zh-Hans');
  });

  // Group by initial
  const groups = new Map();
  for (const e of entries) {
    if (!groups.has(e.initial)) groups.set(e.initial, []);
    groups.get(e.initial).push(e);
  }

  // Slugs with at least one scene
  const slugsWithData = new Set(
    Object.entries(charScenes)
      .filter(([, info]) => info.scenes && info.scenes.length > 0)
      .map(([slug]) => slug)
  );

  // Render A-Z index
  const indexEl = document.getElementById('alpha-index');
  const letters = [...groups.keys()].sort();
  indexEl.innerHTML = letters
    .map((l, i) => `<a class="alpha-letter" href="#letter-${l}" style="--index:${i}">${l}</a>`)
    .join('');

  indexEl.querySelectorAll('.alpha-letter').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      const target = document.getElementById(a.getAttribute('href').slice(1));
      if (target) target.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
    });
  });

  // Render character grid grouped by letter
  const gridEl = document.getElementById('char-grid');
  let html = '';

  letters.forEach((letter, groupIdx) => {
    const chars = groups.get(letter);
    html += `<div class="char-group" id="letter-${letter}" style="--index:${groupIdx}">`;
    html += `<div class="char-group-letter">${letter}</div>`;
    html += `<div class="char-group-list">`;

    for (const c of chars) {
      const hasData = slugsWithData.has(c.slug);
      const cls = hasData ? 'char-card' : 'char-card char-card-empty';

      if (hasData) {
        html += `<a class="${cls}" href="stories.html#char=${escapeHTML(c.slug)}">`;
      } else {
        html += `<div class="${cls}">`;
      }

      const initials = escapeHTML((lang === 'en' ? c.en : c.ch).slice(0, 1));
      const portraitSrc = `images/portraits/${escapeHTML(c.slug)}.jpg`;
      html += `<div class="char-card-portrait">`;
      html += `<img src="${portraitSrc}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`;
      html += `<span class="char-card-portrait-placeholder" style="display:none">${initials}</span>`;
      html += `</div>`;
      html += `<div class="char-card-info">`;
      html += `<span class="char-card-name">${escapeHTML(lang === 'en' ? c.en : c.ch)}</span>`;
      html += `<span class="char-card-name-sub">${escapeHTML(lang === 'en' ? c.ch : c.en)}</span>`;
      if (c.note) {
        html += `<span class="char-card-note">${escapeHTML(c.note)}</span>`;
      }
      if (!hasData) {
        html += `<span class="char-card-soon">${lang === 'en' ? 'Coming soon' : '即将收录'}</span>`;
      }
      html += `</div>`;

      html += hasData ? '</a>' : '</div>';
    }

    html += `</div></div>`;
  });

  gridEl.innerHTML = html;
}

/* ========== View 2: Character profile + flat scene list ========== */

function findCharMeta(charCh) {
  return (charList.kremnos.named || []).find(c => c.ch === charCh) || null;
}

function renderCharacterScenes(slug) {
  const char = charScenes[slug];
  const lang = getLang();
  const headerEl = document.getElementById('char-scenes-header');

  if (!char) {
    headerEl.innerHTML = `<p class="loading-text">${lang === 'en' ? 'No scene data yet.' : '暂无剧情数据。'}</p>`;
    document.getElementById('story-list').innerHTML = '';
    return;
  }

  const meta = findCharMeta(char.name_ch);
  const primaryName   = lang === 'en' ? char.name_en : char.name_ch;
  const secondaryName = lang === 'en' ? char.name_ch : char.name_en;
  const initial = primaryName.slice(0, 1);

  const quoteText = lang === 'en' ? char.quote_en : char.quote_ch;

  headerEl.innerHTML = `
    <div class="char-profile-header">
      <div class="char-profile-portrait">
        <img src="images/portraits/${escapeHTML(slug)}.jpg" alt="${escapeHTML(primaryName)}"
             onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
        <span class="char-profile-portrait-placeholder" style="display:none">${escapeHTML(initial)}</span>
      </div>
      <div class="char-profile-identity">
        <h2 class="char-profile-name">${escapeHTML(primaryName)}</h2>
        <p class="char-profile-name-sub">${escapeHTML(secondaryName)}</p>
        ${meta?.note ? `<p class="char-profile-note">${escapeHTML(meta.note)}</p>` : ''}
        ${quoteText ? `<blockquote class="char-profile-quote"><p class="char-profile-quote-text">${escapeHTML(quoteText)}</p></blockquote>` : ''}
      </div>
    </div>
  `;

  const container = document.getElementById('story-list');

  if (!char.scenes || char.scenes.length === 0) {
    container.innerHTML = `<p class="loading-text">${lang === 'en' ? 'No scenes found.' : '暂无场景数据。'}</p>`;
    return;
  }

  container.innerHTML = '';

  // Flat list of scenes (no version accordion — versions to be added back manually later)
  for (let i = 0; i < char.scenes.length; i++) {
    const scene = char.scenes[i];
    const link = document.createElement('a');
    link.className = 'scene-item';
    link.href = `story.html#char=${slug}&id=${scene.id}`;

    const preview = lang === 'en' ? scene.preview_en : scene.preview_ch;

    link.innerHTML = `
      <span class="scene-num">${i + 1}</span>
      <span class="scene-preview" title="${escapeHTML(preview || '')}">${escapeHTML(preview || '')}</span>
      <span class="scene-meta">${t('stories.lines', { n: scene.line_count })}</span>
    `;

    container.appendChild(link);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
