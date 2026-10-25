// Spending categories, the groups budgets are built from, and the keyword rules
// that give an imported transaction its first guess at a category.

export const GROUPS = {
  essentials:    { label: 'Essentials',    blurb: 'Housing, food, utilities, health — the bills that keep the lights on.' },
  discretionary: { label: 'Discretionary', blurb: 'Choices you can dial up or down month to month.' },
  debt:          { label: 'Debt payments', blurb: 'Loan and card payments beyond the minimum interest.' },
  savings:       { label: 'Savings',       blurb: 'Money moved out to goals and retirement accounts.' },
  income:        { label: 'Income',        blurb: 'Money arriving.' },
  other:         { label: 'Other',         blurb: 'Transfers and anything that doesn\'t belong under a spending heading.' },
};

/** Order matters only for display; ids are stable. */
export const CATEGORIES = [
  { id: 'housing',      label: 'Housing',                group: 'essentials' },
  { id: 'groceries',    label: 'Groceries',              group: 'essentials' },
  { id: 'utilities',    label: 'Utilities',              group: 'essentials' },
  { id: 'transport',    label: 'Transportation',         group: 'essentials' },
  { id: 'healthcare',   label: 'Healthcare',             group: 'essentials' },
  { id: 'insurance',    label: 'Insurance',              group: 'essentials' },
  { id: 'dining',       label: 'Dining out',             group: 'discretionary' },
  { id: 'shopping',     label: 'Shopping',               group: 'discretionary' },
  { id: 'entertain',    label: 'Entertainment',          group: 'discretionary' },
  { id: 'travel',       label: 'Travel',                 group: 'discretionary' },
  { id: 'personal',     label: 'Personal care',          group: 'discretionary' },
  { id: 'gifts',        label: 'Gifts & family support', group: 'discretionary' },
  { id: 'subscriptions',label: 'Subscriptions',          group: 'discretionary' },
  { id: 'card',         label: 'Credit card payment',    group: 'debt' },
  { id: 'loan',         label: 'Loan payment',           group: 'debt' },
  { id: 'savings',      label: 'Savings transfer',       group: 'savings' },
  { id: 'retirement',   label: 'Retirement contribution',group: 'savings' },
  { id: 'income',       label: 'Income',                 group: 'income' },
  { id: 'transfer',     label: 'Transfer',               group: 'other' },
  { id: 'fees',         label: 'Fees & charges',         group: 'essentials' },
  { id: 'other',        label: 'Other',                  group: 'other' },
  { id: 'uncategorized',label: 'Uncategorized',          group: 'other' },
];

export const CAT = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
export const catLabel = (id) => (CAT[id] ? CAT[id].label : 'Uncategorized');
export const catGroup = (id) => (CAT[id] ? CAT[id].group : 'discretionary');

/**
 * Keyword rules, checked in order. The first match wins, so put the specific
 * phrases above the generic ones.
 */
const RULES = [
  [/payroll|direct dep|salary|pension|annuity|social security|ssa treas|benefit pmt|dividend|interest paid/i, 'income'],
  [/rent|mortgage|hoa |property tax|landlord/i, 'housing'],
  [/safeway|kroger|trader joe|whole foods|aldi|grocer|supermarket|publix|wegmans|food lion|costco|sam's club/i, 'groceries'],
  [/electric|power co|gas co|water dist|sewer|internet|comcast|xfinity|verizon|at&t|t-mobile|utility|waste mgmt/i, 'utilities'],
  [/shell|chevron|exxon|bp |fuel|gas station|uber|lyft|transit|metro|parking|dmv|auto repair|jiffy lube/i, 'transport'],
  [/pharmacy|cvs|walgreens|rite aid|clinic|medical|dental|dr\.|hospital|lab corp|quest diag|optometr|medicare/i, 'healthcare'],
  [/insurance|geico|state farm|allstate|progressive|premium|aflac/i, 'insurance'],
  [/restaurant|cafe|coffee|starbucks|diner|pizza|grill|bistro|taqueria|bakery|doordash|grubhub|bar & /i, 'dining'],
  [/netflix|hulu|spotify|disney\+|prime video|subscription|patreon|audible|nyt |new york times/i, 'subscriptions'],
  [/amazon|target|walmart|macy|kohl|home depot|lowe's|best buy|etsy|ebay|store|outlet|electronics/i, 'shopping'],
  [/cinema|movie|theater|concert|ticketmaster|museum|golf|bowling|casino/i, 'entertain'],
  [/airlines|delta air|united air|southwest|hotel|marriott|hilton|airbnb|expedia|booking\.com|cruise|amtrak/i, 'travel'],
  [/salon|barber|spa |nail |gym|fitness|planet fit|ymca/i, 'personal'],
  [/gift ?card|itunes card|google play card|steam card|prepaid card|reload pack/i, 'other'],
  [/gift|florist|hallmark|venmo to|zelle to|western union|moneygram/i, 'gifts'],
  [/card pmt|credit card payment|visa payment|mastercard pmt|chase card|amex payment/i, 'card'],
  [/loan pmt|student loan|auto loan|sallie mae|nelnet|mortgage pmt/i, 'loan'],
  [/401\(?k\)?|403\(?b\)?|ira contrib|roth|vanguard|fidelity|schwab|brokerage/i, 'retirement'],
  [/transfer to (emergency )?savings?|savings deposit|emergency (fund|savings)|ally bank|marcus/i, 'savings'],
  [/fee|overdraft|service charge|atm surcharge|late charge|foreign txn/i, 'fees'],
  [/transfer/i, 'transfer'],
];

/**
 * Guess a category from the merchant description.
 * Returns { category, confidence, matched } so the review screen can show the
 * user *why* a guess was made — a guess you can't inspect is a guess you can't
 * trust.
 */
export function guessCategory(description, amount = 0) {
  const text = String(description || '');
  for (const [re, category] of RULES) {
    const m = text.match(re);
    if (m) {
      // An inbound amount matched by a spending rule is almost always a refund.
      if (amount > 0 && category !== 'income' && category !== 'transfer') {
        return { category, confidence: 'medium', matched: m[0].trim() };
      }
      return { category, confidence: 'high', matched: m[0].trim() };
    }
  }
  if (amount > 0) return { category: 'income', confidence: 'low', matched: 'positive amount' };
  return { category: 'uncategorized', confidence: 'none', matched: null };
}
