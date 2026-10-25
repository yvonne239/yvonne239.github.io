import { store } from '../store.js';
import { money, pct, esc, monthKey, fmtDate, sum } from '../format.js';
import { catLabel } from '../categories.js';
import { monthlyFlows, spendByCategory, netWorth, runwayMonths, savingsRate, cashflowMonth, todayISO } from '../analytics.js';
import { project } from '../projection.js';
import { detectAnomalies, openAlerts } from '../anomalies.js';
import { lineChart, barsH, sparkline, legend, SERIES } from '../charts.js';
import { tile, meter, card, tableView, badge, ICONS, delta } from '../ui.js';

export default {
  title: 'Dashboard',
  subtitle: 'Everything in one place — what came in, what went out, what it means for the years ahead.',

  render(root) {
    const s = store.state;
    const flows = monthlyFlows(s.transactions, 6);
    const thisKey = monthKey(todayISO());
    const cur = flows[flows.length - 1];
    const prev = flows[flows.length - 2];
    const nw = netWorth(s.accounts);
    const rw = runwayMonths(s);
    const rate = savingsRate(s.transactions, thisKey);
    const plan = project(s);
    const alerts = openAlerts(detectAnomalies(s));
    const spend = spendByCategory(s.transactions, thisKey);

    const spendRows = Object.entries(spend)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([id, v]) => ({ label: catLabel(id), value: v }));

    const netDelta = delta(cur.net, prev.net, { upIsGood: true });
    const spendDelta = delta(cur.spending, prev.spending, { upIsGood: false });

    /* ------------------------------------------------- the one hero figure */
    const lasts = plan.lastsToEnd;
    const heroValue = lasts ? `Age ${plan.endAge}+` : `Age ${plan.depletionAge}`;
    const heroLine = lasts
      ? `On your current plan, your savings still have ${money(plan.endingBalanceReal)} left in today's money at age ${plan.endAge}.`
      : `On your current plan, savings run out at age ${plan.depletionAge} — that's ${plan.endAge - plan.depletionAge} years short of your plan to age ${plan.endAge}.`;

    root.innerHTML = `
      <div class="demo-note">
        ${ICONS.info}
        <div><strong>This is a working demo with sample data.</strong> Everything you change is saved
        in this browser only — nothing is uploaded, and no real account is ever connected.</div>
      </div>

      <div class="grid cols-4" style="margin-bottom:18px">
        <section class="card span-2" style="display:flex;flex-direction:column;justify-content:center">
          <div class="tile-label">Your money lasts to</div>
          <div class="hero-figure">${heroValue}</div>
          <p style="margin:12px 0 0;color:var(--ink-2);font-size:0.93rem">${esc(heroLine)}</p>
          <div class="row" style="margin-top:16px">
            <a class="btn btn-secondary btn-sm" href="#/scenarios">Try a change</a>
            ${badge(lasts ? 'On track' : 'Needs attention', lasts ? 'good' : 'serious')}
          </div>
        </section>

        ${tile({
          label: 'Net worth',
          value: money(nw.net),
          note: `${money(nw.assets)} in assets · ${money(nw.debts)} in debt`,
        })}

        ${tile({
          label: 'Left over this month',
          value: money(cur.net),
          delta: netDelta.html, deltaTone: netDelta.tone,
          spark: sparkline(flows.map((f) => f.net), { color: SERIES(1) }),
        })}
      </div>

      <div class="grid cols-4" style="margin-bottom:18px">
        ${tile({
          label: 'Spent this month',
          value: money(cur.spending),
          delta: spendDelta.html, deltaTone: spendDelta.tone,
        })}
        ${tile({
          label: 'Cash runway',
          value: `${rw.months.toFixed(1)} mo`,
          note: `${money(rw.cash)} covers ${money(rw.essentials)}/mo of essentials`,
        })}
        ${tile({
          label: 'Savings rate',
          value: pct(rate),
          note: `${money(sum(s.goals, (g) => g.monthly))} a month going to goals`,
        })}
        ${tile({
          label: 'Needs a look',
          value: String(alerts.length),
          note: alerts.length ? 'unusual transactions flagged' : 'nothing unusual right now',
        })}
      </div>

      <div class="grid cols-2" style="margin-bottom:18px">
        ${card('Money in and money out', `
          <div id="flow-chart"></div>
          ${legend([
            { name: 'Money in', color: SERIES(1) },
            { name: 'Money out', color: SERIES(2) },
          ], { line: true })}
          ${tableView(['Month', 'Money in', 'Money out', 'Left over'],
            flows.map((f) => [esc(f.label), money(f.income), money(f.spending),
              `<span class="${f.net < 0 ? 'neg' : 'pos'}">${money(f.net)}</span>`]))}
        `, { sub: 'The last six months. Where the two lines cross matters more than either one alone.' })}

        ${card('Where the money went', `
          <div id="cat-chart"></div>
          ${tableView(['Category', 'Spent this month'],
            spendRows.map((r) => [esc(r.label), money(r.value)]))}
        `, { sub: `This month so far — ${money(cur.spending)} across ${Object.keys(spend).length} categories.` })}
      </div>

      <div class="grid cols-2">
        ${card('Goals', s.goals.map((g) => `
          <div style="margin-bottom:18px">
            <div class="row-between" style="gap:8px">
              <strong style="font-size:0.95rem">${esc(g.name)}</strong>
              <span class="num muted" style="font-size:0.88rem">${money(g.saved)} of ${money(g.target)}</span>
            </div>
            ${meter(g.saved, g.target, {
              labels: [`${Math.round((g.saved / g.target) * 100)}% there`,
                       `${money(g.monthly)}/mo`],
            })}
          </div>`).join(''), {
          sub: 'Contributions tracked against what you set out to save.',
          action: '<a class="btn btn-ghost btn-sm" href="#/goals">Manage goals</a>',
        })}

        ${card('Worth a look', alerts.length ? `
          <div class="stack" style="gap:12px">
            ${dedupe(alerts).slice(0, 3).map((a) => `
              <div class="alert-card sev-${a.severity}" style="padding:14px 16px">
                <div class="row-between" style="gap:10px;align-items:flex-start">
                  <div>
                    <strong style="font-size:0.95rem">${esc(a.title)}</strong>
                    <div class="muted" style="font-size:0.85rem">${fmtDate(a.date)} · ${money(a.amount)}</div>
                  </div>
                  ${badge(a.severity === 'critical' ? 'Check today' : a.severity === 'serious' ? 'Review' : 'Minor', a.severity)}
                </div>
                <p style="margin:9px 0 0;font-size:0.88rem;color:var(--ink-2)">${esc(a.reasons[0].text)}</p>
              </div>`).join('')}
          </div>
          <div style="margin-top:16px"><a class="btn btn-secondary btn-sm" href="#/safety">See all ${alerts.length} alerts</a></div>
        ` : `<p class="muted" style="margin:0">Nothing unusual in the last 45 days. Transactions are re-checked every time you add or import one.</p>`, {
          sub: 'Transactions that didn\'t match your usual pattern.',
        })}
      </div>

      <div class="grid" style="margin-top:18px">
        ${card('The next 30 days', upcoming(s, 30), {
          sub: 'Scheduled income and bills, with the balance that\'s left after each one.',
          action: '<a class="btn btn-ghost btn-sm" href="#/calendar">Open the calendar</a>',
        })}
      </div>
    `;

    lineChart(root.querySelector('#flow-chart'), {
      labels: flows.map((f) => f.label),
      series: [
        { name: 'Money in', values: flows.map((f) => f.income), color: SERIES(1) },
        { name: 'Money out', values: flows.map((f) => f.spending), color: SERIES(2) },
      ],
      height: 220,
    });

    barsH(root.querySelector('#cat-chart'), { rows: spendRows });
  },
};

