import { store } from '../store.js';
import { money, esc, monthLabel, monthKey, pct, clamp, sum } from '../format.js';
import { CATEGORIES } from '../categories.js';
import { budgetStatus, averageSpend, monthlyFlows, todayISO, lastNMonthKeys } from '../analytics.js';
import { columnChart, legend, SERIES } from '../charts.js';
import { card, meter, badge, tableView, ICONS } from '../ui.js';

const ui = { month: monthKey(todayISO()) };

export default {
  title: 'Budget',
  subtitle: 'Set what you mean to spend in each part of your life, then watch the month against it. Adjust anything — nothing here is fixed.',

  render(root) {
    const s = store.state;
    const st = budgetStatus(s, ui.month);
    const flows = monthlyFlows(s.transactions, 6);
    const months = lastNMonthKeys(6).reverse();
    const expectedIncome = sum(s.income, (i) => i.amount);

    const unallocated = expectedIncome - st.budget;
    const overall = st.budget > 0 ? st.actual / st.budget : 0;

    root.innerHTML = `
      <div class="row" style="margin-bottom:18px;gap:10px">
        <label style="flex:0 1 220px">
          <span class="visually-hidden">Budget month</span>
          <select id="b-month" data-focus-key="b-month">
            ${months.map((m) => `<option value="${m}"${ui.month === m ? ' selected' : ''}>${esc(monthLabel(m, 'long'))}</option>`).join('')}
          </select>
        </label>
        <button class="btn btn-secondary btn-sm" data-act="from-average">Set budgets from my last 3 months</button>
        <button class="btn btn-ghost btn-sm" data-act="reset-budgets">Undo my changes</button>
      </div>

      <div class="grid cols-3" style="margin-bottom:18px">
        <section class="card">
          <div class="tile-label">Budgeted</div>
          <div class="tile-value num">${money(st.budget)}</div>
          <div class="tile-delta ${unallocated < 0 ? 'neg' : 'muted'}">
            ${unallocated >= 0
              ? `${money(unallocated)} of your ${money(expectedIncome)} expected monthly income not yet assigned`
              : `${money(-unallocated)} more than the ${money(expectedIncome)} you expect to come in each month`}
          </div>
        </section>
        <section class="card">
          <div class="tile-label">Spent so far</div>
          <div class="tile-value num">${money(st.actual)}</div>
          ${meter(st.actual, st.budget, {
            labels: [`${pct(clamp(overall, 0, 9))} of budget`, `${money(Math.abs(st.budget - st.actual))} ${st.actual > st.budget ? 'over' : 'left'}`],
          })}
        </section>
        <section class="card">
          <div class="tile-label">Categories over budget</div>
          <div class="tile-value num">${st.rows.filter((r) => r.actual > r.budget).length}</div>
          <div class="tile-delta muted">out of ${st.rows.length} budgeted categories</div>
        </section>
      </div>

      ${card('Budget against actual', `
        <div id="budget-chart"></div>
        ${legend([
          { name: 'Budgeted', color: SERIES(1) },
          { name: 'Spent', color: SERIES(2) },
        ])}
        ${tableView(['Group', 'Budgeted', 'Spent', 'Difference'],
          st.groups.map((g) => [esc(g.label), money(g.budget), money(g.actual),
            `<span class="${g.actual > g.budget ? 'neg' : 'pos'}">${money(g.budget - g.actual)}</span>`]))}
      `, { sub: `${esc(monthLabel(ui.month, 'long'))}, by group.` })}

      <div class="stack" style="margin-top:18px">
        ${st.groups.map(groupCard).join('')}
      </div>

      ${st.unbudgeted > 0 ? `<div class="card" style="margin-top:18px">
        <h3>Spending with no budget</h3>
        <p class="card-sub">${money(st.unbudgeted)} went to categories you haven't budgeted for this month.
        Give them a budget below and they'll be tracked from now on.</p>
        <div class="chips">${CATEGORIES
          .filter((c) => !(c.id in s.budgets) && c.group !== 'income')
          .map((c) => `<button class="chip" data-act="add-budget" data-id="${c.id}">${ICONS.plus} ${esc(c.label)}</button>`)
          .join('')}</div>
      </div>` : ''}
    `;

    columnChart(root.querySelector('#budget-chart'), {
      labels: st.groups.map((g) => g.label),
      series: [
        { name: 'Budgeted', values: st.groups.map((g) => g.budget), color: SERIES(1) },
        { name: 'Spent', values: st.groups.map((g) => g.actual), color: SERIES(2) },
      ],
      stacked: false,
      height: 250,
    });

    wire(root);
  },
};

function groupCard(g) {
  const over = g.actual > g.budget;
  return `<section class="card">
    <div class="card-head">
      <h3>${esc(g.label)}</h3>
      <span class="num ${over ? 'neg' : 'muted'}" style="font-size:0.9rem">
        ${money(g.actual)} of ${money(g.budget)}${over ? ` · ${money(g.actual - g.budget)} over` : ''}
      </span>
    </div>
    <p class="card-sub">${esc(g.blurb)}</p>
    <div class="budget-rows">
      ${g.items.map(row).join('')}
    </div>
  </section>`;
}

