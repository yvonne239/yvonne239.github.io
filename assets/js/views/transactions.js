import { store } from '../store.js';
import { money, esc, fmtDate, toISO, uid, monthKey, monthLabel, sum } from '../format.js';
import { CATEGORIES, guessCategory } from '../categories.js';
import { lastNMonthKeys } from '../analytics.js';
import { card, badge, ICONS, empty } from '../ui.js';

/* Filter state lives here, not in the store — it isn't worth persisting. */
const ui = { q: '', cat: 'all', month: 'all', page: 0 };
const PAGE = 40;

export default {
  title: 'Transactions',
  subtitle: 'Bring in transactions from a file, paste them in, or add them by hand — then check that each one landed in the right category.',

  render(root) {
    const s = store.state;
    const queue = s.reviewQueue || [];

    root.innerHTML = `
      ${queue.length ? reviewPanel(queue) : ''}
      <div class="grid cols-2" style="margin-bottom:18px">
        ${card('Import transactions', importPanel(), {
          sub: 'A CSV from your bank, or anything with a date, a description and an amount.',
        })}
        ${card('Add one by hand', manualForm(), {
          sub: 'For cash spending, or anything your bank statement won\'t show.',
        })}
      </div>
      ${card('All transactions', `<div id="txn-table">${table(s)}</div>`, {
        sub: 'Change a category by picking a new one — budgets and reports update straight away.',
      })}
    `;

    wire(root);
  },
};

/* ---------------------------------------------------------------- import --- */

function importPanel() {
  return `
    <label class="btn btn-secondary" style="width:100%;cursor:pointer" for="csv-file">
      ${ICONS.upload} Choose a CSV file
    </label>
    <input id="csv-file" type="file" accept=".csv,.txt,text/csv,text/plain" class="visually-hidden">
    <p class="field-hint" style="margin:10px 0 16px">
      The file is read in your browser. It is never uploaded.
      <button class="btn btn-ghost btn-sm" data-act="sample" style="padding:0 4px;min-height:auto">Download a sample file</button>
    </p>
    <label class="field">
      <span>Or paste rows here</span>
      <textarea id="csv-paste" data-focus-key="csv-paste" placeholder="2026-10-14, SAFEWAY #2291, -62.40&#10;2026-10-15, PAYROLL DEPOSIT, 1620.00" spellcheck="false"></textarea>
    </label>
    <button class="btn" data-act="parse-paste">Read these rows</button>
    <p id="import-msg" class="field-hint" role="status" style="margin-top:10px"></p>`;
}

