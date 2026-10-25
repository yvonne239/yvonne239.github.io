// Application state: a plain object, persisted to localStorage, with a tiny
// subscribe/notify loop. Everything in here is demo data generated on the
// device — nothing is sent anywhere.

import { toISO, uid, daysInMonth } from './format.js';
import { guessCategory } from './categories.js';

const KEY = 'foresight.state.v1';
const SCHEMA = 1;

/* ---------------------------------------------------------------- PRNG --- */
/** mulberry32 — a seeded generator, so the demo looks the same on every load. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* -------------------------------------------------------------- Seeding --- */

const RECURRING_INCOME = [
  { name: 'Pension — Northfield Retirement Plan', amount: 1850, day: 1 },
  { name: 'Payroll — Mercer Clinic (part-time)',  amount: 1620, day: 15 },
  { name: 'Payroll — Mercer Clinic (part-time)',  amount: 1620, day: 28 },
];

/**
 * `months` (0 = January) marks the bills that don't arrive every month. Lumpy
 * bills like these are the usual cause of a cash-flow shortfall in an otherwise
 * healthy month, which is exactly what the calendar exists to catch.
 */
const RECURRING_BILLS = [
  { name: 'Mortgage — First Valley Bank',   amount: 1420,  day: 1,  category: 'housing' },
  { name: 'Property Tax — County Assessor', amount: 2180,  day: 12, category: 'housing', months: [4, 10] },
  { name: 'Auto Insurance — 6-month premium', amount: 642, day: 16, category: 'insurance', months: [2, 8] },
  { name: 'Transfer to Emergency Savings',  amount: 400,   day: 2,  category: 'savings' },
  { name: 'Roth IRA Contribution — Fidelity', amount: 500, day: 2,  category: 'retirement' },
  { name: 'Medicare Supplement Premium',    amount: 186,   day: 3,  category: 'healthcare' },
  { name: 'Homeowners Insurance — Allstate', amount: 96,   day: 5,  category: 'insurance' },
  { name: 'YMCA Membership',                amount: 42,    day: 6,  category: 'personal' },
  { name: 'Auto Insurance — Geico',         amount: 128,   day: 8,  category: 'insurance' },
  { name: 'Netflix Subscription',           amount: 17.99, day: 9,  category: 'subscriptions' },
  { name: 'Spotify Premium',                amount: 11.99, day: 11, category: 'subscriptions' },
  { name: 'City Electric Utility',          amount: 138,   day: 12, category: 'utilities', vary: 32 },
  { name: 'Xfinity Internet & Phone',       amount: 94,    day: 14, category: 'utilities' },
  { name: 'Municipal Water District',       amount: 48,    day: 18, category: 'utilities', vary: 9 },
  { name: 'Auto Loan Payment — First Valley', amount: 312, day: 20, category: 'loan' },
  { name: 'Credit Card Payment — Visa',     amount: 450,   day: 22, category: 'card' },
  { name: 'New York Times Subscription',    amount: 4,     day: 25, category: 'subscriptions' },
];

const VARIABLE = [
  { pool: ['SAFEWAY #2291', 'TRADER JOE\'S #412', 'KROGER MARKETPLACE', 'COSTCO WHOLESALE #88'],
    category: 'groceries', perMonth: [5, 8], range: [38, 142] },
  { pool: ['SHELL OIL 574120', 'CHEVRON #9921', 'EXXON MOBIL 4418'],
    category: 'transport', perMonth: [2, 4], range: [34, 62] },
  { pool: ['OLIVE & THYME BISTRO', 'CORNER DINER', 'STARBUCKS STORE 1192', 'LUIGI\'S PIZZA KITCHEN', 'THE BLUE HERON GRILL'],
    category: 'dining', perMonth: [3, 8], range: [12, 78] },
  { pool: ['CVS PHARMACY #3310', 'WALGREENS #7741', 'QUEST DIAGNOSTICS'],
    category: 'healthcare', perMonth: [1, 3], range: [14, 96] },
  { pool: ['AMAZON MKTPLACE', 'TARGET T-2204', 'HOME DEPOT #6612', 'MACY\'S DEPT STORE'],
    category: 'shopping', perMonth: [2, 5], range: [19, 168] },
  { pool: ['REGAL CINEMAS 12', 'CITY ART MUSEUM', 'TICKETMASTER EVENT'],
    category: 'entertain', perMonth: [0, 2], range: [16, 88] },
  { pool: ['CLIPPER CUTS SALON', 'SERENITY NAIL SPA'],
    category: 'personal', perMonth: [0, 2], range: [22, 68] },
  { pool: ['VENMO TO M. ALVAREZ', 'PETALS FLORIST'],
    category: 'gifts', perMonth: [0, 2], range: [25, 220] },
];

