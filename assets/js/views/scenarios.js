import { store } from '../store.js';
import { money, esc, pct, clamp } from '../format.js';
import { project } from '../projection.js';
import { lineChart, legend, SERIES } from '../charts.js';
import { card, badge, tableView, ICONS } from '../ui.js';

/** Everything the simulator is allowed to move, with sane bounds. */
const KNOBS = [
  { key: 'retireAge', label: 'Retire at age', min: 55, max: 80, step: 1,
    fmt: (v) => `${v}`, help: 'Each extra year both adds savings and removes a year of drawing on them.' },
  { key: 'monthlySpendRetired', label: 'Monthly spending in retirement', min: 2000, max: 9000, step: 100,
    fmt: (v) => money(v), help: 'The single biggest lever in almost every plan.' },
  { key: 'partTimeMonthly', label: 'Part-time income in retirement', min: 0, max: 4000, step: 100,
    fmt: (v) => (v ? `${money(v)}/mo` : 'none'), help: 'Even a small amount early on protects savings when it matters most.' },
  { key: 'partTimeUntilAge', label: 'Keep that work until age', min: 60, max: 85, step: 1,
    fmt: (v) => `${v}` },
  { key: 'monthlyContribution', label: 'Saving each month until you retire', min: 0, max: 4000, step: 50,
    fmt: (v) => money(v) },
  { key: 'ssClaimAge', label: 'Claim Social Security at', min: 62, max: 70, step: 1,
    fmt: (v) => `${v}`, help: 'Later means a permanently larger cheque — about 8% more for each year waited past full retirement age.' },
  { key: 'returnPost', label: 'Return after retiring', min: 0, max: 0.09, step: 0.005,
    fmt: (v) => pct(v, 1), scale: 100, help: 'Drag this down to see how the plan holds up if markets disappoint.' },
];

const PRESETS = [
  { name: 'Retire two years later', build: (s) => ({ retireAge: s.profile.retireAge + 2 }) },
  { name: 'Work part-time to 70',  build: () => ({ partTimeMonthly: 1200, partTimeUntilAge: 70 }) },
  { name: 'Spend 10% less',        build: (s) => ({ monthlySpendRetired: Math.round(s.retirement.monthlySpendRetired * 0.9) }) },
  { name: 'Claim Social Security at 70', build: () => ({ ssClaimAge: 70 }) },
  { name: 'Markets disappoint',    build: (s) => ({ returnPost: Math.max(0, s.profile.returnPost - 0.02) }) },
  { name: 'Save $300 more a month', build: (s) => ({ monthlyContribution: s.retirement.monthlyContribution + 300 }) },
];

export default {
  title: 'Scenario simulator',
  subtitle: 'Move one thing and watch everything else respond. Nothing here changes your saved plan until you ask it to.',

  render(root) {
    const s = store.state;
    const sc = s.scenario || current(s);

    root.innerHTML = `
      <div class="row" style="margin-bottom:18px;gap:8px">
        <span class="muted" style="font-size:0.9rem">Start from:</span>
        <div class="chips">
          ${PRESETS.map((p, i) => `<button class="chip" data-act="preset" data-i="${i}">${esc(p.name)}</button>`).join('')}
          <button class="chip" data-act="reset">${ICONS.check} Back to my plan</button>
        </div>
      </div>

      <div class="grid cols-2" style="margin-bottom:18px;align-items:start">
        ${card('What if…', KNOBS.map((k) => knob(k, sc)).join(''), {
          sub: 'Drag any of these. The projection redraws as you go.',
        })}

        <div class="stack">
          ${card('Where it leaves you', `<div id="sim-chart"></div>
            <div id="sim-legend"></div>
            <div id="sim-table"></div>`, {
            sub: 'Savings balance by age, in today\'s money.',
          })}
          <div id="sim-summary"></div>
        </div>
      </div>

      ${card('Keeping a scenario', `
        <p style="margin:0 0 16px;font-size:0.94rem;color:var(--ink-2)">
          Happy with what you see? Saving it writes these numbers into your plan, so the dashboard and the
          retirement page use them from now on. You can always come back and change them again.</p>
        <div class="row">
          <button class="btn" data-act="save">Save this as my plan</button>
          <button class="btn btn-secondary" data-act="reset">Discard and start over</button>
        </div>
      `, { sub: 'This is the only button here that changes anything.' })}
    `;

    refresh(root);
    wire(root);
  },
};

function current(s) {
  return {
    retireAge: s.profile.retireAge,
    returnPost: s.profile.returnPost,
    monthlySpendRetired: s.retirement.monthlySpendRetired,
    partTimeMonthly: s.retirement.partTimeMonthly,
    partTimeUntilAge: s.retirement.partTimeUntilAge,
    monthlyContribution: s.retirement.monthlyContribution,
    ssClaimAge: s.retirement.ssClaimAge,
  };
}

