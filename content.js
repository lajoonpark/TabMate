/**
 * TabMate content script
 *
 * Renders helper pop-ups and the "save tab" fly animation directly on the page.
 * Injected by the manifest into all http/https pages.
 *
 * Communicates with background.js via chrome.runtime.onMessage.
 *
 * Messages handled:
 *   { type: 'show-popup',         popup: PopupDescriptor }
 *   { type: 'show-save-animation', title, url, faviconUrl, boardName }
 *
 * PopupDescriptor:
 *   { id, text, action?: { label, message }, position }
 */

// ─── State ────────────────────────────────────────────────────────────────────

/** @type {HTMLElement|null} */
let hostEl = null;

/** Currently shown pop-up element, or null */
let currentPopup = null;

/** Timer to auto-dismiss the current popup */
let dismissTimer = null;

/** Map of popup-id → last dismissed timestamp (ms) */
const dismissedAt = new Map();

/** Cooldown in ms — same popup won't reappear sooner than this */
const POPUP_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

// ─── Host element ─────────────────────────────────────────────────────────────

function ensureHost() {
  if (hostEl) return hostEl;
  hostEl = document.createElement('div');
  hostEl.id = 'tabmate-overlay-host';
  document.documentElement.appendChild(hostEl);
  return hostEl;
}

// ─── Helper pop-up ────────────────────────────────────────────────────────────

/**
 * @param {{
 *   id: string,
 *   text: string,
 *   icon?: 'info'|'danger'|'success',
 *   action?: { label: string, message: Object },
 *   position?: 'bottom-left'|'bottom-right'|'top-left'|'top-right',
 *   autoDismissMs?: number
 * }} descriptor
 */
function showPopup(descriptor) {
  const { id, text, icon = 'info', action, position = 'bottom-left', autoDismissMs = 8000 } = descriptor;

  // Cooldown check
  const last = dismissedAt.get(id) ?? 0;
  if (Date.now() - last < POPUP_COOLDOWN_MS) return;

  // Dismiss any existing popup
  if (currentPopup) {
    removePopup(currentPopup, false);
  }

  ensureHost();

  const popup = document.createElement('div');
  popup.className = `tm-popup tm-popup--${position} tm-popup--entering`;
  popup.setAttribute('role', 'alertdialog');
  popup.setAttribute('aria-live', 'polite');
  popup.setAttribute('aria-label', 'TabMate notification');

  const iconSvg = getIconSvg(icon);
  const iconClass = icon === 'danger' ? 'tm-popup__icon--danger' : icon === 'success' ? 'tm-popup__icon--success' : '';

  popup.innerHTML = `
    <div class="tm-popup__body">
      <div class="tm-popup__icon ${iconClass}" aria-hidden="true">${iconSvg}</div>
      <p class="tm-popup__text">${escapeHtml(text)}</p>
    </div>
    <div class="tm-popup__actions">
      ${action ? `<button class="tm-popup__btn tm-popup__btn--primary" type="button">${escapeHtml(action.label)}</button>` : ''}
      <button class="tm-popup__btn tm-popup__btn--secondary tm-popup__btn--dismiss" type="button">Dismiss</button>
    </div>
  `;

  // Wire action button
  if (action) {
    popup.querySelector('.tm-popup__btn--primary').addEventListener('click', () => {
      chrome.runtime.sendMessage(action.message).catch(() => {});
      removePopup(popup, true);
    });
  }

  // Wire dismiss
  popup.querySelector('.tm-popup__btn--dismiss').addEventListener('click', () => {
    removePopup(popup, true);
  });

  document.documentElement.appendChild(popup);
  currentPopup = popup;

  // Auto-dismiss
  if (autoDismissMs > 0) {
    dismissTimer = setTimeout(() => removePopup(popup, true), autoDismissMs);
  }

  // Remove entering class after animation completes
  popup.addEventListener('animationend', () => popup.classList.remove('tm-popup--entering'), { once: true });

  // Mark dismissed-at when it leaves
  popup._popupId = id;
}

function removePopup(popup, recordDismiss = true) {
  if (!popup || !popup.isConnected) return;

  clearTimeout(dismissTimer);
  dismissTimer = null;

  if (recordDismiss && popup._popupId) {
    dismissedAt.set(popup._popupId, Date.now());
  }

  popup.classList.add('tm-popup--leaving');
  popup.addEventListener(
    'animationend',
    () => {
      popup.remove();
      if (currentPopup === popup) currentPopup = null;
    },
    { once: true },
  );

  // Fallback removal if animation didn't fire (e.g. reduced-motion)
  setTimeout(() => {
    if (popup.isConnected) popup.remove();
    if (currentPopup === popup) currentPopup = null;
  }, 300);
}