/**
 * Transactions that exist to be caught by the safety checks. Offsets are days
 * back from today, so the alerts always sit in the recent window.
 */
const PLANTED = [
  { back: 3,  desc: 'ELECTRONICS OUTLET LLC — ONLINE', amount: -1284.00, cardNotPresent: true, newMerchant: true },
  { back: 5,  desc: 'QUICKCASH GIFT CARD RELOAD',      amount: -500.00,  newMerchant: true },
  { back: 5,  desc: 'QUICKCASH GIFT CARD RELOAD',      amount: -500.00,  newMerchant: true },
  { back: 8,  desc: 'WIRE TRANSFER OUT REF 88241',     amount: -2400.00, newMerchant: true },
  { back: 11, desc: 'SAFEWAY #2291',                   amount: -412.60 },
  { back: 14, desc: 'MERCADO CENTRAL LISBOA PT',       amount: -86.40,   outOfArea: true, newMerchant: true },
  { back: 14, desc: 'FOREIGN TXN FEE',                 amount: -2.59 },
  { back: 17, desc: 'CITY ELECTRIC UTILITY',           amount: -138.00 },
  { back: 16, desc: 'CITY ELECTRIC UTILITY',           amount: -138.00 },
  { back: 22, desc: 'HELPDESK TECH SUPPORT RENEWAL',   amount: -399.00,  newMerchant: true, cardNotPresent: true },
];

