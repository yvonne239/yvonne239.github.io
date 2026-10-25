import { store } from '../store.js';
import { money, esc, fmtDate, monthLabel, uid, ordinal, sum } from '../format.js';
import { cashflowMonth, CUSHION } from '../analytics.js';
import { catLabel, CATEGORIES } from '../categories.js';
import { lineChart, legend, SERIES } from '../charts.js';
import { card, badge, tableView, ICONS } from '../ui.js';

const now = new Date();
const ui = { year: now.getFullYear(), month: now.getMonth() };

export default {
  title: 'Cash-flow calendar',
  subtitle: 'Income and bills laid out day by day, with the balance left after each one — so a shortfall shows up while there is still time to move something.',

  render(root) {
    const s = store.state;
    const cf = cashflowMonth(s, ui.year, ui.month);
    const first = new Date(ui.year, ui.month, 1);
    const lead = first.getDay();
    const label = monthLabel(cf.key, 'long');
    const lowest = cf.days.reduce((a, b) => (b.balance < a.balance ? b : a), cf.days[0]);

    root.innerHTML = `
      <div class="row-between" style="margin-bottom:18px">
        <div class="row" style="gap:8px">
          <button class="btn btn-secondary btn-sm" data-act="prev" aria-label="Previous month">←</button>
          <strong style="font-size:1.1rem;min-width:11ch;text-align:center">${esc(label)}</strong>
          <button class="btn btn-secondary btn-sm" data-act="next" aria-label="Next month">→</button>
          <button class="btn btn-ghost btn-sm" data-act="today">This month</button>
        </div>
        <div class="row" style="gap:8px">
          ${badge(`Opening ${money(cf.opening)}`)}
          ${badge(`Closing ${money(cf.closing)}`, cf.closing < 0 ? 'critical' : cf.closing < CUSHION ? 'warning' : 'good')}
        </div>
      </div>

      ${cf.shortfalls.length ? `
        <div class="alert-card sev-critical" style="margin-bottom:18px">
          <div class="row" style="gap:10px;align-items:center">
            ${ICONS.alert}<strong>${cf.shortfalls.length} day${cf.shortfalls.length === 1 ? '' : 's'} go below zero</strong>
          </div>
          <p style="margin:10px 0 0;font-size:0.93rem;color:var(--ink-2)">
            The first is ${fmtDate(cf.shortfalls[0].iso, 'long')}, when the balance reaches
            <strong>${money(cf.shortfalls[0].balance)}</strong> after
            ${esc(cf.shortfalls[0].events.filter((e) => e.amount < 0).map((e) => e.name).join(', ') || 'the day\'s payments')}.
            Moving one flexible payment past the next deposit usually clears it.
          </p>
        </div>` : cf.tight.length ? `
        <div class="alert-card sev-warning" style="margin-bottom:18px">
          <div class="row" style="gap:10px;align-items:center">
            ${ICONS.info}<strong>It gets tight but stays positive</strong>
          </div>
          <p style="margin:10px 0 0;font-size:0.93rem;color:var(--ink-2)">
            The lowest point is ${money(lowest.balance)} on ${fmtDate(lowest.iso, 'long')} — under the
            ${money(CUSHION)} cushion, but never below zero.
          </p>
        </div>` : ''}

      ${card('The month, day by day', `
        <div class="cal-grid" role="grid" aria-label="${esc(label)} cash-flow calendar">
          ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
            .map((d) => `<div class="cal-head" role="columnheader">${d}</div>`).join('')}
          ${Array.from({ length: lead }, () => '<div class="cal-day is-empty" role="gridcell"></div>').join('')}
          ${cf.days.map(dayCell).join('')}
        </div>
        <div class="legend">
          <span class="legend-item"><span class="legend-swatch" style="background:${SERIES(1)}"></span>Money in</span>
          <span class="legend-item"><span class="legend-swatch" style="background:${SERIES(2)}"></span>Money out</span>
          <span class="legend-item"><span class="legend-swatch" style="background:var(--critical)"></span>Balance below zero</span>
        </div>
      `, { sub: 'Days up to today show what actually happened. Later days show what is scheduled.' })}

      <div class="grid cols-2" style="margin-top:18px">
        ${card('Running balance', `
          <div id="bal-chart"></div>
          ${legend([
            { name: 'Checking balance', color: SERIES(1) },
            { name: `${money(CUSHION)} cushion`, color: 'var(--axis)' },
          ], { line: true })}
          ${tableView(['Day', 'In', 'Out', 'Balance'], cf.days.map((d) => [
            `${ordinal(d.day)}`,
            money(sum(d.events.filter((e) => e.amount > 0), (e) => e.amount)),
            money(sum(d.events.filter((e) => e.amount < 0), (e) => -e.amount)),
            `<span class="${d.balance < 0 ? 'neg' : ''}">${money(d.balance)}</span>`,
          ]))}
        `, { sub: `Checking account through ${esc(label)}. The dotted line is the ${money(CUSHION)} cushion.` })}

        ${card('What\'s scheduled', scheduleEditor(s, cf), {
          sub: 'Recurring income and bills drive every future day on the calendar.',
        })}
      </div>
    `;

    const cushionSeries = cf.days.map(() => CUSHION);
    lineChart(root.querySelector('#bal-chart'), {
      labels: cf.days.map((d) => String(d.day)),
      series: [
        { name: 'Balance', values: cf.days.map((d) => d.balance), color: SERIES(1), area: true },
        { name: `${money(CUSHION)} cushion`, values: cushionSeries, color: 'var(--axis)', dashed: true, marker: false },
      ],
      height: 220,
      endLabels: false,
      zeroBase: true,
    });

    wire(root);
  },
};

