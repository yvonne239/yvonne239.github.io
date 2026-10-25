// Year-by-year retirement projection.
//
// The model is deliberately simple and legible: one balance, one return rate,
// one inflation rate, income sources netted against an inflating spending need.
// Every assumption is a named input the user can change — a projection whose
// workings you can't see isn't worth trusting.

import { clamp } from './format.js';

/**
 * US Social Security claiming adjustment: roughly −6.67%/yr for the first three
 * years early, −5%/yr beyond that, and +8%/yr for each year delayed past full
 * retirement age up to 70.
 */
export function ssClaimFactor(claimAge, fullAge) {
  if (claimAge === fullAge) return 1;
  if (claimAge < fullAge) {
    const months = Math.round((fullAge - claimAge) * 12);
    const first36 = Math.min(months, 36);
    const rest = Math.max(0, months - 36);
    return Math.max(0.5, 1 - first36 * (5 / 9) / 100 - rest * (5 / 12) / 100);
  }
  const months = Math.round(Math.min(claimAge, 70) - fullAge) * 12;
  return 1 + months * (2 / 3) / 100;
}

/**
 * Run the plan. `over` lets the scenario simulator override any input without
 * touching the saved plan.
 *
 * Returns one row per year plus the headline findings.
 */
export function project(state, over = {}) {
  const p = { ...state.profile, ...over };
  const r = { ...state.retirement, ...over };

  const startAge = Math.round(p.age);
  const endAge   = Math.round(p.planToAge);
  const retire   = Math.round(p.retireAge);
  const infl     = p.inflation;
  const thisYear = new Date().getFullYear();

  let balance = state.accounts
    .filter((a) => a.type === 'retirement' || a.type === 'investment')
    .reduce((a, b) => a + b.balance, 0);

  const ssAnnualBase = r.ssMonthlyAtFRA * 12 * ssClaimFactor(r.ssClaimAge, r.ssFullAge);
  const rows = [];
  let depletionAge = null;
  let firstRetired = null;

  for (let age = startAge; age <= endAge; age++) {
    const n = age - startAge;                    // years of inflation so far
    const infFactor = Math.pow(1 + infl, n);
    const opening = balance;
    const retired = age >= retire;

    let contributions = 0, need = 0, pension = 0, ss = 0, partTime = 0, other = 0, withdrawal = 0;

    if (!retired) {
      contributions = r.monthlyContribution * 12;
      balance = balance * (1 + p.returnPre) + contributions;
    } else {
      need    = r.monthlySpendRetired * 12 * infFactor;
      pension = r.pensionMonthly * 12 * (r.pensionCola ? infFactor : 1);
      ss      = age >= r.ssClaimAge ? ssAnnualBase * infFactor : 0;
      partTime = age < r.partTimeUntilAge ? r.partTimeMonthly * 12 * infFactor : 0;
      other   = r.otherMonthly * 12 * infFactor;

      const gap = need - (pension + ss + partTime + other);
      withdrawal = Math.max(0, gap);
      const surplus = Math.max(0, -gap);

      balance = Math.max(0, balance - withdrawal + surplus) * (1 + p.returnPost);

      if (firstRetired === null) {
        firstRetired = {
          age, need, pension, ss, partTime, other, withdrawal, opening,
          guaranteed: pension + ss + partTime + other,
        };
      }
      if (balance <= 0 && depletionAge === null && withdrawal > 0) depletionAge = age;
    }

    rows.push({
      age, year: thisYear + n, opening, closing: balance, retired,
      contributions, need, pension, ss, partTime, other, withdrawal,
      guaranteed: pension + ss + partTime + other,
      // Real (today's-dollars) view, so the numbers stay comprehensible.
      closingReal: balance / infFactor,
      needReal: need / infFactor,
    });
  }

  const atRetirement = rows.find((x) => x.age === retire) || rows[rows.length - 1];
  const firstYear = firstRetired;
  const coverage = firstYear && firstYear.need > 0
    ? (firstYear.pension + firstYear.ss + firstYear.partTime + firstYear.other) / firstYear.need
    : 1;
  const initialRate = firstYear && firstYear.opening > 0
    ? firstYear.withdrawal / firstYear.opening
    : 0;

  // The first year alone can be misleading — a gap before Social Security
  // starts makes it spike — so also report the first five retired years.
  const earlyYears = rows.filter((x) => x.retired).slice(0, 5);
  const earlyRate = earlyYears.length
    ? earlyYears.reduce((a, x) => a + (x.opening > 0 ? x.withdrawal / x.opening : 0), 0) / earlyYears.length
    : 0;

  return {
    rows,
    depletionAge,
    lastsToEnd: depletionAge === null,
    yearsOfMoney: depletionAge === null ? endAge - retire : depletionAge - retire,
    balanceAtRetirement: atRetirement ? atRetirement.opening : 0,
    endingBalance: rows[rows.length - 1]?.closing ?? 0,
    endingBalanceReal: rows[rows.length - 1]?.closingReal ?? 0,
    firstYear,
    coverage: clamp(coverage, 0, 4),
    initialRate,
    earlyRate,
    retire, startAge, endAge,
  };
}

/**
 * How much the plan would need to change to last to `planToAge`. Returns the
 * monthly shortfall in today's dollars, which is the number people can act on.
 */
export function shortfallPerMonth(state, over = {}) {
  const base = project(state, over);
  if (base.lastsToEnd) return 0;

  // Bisect on retirement spending until the money lasts.
  const spend = { ...state.retirement, ...over }.monthlySpendRetired;
  let lo = 0, hi = spend;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (project(state, { ...over, monthlySpendRetired: mid }).lastsToEnd) lo = mid;
    else hi = mid;
  }
  return Math.max(0, spend - lo);
}
