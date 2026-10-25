// SVG chart primitives.
//
// House rules baked in here so no call site has to remember them:
//   · bars cap at 24px thick, 4px rounded data-end, square at the baseline
//   · lines 2px, markers r>=4 with a 2px surface ring
//   · area fills are a ~10% wash, never a saturated block
//   · gridlines are solid hairlines, one step off the surface
//   · a 2px surface gap separates touching fills
//   · text wears text tokens; colour lives on the mark beside it
//   · every chart gets a hover/focus layer; values are never tooltip-gated

import { moneyShort, money } from './format.js';

const NS = 'http://www.w3.org/2000/svg';
const BAR_MAX = 24;
const GAP = 2;

export const SERIES = (n) => `var(--series-${((n - 1) % 8) + 1})`;

/* ------------------------------------------------------------- helpers --- */

function el(name, attrs = {}, parent) {
  const n = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== undefined && v !== null) n.setAttribute(k, v);
  }
  if (parent) parent.appendChild(n);
  return n;
}

/** Axis ticks rounded to 1/2/2.5/5 × 10^n so labels read as clean numbers. */
function niceTicks(min, max, count = 4) {
  if (min === max) { min = Math.min(0, min); max = max || 1; }
  const span = max - min;
  const raw = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(raw) || 1)));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return ticks;
}

/** A rect with two rounded corners on one side only. */
function roundedPath(x, y, w, h, r, side) {
  if (w <= 0 || h <= 0) return '';
  if (side === 'none' || !r) return `M${x},${y} L${x + w},${y} L${x + w},${y + h} L${x},${y + h} Z`;
  r = Math.max(0, Math.min(r, side === 'top' ? w / 2 : h / 2, side === 'top' ? h : w));
  if (side === 'top') {
    return `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`;
  }
  if (side === 'bottom') {
    return `M${x},${y} L${x},${y + h - r} Q${x},${y + h} ${x + r},${y + h} L${x + w - r},${y + h} Q${x + w},${y + h} ${x + w},${y + h - r} L${x + w},${y} Z`;
  }
  // right
  return `M${x},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h} L${x},${y + h} Z`;
}

function smoothPath(pts) {
  if (!pts.length) return '';
  return pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
}

/**
 * Mount a chart into `host`, re-rendering when its width changes.
 * `draw(svg, width, tip)` does the work; everything else is plumbing.
 */
function mount(host, draw) {
  host.classList.add('chart');
  host.innerHTML = '';
  const tip = document.createElement('div');
  tip.className = 'chart-tip';
  tip.setAttribute('role', 'status');
  host.appendChild(tip);

  let frame = 0;
  const render = () => {
    const w = Math.max(240, host.clientWidth || 600);
    host.querySelectorAll('svg').forEach((s) => s.remove());
    const svg = el('svg', { width: w, height: 'auto' });
    host.insertBefore(svg, tip);
    draw(svg, w, tip);
  };

  render();
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(render);
    });
    ro.observe(host);
    host._ro?.disconnect();
    host._ro = ro;
  }
}

function showTip(tip, host, x, y, html) {
  tip.innerHTML = html;
  tip.style.opacity = '1';
  const hw = host.clientWidth;
  const tw = tip.offsetWidth;
  const left = Math.max(tw / 2 + 2, Math.min(hw - tw / 2 - 2, x));
  tip.style.left = `${left}px`;
  tip.style.top = `${Math.max(tip.offsetHeight + 4, y - 10)}px`;
}
const hideTip = (tip) => { tip.style.opacity = '0'; };

function swatchRow(color, label, value) {
  return `<div class="tip-row"><span class="sw" style="background:${color}"></span>${label}<span class="tip-val">${value}</span></div>`;
}

/* --------------------------------------------------------- line / area --- */

/**
 * Multi-series line chart with a crosshair hover layer.
 * series: [{ name, values:number[], color, area?:boolean, dashed?:boolean }]
 */
