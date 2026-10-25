// Unusual-transaction checks.
//
// Every rule must be able to say, in a sentence a person would actually use,
// *why* it fired and what the number was. A flag you can't explain is a flag
// that trains people to ignore flags.

import { parseDate, median, money, fmtDate } from './format.js';
import { catLabel } from './categories.js';

const SEV_RANK = { warning: 1, serious: 2, critical: 3 };

/**
 * `onlyIfUnusual` marks the methods that are perfectly ordinary in everyday
 * life — sending a relative money on Venmo, say. Those only raise a flag when
 * the payee is also new or the amount is out of character; otherwise the rule
 * would fire on half of a normal month and teach people to ignore it.
 */
const IRREVERSIBLE = [
  { re: /gift\s?card|itunes card|google play card|steam card/i, phrase: 'a gift-card purchase' },
  { re: /wire transfer|wire out|swift|western union|moneygram/i, phrase: 'a wire transfer' },
  { re: /bitcoin|crypto|coinbase|binance|btc atm|usdt/i, phrase: 'a cryptocurrency payment' },
  { re: /tech support|helpdesk|remote support|anydesk|teamviewer/i, phrase: 'a remote tech-support charge' },
  { re: /zelle to|cash app|cashapp|venmo to [a-z]\./i, phrase: 'an instant person-to-person transfer', onlyIfUnusual: true },
  { re: /money order|prepaid card|reload pack|greendot|vanilla/i, phrase: 'a prepaid or reloadable card', onlyIfUnusual: true },
];

/**
 * @returns {Array} alerts, newest and most severe first.
 */
export function detectAnomalies(state, { windowDays = 45 } = {}) {
  const txns = state.transactions;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const cutoff = new Date(today); cutoff.setDate(cutoff.getDate() - windowDays);

  // Baselines built from the whole history, not just the review window.
  const byCategory = {};
  const merchantFirstSeen = {};
  for (const t of txns) {
    if (t.amount < 0) (byCategory[t.category] ||= []).push(-t.amount);
    const m = normalizeMerchant(t.desc);
    if (!merchantFirstSeen[m] || t.date < merchantFirstSeen[m]) merchantFirstSeen[m] = t.date;
  }
  const catMedian = Object.fromEntries(
    Object.entries(byCategory).map(([k, v]) => [k, median(v)]));
  const merchantCount = {};
  for (const t of txns) {
    const m = normalizeMerchant(t.desc);
    merchantCount[m] = (merchantCount[m] || 0) + 1;
  }

  const recent = txns.filter((t) => t.amount < 0 && parseDate(t.date) >= cutoff);
  const alerts = [];

  for (const t of recent) {
    const amt = -t.amount;
    const reasons = [];
    let severity = 'warning';
    const merchant = normalizeMerchant(t.desc);
    const isNewMerchant = merchantCount[merchant] <= 2 && parseDate(merchantFirstSeen[merchant]) >= cutoff;

    // 1 — Payment types that are hard or impossible to reverse.
    for (const rule of IRREVERSIBLE) {
      if (!rule.re.test(t.desc)) continue;
      if (rule.onlyIfUnusual && !isNewMerchant && amt <= 500) continue;
      reasons.push({
        label: 'Hard-to-reverse payment type',
        text: `This looks like ${rule.phrase}. Payments of this kind usually can't be cancelled or recovered once they go through, which is exactly why scammers ask for them.`,
      });
      severity = 'critical';
      break;
    }

    // 2 — Far above the usual for its category. Skipped where the category is
    //     a catch-all, since a median across unrelated things means nothing.
    const med = (t.category === 'uncategorized' || t.category === 'other' || t.category === 'transfer')
      ? 0 : (catMedian[t.category] || 0);
    if (med > 0 && amt > med * 3 && amt > 150) {
      reasons.push({
        label: 'Much larger than usual',
        text: `${money(amt)} is about ${Math.round(amt / med)}× your typical ${catLabel(t.category).toLowerCase()} charge of ${money(med)}.`,
      });
      severity = bump(severity, 'serious');
    }

    // 3 — A merchant that has never appeared before, for real money.
    if (isNewMerchant && amt > 250) {
      reasons.push({
        label: 'First time paying this business',
        text: `${titleCase(t.desc)} hasn't appeared in your history before, and the first charge is ${money(amt)}.`,
      });
      severity = bump(severity, 'serious');
    }

    // 4 — Same merchant, same amount, within three days.
    const dup = txns.find((o) =>
      o.id !== t.id && o.amount === t.amount &&
      normalizeMerchant(o.desc) === merchant &&
      Math.abs(daysBetween(o.date, t.date)) <= 3);
    if (dup) {
      reasons.push({
        label: 'Possible duplicate charge',
        text: dup.date === t.date
          ? `The same ${money(amt)} charge from ${titleCase(t.desc)} appears twice on ${fmtDate(t.date)}. Double billing is common and usually refundable if you catch it early.`
          : `The same ${money(amt)} charge from ${titleCase(t.desc)} also appears on ${fmtDate(dup.date)}. Double billing is common and usually refundable if you catch it early.`,
      });
      severity = bump(severity, 'serious');
    }

    // 5 — Flags carried on the transaction itself.
    if (t.outOfArea) {
      reasons.push({
        label: 'Out-of-area merchant',
        text: 'This was charged by a business outside the area where you normally spend.',
      });
      severity = bump(severity, 'warning');
    }
    if (t.cardNotPresent && amt > 200) {
      reasons.push({
        label: 'Card not physically used',
        text: 'This was an online or over-the-phone charge, where the card itself was never swiped or tapped.',
      });
      severity = bump(severity, 'warning');
    }
    if (/fee|overdraft|surcharge|late charge/i.test(t.desc)) {
      reasons.push({
        label: 'A fee you may be able to avoid',
        text: `A ${money(amt)} fee was charged. Many banks will reverse a first-time fee if you ask.`,
      });
      severity = bump(severity, 'warning');
    }

    if (!reasons.length) continue;

    alerts.push({
      id: `a-${t.id}`,
      txnId: t.id,
      txn: t,
      severity,
      title: titleCase(t.desc),
      amount: amt,
      date: t.date,
      reasons,
      status: t.status || 'none',
      action: ACTIONS[severity],
    });
  }

  return alerts.sort((a, b) =>
    (SEV_RANK[b.severity] - SEV_RANK[a.severity]) || (a.date < b.date ? 1 : -1));
}

const ACTIONS = {
  critical: 'If you did not set this up yourself, call your bank using the number on the back of your card — not a number from an email, text or caller — and ask them to stop or dispute it today.',
  serious:  'Check it against a receipt or statement. If you don\'t recognise it, contact the business first, then your bank.',
  warning:  'Worth a glance. If it looks right, mark it recognised and it will stop appearing here.',
};

function bump(current, next) {
  return SEV_RANK[next] > SEV_RANK[current] ? next : current;
}

/** Strip store numbers and reference codes so "SAFEWAY #2291" groups. */
export function normalizeMerchant(desc) {
  return String(desc)
    .toUpperCase()
    .replace(/#?\d{3,}/g, '')
    .replace(/\b(REF|TXN|ID|AUTH)\b.*/i, '')
    .replace(/[^A-Z& ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function daysBetween(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / 86400000);
}

export function titleCase(s) {
  return String(s).toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase())
    .replace(/\bLlc\b/, 'LLC').replace(/\bPt\b/, 'PT').replace(/\bUsa\b/, 'USA');
}

export const openAlerts = (alerts) => alerts.filter((a) => a.status === 'none' || a.status === 'investigating');
