// Small presentational helpers shared by every view.

import { money, esc, clamp } from './format.js';

/* ----------------------------------------------------------------- icons --- */

const I = (d, extra = '') =>
  `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;

export const ICONS = {
  dashboard:   I('<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>'),
  transactions:I('<path d="M4 7h13l-3-3"/><path d="M20 17H7l3 3"/>'),
  budget:      I('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  calendar:    I('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  goals:       I('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.4"/><path d="M12 4V2M12 22v-2M4 12H2M22 12h-2"/>'),
  retirement:  I('<path d="M3 20h18"/><path d="M6 20v-6M11 20V9M16 20v-9M21 20V5"/>'),
  scenarios:   I('<path d="M4 18 L9 11 L13 14 L20 5"/><path d="M15 5h5v5"/>'),
  safety:      I('<path d="M12 3l7 3v6c0 4.3-2.9 7.9-7 9-4.1-1.1-7-4.7-7-9V6z"/><path d="M12 9v4M12 16h.01"/>'),
  alert:       I('<path d="M12 3l9.5 17H2.5z"/><path d="M12 9v5M12 17h.01"/>'),
  check:       I('<path d="M4 12.5 9 17.5 20 6.5"/>'),
  info:        I('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
  upload:      I('<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>'),
  plus:        I('<path d="M12 5v14M5 12h14"/>'),
  search:      I('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>'),
  shield:      I('<path d="M12 3l7 3v6c0 4.3-2.9 7.9-7 9-4.1-1.1-7-4.7-7-9V6z"/>'),
  wallet:      I('<rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10h18M16.5 14.5h.01"/>'),
  trend:       I('<path d="M3 17 9 11l4 4 8-8"/><path d="M16 7h5v5"/>'),
};

export const sevIcon = (sev) => ({
  critical: ICONS.alert, serious: ICONS.alert, warning: ICONS.info, good: ICONS.check,
}[sev] || ICONS.info);

/* ----------------------------------------------------------------- parts --- */

export function tile({ label, value, delta, deltaTone, spark, note }) {
  return `<div class="card tile">
    <div class="tile-label">${esc(label)}</div>
    <div class="tile-value num">${value}</div>
    ${delta ? `<div class="tile-delta ${deltaTone || ''}">${delta}</div>` : ''}
    ${note ? `<div class="tile-delta muted">${note}</div>` : ''}
    ${spark || ''}
  </div>`;
}

/**
 * A meter. The fill carries severity; the track is a lighter step of the same
 * ramp, so the state reads across the whole bar.
 */
export function meter(value, total, { over = 'critical', labels, severity = true, tone: forced } = {}) {
  const ratio = total > 0 ? value / total : 0;
  // `severity: false` for meters where a full bar is the good outcome
  // (goal progress, income coverage) rather than an overrun. `tone` overrides
  // the automatic reading where the caller already knows the verdict.
  const tone = forced !== undefined ? forced
    : !severity ? ''
    : ratio > 1 ? over : ratio > 0.9 ? 'warning' : '';
  const width = clamp(ratio, 0, 1) * 100;
  return `<div class="meter">
    <div class="meter-track" role="img" aria-label="${Math.round(ratio * 100)}% of ${money(total)}">
      <div class="meter-fill ${tone ? 'is-' + tone : ''}" style="width:${width.toFixed(1)}%"></div>
    </div>
    ${labels ? `<div class="meter-legend"><span>${labels[0]}</span><span>${labels[1]}</span></div>` : ''}
  </div>`;
}

export function badge(text, tone = '') {
  return `<span class="badge ${tone ? 'is-' + tone : ''}">${esc(text)}</span>`;
}

export function card(title, body, { sub, action = '', cls = '' } = {}) {
  return `<section class="card ${cls}">
    <div class="card-head"><h3>${esc(title)}</h3>${action}</div>
    ${sub ? `<p class="card-sub">${esc(sub)}</p>` : '<div style="height:12px"></div>'}
    ${body}
  </section>`;
}

/** The WCAG-clean twin of a chart. Every chart in the app gets one. */
export function tableView(headers, rows, { summary = 'Show the numbers' } = {}) {
  return `<details class="table-view">
    <summary>${esc(summary)}</summary>
    <div class="table-wrap"><table class="data">
      <thead><tr>${headers.map((h, i) =>
        `<th class="${i ? 'r' : ''}">${esc(h)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((r) => `<tr>${r.map((c, i) =>
        `<td class="${i ? 'r' : ''}">${c}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>
  </details>`;
}

export function empty(message, action = '') {
  return `<div class="card" style="text-align:center;padding:40px 24px">
    <p class="muted" style="margin:0 0 ${action ? '18px' : '0'}">${esc(message)}</p>${action}
  </div>`;
}

/** Delta string with the right tone for whether up is good. */
export function delta(current, previous, { upIsGood = true, label = 'vs last month' } = {}) {
  if (!previous) return { html: '', tone: '' };
  const diff = current - previous;
  if (Math.abs(diff) < 0.005 * Math.abs(previous || 1)) {
    return { html: `About level ${esc(label)}`, tone: 'muted' };
  }
  const up = diff > 0;
  const good = up === upIsGood;
  return {
    html: `${up ? '▲' : '▼'} ${money(Math.abs(diff))} ${esc(label)}`,
    tone: good ? 'pos' : 'neg',
  };
}

export const h = (strings, ...vals) =>
  strings.reduce((acc, s, i) => acc + s + (vals[i] ?? ''), '');