export function lineChart(host, { labels, series, height = 230, fmt = moneyShort, fmtFull = money, zeroBase = true, endLabels = true, yTitle }) {
  mount(host, (svg, W, tip) => {
    const padL = 56, padR = endLabels ? 56 : 14, padT = 14, padB = 30;
    const H = height;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('height', H);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `Line chart: ${series.map((s) => s.name).join(', ')}`);

    const all = series.flatMap((s) => s.values).filter((v) => Number.isFinite(v));
    let lo = Math.min(...all), hi = Math.max(...all);
    if (zeroBase) lo = Math.min(0, lo);
    const ticks = niceTicks(lo, hi, 4);
    const yMin = ticks[0], yMax = ticks[ticks.length - 1];
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const X = (i) => padL + (labels.length === 1 ? plotW / 2 : (i / (labels.length - 1)) * plotW);
    const Y = (v) => padT + plotH - ((v - yMin) / (yMax - yMin || 1)) * plotH;

    for (const t of ticks) {
      el('line', { x1: padL, x2: W - padR, y1: Y(t), y2: Y(t), class: t === 0 ? 'axis-line' : 'grid-line' }, svg);
      const lab = el('text', { x: padL - 10, y: Y(t) + 4, class: 'axis-label', 'text-anchor': 'end' }, svg);
      lab.textContent = fmt(t);
    }

    // X labels — thinned so they never collide.
    const every = Math.max(1, Math.ceil((labels.length * 54) / plotW));
    labels.forEach((l, i) => {
      if (i % every && i !== labels.length - 1) return;
      const t = el('text', { x: X(i), y: H - 9, class: 'axis-label', 'text-anchor': 'middle' }, svg);
      t.textContent = l;
    });

    series.forEach((s, si) => {
      const color = s.color || SERIES(si + 1);
      const pts = s.values.map((v, i) => [X(i), Y(v)]);
      if (s.area) {
        const base = Y(Math.max(yMin, 0));
        el('path', {
          d: `${smoothPath(pts)} L${pts[pts.length - 1][0]},${base} L${pts[0][0]},${base} Z`,
          fill: color, opacity: 0.10,
        }, svg);
      }
      el('path', {
        d: smoothPath(pts), fill: 'none', stroke: color, 'stroke-width': 2,
        'stroke-linejoin': 'round', 'stroke-linecap': 'round',
        'stroke-dasharray': s.dashed ? '6 5' : null,
      }, svg);

      const last = pts[pts.length - 1];
      // A reference line (a threshold, a cushion) is not a data point, so it
      // gets no end marker and no end label.
      if (s.marker !== false) {
        el('circle', { cx: last[0], cy: last[1], r: 4.5, fill: color, stroke: 'var(--surface)', 'stroke-width': 2 }, svg);
      }
      if (endLabels && s.marker !== false) {
        const t = el('text', { x: last[0] + 10, y: last[1] + 4, class: 'axis-label', 'text-anchor': 'start' }, svg);
        t.setAttribute('style', 'fill:var(--ink-2);font-weight:650');
        t.textContent = fmt(s.values[s.values.length - 1]);
      }
    });

    /* Hover + keyboard layer: one crosshair, dots on every series. */
    const cross = el('line', { y1: padT, y2: padT + plotH, class: 'axis-line', opacity: 0 }, svg);
    const dots = series.map((s, si) => el('circle', {
      r: 5, fill: s.color || SERIES(si + 1), stroke: 'var(--surface)', 'stroke-width': 2, opacity: 0,
    }, svg));

    const focus = (i) => {
      const x = X(i);
      cross.setAttribute('x1', x); cross.setAttribute('x2', x); cross.setAttribute('opacity', 1);
      let top = Infinity;
      series.forEach((s, si) => {
        const y = Y(s.values[i]);
        top = Math.min(top, y);
        dots[si].setAttribute('cx', x); dots[si].setAttribute('cy', y); dots[si].setAttribute('opacity', 1);
      });
      const rows = series.map((s, si) =>
        swatchRow(s.color || SERIES(si + 1), s.name, fmtFull(s.values[i]))).join('');
      showTip(tip, host, x, top, `<strong>${labels[i]}</strong>${rows}`);
    };
    const blur = () => {
      cross.setAttribute('opacity', 0);
      dots.forEach((d) => d.setAttribute('opacity', 0));
      hideTip(tip);
    };

    const hit = el('rect', {
      x: padL - 8, y: padT, width: plotW + 16, height: plotH,
      fill: 'transparent', tabindex: 0, role: 'application',
      'aria-label': 'Chart values — use the left and right arrow keys to read each point',
    }, svg);
    hit.style.cursor = 'crosshair';
    hit.style.outlineOffset = '2px';

    let idx = 0;
    hit.addEventListener('pointermove', (e) => {
      const r = svg.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * W;
      idx = Math.round(((px - padL) / plotW) * (labels.length - 1));
      idx = Math.max(0, Math.min(labels.length - 1, idx));
      focus(idx);
    });
    hit.addEventListener('pointerleave', blur);
    hit.addEventListener('focus', () => focus(idx));
    hit.addEventListener('blur', blur);
    hit.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') idx = Math.min(labels.length - 1, idx + 1);
      else if (e.key === 'ArrowLeft') idx = Math.max(0, idx - 1);
      else return;
      e.preventDefault();
      focus(idx);
    });

    if (yTitle) {
      const t = el('text', { x: padL - 10, y: padT - 2, class: 'axis-label', 'text-anchor': 'end' }, svg);
      t.textContent = yTitle;
    }
  });
}

