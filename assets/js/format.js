// Formatting helpers. Money is stored in whole cents nowhere — plain dollars,
// rounded at the edges, which is fine for a planning tool.

export const money = (n, opts = {}) => {
  const { cents = false, sign = false } = opts;
  const v = Math.abs(n);
  const s = v.toLocaleString('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  });
  if (n < 0) return '−' + s;          // true minus sign
  return sign ? '+' + s : s;
};

/** Compact money for axis ticks and stat tiles: $4.2M, $12.9K. */
export const moneyShort = (n) => {
  const a = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  if (a >= 1e6) return `${sign}$${trim(a / 1e6)}M`;
  if (a >= 1e4) return `${sign}$${Math.round(a / 1e3)}K`;
  if (a >= 1e3) return `${sign}$${trim(a / 1e3)}K`;
  return `${sign}$${Math.round(a)}`;
};
const trim = (n) => String(Math.round(n * 10) / 10);

export const pct = (n, digits = 0) => `${(n * 100).toFixed(digits)}%`;

export const parseDate = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const toISO = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const fmtDate = (iso, style = 'med') => {
  const d = parseDate(iso);
  if (style === 'short') return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
  if (style === 'long')  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export const monthKey = (iso) => iso.slice(0, 7);

export const monthLabel = (key, style = 'short') => {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  return style === 'short'
    ? d.toLocaleDateString('en-US', { month: 'short' })
    : d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

export const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();

export const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

/** Escape untrusted strings before they reach innerHTML. */
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

export const uid = () => Math.random().toString(36).slice(2, 10);

export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export const sum = (arr, fn = (x) => x) => arr.reduce((a, b) => a + fn(b), 0);

export const median = (arr) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};
