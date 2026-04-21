/**
 * monsters.mjs - Monster bestiary page controller
 * Two views:
 *   1. Monster grid (all monsters)
 *   2. Monster detail (stats, resistances, skills)
 *
 * URL scheme:
 *   monsters.html          → monster grid
 *   monsters.html#id=4014010 → detail for that monster
 */

import { getLang, t } from './i18n.mjs?v=3';
import { fetchJSON, escapeHTML } from './app.mjs?v=5';

let monsters = null;

const SKILL_TYPE_ORDER = ['attack', 'skill', 'ultimate', 'special', 'mechanic', 'passive'];

async function init() {
  try {
    monsters = await fetchJSON('data/monsters.json');
  } catch (e) {
    document.getElementById('monster-grid-view').innerHTML =
      '<p class="loading-text">数据加载失败，请刷新重试。</p>';
    return;
  }

  route();
  window.addEventListener('hashchange', route);
  window.addEventListener('langchange', route);
}

function route() {
  const match = location.hash.match(/id=([^&]+)/);
  const gridView   = document.getElementById('monster-grid-view');
  const detailView = document.getElementById('monster-detail-view');

  if (match) {
    gridView.style.display   = 'none';
    detailView.style.display = '';
    renderDetail(match[1]);
  } else {
    gridView.style.display   = '';
    detailView.style.display = 'none';
    renderGrid();
  }
}

/* ── View 1: Monster Grid ── */

function renderGrid() {
  const lang = getLang();
  const grid = document.getElementById('monster-grid');

  if (!monsters || monsters.length === 0) {
    grid.innerHTML = `<p class="loading-text">${lang === 'en' ? 'No monster data.' : '暂无怪物数据。'}</p>`;
    return;
  }

  grid.innerHTML = monsters.map((m, i) =>
    `<a class="monster-card" href="monsters.html#id=${escapeHTML(m.id)}" style="--index:${i}">
      <div class="monster-card-badges">
        <span class="monster-badge monster-badge-type">${escapeHTML(lang === 'en' ? m.type_en : m.type_ch)}</span>
        <span class="monster-badge monster-badge-elem monster-elem-${escapeHTML(m.element)}">${escapeHTML(lang === 'en' ? m.element_en : m.element_ch)}</span>
        ${m.phases > 1 ? `<span class="monster-badge monster-badge-phase">${m.phases} ${lang === 'en' ? 'Phases' : '阶段'}</span>` : ''}
      </div>
      <div class="monster-card-name">${escapeHTML(lang === 'en' ? m.name_en : m.name_ch)}</div>
      <div class="monster-card-name-sub">${escapeHTML(lang === 'en' ? m.name_ch : m.name_en)}</div>
    </a>`
  ).join('');
}

/* ── View 2: Monster Detail ── */

