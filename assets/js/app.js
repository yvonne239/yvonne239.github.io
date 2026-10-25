// App shell: hash router, sidebar, theme, and the render loop.

import { store } from './store.js';
import { esc } from './format.js';
import { detectAnomalies, openAlerts } from './anomalies.js';
import { ICONS } from './ui.js';

import dashboard from './views/dashboard.js';
import transactions from './views/transactions.js';
import budget from './views/budget.js';
import calendar from './views/calendar.js';
import goals from './views/goals.js';
import retirement from './views/retirement.js';
import scenarios from './views/scenarios.js';
import safety from './views/safety.js';

const VIEWS = {
  dashboard:    { icon: 'dashboard',    nav: 'Dashboard',     view: dashboard },
  transactions: { icon: 'transactions', nav: 'Transactions',  view: transactions },
  budget:       { icon: 'budget',       nav: 'Budget',        view: budget },
  calendar:     { icon: 'calendar',     nav: 'Cash-flow',     view: calendar },
  goals:        { icon: 'goals',        nav: 'Goals',         view: goals },
  retirement:   { icon: 'retirement',   nav: 'Retirement',    view: retirement },
  scenarios:    { icon: 'scenarios',    nav: 'What if…',      view: scenarios },
  safety:       { icon: 'safety',       nav: 'Safety',        view: safety },
};

const THEME_KEY = 'runway.theme';

/* ------------------------------------------------------------ routing --- */

const routeFromHash = () => {
  const id = (location.hash || '').replace(/^#\/?/, '').split('?')[0];
  return VIEWS[id] ? id : 'dashboard';
};

let currentRoute = routeFromHash();

/* ------------------------------------------------------------- render --- */

const main = document.getElementById('view');
const nav = document.getElementById('nav');

function renderNav() {
  const alerts = openAlerts(detectAnomalies(store.state)).filter((a) => a.status === 'none').length;
  nav.innerHTML = Object.entries(VIEWS).map(([id, v]) => `
    <a class="nav-link" href="#/${id}" ${id === currentRoute ? 'aria-current="page"' : ''}>
      ${ICONS[v.icon]}<span>${esc(v.nav)}</span>
      ${id === 'safety' && alerts ? `<span class="nav-count" aria-label="${alerts} alerts need review">${alerts}</span>` : ''}
    </a>`).join('');
}

function render() {
  const entry = VIEWS[currentRoute];
  const view = entry.view;

  // Remember where focus was, so an in-place update doesn't drop the caret.
  const active = document.activeElement;
  const focusKey = active?.dataset?.focusKey;
  const caret = (active && 'selectionStart' in active) ? active.selectionStart : null;

  renderNav();

  const header = document.createElement('header');
  header.innerHTML = `<h1>${esc(view.title)}</h1>${view.subtitle ? `<p>${esc(view.subtitle)}</p>` : ''}`;

  // A fresh container each time, so listeners bound by the previous view are
  // garbage along with its nodes — no accumulating handlers.
  const container = document.createElement('div');
  main.replaceChildren(header, container);
  view.render(container);
  document.title = `${view.title} · Runway`;

  if (focusKey) {
    const next = container.querySelector(`[data-focus-key="${CSS.escape(focusKey)}"]`);
    if (next) {
      next.focus({ preventScroll: true });
      if (caret !== null && 'setSelectionRange' in next) {
        try { next.setSelectionRange(caret, caret); } catch { /* unsupported input type */ }
      }
    }
  }
}

/* -------------------------------------------------------------- theme --- */

function applyTheme(mode) {
  if (mode === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', mode);
  try { localStorage.setItem(THEME_KEY, mode); } catch { /* storage blocked */ }
  const btn = document.getElementById('theme-btn');
  if (btn) {
    const label = { system: 'Match my device', light: 'Light', dark: 'Dark' }[mode];
    btn.textContent = `Theme: ${label}`;
    btn.setAttribute('aria-label', `Theme: ${label}. Click to change.`);
  }
}

function initTheme() {
  let mode = 'system';
  try { mode = localStorage.getItem(THEME_KEY) || 'system'; } catch { /* storage blocked */ }
  applyTheme(mode);
  document.getElementById('theme-btn')?.addEventListener('click', () => {
    const order = ['system', 'light', 'dark'];
    const now = document.documentElement.getAttribute('data-theme') || 'system';
    applyTheme(order[(order.indexOf(now) + 1) % order.length]);
  });
}

/* --------------------------------------------------------------- boot --- */

window.addEventListener('hashchange', () => {
  const next = routeFromHash();
  if (next === currentRoute) return;
  currentRoute = next;
  render();
  main.scrollIntoView({ block: 'start' });
  window.scrollTo({ top: 0 });
});

document.getElementById('reset-btn')?.addEventListener('click', () => {
  if (confirm('Put the demo back to its starting data? Anything you have changed here will be lost.')) {
    store.reset();
  }
});

store.subscribe(render);
initTheme();
render();
