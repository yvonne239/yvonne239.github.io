// Derived numbers. Nothing here is stored — every figure is recomputed from
// transactions, accounts and the plan, so editing one input updates every view.

import { monthKey, monthLabel, toISO, parseDate, sum, daysInMonth } from './format.js';
import { CAT, catGroup, GROUPS } from './categories.js';

export const CUSHION = 500;   // the balance a checking account shouldn't dip under

export const todayISO = () => toISO(new Date());

export function lastNMonthKeys(n) {
  const out = [];
  const d = new Date();
  d.setDate(1);
  for (let i = n - 1; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

/** Money in, money out and the net, for each of the last `n` months. */
export function monthlyFlows(txns, n = 6) {
  const keys = lastNMonthKeys(n);
  const base = Object.fromEntries(keys.map((k) => [k, { key: k, label: monthLabel(k), income: 0, spending: 0 }]));
  for (const t of txns) {
    const k = monthKey(t.date);
    if (!base[k]) continue;
    if (t.amount > 0) base[k].income += t.amount;
    else base[k].spending += -t.amount;
  }
  return keys.map((k) => ({ ...base[k], net: base[k].income - base[k].spending }));
}

/** Spending per category for one month (or every month when key is omitted). */
export function spendByCategory(txns, key) {
  const out = {};
  for (const t of txns) {
    if (t.amount >= 0) continue;
    if (key && monthKey(t.date) !== key) continue;
    out[t.category] = (out[t.category] || 0) + -t.amount;
  }
  return out;
}

/** Average monthly spend per category over the last `n` complete-ish months. */
export function averageSpend(txns, n = 3) {
  const keys = lastNMonthKeys(n + 1).slice(0, n);   // skip the partial current month
  const totals = {};
  for (const t of txns) {
    if (t.amount >= 0) continue;
    if (!keys.includes(monthKey(t.date))) continue;
    totals[t.category] = (totals[t.category] || 0) + -t.amount;
  }
  return Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, v / n]));
}

/** Budget vs actual for one month, grouped the way budgets are built. */
export function budgetStatus(state, key = monthKey(todayISO())) {
  const spent = spendByCategory(state.transactions, key);
  const rows = Object.entries(state.budgets).map(([id, budget]) => {
    const actual = spent[id] || 0;
    return {
      id, label: CAT[id]?.label || id, group: catGroup(id),
      budget, actual,
      remaining: budget - actual,
      ratio: budget > 0 ? actual / budget : (actual > 0 ? 2 : 0),
    };
  });
  const groups = Object.keys(GROUPS).filter((g) => g !== 'income').map((g) => {
    const items = rows.filter((r) => r.group === g);
    return {
      id: g, label: GROUPS[g].label, blurb: GROUPS[g].blurb, items,
      budget: sum(items, (r) => r.budget),
      actual: sum(items, (r) => r.actual),
    };
  }).filter((g) => g.items.length);
  return {
    rows, groups,
    budget: sum(rows, (r) => r.budget),
    actual: sum(rows, (r) => r.actual),
    unbudgeted: Object.entries(spent)
      .filter(([id]) => !(id in state.budgets))
      .reduce((a, [, v]) => a + v, 0),
  };
}

export function netWorth(accounts) {
  const assets = sum(accounts.filter((a) => a.balance > 0), (a) => a.balance);
  const debts  = sum(accounts.filter((a) => a.balance < 0), (a) => -a.balance);
  return { assets, debts, net: assets - debts };
}

export const investable = (accounts) =>
  sum(accounts.filter((a) => a.type === 'retirement' || a.type === 'investment'), (a) => a.balance);

export const cashOnHand = (accounts) =>
  sum(accounts.filter((a) => a.type === 'cash'), (a) => a.balance);

/**
 * Day-by-day cash-flow for one month.
 *
 * Days up to today use the transactions that actually happened; days after
 * today use the scheduled income and bills. The running balance is the point:
 * it shows a shortfall while there's still time to move something.
 */
export function cashflowMonth(state, year, month) {
  const dim = daysInMonth(year, month);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const monthStart = new Date(year, month, 1);
  const checking = state.accounts.find((a) => a.id === 'checking')?.balance ?? 0;
  const key = `${year}-${String(month + 1).padStart(2, '0')}`;

  // Bills that don't repeat every month only count in the months they fall in.
  const billsIn = (m) => state.bills.filter((b) => !b.months || b.months.includes(m));
  const monthlyIn  = sum(state.income, (i) => i.amount);
  const monthlyOut = sum(billsIn(month), (b) => b.amount);
  const averageOut = sum([...Array(12).keys()], (m) => sum(billsIn(m), (b) => b.amount)) / 12;

  // Rewind (or fast-forward) the live checking balance to the first of the month.
  let opening = checking;
  if (monthStart <= today) {
    const since = state.transactions.filter((t) => {
      const d = parseDate(t.date);
      return d >= monthStart && d <= today;
    });
    opening = checking - sum(since, (t) => t.amount);
  } else {
    const ahead = (year - today.getFullYear()) * 12 + (month - today.getMonth());
    opening = checking + (monthlyIn - averageOut) * ahead;
  }

  const days = [];
  let balance = opening;
  for (let d = 1; d <= dim; d++) {
    const date = new Date(year, month, d);
    const iso = toISO(date);
    const isPast = date <= today;
    let events = [];

    if (isPast) {
      events = state.transactions
        .filter((t) => t.date === iso)
        .map((t) => ({ name: t.desc, amount: t.amount, kind: t.amount > 0 ? 'in' : 'out', actual: true }));
    } else {
      events = [
        ...state.income.filter((i) => Math.min(i.day, dim) === d)
          .map((i) => ({ name: i.name, amount: i.amount, kind: 'in', actual: false })),
        ...billsIn(month).filter((b) => Math.min(b.day, dim) === d)
          .map((b) => ({ name: b.name, amount: -b.amount, kind: 'out', actual: false })),
      ];
    }

    balance += sum(events, (e) => e.amount);
    days.push({
      day: d, iso, date, events, balance,
      isPast, isToday: iso === toISO(today),
      short: balance < 0,
      tight: balance >= 0 && balance < CUSHION,
    });
  }

  const shortfalls = days.filter((d) => d.short && !d.isPast);
  const tight = days.filter((d) => d.tight && !d.isPast);
  return { key, year, month, dim, opening, days, shortfalls, tight, closing: balance, monthlyIn, monthlyOut, averageOut };
}

/** Months of essential spending covered by cash on hand. */
export function runwayMonths(state) {
  const avg = averageSpend(state.transactions, 3);
  const essentials = Object.entries(avg)
    .filter(([id]) => catGroup(id) === 'essentials')
    .reduce((a, [, v]) => a + v, 0);
  const cash = cashOnHand(state.accounts);
  return { months: essentials > 0 ? cash / essentials : 0, essentials, cash };
}

/** Savings rate = everything routed to savings and goals ÷ money in. */
export function savingsRate(txns, key = monthKey(todayISO())) {
  let income = 0, saved = 0;
  for (const t of txns) {
    if (monthKey(t.date) !== key) continue;
    if (t.amount > 0) income += t.amount;
    else if (catGroup(t.category) === 'savings') saved += -t.amount;
  }
  return income > 0 ? saved / income : 0;
}
