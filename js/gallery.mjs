/**
 * gallery.mjs - Gallery page controller
 * Loads gallery.json, renders image grid with lazy loading, and provides lightbox viewer.
 */

import { getLang, t } from './i18n.mjs?v=3';
import { fetchJSON } from './app.mjs?v=5';

let images = [];
let lightboxIndex = 0;
let lightboxTrigger = null;  // element that opened the lightbox, restored on close

async function init() {
  try {
    images = await fetchJSON('data/gallery.json');
  } catch (e) {
    document.getElementById('gallery-grid').innerHTML =
      '<p class="loading-text">Gallery data not available.</p>';
    return;
  }

  renderGrid();
  initLightbox();

  window.addEventListener('langchange', () => {
    renderGrid();
    updateLightboxCaption();
  });
}

function renderGrid() {
  const grid = document.getElementById('gallery-grid');
  const lang = getLang();
  grid.innerHTML = '';

  if (images.length === 0) {
    grid.innerHTML = '<p class="loading-text">No images yet.</p>';
    return;
  }

  images.forEach((img, idx) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'gallery-item' + (img.tags?.includes('lightcone') ? ' gallery-item--lightcone' : '');
    item.setAttribute('aria-label', (lang === 'en' ? img.title_en : img.title_ch) || img.title_en || '');

    const imgEl = document.createElement('img');
    imgEl.className = 'gallery-thumb';
    imgEl.loading = 'lazy';
    imgEl.src = img.thumb || img.src;
    imgEl.alt = ''; // decorative — button aria-label provides the accessible name

    item.addEventListener('click', () => openLightbox(idx));
    item.appendChild(imgEl);
    grid.appendChild(item);
  });
}

function initLightbox() {
  const lightbox = document.getElementById('lightbox');
  const closeBtn = document.getElementById('lightbox-close');
  const prevBtn = document.getElementById('lightbox-prev');
  const nextBtn = document.getElementById('lightbox-next');

  closeBtn.addEventListener('click', closeLightbox);
  prevBtn.addEventListener('click', () => navigateLightbox(-1));
  nextBtn.addEventListener('click', () => navigateLightbox(1));

  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) closeLightbox();
  });

  document.addEventListener('keydown', (e) => {
    if (lightbox.hidden) return;
    if (e.key === 'Escape') { closeLightbox(); return; }
    if (e.key === 'ArrowLeft') { navigateLightbox(-1); return; }
    if (e.key === 'ArrowRight') { navigateLightbox(1); return; }
    if (e.key === 'Tab') {
      const focusable = [...lightbox.querySelectorAll('button:not([hidden])')].filter(
        el => el.style.display !== 'none'
      );
      if (focusable.length === 0) { e.preventDefault(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });
}

function openLightbox(idx) {
  lightboxIndex = idx;
  lightboxTrigger = document.activeElement;
  const lightbox = document.getElementById('lightbox');
  lightbox.hidden = false;
  document.body.style.overflow = 'hidden';
  updateLightboxContent();
  document.getElementById('lightbox-close').focus();
}

function closeLightbox() {
  document.getElementById('lightbox').hidden = true;
  document.body.style.overflow = '';
  if (lightboxTrigger) {
    lightboxTrigger.focus();
    lightboxTrigger = null;
  }
}

function navigateLightbox(dir) {
  lightboxIndex = (lightboxIndex + dir + images.length) % images.length;
  updateLightboxContent();
}

function updateLightboxContent() {
  const img = images[lightboxIndex];
  const imgEl = document.getElementById('lightbox-img');
  imgEl.src = img.src;
  imgEl.alt = (getLang() === 'en' ? img.title_en : img.title_ch) || img.title_en || '';
  updateLightboxCaption();

  // Hide nav buttons if only one image
  document.getElementById('lightbox-prev').style.display = images.length > 1 ? '' : 'none';
  document.getElementById('lightbox-next').style.display = images.length > 1 ? '' : 'none';
}

function updateLightboxCaption() {
  const img = images[lightboxIndex];
  const caption = document.getElementById('lightbox-caption');
  const lang = getLang();
  caption.textContent = (lang === 'en' ? img.title_en : img.title_ch) || img.title_en || '';
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