function renderDetail(id) {
  const lang = getLang();
  const m = monsters.find(x => x.id === id);
  const container = document.getElementById('monster-detail');

  if (!m) {
    container.innerHTML = `<p class="loading-text">${lang === 'en' ? 'Monster not found.' : '未找到该怪物。'}</p>`;
    return;
  }

  const primaryName   = lang === 'en' ? m.name_en   : m.name_ch;
  const secondaryName = lang === 'en' ? m.name_ch   : m.name_en;
  const primaryType   = lang === 'en' ? m.type_en   : m.type_ch;
  const primaryElem   = lang === 'en' ? m.element_en : m.element_ch;
  const desc          = lang === 'en' ? (m.desc_en || m.desc_ch) : m.desc_ch;

  const statLabels = {
    hp:         { ch: '血量',     en: 'HP' },
    spd:        { ch: '速度',     en: 'SPD' },
    def:        { ch: '防御',     en: 'DEF' },
    effect_res: { ch: '效果抵抗', en: 'Effect RES' },
    effect_hit: { ch: '效果命中', en: 'Effect HIT' },
    toughness:  { ch: '韧性',     en: 'Toughness' },
    break_mult: { ch: '击破倍率', en: 'Break Mult.' },
    growth:     { ch: '成长曲线', en: 'Growth' },
  };

  const statsHtml = Object.entries(statLabels).map(([key, labels]) => {
    let val;
    if (key === 'growth') {
      val = lang === 'en' ? m.stats.growth_en : m.stats.growth_ch;
    } else {
      val = m.stats[key] ?? '—';
    }
    return `<div class="monster-stat-item">
      <span class="monster-stat-label">${escapeHTML(labels[lang] || labels.ch)}</span>
      <span class="monster-stat-value">${escapeHTML(String(val))}</span>
    </div>`;
  }).join('');

  const resistsHtml = m.resistances.map(r =>
    `<span class="monster-resist-chip monster-elem-${escapeHTML(r.element)}">
      <span class="monster-resist-elem">${escapeHTML(lang === 'en' ? r.element_en : r.element_ch)}</span>
      <span class="monster-resist-val">${escapeHTML(r.value)}</span>
    </span>`
  ).join('');

  const controlLabel = lang === 'en' ? 'Control RES' : '控制抵抗';

  // Group skills by type
  const groups = new Map();
  for (const sk of m.skills) {
    if (!groups.has(sk.type)) groups.set(sk.type, []);
    groups.get(sk.type).push(sk);
  }

  const skillsHtml = SKILL_TYPE_ORDER
    .filter(t => groups.has(t))
    .map(typeKey => {
      const skills = groups.get(typeKey);
      const firstSkill = skills[0];
      const typeLabel = lang === 'en' ? firstSkill.type_en : firstSkill.type_ch;

      const skillCards = skills.map(sk => renderSkillCard(sk, lang)).join('');

      return `<div class="monster-skill-group">
        <div class="monster-skill-group-header">
          <span class="monster-skill-group-label">${escapeHTML(typeLabel)}</span>
        </div>
        ${skillCards}
      </div>`;
    }).join('');

  container.innerHTML = `
    <div class="monster-profile">
      <div class="monster-profile-head">
        <div class="monster-profile-identity">
          <div class="monster-profile-badges">
            <span class="monster-badge monster-badge-type">${escapeHTML(primaryType)}</span>
            <span class="monster-badge monster-badge-elem monster-elem-${escapeHTML(m.element)}">${escapeHTML(primaryElem)}</span>
            ${m.phases > 1 ? `<span class="monster-badge monster-badge-phase">${m.phases} ${lang === 'en' ? 'Phases' : '阶段'}</span>` : ''}
          </div>
          <h2 class="monster-profile-name">${escapeHTML(primaryName)}</h2>
          <p class="monster-profile-name-sub">${escapeHTML(secondaryName)}</p>
          <p class="monster-profile-id">ID ${escapeHTML(m.id)}</p>
        </div>
      </div>

      ${desc ? `<blockquote class="monster-lore">
        <p class="monster-lore-text">${escapeHTML(desc)}</p>
      </blockquote>` : ''}

      <section class="monster-section">
        <div class="monster-section-label">${lang === 'en' ? 'Base Stats' : '基础属性'}</div>
        <div class="monster-stats-grid">${statsHtml}</div>
      </section>

      <section class="monster-section">
        <div class="monster-section-label">${lang === 'en' ? 'Resistances' : '抗性'}</div>
        <div class="monster-resist-row">
          ${resistsHtml}
          ${m.resist_control ? `<span class="monster-resist-chip monster-resist-control">
            <span class="monster-resist-elem">${escapeHTML(controlLabel)}</span>
            <span class="monster-resist-val">${escapeHTML(m.resist_control)}</span>
          </span>` : ''}
        </div>
      </section>

      <section class="monster-section">
        <div class="monster-section-label">${lang === 'en' ? 'Skills' : '技能'}</div>
        <div class="monster-skills">${skillsHtml}</div>
      </section>
    </div>
  `;

  // Accordion toggle for skill cards
  container.querySelectorAll('.monster-skill-card[data-expandable]').forEach(card => {
    const header = card.querySelector('.monster-skill-card-header');
    const body   = card.querySelector('.monster-skill-card-body');
    header.addEventListener('click', () => {
      const open = card.classList.toggle('open');
      body.hidden = !open;
    });
  });
}

function renderSkillCard(sk, lang) {
  const name    = lang === 'en' ? (sk.name_en || sk.name_ch) : sk.name_ch;
  const desc    = lang === 'en' ? (sk.desc_en  || sk.desc_ch)  : sk.desc_ch;
  const phases  = sk.phases.map(p =>
    `<span class="monster-phase-badge">${lang === 'en' ? `Phase ${p}` : `阶段 ${p}`}</span>`
  ).join('');
  const levelStr = sk.level != null ? `+${sk.level}` : '';

  const paramsHtml = sk.params && sk.params.length
    ? `<dl class="monster-skill-params">${sk.params.map(p =>
        `<div class="monster-skill-param">
          <dt>${escapeHTML(lang === 'en' ? p.label_en : p.label_ch)}</dt>
          <dd>${escapeHTML(p.value)}</dd>
        </div>`
      ).join('')}</dl>`
    : '';

  const isExpandable = desc && desc.length > 80;

  return `<div class="monster-skill-card${isExpandable ? '' : ' monster-skill-card-short'}"
               ${isExpandable ? 'data-expandable' : ''}>
    <div class="monster-skill-card-header">
      <div class="monster-skill-card-meta">
        ${phases}
        ${sk.warning ? '<span class="monster-skill-warning" title="重要机制">⚠</span>' : ''}
      </div>
      <div class="monster-skill-name-row">
        <span class="monster-skill-name">${escapeHTML(name)}</span>
        ${levelStr ? `<span class="monster-skill-level">${escapeHTML(levelStr)}</span>` : ''}
        ${isExpandable ? '<span class="monster-skill-arrow"></span>' : ''}
      </div>
    </div>
    <div class="monster-skill-card-body" ${isExpandable ? 'hidden' : ''}>
      ${desc ? `<p class="monster-skill-desc">${escapeHTML(desc)}</p>` : ''}
      ${paramsHtml}
    </div>
  </div>`;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