// ─── Save tab animation ───────────────────────────────────────────────────────

/**
 * @param {{
 *   title: string,
 *   url: string,
 *   faviconUrl?: string,
 *   boardName: string
 * }} data
 */
function showSaveAnimation(data) {
  const { title, faviconUrl, boardName } = data;

  // Choose starting position: bottom-centre of the viewport
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const startX = Math.round(vw / 2 - 100);
  const startY = Math.round(vh * 0.72);

  // Destination: top-right corner
  const destX = vw - 24;
  const destY = 20;

  // Delta for fly animation
  const dx = destX - startX;
  const dy = destY - startY;

  // Create bubble element
  const bubble = document.createElement('div');
  bubble.className = 'tm-save-anim';
  bubble.style.cssText = `left:${startX}px; top:${startY}px;`;

  const faviconHtml = faviconUrl
    ? `<img class="tm-save-bubble__favicon" src="${escapeAttr(faviconUrl)}" alt="" />`
    : '';

  bubble.innerHTML = `
    <div class="tm-save-bubble">
      ${faviconHtml}
      <span class="tm-save-bubble__label">${escapeHtml(title || 'Tab')}</span>
    </div>
  `;

  document.documentElement.appendChild(bubble);

  // Reduced motion: skip fly, just show confirm toast
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    bubble.remove();
    showConfirmToast(`Saved to ${boardName}`);
    return;
  }

  // Set CSS variable for fly destination
  bubble.style.setProperty('--tm-fly-to', `translate(${dx}px, ${dy}px)`);

  // Launch particles from start
  spawnParticles(startX + 100, startY + 16);

  // Start fly animation
  requestAnimationFrame(() => {
    bubble.classList.add('tm-save-anim--flying');
  });

  bubble.addEventListener('animationend', () => {
    bubble.remove();
    showConfirmToast(`Saved to ${boardName}`);
  }, { once: true });

  // Fallback
  setTimeout(() => {
    if (bubble.isConnected) bubble.remove();
    showConfirmToast(`Saved to ${boardName}`);
  }, 900);
}

function showConfirmToast(text) {
  // Remove any existing toast
  document.querySelectorAll('.tm-save-confirm').forEach((el) => el.remove());

  const toast = document.createElement('div');
  toast.className = 'tm-save-confirm tm-save-confirm--in';
  toast.textContent = text;
  document.documentElement.appendChild(toast);

  // Fade out after 2.2 s
  setTimeout(() => {
    toast.classList.remove('tm-save-confirm--in');
    toast.classList.add('tm-save-confirm--out');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
    setTimeout(() => { if (toast.isConnected) toast.remove(); }, 400);
  }, 2200);
}

const PARTICLE_COLOURS = ['#1a4bbf', '#2563eb', '#059669', '#f59e0b', '#ec4899', '#8b5cf6'];

function spawnParticles(cx, cy) {
  const count = 10;
  for (let i = 0; i < count; i++) {
    const particle = document.createElement('div');
    particle.className = 'tm-particle';
    particle.style.left = `${cx}px`;
    particle.style.top  = `${cy}px`;
    particle.style.background = PARTICLE_COLOURS[i % PARTICLE_COLOURS.length];

    const angle = (360 / count) * i + Math.random() * 20 - 10;
    const dist  = 30 + Math.random() * 40;
    const rad   = (angle * Math.PI) / 180;
    const tx    = Math.round(Math.cos(rad) * dist);
    const ty    = Math.round(Math.sin(rad) * dist);
    const dur   = (0.45 + Math.random() * 0.25).toFixed(2);

    particle.style.setProperty('--tm-p-to', `translate(${tx}px, ${ty}px)`);
    particle.style.setProperty('--tm-p-dur', `${dur}s`);

    document.documentElement.appendChild(particle);

    requestAnimationFrame(() => particle.classList.add('tm-particle--anim'));

    particle.addEventListener('animationend', () => particle.remove(), { once: true });
    setTimeout(() => { if (particle.isConnected) particle.remove(); }, 1000);
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  return String(str ?? '').replace(/"/g, '%22').replace(/'/g, '%27');
}

function getIconSvg(type) {
  if (type === 'danger') {
    return `<svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>`;
  }
  if (type === 'success') {
    return `<svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>`;
  }
  // info
  return `<svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/></svg>`;
}

// ─── Message listener ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message) => {
  if (!message || typeof message !== 'object') return;

  if (message.type === 'show-popup') {
    showPopup(message.popup);
  } else if (message.type === 'show-save-animation') {
    showSaveAnimation({
      title: message.title,
      url: message.url,
      faviconUrl: message.faviconUrl,
      boardName: message.boardName,
    });
  }
});
