// Scam-awareness checker.
//
// This does NOT decide whether something is a scam. It recognises the patterns
// that show up again and again in financial fraud, names each one in plain
// language, and says what to do next. The judgement stays with the person —
// which is also why every matched signal shows the exact words that matched.

const SIGNALS = [
  {
    id: 'irreversible',
    weight: 4,
    re: /\b(gift ?cards?|itunes card|google play card|steam card|wire transfer|western union|moneygram|money order|bitcoin|crypto(currency)?|btc|usdt|cash app|zelle|prepaid card|reload pack)\b/i,
    label: 'Asks for a payment that can’t be undone',
    text: 'Gift cards, wire transfers, crypto and instant transfers are the methods fraud teams see most, because once the money moves it is almost never recoverable. No real government agency, utility or bank asks to be paid this way.',
  },
  {
    id: 'authority',
    weight: 3,
    re: /\b(IRS|internal revenue|social security (administration|office)|SSA|medicare|medicaid|FBI|sheriff|police department|warrant for your arrest|federal agent|customs|immigration|DMV)\b/i,
    label: 'Claims to be a government agency',
    text: 'Agencies like the IRS, Social Security and Medicare contact people by mail first. They do not call to demand immediate payment, and they never threaten arrest over the phone.',
  },
  {
    id: 'bankfraud',
    weight: 3,
    re: /\b(fraud department|security department|your account (has been|was) (compromised|suspended|locked|frozen)|unauthorized (charge|access|login)|verify your (account|identity)|confirm your (account|identity|card))\b/i,
    label: 'Claims your account is in danger',
    text: 'A warning that your account is compromised creates panic, which is the point. Your bank will never ask you to move money to “keep it safe”, and never needs your full card number, PIN or one-time code.',
  },
  {
    id: 'urgency',
    weight: 2,
    re: /\b(immediately|right away|within (24|48|72) hours|act now|final notice|last warning|expires? (today|tonight|soon)|urgent|time[- ]sensitive|before it'?s too late|don'?t delay)\b/i,
    label: 'Pushes you to act immediately',
    text: 'Artificial deadlines exist to stop you checking with someone else. A genuine bill or refund will still be there tomorrow.',
  },
  {
    id: 'secrecy',
    weight: 4,
    re: /\b(don'?t tell|do not tell|keep (this|it) (secret|confidential|between us)|don'?t discuss|not even your (family|spouse|husband|wife|children)|they'?ll (only )?worry)\b/i,
    label: 'Tells you to keep it secret',
    text: 'Asking you not to tell your family, your bank or the branch teller is one of the strongest single indicators of fraud. There is no legitimate reason for it.',
  },
  {
    id: 'remote',
    weight: 4,
    re: /\b(anydesk|teamviewer|logmein|ultraviewer|remote (access|desktop|session)|install (this|the) (app|program|software)|let me (connect|access)|share your screen|control of your computer)\b/i,
    label: 'Wants access to your device',
    text: 'Remote-access software hands over your screen, your files and any account you open while they are watching. Refuse, then disconnect.',
  },
  {
    id: 'credentials',
    weight: 4,
    re: /\b(one[- ]?time (code|password|passcode)|OTP|verification code|security code|your (PIN|password)|social security number|SSN|full card number|CVV|routing number|account and routing)\b/i,
    label: 'Asks for codes, PINs or account details',
    text: 'A one-time code is the key to your account. Anyone asking you to read one out is trying to get in — including, and especially, someone claiming to be from your bank.',
  },
  {
    id: 'prize',
    weight: 2,
    re: /\b(you'?ve won|you have won|congratulations[!,]|lottery|sweepstakes|prize|unclaimed (funds|money|refund)|overpayment|you are (entitled|owed)|claim your (reward|prize|refund))\b/i,
    label: 'Promises money you weren’t expecting',
    text: 'Winnings and refunds you didn’t apply for are a lure. The tell is what comes next: a fee, a tax, or your bank details “to send the money”.',
  },
  {
    id: 'investment',
    weight: 3,
    re: /\b(guaranteed (return|profit|income)|risk[- ]free|double your money|\d+% (per|a) (day|week|month)|insider|can'?t lose|limited (spots|allocation)|trading (signals|group)|pig butchering)\b/i,
    label: 'Promises returns that can’t be guaranteed',
    text: 'No real investment guarantees a return. Guaranteed-profit pitches, especially ones that arrive through a messaging app or a new online friend, are the standard opening of an investment scam.',
  },
  {
    id: 'family',
    weight: 3,
    re: /\b(grandma|grandpa|grandson|granddaughter|it'?s me|i'?m in (jail|trouble|hospital|an accident)|bail|post bond|arrested|hospital bill|stranded|lost my (wallet|passport|phone))\b/i,
    label: 'Claims a relative is in trouble',
    text: 'The “grandparent scam” relies on fear and a voice that sounds close enough — now often cloned from a few seconds of audio. Hang up and call that family member back on the number you already have.',
  },
  {
    id: 'moveMoney',
    weight: 4,
    re: /\b(move your money|transfer (your )?(funds|money) to (a )?(safe|secure|protective|new) account|safe account|protect your (funds|savings)|withdraw (the )?cash and)\b/i,
    label: 'Tells you to move money to a “safe account”',
    text: 'There is no such thing as a safe account held by your bank’s fraud team or the police. This instruction is fraud, every time, with no exceptions.',
  },
  {
    id: 'staywith',
    weight: 3,
    re: /\b(stay on the (line|phone)|don'?t hang up|keep me on|while you (go|drive) to the bank|tell the (teller|cashier|branch)|if (they|the bank) ask(s)?,? say)\b/i,
    label: 'Coaches you on what to tell the bank',
    text: 'Being told what to say to a teller — or to stay on the line while you withdraw money — means someone is deliberately steering you past the checks designed to protect you.',
  },
  {
    id: 'link',
    weight: 2,
    re: /\b(click (the|this) link|tap the link|follow this link|log ?in (here|below)|update your (details|information)|http:\/\/|bit\.ly|tinyurl|[a-z0-9-]+\.(xyz|top|icu|click|live|shop)\b)/i,
    label: 'Sends you to a link to log in',
    text: 'Links in unexpected messages lead to copied login pages. Reach the site the way you normally would — your own bookmark, or the app — rather than through the message.',
  },
  {
    id: 'unsolicited',
    weight: 1,
    re: /\b(out of the blue|unexpected(ly)?|didn'?t (order|apply|sign up)|never (heard of|contacted)|unknown (number|sender)|wrong number)\b/i,
    label: 'Contact you weren’t expecting',
    text: 'Unexpected contact isn’t proof of anything on its own, but almost every scam starts with it. Treat it as a reason to verify, not to respond.',
  },
];

const LEVELS = [
  { min: 8, key: 'critical', label: 'Strong warning signs',
    summary: 'Several of the patterns here are ones fraud teams treat as near-certain. Do not send money, share codes, or give access.' },
  { min: 4, key: 'serious', label: 'Clear warning signs',
    summary: 'This has more than one hallmark of a scam. Stop and verify through a channel you choose yourself before doing anything else.' },
  { min: 2, key: 'warning', label: 'Some warning signs',
    summary: 'A couple of common pressure tactics showed up. That doesn’t make it a scam, but it does make it worth checking independently.' },
  { min: 1, key: 'warning', label: 'One thing to check',
    summary: 'One pattern matched. Have a look at what it was, and verify before you act if money or account details are involved.' },
  { min: 0, key: 'good', label: 'No common patterns matched',
    summary: 'None of the usual scam patterns appeared in this text. That is reassuring, not proof — scams are rewritten constantly, and a convincing one may use none of these words.' },
];

export const NEXT_STEPS = [
  'Stop. Nothing genuine is lost by waiting an hour.',
  'Hang up or close the message, then make contact yourself — using the number on your card, your own bookmark, or a statement you already had.',
  'Tell one other person before any money moves. Saying it out loud is the single most effective check there is.',
  'Never read out a one-time code, PIN or password, and never let anyone connect to your computer.',
  'If money has already gone, call your bank straight away and ask for the fraud team — speed matters more than certainty.',
];

/**
 * @param {string} text — the message, email or a description of the call.
 * @returns {{score, level, matched, unmatchedCount}}
 */
export function checkMessage(text) {
  const input = String(text || '');
  const matched = [];
  let score = 0;

  for (const s of SIGNALS) {
    const m = input.match(s.re);
    if (!m) continue;
    score += s.weight;
    matched.push({ ...s, phrase: m[0].trim() });
  }

  // Irreversible payment plus any pressure tactic is the classic combination.
  const has = (id) => matched.some((m) => m.id === id);
  if (has('irreversible') && (has('urgency') || has('authority') || has('secrecy'))) score += 2;

  const level = LEVELS.find((l) => score >= l.min);
  return {
    score,
    level,
    matched: matched.sort((a, b) => b.weight - a.weight),
    checked: SIGNALS.length,
  };
}

export const EXAMPLES = [
  {
    name: 'Bank “fraud team” call',
    text: 'This is the fraud department at your bank. We have detected an unauthorized charge of $2,480 on your account. For your protection you need to move your money to a safe account immediately. Please stay on the line while you go to the bank, and if the teller asks, say it is for home repairs. Do not discuss this with anyone, as the investigation is confidential. I will also need the verification code we just sent to your phone.',
  },
  {
    name: 'Grandchild in trouble',
    text: "Grandma it's me, I'm in trouble. I was in an accident and I'm in jail and I need bail money today. Please don't tell Mom and Dad, they'll only worry. My lawyer says the fastest way is gift cards — can you buy $1,500 and read me the numbers right away?",
  },
  {
    name: 'Investment offer',
    text: 'I wanted to share the trading group that changed everything for me. Guaranteed return of 3% per day, completely risk-free, and we only have limited spots left in this allocation. Start with a small crypto deposit and withdraw any time. Click the link below to log in and see your balance grow.',
  },
  {
    name: 'A real utility bill',
    text: 'Your City Electric Utility statement for October is ready. Your balance of $138.00 is due on the 12th. You can view your statement by signing in to your account, or call the number printed on your bill with any questions. Thank you for being a customer.',
  },
];
