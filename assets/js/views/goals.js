import { store } from '../store.js';
import { money, esc, uid, sum, clamp, parseDate } from '../format.js';
import { monthlyFlows } from '../analytics.js';
import { columnChart, legend, SERIES } from '../charts.js';
import { card, meter, badge, tableView, ICONS, empty } from '../ui.js';

const KINDS = {
  emergency:  'Emergency fund',
  retirement: 'Retirement',
  travel:     'Travel',
  family:     'Family support',
  home:       'Home',
  other:      'Something else',
};

export default {
  title: 'Savings goals',
  subtitle: 'What you are saving for, how much is set aside, and when each goal gets there at the rate you are going.',

  render(root) {
    const s = store.state;
    const flows = monthlyFlows(s.transactions, 4);
    const typicalLeft = flows.slice(0, -1).reduce((a, f) => a + f.net, 0) / Math.max(1, flows.length - 1);
    const committed = sum(s.goals, (g) => g.monthly);
    const totalTarget = sum(s.goals, (g) => g.target);
    const totalSaved = sum(s.goals, (g) => g.saved);

    const proj = projectGoals(s.goals, 12);

    root.innerHTML = `
      <div class="grid cols-3" style="margin-bottom:18px">
        <section class="card">
          <div class="tile-label">Set aside so far</div>
          <div class="tile-value num">${money(totalSaved)}</div>
          ${meter(totalSaved, totalTarget, { severity: false,
            labels: [`of ${money(totalTarget)} across ${s.goals.length} goal${s.goals.length === 1 ? '' : 's'}`,
                     `${Math.round((totalSaved / (totalTarget || 1)) * 100)}%`],
          })}
        </section>
        <section class="card">
          <div class="tile-label">Going in each month</div>
          <div class="tile-value num">${money(committed)}</div>
          <div class="tile-delta ${committed > typicalLeft ? 'neg' : 'pos'}">
            ${typicalLeft <= 0
              ? `A typical month hasn't been leaving anything over lately, so these contributions are
                 coming out of what you already have.`
              : committed > typicalLeft
                ? `${money(committed - typicalLeft)} more than the ${money(typicalLeft)} a typical month leaves over`
                : `Fits inside the ${money(typicalLeft)} a typical month leaves over.`}
          </div>
        </section>
        <section class="card">
          <div class="tile-label">Next goal to finish</div>
          ${nextToFinish(s.goals)}
        </section>
      </div>

      ${s.goals.length ? card('Where the goals get to', `
        <div id="goal-chart"></div>
        ${legend(proj.series.map((x) => ({ name: x.name, color: x.color })))}
        ${tableView(['Month', ...proj.series.map((x) => x.name), 'Total'],
          proj.labels.map((l, i) => [esc(l),
            ...proj.series.map((x) => money(x.values[i])),
            money(proj.series.reduce((a, x) => a + x.values[i], 0))]))}
      `, { sub: 'The next twelve months, if you keep contributing at the current rate.' }) : ''}

      <div class="grid cols-2" style="margin-top:18px">
        ${s.goals.length
          ? s.goals.map((g) => goalCard(g)).join('')
          : empty('No goals yet. Add the first one below.')}
      </div>

      ${card('Add a goal', `
        <form id="goal-form">
          <div class="grid cols-2" style="gap:0 14px">
            <label class="field"><span>What is it for?</span>
              <input name="name" type="text" required placeholder="New roof"></label>
            <label class="field"><span>Kind</span>
              <select name="kind">${Object.entries(KINDS)
                .map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></label>
            <label class="field"><span>Target amount</span>
              <input name="target" type="number" min="1" step="100" required inputmode="decimal" placeholder="12000"></label>
            <label class="field"><span>Already saved</span>
              <input name="saved" type="number" min="0" step="10" value="0" inputmode="decimal"></label>
            <label class="field"><span>Contribution each month</span>
              <input name="monthly" type="number" min="0" step="10" value="100" inputmode="decimal"></label>
            <label class="field"><span>Want it by <span class="muted">(optional)</span></span>
              <input name="due" type="date"></label>
          </div>
          <button class="btn" type="submit">${ICONS.plus} Add this goal</button>
        </form>
      `, { sub: 'Emergency savings first, then everything else — that is the order that survives a surprise.', cls: 'span-2' })}
    `;

    if (s.goals.length) {
      columnChart(root.querySelector('#goal-chart'), {
        labels: proj.labels,
        series: proj.series,
        stacked: true,
        height: 250,
      });
    }

    wire(root);
  },
};

function goalCard(g) {
  const left = Math.max(0, g.target - g.saved);
  const months = g.monthly > 0 ? Math.ceil(left / g.monthly) : null;
  const done = left === 0;
  const eta = months !== null ? etaLabel(months) : null;
  const dueMiss = g.due && months !== null ? missesDeadline(g.due, months) : null;

  return `<section class="card">
    <div class="card-head">
      <h3>${esc(g.name)}</h3>
      ${done ? badge('reached', 'good')
        : dueMiss ? badge(`${dueMiss} behind`, 'warning')
        : g.monthly > 0 ? badge(eta, 'good') : badge('no contribution set', 'warning')}
    </div>
    <p class="card-sub">${esc(kindLabel(g))}${g.due ? ` · wanted by ${esc(parseDate(g.due).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }))}` : ''}</p>

    <div class="row-between" style="align-items:baseline">
      <span class="tile-value num" style="font-size:1.5rem">${money(g.saved)}</span>
      <span class="muted num" style="font-size:0.9rem">of ${money(g.target)}</span>
    </div>
    ${meter(g.saved, g.target, { severity: false,
      labels: [`${Math.round(clamp(g.saved / g.target, 0, 1) * 100)}% there`,
               done ? 'done' : `${money(left)} to go`],
    })}

    <div class="row" style="margin-top:18px;gap:10px">
      <label style="flex:0 1 130px">
        <span class="visually-hidden">Monthly contribution for ${esc(g.name)}</span>
        <input type="number" min="0" step="10" value="${Math.round(g.monthly)}"
          data-act="goal-monthly" data-id="${g.id}" data-focus-key="gm-${g.id}"
          style="min-height:38px;padding:6px 10px;font-size:0.9rem;text-align:right">
      </label>
      <span class="muted" style="font-size:0.86rem">a month</span>
      <button class="btn btn-secondary btn-sm push" data-act="contribute" data-id="${g.id}">Add money</button>
      <button class="btn btn-ghost btn-sm" data-act="drop-goal" data-id="${g.id}"
        aria-label="Remove the goal ${esc(g.name)}">Remove</button>
    </div>
  </section>`;
}