function dayCell(d) {
  const cls = [
    'cal-day',
    d.isToday ? 'is-today' : '',
    d.short ? 'is-short' : '',
  ].filter(Boolean).join(' ');
  const evs = d.events.slice(0, 3).map((e) => `
    <span class="cal-ev" title="${esc(e.name)}: ${money(e.amount, { cents: true })}">
      <span class="cal-bar" style="background:${e.amount > 0 ? SERIES(1) : SERIES(2)}"></span>
      <span class="cal-name">${esc(shorten(e.name))}</span>
    </span>`).join('');
  const more = d.events.length > 3
    ? `<span class="cal-ev muted">+${d.events.length - 3} more</span>` : '';
  return `<div class="${cls}" role="gridcell"
      aria-label="${ordinal(d.day)}: ${d.events.length} item${d.events.length === 1 ? '' : 's'}, balance ${money(d.balance)}">
    <span class="cal-num">${d.day}</span>
    ${evs}${more}
    ${d.events.length ? `<span class="cal-bal">${money(d.balance)}</span>` : ''}
  </div>`;
}

const shorten = (s) => (s.length > 18 ? s.slice(0, 17) + '…' : s);

/** "12th of May and November" beats "12th of the month" for a twice-yearly bill. */
function whenLabel(item) {
  if (!item.months || !item.months.length) return `${ordinal(item.day)} of every month`;
  const names = item.months.map((m) =>
    new Date(2000, m, 1).toLocaleDateString('en-US', { month: 'long' }));
  const list = names.length === 1 ? names[0]
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `${ordinal(item.day)} of ${list}`;
}

function scheduleEditor(s, cf) {
  const line = (item, kind) => `<li class="row-between" style="padding:9px 0;border-bottom:1px solid var(--grid);gap:10px">
    <span style="flex:1 1 150px">
      <strong style="font-size:0.92rem;font-weight:580">${esc(item.name)}</strong>
      <span class="muted" style="font-size:0.82rem;display:block">
        ${esc(whenLabel(item))}${kind === 'bill' ? ` · ${esc(catLabel(item.category))}` : ''}
      </span>
    </span>
    <span class="num ${kind === 'income' ? 'pos' : ''}" style="font-size:0.92rem">
      ${money(kind === 'income' ? item.amount : -item.amount)}
    </span>
    <button class="btn btn-ghost btn-sm" data-act="drop-sched" data-kind="${kind}" data-id="${item.id}"
      aria-label="Remove ${esc(item.name)}">×</button>
  </li>`;

  return `
    <h4 style="margin-bottom:6px">Income — ${money(sum(s.income, (i) => i.amount))} a month</h4>
    <ul style="list-style:none;margin:0 0 18px;padding:0">${s.income.map((i) => line(i, 'income')).join('')}</ul>
    <h4 style="margin-bottom:6px">Bills — ${money(cf.averageOut)} a month on average</h4>
    <p class="field-hint" style="margin:-2px 0 8px">
      ${money(cf.monthlyOut)} falls due in ${esc(monthLabel(cf.key, 'long'))}. Bills that don't repeat
      every month are counted only in the months they land.</p>
    <ul style="list-style:none;margin:0 0 18px;padding:0">${s.bills.map((b) => line(b, 'bill')).join('')}</ul>

    <details>
      <summary style="cursor:pointer;font-weight:600;font-size:0.9rem;padding:6px 0">Add something recurring</summary>
      <form id="sched-form" style="margin-top:14px">
        <label class="field"><span>Name</span><input name="name" type="text" required placeholder="Water bill"></label>
        <div class="grid cols-2" style="gap:0 14px">
          <label class="field"><span>Amount</span><input name="amount" type="number" step="0.01" min="0" required inputmode="decimal"></label>
          <label class="field"><span>Day of the month</span><input name="day" type="number" min="1" max="31" value="1" required></label>
        </div>
        <label class="field"><span>Kind</span>
          <select name="kind"><option value="bill">A bill going out</option><option value="income">Income coming in</option></select>
        </label>
        <label class="field"><span>Category</span>
          <select name="category">${CATEGORIES.filter((c) => c.group !== 'income')
            .map((c) => `<option value="${c.id}">${esc(c.label)}</option>`).join('')}</select>
        </label>
        <button class="btn btn-sm" type="submit">${ICONS.plus} Add to the calendar</button>
      </form>
    </details>`;
}

function wire(root) {
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'prev') { shift(-1); store.update(() => {}); }
    if (act === 'next') { shift(1); store.update(() => {}); }
    if (act === 'today') { ui.year = new Date().getFullYear(); ui.month = new Date().getMonth(); store.update(() => {}); }
    if (act === 'drop-sched') {
      const { kind, id } = btn.dataset;
      store.update((s) => {
        if (kind === 'income') s.income = s.income.filter((x) => x.id !== id);
        else s.bills = s.bills.filter((x) => x.id !== id);
      });
    }
  });

  root.querySelector('#sched-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const item = {
      id: uid(),
      name: String(f.get('name')).trim(),
      amount: Math.abs(Number(f.get('amount'))),
      day: Math.min(31, Math.max(1, Number(f.get('day')) || 1)),
      category: String(f.get('category')),
    };
    if (!item.name || !item.amount) return;
    store.update((s) => {
      if (f.get('kind') === 'income') s.income.push(item);
      else s.bills.push(item);
    });
  });
}

function shift(n) {
  const d = new Date(ui.year, ui.month + n, 1);
  ui.year = d.getFullYear();
  ui.month = d.getMonth();
}