function row(r) {
  const over = r.actual > r.budget;
  const exact = !over && r.budget > 0 && r.ratio >= 0.995;
  const near = !over && !exact && r.ratio > 0.9;
  return `<div class="budget-row">
    <div class="row-between" style="gap:12px;align-items:center">
      <div class="row" style="gap:9px;flex:1 1 180px">
        <strong style="font-size:0.95rem">${esc(r.label)}</strong>
        ${over ? badge('over', 'critical') : exact ? badge('on budget', 'good') : near ? badge('nearly there', 'warning') : ''}
      </div>
      <div class="row" style="gap:8px">
        <span class="num muted" style="font-size:0.88rem">${money(r.actual)} spent</span>
        <label style="width:118px">
          <span class="visually-hidden">${esc(r.label)} budget</span>
          <input type="number" min="0" step="10" value="${Math.round(r.budget)}"
            data-act="budget-num" data-id="${r.id}" data-focus-key="bn-${r.id}"
            style="min-height:36px;padding:5px 9px;font-size:0.88rem;text-align:right">
        </label>
        <button class="btn btn-ghost btn-sm" data-act="remove-budget" data-id="${r.id}"
          aria-label="Remove the ${esc(r.label)} budget">×</button>
      </div>
    </div>
    <input type="range" min="0" max="${Math.max(200, Math.ceil(Math.max(r.budget, r.actual) * 2 / 50) * 50)}"
      step="10" value="${Math.round(r.budget)}"
      data-act="budget-range" data-id="${r.id}" data-focus-key="br-${r.id}"
      aria-label="${esc(r.label)} budget">
    ${meter(r.actual, r.budget, {
      tone: over ? 'critical' : exact ? '' : near ? 'warning' : '',
      labels: [`${money(r.actual)} of ${money(r.budget)}`,
        over ? `${money(r.actual - r.budget)} over` : exact ? 'exactly on budget' : `${money(r.remaining)} left`],
    })}
  </div>`;
}

function wire(root) {
  root.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'b-month') { ui.month = t.value; store.update(() => {}); }
  });

  root.addEventListener('input', (e) => {
    const t = e.target;
    const act = t.dataset.act;
    if (act !== 'budget-range' && act !== 'budget-num') return;
    const id = t.dataset.id;
    const value = Math.max(0, Number(t.value) || 0);
    // Keep the pair in step without a full re-render, so dragging stays smooth.
    const partner = root.querySelector(
      `[data-act="${act === 'budget-range' ? 'budget-num' : 'budget-range'}"][data-id="${id}"]`);
    if (partner) partner.value = String(Math.round(value));
    store.state.budgets[id] = value;
    refreshRow(root, id);
  });

  root.addEventListener('change', (e) => {
    if (e.target.dataset.act === 'budget-range' || e.target.dataset.act === 'budget-num') {
      store.update(() => {});   // commit + persist once the drag ends
    }
  });

  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'add-budget') {
      const avg = averageSpend(store.state.transactions, 3);
      store.update((s) => { s.budgets[btn.dataset.id] = Math.round((avg[btn.dataset.id] || 50) / 10) * 10; });
    }
    if (act === 'remove-budget') {
      store.update((s) => { delete s.budgets[btn.dataset.id]; });
    }
    if (act === 'from-average') {
      const avg = averageSpend(store.state.transactions, 3);
      store.update((s) => {
        for (const id of Object.keys(s.budgets)) {
          if (avg[id] !== undefined) s.budgets[id] = Math.round(avg[id] / 10) * 10;
        }
      });
    }
    if (act === 'reset-budgets') {
      if (confirm('Put every budget back to its starting value?')) {
        import('../store.js').then(({ defaultState }) => {
          store.update((s) => { s.budgets = defaultState().budgets; });
        });
      }
    }
  });
}

/** Repaint one row's meter mid-drag without rebuilding the view. */
function refreshRow(root, id) {
  const s = store.state;
  const st = budgetStatus(s, ui.month);
  const r = st.rows.find((x) => x.id === id);
  if (!r) return;
  const input = root.querySelector(`[data-act="budget-range"][data-id="${id}"]`);
  const wrap = input?.closest('.budget-row');
  const m = wrap?.querySelector('.meter');
  if (!m) return;
  const over = r.actual > r.budget;
  const exact = !over && r.budget > 0 && r.ratio >= 0.995;
  m.outerHTML = meter(r.actual, r.budget, {
    tone: over ? 'critical' : exact ? '' : r.ratio > 0.9 ? 'warning' : '',
    labels: [`${money(r.actual)} of ${money(r.budget)}`,
      over ? `${money(r.actual - r.budget)} over` : exact ? 'exactly on budget' : `${money(r.remaining)} left`],
  });
}