/** The kind is only worth printing when it isn't just the goal's name again. */
function kindLabel(g) {
  const label = KINDS[g.kind] || 'Goal';
  return label.toLowerCase() === String(g.name).toLowerCase() ? 'Goal' : label;
}

function etaLabel(months) {
  if (months <= 0) return 'reached';
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return `${d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`;
}

function missesDeadline(due, months) {
  const target = parseDate(due);
  const eta = new Date();
  eta.setMonth(eta.getMonth() + months);
  const diff = (eta.getFullYear() - target.getFullYear()) * 12 + (eta.getMonth() - target.getMonth());
  if (diff <= 0) return null;
  return diff === 1 ? '1 month' : `${diff} months`;
}

function nextToFinish(goals) {
  const open = goals
    .filter((g) => g.saved < g.target && g.monthly > 0)
    .map((g) => ({ g, months: Math.ceil((g.target - g.saved) / g.monthly) }))
    .sort((a, b) => a.months - b.months);
  if (!open.length) {
    return '<div class="tile-value num" style="font-size:1.2rem">—</div><div class="tile-delta muted">Set a monthly contribution to see a finish date.</div>';
  }
  const { g, months } = open[0];
  return `<div class="tile-value" style="font-size:1.3rem">${esc(g.name)}</div>
    <div class="tile-delta">Reaches ${money(g.target)} around <strong>${etaLabel(months)}</strong> — about ${months} month${months === 1 ? '' : 's'} away.</div>`;
}

/** Stacked projection of every goal's balance over the next `n` months. */
function projectGoals(goals, n) {
  const labels = [];
  const d = new Date();
  for (let i = 1; i <= n; i++) {
    const m = new Date(d.getFullYear(), d.getMonth() + i, 1);
    labels.push(m.toLocaleDateString('en-US', { month: 'short' }));
  }
  const top = [...goals].sort((a, b) => b.target - a.target).slice(0, 8);
  const series = top.map((g, i) => ({
    name: g.name,
    color: SERIES(i + 1),
    values: labels.map((_, k) => Math.min(g.target, g.saved + g.monthly * (k + 1))),
  }));
  return { labels, series };
}

function wire(root) {
  root.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.act === 'goal-monthly') {
      const v = Math.max(0, Number(t.value) || 0);
      store.update((s) => {
        const g = s.goals.find((x) => x.id === t.dataset.id);
        if (g) g.monthly = v;
      });
    }
  });

  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const id = btn.dataset.id;

    if (btn.dataset.act === 'contribute') {
      const g = store.state.goals.find((x) => x.id === id);
      const raw = prompt(`How much are you adding to “${g.name}”?`, String(g.monthly || 100));
      if (raw === null) return;
      const amount = Math.abs(Number(raw));
      if (!Number.isFinite(amount) || amount === 0) return;
      store.update((s) => {
        const goal = s.goals.find((x) => x.id === id);
        if (goal) goal.saved = Math.min(goal.target, goal.saved + amount);
      });
    }

    if (btn.dataset.act === 'drop-goal') {
      const g = store.state.goals.find((x) => x.id === id);
      if (confirm(`Remove the goal “${g.name}”? Nothing else changes.`)) {
        store.update((s) => { s.goals = s.goals.filter((x) => x.id !== id); });
      }
    }
  });

  root.querySelector('#goal-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const goal = {
      id: uid(),
      name: String(f.get('name')).trim(),
      kind: String(f.get('kind')),
      target: Math.abs(Number(f.get('target'))) || 0,
      saved: Math.abs(Number(f.get('saved'))) || 0,
      monthly: Math.abs(Number(f.get('monthly'))) || 0,
      due: String(f.get('due') || ''),
    };
    if (!goal.name || !goal.target) return;
    store.update((s) => { s.goals.push(goal); });
  });
}