function seedTransactions() {
  const rand = rng(20260301);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const out = [];
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const between = ([lo, hi]) => lo + rand() * (hi - lo);

  const push = (date, desc, amount, extra = {}) => {
    if (date > today) return;
    const g = guessCategory(desc, amount);
    out.push({
      id: uid(),
      date: toISO(date),
      desc,
      amount: Math.round(amount * 100) / 100,
      category: g.category,
      confidence: g.confidence,
      account: amount > 0 ? 'checking' : (extra.cardNotPresent ? 'card' : 'checking'),
      reviewed: true,
      status: 'none',
      ...extra,
    });
  };

  // Six whole months back through the current month.
  for (let back = 5; back >= 0; back--) {
    const cursor = new Date(today.getFullYear(), today.getMonth() - back, 1);
    const y = cursor.getFullYear(), m = cursor.getMonth();
    const dim = daysInMonth(y, m);

    for (const inc of RECURRING_INCOME) {
      push(new Date(y, m, Math.min(inc.day, dim)), inc.name, inc.amount);
    }
    for (const bill of RECURRING_BILLS) {
      if (bill.months && !bill.months.includes(m)) continue;
      const jitter = bill.vary ? (rand() - 0.5) * 2 * bill.vary : 0;
      push(new Date(y, m, Math.min(bill.day, dim)), bill.name, -(bill.amount + jitter));
    }
    for (const v of VARIABLE) {
      const n = Math.round(between(v.perMonth));
      for (let i = 0; i < n; i++) {
        const day = 1 + Math.floor(rand() * dim);
        push(new Date(y, m, day), pick(v.pool), -between(v.range));
      }
    }
  }

  for (const p of PLANTED) {
    const d = new Date(today);
    d.setDate(d.getDate() - p.back);
    const { back, desc, amount, ...extra } = p;
    push(d, desc, amount, extra);
  }

  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/* ------------------------------------------------------------ Defaults --- */

function defaultState() {
  const txns = seedTransactions();
  return {
    schema: SCHEMA,
    profile: {
      name: 'Diane Alvarez',
      age: 61,
      retireAge: 66,
      planToAge: 92,
      inflation: 0.026,
      returnPre: 0.050,
      returnPost: 0.042,
    },
    accounts: [
      { id: 'checking',  name: 'Everyday Checking',      type: 'cash',       balance: 2380 },
      { id: 'savings',   name: 'Emergency Savings',      type: 'cash',       balance: 11400 },
      { id: 'ira',       name: 'Rollover IRA',           type: 'retirement', balance: 268500 },
      { id: 'roth',      name: 'Roth IRA',               type: 'retirement', balance: 96200 },
      { id: 'brokerage', name: 'Taxable Brokerage',      type: 'investment', balance: 47800 },
      { id: 'card',      name: 'Visa Credit Card',       type: 'debt',       balance: -2180, apr: 0.2124, minPayment: 62 },
      { id: 'autoloan',  name: 'Auto Loan',              type: 'debt',       balance: -8640, apr: 0.0649, minPayment: 312 },
      { id: 'mortgage',  name: 'Mortgage',               type: 'debt',       balance: -118400, apr: 0.0375, minPayment: 1420 },
    ],
    income: RECURRING_INCOME.map((i) => ({ id: uid(), ...i })),
    bills: RECURRING_BILLS.map((b) => ({ id: uid(), ...b })),
    transactions: txns,
    budgets: {
      housing: 1420, groceries: 620, utilities: 290, transport: 190,
      healthcare: 320, insurance: 224,
      dining: 260, shopping: 280, entertain: 90, travel: 120,
      personal: 110, gifts: 150, subscriptions: 40,
      card: 450, loan: 312,
      savings: 400, retirement: 500,
    },
    goals: [
      { id: uid(), name: 'Emergency fund',        target: 18000, saved: 11400, monthly: 400, kind: 'emergency', due: '' },
      { id: uid(), name: 'Retirement top-up',     target: 60000, saved: 41800, monthly: 500, kind: 'retirement', due: '' },
      { id: uid(), name: 'Trip to Portugal',      target: 6500,  saved: 2150,  monthly: 150, kind: 'travel',    due: '2027-09-01' },
      { id: uid(), name: 'Help with Maya\'s tuition', target: 12000, saved: 4300, monthly: 200, kind: 'family', due: '2028-08-01' },
    ],
    retirement: {
      monthlySpendNow: 4950,
      monthlySpendRetired: 4600,
      pensionMonthly: 1850,
      pensionCola: false,
      ssMonthlyAtFRA: 2340,
      ssFullAge: 67,
      ssClaimAge: 67,
      otherMonthly: 0,
      partTimeMonthly: 0,
      partTimeUntilAge: 70,
      monthlyContribution: 900,
    },
    scenario: null,   // live simulator overrides; null = follow the plan above
    reviewQueue: [],  // transactions imported but not yet confirmed
    dismissedAlerts: [],
    savedChecks: [],
  };
}

/* ---------------------------------------------------------------- Store --- */

let state = load();
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    if (parsed.schema !== SCHEMA) return defaultState();
    return parsed;
  } catch {
    return defaultState();
  }
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* Private browsing, quota, or storage blocked — the app still works,
       it just won't remember across reloads. */
  }
}

export const store = {
  get state() { return state; },

  /** Mutate state inside `fn`, then persist and notify. */
  update(fn) {
    fn(state);
    persist();
    listeners.forEach((l) => l(state));
  },

  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  reset() {
    state = defaultState();
    persist();
    listeners.forEach((l) => l(state));
  },
};

export { defaultState };
