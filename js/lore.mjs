/**
 * lore.mjs - Lore/Archive page controller
 * Tabs: 书籍 (books), 任务 (quests), 成就 (achievements), 角色 (characters)
 */

import { getLang, t } from './i18n.mjs?v=5';
import { fetchJSON, escapeHTML } from './app.mjs?v=5';

let readables = null;
let quests = null;
let achievements = null;
let items = null;
let charactersMydei = null;
let lightcones = null;
let currentTab = 'books';
let lcDetailId = null; // null = gallery view, string ID = detail view

/** Fill light cone skill template with params for a given superimposition (0-indexed) */
function fmtLC(template, params) {
  return fmt(
    template
      .replace(/#(\d+)\[f(\d+)\]/g, (_, n, dec) => {
        const v = params[+n - 1];
        return v !== undefined ? parseFloat(v).toFixed(+dec) : '?';
      })
      .replace(/#(\d+)\[i\]/g, (_, n) => {
        const v = params[+n - 1];
        return v !== undefined ? Math.round(v) : '?';
      })
  );
}

/** Convert game rich text to safe HTML */
function fmt(str) {
  if (!str) return '';
  return str
    .replace(/\\n/g, '<br>')
    .replace(/<br\s*\/?>/gi, '<br>')
    .replace(/<b>/gi, '<strong>').replace(/<\/b>/gi, '</strong>')
    .replace(/<i>/gi, '<em>').replace(/<\/i>/gi, '</em>')
    .replace(/<color=(#[0-9a-fA-F]+)>/gi, '<span style="color:$1">')
    .replace(/<\/color>/gi, '</span>')
    .replace(/<align="center">/gi, '<div style="text-align:center">')
    .replace(/<align="right">/gi, '<div style="text-align:right">')
    .replace(/<\/align>/gi, '</div>')
    .replace(/<size=(\d+)>/gi, '<span style="font-size:$1%">')
    .replace(/<\/size>/gi, '</span>')
    .replace(/<\/?unbreak>/gi, '')
    .replace(/\{NICKNAME\}/g, '{开拓者}')
    .replace(/\{M#([^}]*)}\{F#([^}]*)}/g, '$1/$2')
    .replace(/\{[MF]#([^}]*)}/g, '$1')
    .replace(
      /\{RUBY_B#([^}]*)\}([^{]*)\{RUBY_E#\}/g,
      '<ruby>$2<rt>$1</rt></ruby>'
    )
    .replace(/<(?!br|strong|\/strong|em|\/em|span|\/span|div|\/div|ruby|\/ruby|rt|\/rt|u|\/u|s|\/s)[^>]+>/g, '');
}

/* ── Tab switching ── */
function setupTabs() {
  const bar = document.getElementById('lore-tabs');
  bar.addEventListener('click', e => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    bar.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentTab = btn.dataset.tab;
    lcDetailId = null;
    render();
  });
}

/* ── Render dispatcher ── */
function render() {
  const c = document.getElementById('lore-content');
  c.classList.remove('is-fading');
  void c.offsetWidth;
  c.classList.add('is-fading');
  c.innerHTML = '';
  switch (currentTab) {
    case 'books': renderBooks(c); break;
    case 'quests': renderQuests(c); break;
    case 'achievements': renderAchievements(c); break;
    case 'items': renderItems(c); break;
    case 'characters': renderCharacters(c); break;
    case 'lightcones': renderLightcones(c); break;
    case 'appendix': renderAppendix(c); break;
  }
}

/* ── Books (readables) ── */
function renderBooks(container) {
  if (!readables) { container.innerHTML = '<p class="loading-text">数据加载中…</p>'; return; }
  const lang = getLang();

  readables.forEach((group, idx) => {
    // Version header (collapsible)
    const section = document.createElement('div');
    section.className = 'version-section';
    section.style.setProperty('--index', idx);

    const vHeader = document.createElement('div');
    vHeader.className = 'version-header';
    vHeader.innerHTML = `<span class="accordion-arrow"></span> ${group.version} <span class="version-count">${group.books.length}</span>`;
    section.appendChild(vHeader);

    const vBody = document.createElement('div');
    vBody.className = 'version-body';

    vHeader.addEventListener('click', () => {
      vHeader.classList.toggle('open');
      vBody.classList.toggle('open');
    });

    for (const r of group.books) {
      const name = lang === 'en' ? r.name_en : r.name_ch;
      const nameOther = lang === 'en' ? r.name_ch : r.name_en;
      const desc = lang === 'en' ? r.desc_en : r.desc_ch;

      const article = document.createElement('div');
      article.className = 'readable-entry';

      const header = document.createElement('div');
      header.className = 'readable-header';
      header.innerHTML = `
        <span class="accordion-arrow"></span>
        <div class="readable-title-group">
          <span class="readable-title">${escapeHTML(name)}</span>
          ${nameOther ? `<span class="readable-title-other">${escapeHTML(nameOther)}</span>` : ''}
        </div>
        ${r.chapters.length > 1 ? `<span class="readable-chapters-count">${r.chapters.length}</span>` : ''}
      `;

      if (desc) {
        const descEl = document.createElement('div');
        descEl.className = 'readable-desc';
        descEl.textContent = desc;
        header.appendChild(descEl);
      }

      const body = document.createElement('div');
      body.className = 'readable-body';

      for (const ch of r.chapters) {
        const chDiv = document.createElement('div');
        chDiv.className = 'readable-chapter';

        const chName = lang === 'en' ? ch.name_en : ch.name_ch;
        if (chName) {
          const chTitle = document.createElement('div');
          chTitle.className = 'readable-chapter-title';
          chTitle.textContent = chName;
          chDiv.appendChild(chTitle);
        }

        const textPrimary = lang === 'en' ? ch.text_en : ch.text_ch;
        const textSecondary = lang === 'en' ? ch.text_ch : ch.text_en;

        if (textPrimary) {
          const p = document.createElement('div');
          p.className = 'readable-text';
          p.innerHTML = fmt(textPrimary);
          chDiv.appendChild(p);
        }

        if (textSecondary) {
          const s = document.createElement('div');
          s.className = 'readable-text-other';
          s.innerHTML = fmt(textSecondary);
          s.hidden = true;
          chDiv.appendChild(s);
        }

        body.appendChild(chDiv);
      }

      header.addEventListener('click', () => {
        header.classList.toggle('open');
        body.classList.toggle('open');
      });

      article.appendChild(header);
      article.appendChild(body);
      vBody.appendChild(article);
    }

    section.appendChild(vBody);
    container.appendChild(section);
  });
}

/* ── Quest entry helper ── */
function createQuestEntry(q, lang) {
  const name = lang === 'en' ? q.name_en : q.name_ch;
  const nameOther = lang === 'en' ? q.name_ch : q.name_en;
  const hasSteps = q.steps && q.steps.length;

  const entry = document.createElement('div');
  entry.className = 'quest-entry' + (hasSteps ? ' quest-expandable' : '');

  const header = document.createElement('div');
  header.className = 'quest-entry-header';
  header.innerHTML = `
    ${hasSteps ? '<span class="accordion-arrow quest-arrow"></span>' : ''}
    <div>
      <div class="quest-name">${fmt(name || q.name_ch)}</div>
      ${nameOther ? `<div class="quest-name-other">${fmt(nameOther)}</div>` : ''}
    </div>
  `;
  entry.appendChild(header);

  if (hasSteps) {
    const detail = document.createElement('div');
    detail.className = 'quest-detail';

    for (const step of q.steps) {
      const text = lang === 'en' ? step.en : step.ch;
      if (!text) continue;
      const el = document.createElement('div');
      if (step.type === 'desc') {
        el.className = 'quest-desc';
        el.innerHTML = fmt(text);
      } else {
        el.className = 'quest-target';
        el.innerHTML = `<span class="quest-target-dot">●</span> ${fmt(text)}`;
      }
      detail.appendChild(el);
    }

    header.addEventListener('click', () => {
      header.classList.toggle('open');
      detail.classList.toggle('open');
    });
    entry.appendChild(detail);
  }

  return entry;
}

/* ── Quests ── */
function renderQuests(container) {
  if (!quests) { container.innerHTML = '<p class="loading-text">数据加载中…</p>'; return; }
  const lang = getLang();

  // Main story quests
  if (quests.main_story && quests.main_story.length) {
    const heading = document.createElement('h3');
    heading.className = 'quest-section-heading';
    heading.textContent = lang === 'en' ? 'Trailblaze Missions' : '开拓任务';
    container.appendChild(heading);

    for (const vGroup of quests.main_story) {
      const section = document.createElement('div');
      section.className = 'achievement-version-section';

      // Count total quests in this version
      const total = vGroup.chapters.reduce((s, c) => s + c.quests.length, 0);

      const verHeader = document.createElement('div');
      verHeader.className = 'version-header';
      verHeader.innerHTML = `
        <span class="accordion-arrow"></span>
        <span>${escapeHTML(vGroup.version)}</span>
        <span class="version-count">${total}</span>
      `;

      const body = document.createElement('div');
      body.className = 'version-body';

      for (const chapter of vGroup.chapters) {
        const chTitle = document.createElement('div');
        chTitle.className = 'quest-chapter-title';
        const chName = lang === 'en' ? chapter.chapter_en : chapter.chapter_ch;
        chTitle.textContent = chName || chapter.chapter_ch;
        body.appendChild(chTitle);

        for (const q of chapter.quests) {
          body.appendChild(createQuestEntry(q, lang));
        }
      }

      verHeader.addEventListener('click', () => {
        verHeader.classList.toggle('open');
        body.classList.toggle('open');
      });

      section.appendChild(verHeader);
      section.appendChild(body);
      container.appendChild(section);
    }
  }

  // Adventure quests
  if (quests.adventure && quests.adventure.length) {
    const heading = document.createElement('h3');
    heading.className = 'quest-section-heading';
    heading.textContent = lang === 'en' ? 'Adventure Missions' : '冒险任务';
    container.appendChild(heading);

    for (const verGroup of quests.adventure) {
      const section = document.createElement('div');
      section.className = 'achievement-version-section';

      const vHeader = document.createElement('div');
      vHeader.className = 'version-header';
      vHeader.innerHTML = `
        <span class="accordion-arrow"></span>
        <span>${verGroup.version}</span>
        <span class="version-count">${verGroup.quests.length}</span>
      `;

      const vBody = document.createElement('div');
      vBody.className = 'version-body';

      vHeader.addEventListener('click', () => {
        vHeader.classList.toggle('open');
        vBody.classList.toggle('open');
      });

      for (const q of verGroup.quests) {
        vBody.appendChild(createQuestEntry(q, lang));
      }

      section.appendChild(vHeader);
      section.appendChild(vBody);
      container.appendChild(section);
    }
  }
}

/* ── Achievements ── */
function renderAchievements(container) {
  if (!achievements) { container.innerHTML = '<p class="loading-text">数据加载中…</p>'; return; }
  const lang = getLang();

  achievements.forEach((group, idx) => {
    const section = document.createElement('div');
    section.className = 'achievement-version-section';
    section.style.setProperty('--index', idx);

    const verHeader = document.createElement('div');
    verHeader.className = 'version-header';
    verHeader.innerHTML = `
      <span class="accordion-arrow"></span>
      <span>${escapeHTML(group.version)}</span>
      <span class="version-count">${group.achievements.length}</span>
    `;

    const body = document.createElement('div');
    body.className = 'version-body';

    for (const a of group.achievements) {
      const name = lang === 'en' ? a.name_en : a.name_ch;
      const nameOther = lang === 'en' ? a.name_ch : a.name_en;
      const desc = lang === 'en' ? a.desc_en : a.desc_ch;
      const descOther = lang === 'en' ? a.desc_ch : a.desc_en;
      const hint = lang === 'en' ? a.hint_en : a.hint_ch;

      const item = document.createElement('div');
      item.className = 'achievement-entry';
      item.innerHTML = `
        <div class="achievement-name">${escapeHTML(name)}</div>
        ${nameOther ? `<div class="achievement-name-other">${escapeHTML(nameOther)}</div>` : ''}
        <div class="achievement-desc">${fmt(desc)}</div>
        ${descOther ? `<div class="achievement-desc-other">${fmt(descOther)}</div>` : ''}
        ${hint ? `<div class="achievement-hint">${fmt(hint)}</div>` : ''}
      `;
      body.appendChild(item);
    }

    verHeader.addEventListener('click', () => {
      verHeader.classList.toggle('open');
      body.classList.toggle('open');
    });

    section.appendChild(verHeader);
    section.appendChild(body);
    container.appendChild(section);
  });
}

/* ── Items ── */
function renderItems(container) {
  if (!items) { container.innerHTML = '<p class="loading-text">数据加载中…</p>'; return; }
  const lang = getLang();

  // Collect all versions present
  const allVersions = [...new Set(items.map(i => i.version))].sort();

  // Build category map
  const groups = new Map();
  for (const item of items) {
    const key = item.category_ch;
    if (!groups.has(key)) groups.set(key, { label_ch: item.category_ch, label_en: item.category_en, items: [] });
    groups.get(key).items.push(item);
  }

  const cats = Array.from(groups.values());
  let activeCat = cats[0]?.label_ch ?? '';
  let activeVer = null; // null = all versions

  // Category bar
  const catBar = document.createElement('div');
  catBar.className = 'item-cat-bar';
  cats.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'item-cat-btn' + (cat.label_ch === activeCat ? ' active' : '');
    btn.textContent = lang === 'en' ? (cat.label_en || cat.label_ch) : cat.label_ch;
    btn.dataset.cat = cat.label_ch;
    catBar.appendChild(btn);
  });
  container.appendChild(catBar);

  // Version bar
  const verBar = document.createElement('div');
  verBar.className = 'item-ver-bar';
  const allBtn = document.createElement('button');
  allBtn.className = 'item-ver-btn active';
  allBtn.textContent = lang === 'en' ? 'All' : '全部';
  allBtn.dataset.ver = '';
  verBar.appendChild(allBtn);
  allVersions.forEach(ver => {
    const btn = document.createElement('button');
    btn.className = 'item-ver-btn';
    btn.textContent = ver.replace('v', '');
    btn.dataset.ver = ver;
    verBar.appendChild(btn);
  });
  container.appendChild(verBar);

  // Content area
  const content = document.createElement('div');
  content.className = 'item-cat-content';
  container.appendChild(content);

  function renderContent() {
    // Fade out → swap → fade in
    content.classList.remove('is-fading');
    void content.offsetWidth; // reflow to restart animation
    content.classList.add('is-fading');
    content.innerHTML = '';

    const group = groups.get(activeCat);
    if (!group) return;

    const filtered = activeVer ? group.items.filter(i => i.version === activeVer) : group.items;
    if (!filtered.length) {
      content.innerHTML = '<p class="loading-text">该版本暂无此类物品</p>';
      return;
    }

    const list = document.createElement('div');
    list.className = 'items-list';

    filtered.forEach((item, idx) => {
      const name = lang === 'en' ? (item.name_en || item.name_ch) : item.name_ch;
      const nameOther = lang === 'en' ? item.name_ch : item.name_en;
      const effect = lang === 'en' ? (item.effect_en || item.effect_ch) : item.effect_ch;
      const lore = lang === 'en' ? (item.lore_en || item.lore_ch) : item.lore_ch;
      const dialogue = lang === 'en' ? item.dialogue_en : item.dialogue_ch;
      if (!name) return;

      const dialogueHtml = (dialogue && dialogue.length)
        ? `<div class="item-dialogue">${dialogue.map(l => `<p class="item-dialogue-line">「${escapeHTML(l)}」</p>`).join('')}</div>`
        : '';

      const iconHtml = item.icon
        ? `<img class="item-icon" src="${escapeHTML(item.icon)}" alt="${escapeHTML(name)}" onerror="this.style.display='none'">`
        : `<div class="item-icon-placeholder"></div>`;

      const entry = document.createElement('div');
      entry.className = 'item-card';
      entry.style.setProperty('--index', idx);
      entry.innerHTML = `
        <div class="item-header">
          ${iconHtml}
          <div class="item-name-block">
            <span class="item-name">${escapeHTML(name)}</span>
            ${nameOther ? `<span class="item-name-other">${escapeHTML(nameOther)}</span>` : ''}
          </div>
        </div>
        ${effect ? `<div class="item-effect">${fmt(effect)}</div>` : ''}
        ${lore ? `<div class="item-lore">${fmt(lore)}</div>` : ''}
        ${dialogueHtml}
      `;
      list.appendChild(entry);
    });
    content.appendChild(list);
  }

  catBar.addEventListener('click', e => {
    const btn = e.target.closest('.item-cat-btn');
    if (!btn) return;
    activeCat = btn.dataset.cat;
    catBar.querySelectorAll('.item-cat-btn').forEach(b => b.classList.toggle('active', b.dataset.cat === activeCat));
    renderContent();
  });

  verBar.addEventListener('click', e => {
    const btn = e.target.closest('.item-ver-btn');
    if (!btn) return;
    activeVer = btn.dataset.ver || null;
    verBar.querySelectorAll('.item-ver-btn').forEach(b => b.classList.toggle('active', b.dataset.ver === (btn.dataset.ver)));
    renderContent();
  });

  renderContent();
}

/* ── Characters ── */
function renderCharacters(container) {
  if (!charactersMydei) { container.innerHTML = '<p class="loading-text">数据加载中…</p>'; return; }
  const lang = getLang();
  const c = charactersMydei;

  // Character header with profile info
  const header = document.createElement('div');
  header.className = 'char-header';
  const name = lang === 'en' ? c.name_en : c.name_ch;
  const nameOther = lang === 'en' ? c.name_ch : c.name_en;
  const title = lang === 'en' ? c.title_en : c.title_ch;
  const path = lang === 'en' ? c.path_en : c.path;
  const element = lang === 'en' ? c.element_en : c.element;
  header.innerHTML = `
    <h2 class="character-name">${escapeHTML(name)} <span class="character-name-en">${escapeHTML(nameOther)}</span></h2>
    <div class="char-meta">${escapeHTML(title)} · ${escapeHTML(path)} · ${escapeHTML(element)}</div>
  `;
  container.appendChild(header);

  // Render epigraph if present (above all sections)
  const epigraphSection = c.sections.find(s => s.key === 'epigraph');
  if (epigraphSection) {
    const entry = epigraphSection.entries?.[0];
    const text = entry ? (lang === 'en' ? entry.en : entry.ch) : '';
    if (text) {
      const epigraph = document.createElement('div');
      epigraph.className = 'char-epigraph';
      epigraph.innerHTML = `<div class="char-epigraph-text">${fmt(text)}</div>`;
      container.appendChild(epigraph);
    }
  }

  // Render each section (appendix-only and epigraph rendered separately)
  const appendixOnly = ['inscriptions', 'misc', 'mydeimos_boss', 'epigraph'];
  for (const section of c.sections.filter(s => !appendixOnly.includes(s.key))) {
    const label = lang === 'en' ? section.label_en : section.label_ch;
    const labelOther = lang === 'en' ? section.label_ch : section.label_en;
    const skillName = lang === 'en' ? (section.name_en || '') : (section.name_ch || '');
    const skillNameOther = lang === 'en' ? (section.name_ch || '') : (section.name_en || '');

    // Sections with a named skill render as a card (icon+name in body, not header)
    const isSkillCard = !section.ranks && !!(section.img && (section.name_ch || section.name_en));

    const sec = document.createElement('div');
    sec.className = 'char-section';

    const itemCount = (section.entries || section.ranks || []).length;
    const iconHTML = section.img
      ? `<img class="skill-section-icon" src="${escapeHTML(section.img)}" alt="${escapeHTML(label)}" onerror="this.style.display='none'">`
      : '';

    const secHeader = document.createElement('div');
    secHeader.className = 'char-section-header';
    if (isSkillCard) {
      // Header shows only the type label (icon + name move into the card)
      secHeader.innerHTML = `
        <span class="accordion-arrow"></span>
        <span class="char-section-label">${escapeHTML(label)}</span>
        <span class="char-section-label-other">${escapeHTML(labelOther)}</span>
      `;
    } else {
      const headerAlt = skillNameOther || labelOther;
      secHeader.innerHTML = `
        <span class="accordion-arrow"></span>
        ${iconHTML}
        <span class="char-section-label">${escapeHTML(label)}</span>
        ${skillName ? `<span class="char-section-skill-name">${escapeHTML(skillName)}</span>` : ''}
        <span class="char-section-label-other">${escapeHTML(headerAlt)}</span>
        <span class="char-section-count">${itemCount}</span>
      `;
    }

    const secBody = document.createElement('div');
    secBody.className = 'char-section-body';

    // ranks: eidolon/trace card grid
    if (section.ranks) {
      const grid = document.createElement('div');
      grid.className = 'eidolon-grid';
      for (const rank of section.ranks) {
        const rankLabel = lang === 'en' ? rank.label_en : rank.label_ch;
        const rankLabelOther = lang === 'en' ? (rank.label_ch || '') : (rank.label_en || '');
        const card = document.createElement('div');
        card.className = 'eidolon-card';
        const rankDesc = lang === 'en' ? (rank.desc_en || '') : (rank.desc_ch || '');
        card.innerHTML = `
          <img class="eidolon-img" src="${escapeHTML(rank.img)}" alt="${escapeHTML(rankLabel)}" onerror="this.style.display='none'">
          <div>
            <span class="eidolon-label">${escapeHTML(rankLabel)}</span>
            ${rankLabelOther ? `<span class="eidolon-label-other">${escapeHTML(rankLabelOther)}</span>` : ''}
            ${rankDesc ? `<p class="eidolon-desc">${fmt(rankDesc)}</p>` : ''}
          </div>
        `;
        grid.appendChild(card);
      }
      secBody.appendChild(grid);
    } else if (isSkillCard) {
      // Named skill section: single card with icon + name + all entry texts
      const grid = document.createElement('div');
      grid.className = 'eidolon-grid';
      const card = document.createElement('div');
      card.className = 'eidolon-card';
      const descParts = (section.entries || [])
        .map(e => fmt(lang === 'en' ? e.en : e.ch))
        .filter(Boolean);
      card.innerHTML = `
        <img class="eidolon-img" src="${escapeHTML(section.img)}" alt="${escapeHTML(skillName)}" onerror="this.style.display='none'">
        <div>
          <span class="eidolon-label">${escapeHTML(skillName)}</span>
          ${skillNameOther ? `<span class="eidolon-label-other">${escapeHTML(skillNameOther)}</span>` : ''}
          ${descParts.map(p => `<p class="eidolon-desc">${p}</p>`).join('')}
        </div>
      `;
      grid.appendChild(card);
      secBody.appendChild(grid);
    } else if (section.key === 'story') {
      // Story entries: card per entry, Chinese only
      const grid = document.createElement('div');
      grid.className = 'eidolon-grid';
      for (const entry of (section.entries || [])) {
        const text = entry.ch;
        if (!text) continue;
        const card = document.createElement('div');
        card.className = 'eidolon-card story-card';
        card.innerHTML = `
          <div>
            <span class="eidolon-label">${escapeHTML(entry.title_ch || '')}</span>
            <div class="story-text">${fmt(text.replace(/\n/g, '<br>'))}</div>
          </div>
        `;
        grid.appendChild(card);
      }
      secBody.appendChild(grid);
    } else {
      // Default: plain lore entries (inscriptions, etc.)
      for (const entry of (section.entries || [])) {
        const primary = lang === 'en' ? entry.en : entry.ch;
        const secondary = lang === 'en' ? entry.ch : entry.en;
        if (!primary) continue;

        const entryTitle = lang === 'en' ? entry.title_en : entry.title_ch;
        const item = document.createElement('div');
        item.className = 'lore-entry';
        item.innerHTML = `
          ${entryTitle ? `<h4 class="lore-entry-title">${escapeHTML(entryTitle)}</h4>` : ''}
          <div class="lore-entry-text">${fmt(primary)}</div>
          ${secondary ? `<div class="lore-entry-text-other">${fmt(secondary)}</div>` : ''}
        `;
        secBody.appendChild(item);
      }
    }

    // Skill/trace/eidolon/story sections: always visible, no collapse toggle
    const alwaysOpen = ['talent', 'basic', 'skill', 'ultimate', 'technique', 'traces', 'eidolons', 'story'].includes(section.key);
    if (alwaysOpen) {
      secHeader.classList.add('open', 'always-open');
      secBody.classList.add('open');
    } else {
      const autoOpen = ['story', 'inscriptions'].includes(section.key);
      if (autoOpen) {
        secHeader.classList.add('open');
        secBody.classList.add('open');
      }
      secHeader.addEventListener('click', () => {
        secHeader.classList.toggle('open');
        secBody.classList.toggle('open');
      });
    }

    sec.appendChild(secHeader);
    sec.appendChild(secBody);
    container.appendChild(sec);
  }
}

/* ── Light Cones ── */
function renderLightcones(container) {
  if (!lightcones) { container.innerHTML = '<p class="loading-text">数据加载中…</p>'; return; }
  if (lcDetailId) {
    const lc = lightcones.find(l => l.id === lcDetailId);
    if (lc) { renderLcDetail(container, lc); return; }
    lcDetailId = null;
  }
  renderLcGallery(container);
}

function renderLcGallery(container) {
  const lang = getLang();
  const grid = document.createElement('div');
  grid.className = 'lc-gallery';

  for (const lc of lightcones) {
    const name = lang === 'en' ? lc.name_en : lc.name_ch;
    const stars = '★'.repeat(lc.rarity || 5);
    const pathLabel = lang === 'en' ? lc.path_en : lc.path_ch;

    const card = document.createElement('button');
    card.className = 'lc-gallery-card';
    card.type = 'button';

    const imgWrap = document.createElement('div');
    imgWrap.className = 'lc-gallery-img-wrap';
    if (lc.img) {
      const img = document.createElement('img');
      img.className = 'lc-gallery-img';
      img.src = lc.img;
      img.alt = name;
      if (lc.gallery_position) img.style.objectPosition = lc.gallery_position;
      img.onerror = () => { imgWrap.classList.add('lc-img-missing'); };
      imgWrap.appendChild(img);
    } else {
      imgWrap.classList.add('lc-img-missing');
    }

    const label = document.createElement('div');
    label.className = 'lc-gallery-label';
    label.innerHTML = `
      <span class="lc-gallery-stars">${stars}</span>
      <span class="lc-gallery-name">${escapeHTML(name)}</span>
      <span class="lc-gallery-path">${escapeHTML(pathLabel)}</span>
    `;

    card.appendChild(imgWrap);
    card.appendChild(label);
    card.addEventListener('click', () => {
      lcDetailId = lc.id;
      render();
    });
    grid.appendChild(card);
  }
  container.appendChild(grid);
}

function renderLcDetail(container, lc) {
  const lang = getLang();
  const name  = lang === 'en' ? lc.name_en  : lc.name_ch;
  const nameOther = lang === 'en' ? lc.name_ch : lc.name_en;
  const skillName = lang === 'en' ? lc.skill_name_en : lc.skill_name_ch;
  const template  = lang === 'en' ? lc.skill_template_en : lc.skill_template_ch;
  const story     = lang === 'en' ? lc.story_en : lc.story_ch;
  const storyOther= lang === 'en' ? lc.story_ch : lc.story_en;

  /* Back button */
  const backBtn = document.createElement('button');
  backBtn.className = 'lc-back-btn';
  backBtn.innerHTML = `← ${lang === 'en' ? 'All Light Cones' : '全部光锥'}`;
  backBtn.addEventListener('click', () => { lcDetailId = null; render(); });
  container.appendChild(backBtn);

  const card = document.createElement('div');
  card.className = 'lc-card';

  /* ── Image ── */
  const imgWrap = document.createElement('div');
  imgWrap.className = 'lc-img-wrap';
  if (lc.img) {
    const img = document.createElement('img');
    img.className = 'lc-img';
    img.src = lc.img;
    img.alt = name;
    img.onerror = () => { imgWrap.classList.add('lc-img-missing'); };
    imgWrap.appendChild(img);
  } else {
    imgWrap.classList.add('lc-img-missing');
  }

  /* ── Body ── */
  const body = document.createElement('div');
  body.className = 'lc-body';

  /* Name */
  const nameEl = document.createElement('div');
  nameEl.className = 'lc-name-block';
  nameEl.innerHTML = `
    <h2 class="lc-name">${escapeHTML(name)}</h2>
    <span class="lc-name-other">${escapeHTML(nameOther)}</span>
  `;
  body.appendChild(nameEl);

  /* Meta: path + rarity */
  const meta = document.createElement('div');
  meta.className = 'lc-meta';
  const stars = '★'.repeat(lc.rarity || 5);
  const pathLabel = lang === 'en' ? lc.path_en : lc.path_ch;
  meta.innerHTML = `<span class="lc-path">${escapeHTML(pathLabel)}</span><span class="lc-stars">${stars}</span>`;
  body.appendChild(meta);

  /* ── Skill section ── */
  const skillSec = document.createElement('div');
  skillSec.className = 'lc-skill';

  const skillHeader = document.createElement('div');
  skillHeader.className = 'lc-skill-header';
  skillHeader.innerHTML = `<span class="lc-skill-name">${escapeHTML(skillName)}</span>`;

  /* Superimposition selector S1–S5 */
  const sSelector = document.createElement('div');
  sSelector.className = 'lc-superimpose';
  let activeS = 0;
  for (let i = 0; i < 5; i++) {
    const btn = document.createElement('button');
    btn.className = 'lc-s-btn' + (i === 0 ? ' active' : '');
    btn.textContent = `S${i + 1}`;
    btn.dataset.s = i;
    sSelector.appendChild(btn);
  }
  skillHeader.appendChild(sSelector);
  skillSec.appendChild(skillHeader);

  const skillDesc = document.createElement('div');
  skillDesc.className = 'lc-skill-desc';
  skillDesc.innerHTML = fmtLC(template, lc.skill_params[0]);
  skillSec.appendChild(skillDesc);

  sSelector.addEventListener('click', e => {
    const btn = e.target.closest('.lc-s-btn');
    if (!btn) return;
    activeS = +btn.dataset.s;
    sSelector.querySelectorAll('.lc-s-btn').forEach(b => b.classList.toggle('active', +b.dataset.s === activeS));
    skillDesc.innerHTML = fmtLC(template, lc.skill_params[activeS]);
  });
  body.appendChild(skillSec);

  /* ── Story section (collapsible) ── */
  const storySec = document.createElement('div');
  storySec.className = 'lc-story-sec';

  const storyHeader = document.createElement('div');
  storyHeader.className = 'char-section-header';
  storyHeader.innerHTML = `<span class="accordion-arrow"></span><span class="char-section-label">${lang === 'en' ? 'Story' : '故事'}</span>`;

  const storyBody = document.createElement('div');
  storyBody.className = 'char-section-body';
  const storyText = document.createElement('div');
  storyText.className = 'lore-entry-text lc-story-text';
  storyText.innerHTML = fmt(story);
  storyBody.appendChild(storyText);
  if (storyOther) {
    const storyOtherEl = document.createElement('div');
    storyOtherEl.className = 'lore-entry-text-other';
    storyOtherEl.innerHTML = fmt(storyOther);
    storyBody.appendChild(storyOtherEl);
  }

  storyHeader.addEventListener('click', () => {
    storyHeader.classList.toggle('open');
    storyBody.classList.toggle('open');
  });

  storySec.appendChild(storyHeader);
  storySec.appendChild(storyBody);
  body.appendChild(storySec);

  card.appendChild(imgWrap);
  card.appendChild(body);
  container.appendChild(card);
}

/* ── Appendix ── */
function renderAppendix(container) {
  if (!charactersMydei) { container.innerHTML = '<p class="loading-text">数据加载中…</p>'; return; }
  const lang = getLang();
  const appendixKeys = ['inscriptions', 'mydeimos_boss', 'misc'];
  const sections = charactersMydei.sections.filter(s => appendixKeys.includes(s.key));

  if (!sections.length) { container.innerHTML = '<p class="loading-text">暂无内容</p>'; return; }

  for (const section of sections) {
    const label = lang === 'en' ? section.label_en : section.label_ch;
    const labelOther = lang === 'en' ? section.label_ch : section.label_en;

    const sec = document.createElement('div');
    sec.className = 'char-section';

    const secHeader = document.createElement('div');
    secHeader.className = 'char-section-header open';
    secHeader.innerHTML = `
      <span class="accordion-arrow"></span>
      <span class="char-section-label">${escapeHTML(label)}</span>
      <span class="char-section-label-other">${escapeHTML(labelOther)}</span>
      <span class="char-section-count">${(section.entries || []).length}</span>
    `;

    const secBody = document.createElement('div');
    secBody.className = 'char-section-body open';

    for (const entry of (section.entries || [])) {
      const primary = lang === 'en' ? entry.en : entry.ch;
      const secondary = lang === 'en' ? entry.ch : entry.en;
      if (!primary) continue;

      const item = document.createElement('div');
      item.className = 'lore-entry';
      item.innerHTML = `
        <div class="lore-entry-text">${fmt(primary)}</div>
        ${secondary ? `<div class="lore-entry-text-other">${fmt(secondary)}</div>` : ''}
      `;
      secBody.appendChild(item);
    }

    secHeader.addEventListener('click', () => {
      secHeader.classList.toggle('open');
      secBody.classList.toggle('open');
    });

    sec.appendChild(secHeader);
    sec.appendChild(secBody);
    container.appendChild(sec);
  }
}

/* ── Init ── */
async function init() {
  setupTabs();

  // Load all data in parallel
  const [r, q, a, it, cm, lc] = await Promise.allSettled([
    fetchJSON('data/lore/readables.json'),
    fetchJSON('data/lore/quests.json'),
    fetchJSON('data/lore/achievements.json'),
    fetchJSON('data/lore/items.json'),
    fetchJSON('data/lore/characters-mydei.json'),
    fetchJSON('data/lore/lightcones.json'),
  ]);

  readables = r.status === 'fulfilled' ? r.value : null;
  if (q.status === 'fulfilled') quests = q.value;
  if (a.status === 'fulfilled') achievements = a.value;
  if (it.status === 'fulfilled') items = it.value;
  if (cm.status === 'fulfilled') charactersMydei = cm.value;
  if (lc.status === 'fulfilled') lightcones = lc.value;

  render();
  window.addEventListener('langchange', render);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