/* ------------------------------------------------------- columns/stack --- */

/**
 * Grouped or stacked columns, with an optional 2px overlay line on the SAME
 * axis (same unit — never a second y-scale).
 * series: [{ name, values, color }]
 */
export function columnChart(host, { labels, series, stacked = true, height = 250, fmt = moneyShort, fmtFull = money, overlay = null }) {
  mount(host, (svg, W, tip) => {
    const padL = 56, padR = 14, padT = 16, padB = 32;
    const H = height;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('height', H);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `Column chart: ${series.map((s) => s.name).join(', ')}`);

    const totals = labels.map((_, i) =>
      stacked ? series.reduce((a, s) => a + (s.values[i] || 0), 0) : Math.max(...series.map((s) => s.values[i] || 0)));
    const peak = Math.max(...totals, ...(overlay ? overlay.values : [0]));
    const ticks = niceTicks(0, peak, 4);
    const yMax = ticks[ticks.length - 1];
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const band = plotW / labels.length;
    const barW = Math.min(BAR_MAX, band * 0.6);
    const groupW = stacked ? barW : Math.min(BAR_MAX, (band * 0.72) / series.length);
    const Y = (v) => padT + plotH - (v / (yMax || 1)) * plotH;
    const baseY = padT + plotH;

    for (const t of ticks) {
      el('line', { x1: padL, x2: W - padR, y1: Y(t), y2: Y(t), class: t === 0 ? 'axis-line' : 'grid-line' }, svg);
      const lab = el('text', { x: padL - 10, y: Y(t) + 4, class: 'axis-label', 'text-anchor': 'end' }, svg);
      lab.textContent = fmt(t);
    }

    const every = Math.max(1, Math.ceil((labels.length * 46) / plotW));
    labels.forEach((l, i) => {
      if (i % every) return;
      const t = el('text', { x: padL + band * i + band / 2, y: H - 10, class: 'axis-label', 'text-anchor': 'middle' }, svg);
      t.textContent = l;
    });

    labels.forEach((_, i) => {
      const cx = padL + band * i + band / 2;
      if (stacked) {
        let acc = 0;
        const segs = series.map((s, si) => ({ s, si, v: s.values[i] || 0 })).filter((d) => d.v > 0);
        segs.forEach((d, k) => {
          const yBottom = Y(acc);
          acc += d.v;
          const yTop = Y(acc);
          const isTop = k === segs.length - 1;
          // Non-top segments give up GAP px at their top edge, so the surface
          // itself does the separating. No stroke around the mark.
          const y = isTop ? yTop : yTop + GAP;
          const h = Math.max(1, yBottom - y);
          el('path', {
            d: roundedPath(cx - barW / 2, y, barW, h, 4, isTop ? 'top' : 'none'),
            fill: d.s.color || SERIES(d.si + 1),
          }, svg);
        });
      } else {
        series.forEach((s, si) => {
          const v = s.values[i] || 0;
          const x = cx - (groupW * series.length + GAP * (series.length - 1)) / 2 + si * (groupW + GAP);
          el('path', { d: roundedPath(x, Y(v), groupW, baseY - Y(v), 4, 'top'), fill: s.color || SERIES(si + 1) }, svg);
        });
      }
    });

    if (overlay) {
      const pts = overlay.values.map((v, i) => [padL + band * i + band / 2, Y(v)]);
      el('path', {
        d: smoothPath(pts), fill: 'none', stroke: overlay.color || 'var(--ink)',
        'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
        'stroke-dasharray': overlay.dashed ? '6 5' : null,
      }, svg);
    }

    // One hit band per column — comfortably bigger than the bar itself.
    labels.forEach((l, i) => {
      const r = el('rect', {
        x: padL + band * i, y: padT, width: band, height: plotH,
        fill: 'transparent', tabindex: 0,
        'aria-label': `${l}: ${series.map((s) => `${s.name} ${fmtFull(s.values[i] || 0)}`).join(', ')}`,
      }, svg);
      const open = () => {
        const rows = series
          .map((s, si) => ({ s, si }))
          .filter(({ s }) => (s.values[i] || 0) !== 0)
          .map(({ s, si }) => swatchRow(s.color || SERIES(si + 1), s.name, fmtFull(s.values[i])))
          .join('');
        const tot = stacked
          ? `<div class="tip-row" style="border-top:1px solid var(--border);margin-top:5px;padding-top:5px"><strong>Total</strong><span class="tip-val"><strong>${fmtFull(totals[i])}</strong></span></div>`
          : '';
        const ov = overlay ? swatchRow(overlay.color || 'var(--ink)', overlay.name, fmtFull(overlay.values[i])) : '';
        showTip(tip, host, padL + band * i + band / 2, Y(totals[i]), `<strong>${l}</strong>${rows}${tot}${ov}`);
      };
      r.addEventListener('pointerenter', open);
      r.addEventListener('focus', open);
      r.addEventListener('pointerleave', () => hideTip(tip));
      r.addEventListener('blur', () => hideTip(tip));
    });
  });
}

