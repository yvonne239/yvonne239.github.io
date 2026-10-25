import { store } from '../store.js';
import { money, esc, pct, clamp } from '../format.js';
import { project, ssClaimFactor, shortfallPerMonth } from '../projection.js';
import { investable } from '../analytics.js';
import { columnChart, legend, SERIES } from '../charts.js';
import { card, meter, tableView, ICONS } from '../ui.js';

const ui = { dollars: 'today' };   // 'today' | 'future'

export default {
  title: 'Retirement income',
  subtitle: 'What retirement is likely to cost, what is already promised to cover it, and what the rest has to come from.',

  render(root) {
    const s = store.state;
    const r = s.retirement;
    const p = s.profile;
    const res = project(s);
    const fy = res.firstYear;
    const real = ui.dollars === 'today';

    const ssFactor = ssClaimFactor(r.ssClaimAge, r.ssFullAge);
    const ssMonthly = r.ssMonthlyAtFRA * ssFactor;
    const shortfall = res.lastsToEnd ? 0 : shortfallPerMonth(s);

    // First retirement year, deflated back to today's money so the headline,
    // the meter and the gap all describe the same thing.
    const deflate = Math.pow(1 + p.inflation, res.retire - p.age);
    const firstNeed = fy ? fy.need / deflate / 12 : r.monthlySpendRetired;
    const firstGuaranteed = fy ? fy.guaranteed / deflate / 12 : 0;
    const gapMonthly = Math.max(0, firstNeed - firstGuaranteed);
    const ssStartsLater = r.ssClaimAge > res.retire;

    // Chart rows: retirement years only — before that there is nothing to show.
    const rows = res.rows.filter((x) => x.retired);
    const conv = (v, row) => (real ? v / Math.pow(1 + p.inflation, row.age - res.startAge) : v);

    const stack = [
      { name: 'Pension',           key: 'pension',    color: SERIES(1) },
      { name: 'Social Security',   key: 'ss',         color: SERIES(2) },
      { name: 'Part-time work',    key: 'partTime',   color: SERIES(3) },
      { name: 'Other income',      key: 'other',      color: SERIES(4) },
      { name: 'From your savings', key: 'withdrawal', color: SERIES(5) },
    ].filter((x) => rows.some((row) => row[x.key] > 0));

    root.innerHTML = `
      <div class="grid cols-4" style="margin-bottom:18px">
        <section class="card span-2" style="display:flex;flex-direction:column;justify-content:center">
          <div class="tile-label">Guaranteed income covers</div>
          <div class="hero-figure">${pct(clamp(res.coverage, 0, 2))}</div>
          <p style="margin:12px 0 0;font-size:0.93rem;color:var(--ink-2)">
            of your ${money(firstNeed)} a month of planned spending in your first year of retirement,
            leaving <strong>${money(gapMonthly)} a month</strong> to come out of savings.${ssStartsLater
              ? ` Social Security doesn't start until ${r.ssClaimAge}, so that first year leans hardest on savings —
                 from then on, ${money(ssMonthly)} a month of it is covered.` : ''}
          </p>
          ${meter(Math.min(firstGuaranteed, firstNeed), firstNeed, {
            severity: false,
            labels: [`${money(firstGuaranteed)} promised`, `${money(firstNeed)} needed`],
          })}
        </section>

        <section class="card">
          <div class="tile-label">Savings at age ${res.retire}</div>
          <div class="tile-value num">${money(res.balanceAtRetirement)}</div>
          <div class="tile-delta muted">${money(investable(s.accounts))} today, growing at ${pct(p.returnPre, 1)} a year</div>
        </section>

        <section class="card">
          <div class="tile-label">Money lasts to</div>
          <div class="tile-value num">${res.lastsToEnd ? `Age ${res.endAge}+` : `Age ${res.depletionAge}`}</div>
          <div class="tile-delta ${res.lastsToEnd ? 'pos' : 'neg'}">
            ${res.lastsToEnd
              ? `${money(res.endingBalanceReal)} left in today's money`
              : `${money(shortfall)}/mo of spending more than the plan supports`}
          </div>
        </section>
      </div>

      ${!res.lastsToEnd ? `<div class="alert-card sev-serious" style="margin-bottom:18px">
        <div class="row" style="gap:10px;align-items:center">${ICONS.alert}
          <strong>The plan runs short at age ${res.depletionAge}</strong></div>
        <p style="margin:10px 0 0;font-size:0.93rem;color:var(--ink-2)">
          Spending ${money(shortfall)} a month less — ${money(r.monthlySpendRetired - shortfall)} instead of
          ${money(r.monthlySpendRetired)} — would make it last to ${res.endAge}.
          Working part-time, retiring later, or claiming Social Security later would each do some of the same work.
          <a href="#/scenarios">Try them in the simulator →</a>
        </p>
      </div>` : ''}

      ${card('How each year gets paid for', `
        <div class="row" style="margin-bottom:14px;gap:8px">
          <div class="chips">
            <button class="chip" data-act="dollars" data-v="today" aria-pressed="${real}">Today's dollars</button>
            <button class="chip" data-act="dollars" data-v="future" aria-pressed="${!real}">Future dollars</button>
          </div>
        </div>
        <div id="ret-chart"></div>
        ${legend([...stack.map((x) => ({ name: x.name, color: x.color }))])}
        <div class="legend" style="margin-top:4px">
          <span class="legend-item"><span class="legend-line" style="background:var(--ink)"></span>What you plan to spend</span>
        </div>
        ${tableView(['Age', ...stack.map((x) => x.name), 'Total income', 'Savings left'],
          rows.map((row) => [
            String(row.age),
            ...stack.map((x) => money(conv(row[x.key], row))),
            money(conv(row.guaranteed + row.withdrawal, row)),
            money(real ? row.closingReal : row.closing),
          ]), { summary: 'Show the year-by-year numbers' })}
      `, {
        sub: real
          ? 'In today\'s money, so the figures stay comparable with what you spend now. The bars stack up to meet the spending line; where they fall short, savings have run out.'
          : 'In the actual dollars of each future year, including inflation.',
      })}

      <div class="grid cols-2" style="margin-top:18px">
        ${card('Your plan', planForm(s), { sub: 'Change anything — every figure above updates as you type.' })}
        ${card('What this assumes', assumptions(s, res, ssFactor), {
          sub: 'A projection is only as honest as the assumptions behind it, so here they are.',
        })}
      </div>
    `;

    columnChart(root.querySelector('#ret-chart'), {
      labels: rows.map((x) => String(x.age)),
      series: stack.map((x) => ({
        name: x.name, color: x.color,
        values: rows.map((row) => conv(row[x.key], row)),
      })),
      overlay: {
        name: 'What you plan to spend',
        color: 'var(--ink)',
        values: rows.map((row) => conv(row.need, row)),
      },
      stacked: true,
      height: 280,
    });

    wire(root);
  },
};

function planForm(s) {
  const r = s.retirement, p = s.profile;
  const num = (name, label, value, attrs = '', hint = '') => `
    <label class="field"><span>${esc(label)}</span>
      <input type="number" name="${name}" value="${value}" data-focus-key="f-${name}" ${attrs}>
      ${hint ? `<span class="field-hint">${hint}</span>` : ''}
    </label>`;

  return `<form id="plan-form">
    <div class="grid cols-2" style="gap:0 14px">
      ${num('age', 'Your age now', p.age, 'min="18" max="100" step="1"')}
      ${num('retireAge', 'Retire at', p.retireAge, 'min="50" max="85" step="1"')}
      ${num('planToAge', 'Plan through age', p.planToAge, 'min="70" max="110" step="1"',
        'Planners commonly use 90–95.')}
      ${num('monthlySpendRetired', 'Monthly spending then', Math.round(r.monthlySpendRetired), 'min="0" step="50"',
        `You spend about ${money(r.monthlySpendNow)} now.`)}
      ${num('pensionMonthly', 'Pension, monthly', Math.round(r.pensionMonthly), 'min="0" step="50"')}
      ${num('ssMonthlyAtFRA', 'Social Security at full age', Math.round(r.ssMonthlyAtFRA), 'min="0" step="50"',
        `Your full retirement age is ${r.ssFullAge}.`)}
      ${num('ssClaimAge', 'Claim Social Security at', r.ssClaimAge, 'min="62" max="70" step="1"',
        `${pct(ssClaimFactor(r.ssClaimAge, r.ssFullAge) - 1, 1)} vs claiming at ${r.ssFullAge}.`)}
      ${num('otherMonthly', 'Other monthly income', Math.round(r.otherMonthly), 'min="0" step="50"',
        'Rent, annuity, royalties.')}
      ${num('monthlyContribution', 'Saving each month until then', Math.round(r.monthlyContribution), 'min="0" step="50"')}
      ${num('inflation', 'Inflation, % a year', (p.inflation * 100).toFixed(1), 'min="0" max="10" step="0.1"')}
      ${num('returnPre', 'Return before retirement, %', (p.returnPre * 100).toFixed(1), 'min="0" max="15" step="0.1"')}
      ${num('returnPost', 'Return after retirement, %', (p.returnPost * 100).toFixed(1), 'min="0" max="15" step="0.1"')}
    </div>
    <label class="row" style="gap:9px;font-size:0.92rem;margin-top:4px">
      <input type="checkbox" name="pensionCola" ${r.pensionCola ? 'checked' : ''} style="width:20px;height:20px;min-height:0">
      <span>My pension rises with inflation</span>
    </label>
  </form>`;
}

function assumptions(s, res, ssFactor) {
  const r = s.retirement, p = s.profile;
  const rate = res.initialRate;
  return `<ul class="signal-list">
    <li>${ICONS.info}<span><b>Savings grow at ${pct(p.returnPre, 1)} before retirement and ${pct(p.returnPost, 1)} after.</b>
      One steady rate, every year — real markets are nothing like this, which is why the point is the shape, not the decimal.</span></li>
    <li>${ICONS.info}<span><b>Spending rises with ${pct(p.inflation, 1)} inflation.</b>
      ${money(r.monthlySpendRetired)} a month today becomes
      ${money(r.monthlySpendRetired * Math.pow(1 + p.inflation, res.retire - p.age))} by the time you retire.</span></li>
    <li>${ICONS.info}<span><b>Social Security starts at ${r.ssClaimAge} and rises with inflation.</b>
      ${r.ssClaimAge === r.ssFullAge
        ? `You claim at your full retirement age, so you get the whole ${money(r.ssMonthlyAtFRA)} a month.
           Waiting until 70 would make it ${money(r.ssMonthlyAtFRA * ssClaimFactor(70, r.ssFullAge))}; claiming at 62 would cut it to ${money(r.ssMonthlyAtFRA * ssClaimFactor(62, r.ssFullAge))}.`
        : `Claiming at ${r.ssClaimAge} rather than your full retirement age of ${r.ssFullAge} changes it by
           ${pct(ssFactor - 1, 1)} — ${money(r.ssMonthlyAtFRA * ssFactor)} a month instead of ${money(r.ssMonthlyAtFRA)}.`}</span></li>
    <li>${ICONS.info}<span><b>Your pension ${r.pensionCola ? 'rises with inflation' : 'stays flat'}.</b>
      ${r.pensionCola ? '' : 'A fixed pension loses about a third of its buying power over twenty years at this inflation rate.'}</span></li>
    <li>${ICONS.info}<span><b>Savings cover ${pct(res.earlyRate, 1)} a year on average over your first five years of retirement</b>
      — ${pct(rate, 1)} in the first year alone${r.ssClaimAge > p.retireAge
        ? `, which is higher because Social Security doesn't start until ${r.ssClaimAge}`
        : ''}.
      ${res.earlyRate > 0.045
        ? 'That is above the 4%-ish rule of thumb, so the plan leans on markets behaving.'
        : 'That sits within the usual 4%-ish rule of thumb.'}</span></li>
    <li>${ICONS.info}<span><b>Tax is not modelled.</b>
      Withdrawals from a traditional IRA are taxable income; Roth withdrawals generally are not. Treat the
      figures as before-tax and talk to someone qualified before acting on them.</span></li>
  </ul>`;
}

function wire(root) {
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act="dollars"]');
    if (!b) return;
    ui.dollars = b.dataset.v;
    store.update(() => {});
  });

  const form = root.querySelector('#plan-form');
  form?.addEventListener('input', (e) => {
    const t = e.target;
    const name = t.name;
    if (!name) return;
    const raw = t.type === 'checkbox' ? t.checked : Number(t.value);
    if (t.type !== 'checkbox' && !Number.isFinite(raw)) return;

    store.update((s) => {
      if (name === 'age' || name === 'retireAge' || name === 'planToAge') s.profile[name] = raw;
      else if (name === 'inflation' || name === 'returnPre' || name === 'returnPost') s.profile[name] = raw / 100;
      else if (name === 'pensionCola') s.retirement.pensionCola = raw;
      else s.retirement[name] = raw;
    });
  });
}