function knob(k, sc) {
  const v = sc[k.key];
  return `<div style="margin-bottom:22px">
    <div class="row-between" style="gap:10px;align-items:baseline">
      <label for="k-${k.key}" style="font-size:0.93rem;font-weight:600">${esc(k.label)}</label>
      <strong class="num" id="v-${k.key}" style="font-size:1.02rem">${k.fmt(v)}</strong>
    </div>
    <input type="range" id="k-${k.key}" data-knob="${k.key}" data-focus-key="k-${k.key}"
      min="${k.min}" max="${k.max}" step="${k.step}" value="${v}"
      aria-label="${esc(k.label)}">
    ${k.help ? `<p class="field-hint" style="margin-top:2px">${esc(k.help)}</p>` : ''}
  </div>`;
}

/** Redraw the chart and the findings without rebuilding the controls. */
function refresh(root) {
  const s = store.state;
  const sc = s.scenario || current(s);
  const base = project(s);
  const alt = project(s, overrides(sc));
  const touched = changedKnobs(sc, current(s)).length > 0;

  const labels = base.rows.map((x) => String(x.age));

  lineChart(root.querySelector('#sim-chart'), {
    labels,
    series: touched ? [
      { name: 'Your current plan', values: base.rows.map((x) => x.closingReal), color: SERIES(1) },
      { name: 'This scenario', values: alt.rows.map((x) => x.closingReal), color: SERIES(2) },
    ] : [
      { name: 'Your current plan', values: base.rows.map((x) => x.closingReal), color: SERIES(1), area: true },
    ],
    height: 250,
    endLabels: false,
  });

  root.querySelector('#sim-legend').innerHTML = touched
    ? legend([
        { name: 'Your current plan', color: SERIES(1) },
        { name: 'This scenario', color: SERIES(2) },
      ], { line: true })
    : '<p class="field-hint" style="margin-top:12px">Drag a slider and a second line appears, so you can see the two side by side.</p>';

  const rows = touched
    ? base.rows.map((x, i) => [
        String(x.age), money(x.closingReal), money(alt.rows[i].closingReal),
        diffCell(alt.rows[i].closingReal - x.closingReal),
      ])
    : base.rows.map((x) => [String(x.age), money(x.closingReal)]);
  root.querySelector('#sim-table').innerHTML = tableView(
    touched ? ['Age', 'Current plan', 'This scenario', 'Difference'] : ['Age', 'Savings left'],
    rows, { summary: 'Show the numbers behind the lines' });

  root.querySelector('#sim-summary').innerHTML = findings(base, alt, sc, s, touched);
}

const diffCell = (d) => Math.abs(d) < 1
  ? '<span class="muted">—</span>'
  : `<span class="${d > 0 ? 'pos' : 'neg'}">${money(d, { sign: d > 0 })}</span>`;

function changedKnobs(sc, cur) {
  return KNOBS.filter((k) => Math.abs(sc[k.key] - cur[k.key]) > 1e-9);
}