/* ------------------------------------------------------- horizontal bar --- */

/** One series, one colour. Value sits at the tip; the label is a text token. */
export function barsH(host, { rows, height, fmtFull = money, color = SERIES(1), labelW = 150 }) {
  mount(host, (svg, W, tip) => {
    const padR = 78, padT = 4, rowH = 34;
    const H = height || rows.length * rowH + padT * 2;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('height', H);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Bar chart');

    const lw = Math.min(labelW, W * 0.38);
    const max = Math.max(...rows.map((r) => r.value), 1);
    const plotW = Math.max(40, W - lw - padR);
    const barH = Math.min(BAR_MAX, rowH - 12);

    rows.forEach((r, i) => {
      const y = padT + i * rowH + (rowH - barH) / 2;
      const w = (r.value / max) * plotW;

      const lab = el('text', { x: lw - 12, y: y + barH / 2 + 4, class: 'axis-label', 'text-anchor': 'end' }, svg);
      lab.setAttribute('style', 'fill:var(--ink-2);font-size:12.5px');
      lab.textContent = r.label;

      el('path', { d: roundedPath(lw, y, Math.max(2, w), barH, 4, 'right'), fill: r.color || color }, svg);

      const val = el('text', { x: lw + Math.max(2, w) + 9, y: y + barH / 2 + 4, class: 'axis-label', 'text-anchor': 'start' }, svg);
      val.setAttribute('style', 'fill:var(--ink);font-size:12.5px;font-weight:650');
      val.textContent = fmtFull(r.value);

      const hit = el('rect', { x: 0, y: padT + i * rowH, width: W, height: rowH, fill: 'transparent', tabindex: 0, 'aria-label': `${r.label}: ${fmtFull(r.value)}` }, svg);
      const open = () => showTip(tip, host, lw + Math.max(2, w) / 2, y, `<strong>${r.label}</strong><div class="tip-row">${fmtFull(r.value)}${r.note ? `<span class="tip-val">${r.note}</span>` : ''}</div>`);
      hit.addEventListener('pointerenter', open);
      hit.addEventListener('focus', open);
      hit.addEventListener('pointerleave', () => hideTip(tip));
      hit.addEventListener('blur', () => hideTip(tip));
    });
  });
}

/* ------------------------------------------------------------ sparkline --- */

/** Returns an SVG string — cheap enough to drop straight into a stat tile. */
export function sparkline(values, { w = 132, h = 34, color = SERIES(1) } = {}) {
  if (!values.length) return '';
  const lo = Math.min(...values), hi = Math.max(...values);
  const span = hi - lo || 1;
  const X = (i) => (i / (values.length - 1 || 1)) * (w - 6) + 3;
  const Y = (v) => h - 4 - ((v - lo) / span) * (h - 10);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
  const lx = X(values.length - 1), ly = Y(values[values.length - 1]);
  return `<svg class="tile-spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">
    <path d="${d} L${lx.toFixed(1)},${h} L3,${h} Z" fill="${color}" opacity="0.10"/>
    <path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="4" fill="${color}" stroke="var(--surface)" stroke-width="2"/>
  </svg>`;
}

/* --------------------------------------------------------------- legend --- */

export function legend(items, { line = false } = {}) {
  return `<div class="legend">${items.map((it) => `
    <span class="legend-item">
      <span class="${line ? 'legend-line' : 'legend-swatch'}" style="background:${it.color}"></span>${it.name}
    </span>`).join('')}</div>`;
}

export { niceTicks };