function reviewPanel(queue) {
  const low = queue.filter((t) => t.confidence === 'low' || t.confidence === 'none').length;
  return `<section class="card" style="margin-bottom:18px;border-color:var(--accent)">
    <div class="card-head">
      <h3>Review ${queue.length} imported transaction${queue.length === 1 ? '' : 's'}</h3>
      <div class="row">
        <button class="btn btn-secondary btn-sm" data-act="discard-queue">Discard</button>
        <button class="btn btn-sm" data-act="accept-queue">Add all ${queue.length}</button>
      </div>
    </div>
    <p class="card-sub">Each one has been given a category from its description.
      ${low ? `${low} couldn't be matched confidently — those are marked.` : 'Change any that look wrong before adding them.'}</p>
    <div class="table-wrap"><table class="data">
      <thead><tr><th>Date</th><th>Description</th><th class="r">Amount</th><th>Category</th><th>Why</th><th></th></tr></thead>
      <tbody>
        ${queue.map((t) => `<tr>
          <td class="nowrap">${fmtDate(t.date)}</td>
          <td>${esc(t.desc)}</td>
          <td class="r ${t.amount > 0 ? 'pos' : ''}">${money(t.amount, { cents: true, sign: t.amount > 0 })}</td>
          <td>${catSelect(t.category, t.id, 'queue')}</td>
          <td>${confidenceCell(t)}</td>
          <td class="r"><button class="btn btn-ghost btn-sm" data-act="drop-queued" data-id="${t.id}" aria-label="Remove ${esc(t.desc)}">Remove</button></td>
        </tr>`).join('')}
      </tbody>
    </table></div>
  </section>`;
}

function confidenceCell(t) {
  if (t.confidence === 'high')   return badge(`matched “${esc(t.matched || '')}”`, 'good');
  if (t.confidence === 'medium') return badge('likely a refund', 'warning');
  if (t.confidence === 'low')    return badge('guessed from the amount', 'warning');
  return badge('no match — please pick', 'serious');
}

/* ---------------------------------------------------------------- manual --- */

function manualForm() {
  return `<form id="manual-form" autocomplete="off">
    <div class="grid cols-2" style="gap:0 14px">
      <label class="field"><span>Date</span>
        <input type="date" name="date" value="${toISO(new Date())}" required></label>
      <label class="field"><span>Amount</span>
        <input type="number" name="amount" step="0.01" placeholder="42.80" required inputmode="decimal">
        <span class="field-hint">Money spent. Tick below if it came in.</span></label>
    </div>
    <label class="field"><span>Description</span>
      <input type="text" name="desc" placeholder="Hardware store" required></label>
    <label class="field"><span>Category</span>
      <select name="category">${CATEGORIES.map((c) =>
        `<option value="${c.id}">${esc(c.label)}</option>`).join('')}</select></label>
    <label class="row" style="margin-bottom:16px;font-size:0.92rem;gap:8px">
      <input type="checkbox" name="incoming" style="width:20px;height:20px;min-height:0">
      <span>This was money coming in</span></label>
    <button class="btn" type="submit">${ICONS.plus} Add transaction</button>
    <p id="manual-msg" class="field-hint" role="status" style="margin-top:10px"></p>
  </form>`;
}

/* ----------------------------------------------------------------- table --- */

function catSelect(value, id, scope) {
  const groups = {};
  for (const c of CATEGORIES) (groups[c.group] ||= []).push(c);
  return `<select class="cat-select" data-act="set-cat" data-scope="${scope}" data-id="${id}"
      data-focus-key="cat-${scope}-${id}" aria-label="Category"
      style="min-height:36px;padding:5px 8px;font-size:0.86rem;width:auto;max-width:190px">
    ${Object.entries(groups).map(([g, cs]) => `<optgroup label="${esc(g)}">
      ${cs.map((c) => `<option value="${c.id}"${c.id === value ? ' selected' : ''}>${esc(c.label)}</option>`).join('')}
    </optgroup>`).join('')}
  </select>`;
}

function filtered(s) {
  const q = ui.q.trim().toLowerCase();
  return s.transactions.filter((t) => {
    if (ui.cat !== 'all' && t.category !== ui.cat) return false;
    if (ui.month !== 'all' && monthKey(t.date) !== ui.month) return false;
    if (q && !t.desc.toLowerCase().includes(q)) return false;
    return true;
  });
}

function table(s) {
  const rows = filtered(s);
  const months = lastNMonthKeys(6).reverse();
  const shown = rows.slice(0, (ui.page + 1) * PAGE);
  const totalOut = sum(rows.filter((t) => t.amount < 0), (t) => -t.amount);
  const totalIn = sum(rows.filter((t) => t.amount > 0), (t) => t.amount);

  return `
    <div class="row" style="margin-bottom:16px;gap:10px">
      <label style="flex:1 1 220px;max-width:320px">
        <span class="visually-hidden">Search descriptions</span>
        <input type="search" id="txn-search" data-focus-key="txn-search" placeholder="Search descriptions…" value="${esc(ui.q)}">
      </label>
      <label style="flex:0 1 190px">
        <span class="visually-hidden">Filter by category</span>
        <select id="txn-cat" data-focus-key="txn-cat">
          <option value="all">All categories</option>
          ${CATEGORIES.map((c) => `<option value="${c.id}"${ui.cat === c.id ? ' selected' : ''}>${esc(c.label)}</option>`).join('')}
        </select>
      </label>
      <label style="flex:0 1 170px">
        <span class="visually-hidden">Filter by month</span>
        <select id="txn-month" data-focus-key="txn-month">
          <option value="all">All months</option>
          ${months.map((m) => `<option value="${m}"${ui.month === m ? ' selected' : ''}>${esc(monthLabel(m, 'long'))}</option>`).join('')}
        </select>
      </label>
      ${(ui.q || ui.cat !== 'all' || ui.month !== 'all')
        ? '<button class="btn btn-ghost btn-sm" data-act="clear-filters">Clear</button>' : ''}
    </div>

    <p class="card-sub" style="margin:0 0 12px">
      ${rows.length.toLocaleString()} transaction${rows.length === 1 ? '' : 's'} ·
      ${money(totalOut)} out · ${money(totalIn)} in
    </p>

    ${rows.length === 0 ? empty('Nothing matches those filters.') : `
    <div class="table-wrap"><table class="data">
      <thead><tr><th>Date</th><th>Description</th><th>Category</th><th class="r">Amount</th></tr></thead>
      <tbody>${shown.map((t) => `<tr>
        <td class="nowrap">${fmtDate(t.date)}</td>
        <td>${esc(t.desc)}${t.status === 'investigating' ? ' ' + badge('being checked', 'serious') : ''}${t.status === 'recognized' ? ' ' + badge('recognised', 'good') : ''}</td>
        <td>${catSelect(t.category, t.id, 'txn')}</td>
        <td class="r ${t.amount > 0 ? 'pos' : ''}">${money(t.amount, { cents: true, sign: t.amount > 0 })}</td>
      </tr>`).join('')}</tbody>
    </table></div>
    ${shown.length < rows.length
      ? `<div style="margin-top:16px;text-align:center"><button class="btn btn-secondary btn-sm" data-act="more">Show ${Math.min(PAGE, rows.length - shown.length)} more</button></div>`
      : ''}`}
  `;
}

/* ----------------------------------------------------------------- wiring --- */

function wire(root) {
  const refreshTable = () => {
    const host = root.querySelector('#txn-table');
    if (host) host.innerHTML = table(store.state);
  };

  root.addEventListener('input', (e) => {
    if (e.target.id === 'txn-search') { ui.q = e.target.value; ui.page = 0; refreshTable(); restore(root, 'txn-search'); }
  });

  root.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'txn-cat')   { ui.cat = t.value; ui.page = 0; refreshTable(); restore(root, 'txn-cat'); }
    if (t.id === 'txn-month') { ui.month = t.value; ui.page = 0; refreshTable(); restore(root, 'txn-month'); }

    if (t.dataset.act === 'set-cat') {
      const { id, scope } = t.dataset;
      const value = t.value;
      store.update((s) => {
        const list = scope === 'queue' ? s.reviewQueue : s.transactions;
        const item = list.find((x) => x.id === id);
        if (item) { item.category = value; item.confidence = 'user'; item.matched = 'you chose this'; }
      });
    }

    if (t.id === 'csv-file' && t.files && t.files[0]) {
      const file = t.files[0];
      file.text().then((text) => ingest(root, text, file.name)).catch(() =>
        msg(root, '#import-msg', 'That file could not be read.', true));
    }
  });

  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;

    if (act === 'more') { ui.page++; refreshTable(); }
    if (act === 'clear-filters') { ui.q = ''; ui.cat = 'all'; ui.month = 'all'; ui.page = 0; refreshTable(); }
    if (act === 'sample') downloadSample();
    if (act === 'parse-paste') {
      const text = root.querySelector('#csv-paste').value;
      if (!text.trim()) return msg(root, '#import-msg', 'Paste some rows first.', true);
      ingest(root, text, 'pasted rows');
    }
    if (act === 'drop-queued') {
      store.update((s) => { s.reviewQueue = s.reviewQueue.filter((x) => x.id !== btn.dataset.id); });
    }
    if (act === 'discard-queue') {
      store.update((s) => { s.reviewQueue = []; });
    }
    if (act === 'accept-queue') {
      store.update((s) => {
        const incoming = s.reviewQueue.map((t) => ({ ...t, reviewed: true, status: 'none' }));
        s.transactions = [...incoming, ...s.transactions]
          .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
        s.reviewQueue = [];
      });
    }
  });

  const form = root.querySelector('#manual-form');
  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const raw = Math.abs(Number(f.get('amount')));
    if (!Number.isFinite(raw) || raw === 0) return msg(root, '#manual-msg', 'Enter an amount.', true);
    const incoming = f.get('incoming') === 'on';
    const txn = {
      id: uid(),
      date: String(f.get('date')) || toISO(new Date()),
      desc: String(f.get('desc')).trim(),
      amount: incoming ? raw : -raw,
      category: String(f.get('category')),
      confidence: 'user',
      account: 'checking',
      reviewed: true,
      status: 'none',
    };
    store.update((s) => {
      s.transactions = [txn, ...s.transactions]
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    });
  });
}

function restore(root, key) {
  const el = root.querySelector(`[data-focus-key="${key}"]`);
  if (!el) return;
  el.focus();
  if (el.setSelectionRange && el.type === 'search') {
    const n = el.value.length;
    try { el.setSelectionRange(n, n); } catch { /* not all inputs allow it */ }
  }
}

function msg(root, sel, text, isError) {
  const el = root.querySelector(sel);
  if (!el) return;
  el.textContent = text;
  el.style.color = isError ? 'var(--critical)' : 'var(--good-text)';
}

/* -------------------------------------------------------------- CSV parse --- */

export function parseCSV(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',' || c === '\t') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const DATE_COL = /^(date|posted|post date|transaction date|trans date|date posted)$/i;
const DESC_COL = /^(description|desc|merchant|payee|name|details|memo|transaction)$/i;
const AMT_COL  = /^(amount|amt|value|transaction amount)$/i;
const DEBIT_COL = /^(debit|withdrawal|withdrawals|money out|paid out)$/i;
const CREDIT_COL = /^(credit|deposit|deposits|money in|paid in)$/i;

function parseAmount(raw) {
  let s = String(raw).trim().replace(/[$£€,\s]/g, '');
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (s.startsWith('-')) { neg = true; s = s.slice(1); }
  if (s.startsWith('+')) s = s.slice(1);
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

function parseAnyDate(raw) {
  const s = String(raw).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) {
    let [, a, b, y] = m;
    if (y.length === 2) y = String(2000 + Number(y));
    return `${y}-${pad(a)}-${pad(b)}`;          // US order: month first
  }
  const d = new Date(s);
  if (!isNaN(d)) return toISO(d);
  return null;
}
const pad = (n) => String(n).padStart(2, '0');

/** Turn parsed rows into review-queue items, guessing the column layout. */
export function rowsToTransactions(rows) {
  if (!rows.length) return { items: [], skipped: 0 };
  const head = rows[0].map((h) => h.trim());
  const looksLikeHeader = head.some((h) => DATE_COL.test(h) || DESC_COL.test(h) || AMT_COL.test(h));
  const body = looksLikeHeader ? rows.slice(1) : rows;

  let iDate = 0, iDesc = 1, iAmt = 2, iDebit = -1, iCredit = -1;
  if (looksLikeHeader) {
    head.forEach((h, i) => {
      if (DATE_COL.test(h)) iDate = i;
      else if (DESC_COL.test(h)) iDesc = i;
      else if (AMT_COL.test(h)) iAmt = i;
      else if (DEBIT_COL.test(h)) iDebit = i;
      else if (CREDIT_COL.test(h)) iCredit = i;
    });
    if (iDebit >= 0 || iCredit >= 0) iAmt = -1;
  }

  const items = [];
  let skipped = 0;
  for (const r of body) {
    const date = parseAnyDate(r[iDate] ?? '');
    const desc = String(r[iDesc] ?? '').trim();
    let amount = null;
    if (iAmt >= 0) amount = parseAmount(r[iAmt] ?? '');
    else {
      const d = iDebit >= 0 ? parseAmount(r[iDebit] ?? '') : null;
      const c = iCredit >= 0 ? parseAmount(r[iCredit] ?? '') : null;
      if (d) amount = -Math.abs(d);
      else if (c) amount = Math.abs(c);
    }
    if (!date || !desc || amount === null || amount === 0) { skipped++; continue; }
    const g = guessCategory(desc, amount);
    items.push({
      id: uid(), date, desc,
      amount: Math.round(amount * 100) / 100,
      category: g.category, confidence: g.confidence, matched: g.matched,
      account: 'checking', reviewed: false, status: 'none',
    });
  }
  items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return { items, skipped };
}

function ingest(root, text, source) {
  const { items, skipped } = rowsToTransactions(parseCSV(text));
  if (!items.length) {
    return msg(root, '#import-msg',
      `Nothing readable in ${source}. Each row needs a date, a description and an amount.`, true);
  }
  store.update((s) => { s.reviewQueue = items; });
  msg(root, '#import-msg',
    `Read ${items.length} transaction${items.length === 1 ? '' : 's'} from ${source}${skipped ? ` — ${skipped} row${skipped === 1 ? '' : 's'} skipped` : ''}. Review them above.`);
}

function downloadSample() {
  const today = new Date();
  const d = (back) => {
    const x = new Date(today); x.setDate(x.getDate() - back); return toISO(x);
  };
  const csv = [
    'Date,Description,Amount',
    `${d(1)},SAFEWAY #2291,-62.40`,
    `${d(2)},SHELL OIL 574120,-48.15`,
    `${d(3)},PAYROLL DEPOSIT MERCER CLINIC,1620.00`,
    `${d(4)},"OLIVE & THYME BISTRO",-54.80`,
    `${d(5)},CITY ELECTRIC UTILITY,-141.22`,
    `${d(6)},AMAZON MKTPLACE,-31.99`,
    `${d(7)},CVS PHARMACY #3310,-24.60`,
    `${d(8)},QUICKCASH GIFT CARD RELOAD,-500.00`,
    `${d(9)},TRANSFER TO SAVINGS,-400.00`,
    `${d(10)},NETFLIX SUBSCRIPTION,-17.99`,
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'runway-sample-transactions.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