function findings(base, alt, sc, s, touched) {
  const cur = current(s);
  const changed = changedKnobs(sc, cur).map((k) =>
    `${k.label.toLowerCase()}: ${k.fmt(cur[k.key])} → <strong>${k.fmt(sc[k.key])}</strong>`);

  if (!touched) {
    return `<section class="card">
      <div class="card-head"><h3>What changes</h3>${badge('Nothing yet', '')}</div>
      <p class="card-sub">Nothing has been changed, so this scenario is simply your current plan.</p>
      <p style="margin:0;font-size:0.94rem;color:var(--ink-2)">
        Drag any slider above — or pick one of the starting points at the top of the page — and this
        panel will show exactly what it does to the plan, side by side.</p>
    </section>`;
  }

  // An unchanged figure is neither better nor worse; colouring it green would
  // claim an improvement that isn't there.
  const row = (label, a, b, better) => `<tr>
    <td>${label}</td><td class="r">${a}</td>
    <td class="r"><strong class="${better === null ? '' : better ? 'pos' : 'neg'}">${b}</strong></td></tr>`;
  const cmp = (x, y, higherIsBetter = true) =>
    Math.abs(x - y) < 0.5 ? null : (higherIsBetter ? y > x : y < x);

  const lastA = base.lastsToEnd ? `${base.endAge}+` : String(base.depletionAge);
  const lastB = alt.lastsToEnd ? `${alt.endAge}+` : String(alt.depletionAge);
  const yearsA = base.lastsToEnd ? Infinity : base.depletionAge;
  const yearsB = alt.lastsToEnd ? Infinity : alt.depletionAge;

  const headline = alt.lastsToEnd && !base.lastsToEnd
    ? { tone: 'good', text: `This makes the plan last all the way to ${alt.endAge}, where it previously ran out at ${base.depletionAge}.` }
    : !alt.lastsToEnd && base.lastsToEnd
      ? { tone: 'critical', text: `This breaks a plan that previously held — savings now run out at age ${alt.depletionAge}.` }
      : alt.lastsToEnd && base.lastsToEnd
        ? (Math.abs(alt.endingBalanceReal - base.endingBalanceReal) < 1
            ? { tone: 'warning', text: `Both plans last to ${alt.endAge} and end up in the same place. What you changed doesn't move the outcome.` }
            : { tone: alt.endingBalanceReal > base.endingBalanceReal ? 'good' : 'warning',
                text: `Both plans last to ${alt.endAge}. This one leaves ${money(Math.abs(alt.endingBalanceReal - base.endingBalanceReal))} ${alt.endingBalanceReal > base.endingBalanceReal ? 'more' : 'less'} at the end, in today's money.` })
        : { tone: yearsB > yearsA ? 'warning' : 'critical',
            text: `Savings still run out, but at age ${alt.depletionAge} instead of ${base.depletionAge} — ${Math.abs(alt.depletionAge - base.depletionAge)} year${Math.abs(alt.depletionAge - base.depletionAge) === 1 ? '' : 's'} ${yearsB > yearsA ? 'later' : 'earlier'}.` };

  return `<section class="card">
    <div class="card-head"><h3>What changes</h3>${badge(
      headline.tone === 'good' ? 'Better' : headline.tone === 'critical' ? 'Worse' : 'Mixed', headline.tone)}</div>
    <p class="card-sub">You changed ${changed.length === 1 ? 'one thing' : `${changed.length} things`} — ${changed.join('; ')}.</p>
    <div class="alert-card sev-${headline.tone}" style="margin-bottom:16px;padding:14px 16px">
      <p style="margin:0;font-size:0.94rem">${headline.text}</p>
    </div>
    <div class="table-wrap"><table class="data">
      <thead><tr><th></th><th class="r">Current plan</th><th class="r">This scenario</th></tr></thead>
      <tbody>
        ${row('Money lasts to age', lastA, lastB, yearsB === yearsA ? null : yearsB > yearsA)}
        ${row('Savings when you retire', money(base.balanceAtRetirement), money(alt.balanceAtRetirement),
          cmp(base.balanceAtRetirement, alt.balanceAtRetirement))}
        ${row('First year taken from savings', money(base.firstYear?.withdrawal || 0), money(alt.firstYear?.withdrawal || 0),
          cmp(base.firstYear?.withdrawal || 0, alt.firstYear?.withdrawal || 0, false))}
        ${row('First-year withdrawal rate', pct(base.initialRate, 1), pct(alt.initialRate, 1),
          cmp(base.initialRate * 1000, alt.initialRate * 1000, false))}
        ${row('Guaranteed income covers', pct(clamp(base.coverage, 0, 2)), pct(clamp(alt.coverage, 0, 2)),
          cmp(base.coverage * 1000, alt.coverage * 1000))}
        ${row('Left at age ' + alt.endAge, money(base.endingBalanceReal), money(alt.endingBalanceReal),
          cmp(base.endingBalanceReal, alt.endingBalanceReal))}
      </tbody>
    </table></div>
    <p class="field-hint" style="margin-top:12px">All amounts in today's money. Comparisons assume one steady
      rate of return every year, which no real market provides.</p>
  </section>`;
}

/** Map the knob values onto the shape project() expects. */
function overrides(sc) {
  return {
    retireAge: sc.retireAge,
    returnPost: sc.returnPost,
    monthlySpendRetired: sc.monthlySpendRetired,
    partTimeMonthly: sc.partTimeMonthly,
    partTimeUntilAge: sc.partTimeUntilAge,
    monthlyContribution: sc.monthlyContribution,
    ssClaimAge: sc.ssClaimAge,
  };
}

function wire(root) {
  // During a drag, mutate state directly and repaint only the results — a full
  // re-render would take the slider out from under the pointer.
  root.addEventListener('input', (e) => {
    const key = e.target.dataset.knob;
    if (!key) return;
    const k = KNOBS.find((x) => x.key === key);
    const v = Number(e.target.value);
    const s = store.state;
    s.scenario = { ...(s.scenario || current(s)), [key]: v };
    const out = root.querySelector(`#v-${key}`);
    if (out) out.textContent = k.fmt(v);
    refresh(root);
  });

  root.addEventListener('change', (e) => {
    if (e.target.dataset.knob) store.update(() => {});   // persist once the drag ends
  });

  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;

    if (act === 'preset') {
      const p = PRESETS[Number(btn.dataset.i)];
      store.update((s) => { s.scenario = { ...current(s), ...p.build(s) }; });
    }
    if (act === 'reset') {
      store.update((s) => { s.scenario = null; });
    }
    if (act === 'save') {
      store.update((s) => {
        const sc = s.scenario || current(s);
        s.profile.retireAge = sc.retireAge;
        s.profile.returnPost = sc.returnPost;
        Object.assign(s.retirement, {
          monthlySpendRetired: sc.monthlySpendRetired,
          partTimeMonthly: sc.partTimeMonthly,
          partTimeUntilAge: sc.partTimeUntilAge,
          monthlyContribution: sc.monthlyContribution,
          ssClaimAge: sc.ssClaimAge,
        });
        s.scenario = null;
      });
      location.hash = '#/retirement';
    }
  });
}