/** One preview row per merchant, so a duplicated charge doesn't fill the card. */
function dedupe(alerts) {
  const seen = new Set();
  return alerts.filter((a) => {
    const key = `${a.title}|${a.amount}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The next month of scheduled money, with a running balance after each item. */
function upcoming(s, days) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const rows = [];
  const months = [cashflowMonth(s, today.getFullYear(), today.getMonth())];
  const next = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  months.push(cashflowMonth(s, next.getFullYear(), next.getMonth()));

  for (const m of months) {
    for (const d of m.days) {
      if (d.date <= today) continue;
      if ((d.date - today) / 86400000 > days) continue;
      for (const e of d.events) {
        rows.push({ date: d.iso, name: e.name, amount: e.amount, balance: d.balance, short: d.short, tight: d.tight });
      }
    }
  }
  if (!rows.length) {
    return '<p class="muted" style="margin:0">No scheduled income or bills in the next month.</p>';
  }

  const worst = rows.reduce((a, b) => (b.balance < a.balance ? b : a), rows[0]);
  const warn = worst.balance < 500
    ? `<div class="alert-card sev-${worst.balance < 0 ? 'critical' : 'warning'}" style="margin-bottom:16px;padding:14px 16px">
         <strong>${worst.balance < 0 ? 'Shortfall ahead' : 'It gets tight'}</strong>
         <p style="margin:6px 0 0;font-size:0.9rem;color:var(--ink-2)">
           After <em>${esc(worst.name)}</em> on ${fmtDate(worst.date, 'long')}, the balance drops to
           ${money(worst.balance)}. Moving a flexible payment a few days later would clear it.</p>
       </div>`
    : '';

  return warn + `<div class="table-wrap"><table class="data">
    <thead><tr><th>Date</th><th>What</th><th class="r">Amount</th><th class="r">Balance after</th></tr></thead>
    <tbody>${rows.map((r) => `<tr>
      <td class="nowrap">${fmtDate(r.date)}</td>
      <td>${esc(r.name)}</td>
      <td class="r ${r.amount > 0 ? 'pos' : ''}">${money(r.amount, { sign: r.amount > 0 })}</td>
      <td class="r ${r.balance < 0 ? 'neg' : ''}">${money(r.balance)}</td>
    </tr>`).join('')}</tbody></table></div>`;
}
