import { store } from '../store.js';
import { money, esc, fmtDate } from '../format.js';
import { detectAnomalies } from '../anomalies.js';
import { checkMessage, EXAMPLES, NEXT_STEPS } from '../scam.js';
import { card, badge, ICONS, sevIcon } from '../ui.js';

const ui = { filter: 'open' };

const SEV_LABEL = { critical: 'Check today', serious: 'Worth reviewing', warning: 'Minor' };

export default {
  title: 'Financial safety',
  subtitle: 'Transactions that didn\'t fit your usual pattern, explained in plain terms — plus a place to check a message or a call before you act on it.',

  render(root) {
    const s = store.state;
    const alerts = detectAnomalies(s);
    const counts = {
      open: alerts.filter((a) => a.status === 'none').length,
      investigating: alerts.filter((a) => a.status === 'investigating').length,
      recognized: alerts.filter((a) => a.status === 'recognized').length,
      critical: alerts.filter((a) => a.status === 'none' && a.severity === 'critical').length,
    };

    const shown = alerts.filter((a) =>
      ui.filter === 'all' ? true
      : ui.filter === 'open' ? a.status === 'none'
      : a.status === ui.filter);

    root.innerHTML = `
      <div class="grid cols-4" style="margin-bottom:18px">
        <section class="card">
          <div class="tile-label">Needs your review</div>
          <div class="tile-value num">${counts.open}</div>
          <div class="tile-delta ${counts.critical ? 'neg' : 'muted'}">
            ${counts.critical ? `${counts.critical} worth a call to your bank today` : 'nothing urgent'}
          </div>
        </section>
        <section class="card">
          <div class="tile-label">Being checked</div>
          <div class="tile-value num">${counts.investigating}</div>
          <div class="tile-delta muted">marked as needing investigation</div>
        </section>
        <section class="card">
          <div class="tile-label">Recognised</div>
          <div class="tile-value num">${counts.recognized}</div>
          <div class="tile-delta muted">confirmed as yours</div>
        </section>
        <section class="card">
          <div class="tile-label">Checked against</div>
          <div class="tile-value num">${s.transactions.length}</div>
          <div class="tile-delta muted">transactions, re-checked on every change</div>
        </section>
      </div>

      ${card('Unusual transactions', `
        <div class="chips" style="margin-bottom:18px">
          ${[['open', `Needs review (${counts.open})`],
             ['investigating', `Being checked (${counts.investigating})`],
             ['recognized', `Recognised (${counts.recognized})`],
             ['all', `All (${alerts.length})`]]
            .map(([v, l]) => `<button class="chip" data-act="filter" data-v="${v}" aria-pressed="${ui.filter === v}">${esc(l)}</button>`).join('')}
        </div>
        ${shown.length ? `<div class="stack">${shown.map(alertCard).join('')}</div>`
          : `<p class="muted" style="margin:0">${ui.filter === 'open'
              ? 'Nothing is waiting for review. Anything newly flagged will appear here.'
              : 'Nothing in this list yet.'}</p>`}
      `, { sub: 'Each flag says exactly what triggered it. You decide what it means.' })}

      <div class="grid cols-2" style="margin-top:18px;align-items:start">
        ${card('Scam-awareness checker', `
          <p style="margin:0 0 16px;font-size:0.94rem;color:var(--ink-2)">
            Paste a text message or email, or type out what someone said on the phone.
            This looks for the patterns that show up again and again in financial fraud and names each one.
            It does not decide for you — and nothing you type leaves this page.</p>
          <label class="field">
            <span class="visually-hidden">Message to check</span>
            <textarea id="scam-input" data-focus-key="scam-input" rows="7" spellcheck="false"
              placeholder="Paste the message here, or describe the call…"></textarea>
          </label>
          <div class="row" style="margin-bottom:16px">
            <button class="btn" data-act="check">${ICONS.search} Check this message</button>
            <button class="btn btn-ghost btn-sm" data-act="clear-check">Clear</button>
          </div>
          <div class="row" style="gap:8px;margin-bottom:6px">
            <span class="muted" style="font-size:0.86rem">Or try an example:</span>
          </div>
          <div class="chips">
            ${EXAMPLES.map((x, i) => `<button class="chip" data-act="example" data-i="${i}">${esc(x.name)}</button>`).join('')}
          </div>
          <div id="scam-result" aria-live="polite"></div>
        `, { sub: 'Check before you act, not after.' })}

        ${card('If something has already happened', `
          <ol class="signal-list" style="counter-reset:none">
            ${NEXT_STEPS.map((t) => `<li>${ICONS.check}<span>${esc(t)}</span></li>`).join('')}
          </ol>
          <div class="disclosure" style="margin-top:18px">
            <strong>Where to report it.</strong> In the US, the FTC takes reports at reportfraud.ftc.gov and
            identity theft at identitytheft.gov; suspected elder financial abuse can go to Adult Protective
            Services or the National Elder Fraud Hotline on 833-372-8311. Your bank's fraud line is on the
            back of your card. Reporting is worth doing even when the money is gone — it is often how
            a pattern gets stopped for someone else.
          </div>
        `, { sub: 'Acting quickly matters more than being certain.' })}
      </div>
    `;

    wire(root);
  },
};

function alertCard(a) {
  const resolved = a.status === 'recognized';
  return `<article class="alert-card sev-${resolved ? 'good' : a.severity} ${resolved ? 'is-resolved' : ''}">
    <div class="row-between" style="align-items:flex-start;gap:12px">
      <div>
        <h4 style="font-size:1.02rem">${esc(a.title)}</h4>
        <div class="muted num" style="font-size:0.88rem;margin-top:3px">
          ${fmtDate(a.date, 'long')} · ${money(a.amount)}
        </div>
      </div>
      <div class="row" style="gap:7px">
        ${a.status === 'recognized' ? badge('recognised by you', 'good')
          : a.status === 'investigating' ? badge('being checked', 'serious')
          : badge(SEV_LABEL[a.severity], a.severity)}
      </div>
    </div>

    <div class="alert-why">
      <strong>Why this was flagged</strong>
      <ul style="margin:8px 0 0;padding-left:18px">
        ${a.reasons.map((r) => `<li style="margin-bottom:5px"><strong>${esc(r.label)}.</strong> ${esc(r.text)}</li>`).join('')}
      </ul>
    </div>

    ${a.status === 'none' ? `<p style="margin:0 0 14px;font-size:0.91rem;color:var(--ink-2)">${esc(a.action)}</p>` : ''}

    <div class="row" style="gap:9px">
      ${a.status === 'none' ? `
        <button class="btn btn-secondary btn-sm" data-act="recognize" data-id="${a.txnId}">${ICONS.check} I recognise this</button>
        <button class="btn btn-sm" data-act="investigate" data-id="${a.txnId}">This needs investigating</button>`
      : `<span class="muted" style="font-size:0.88rem">
           ${a.status === 'recognized' ? 'Marked as yours — it won\'t be flagged again.' : 'Flagged for investigation.'}
         </span>
         <button class="btn btn-ghost btn-sm" data-act="unmark" data-id="${a.txnId}">Undo</button>`}
    </div>

    ${a.status === 'investigating' ? `<div class="alert-why" style="margin:14px 0 0;border-left:3px solid var(--serious)">
      <strong>What to do next</strong>
      <ol style="margin:8px 0 0;padding-left:18px;font-size:0.9rem">
        <li style="margin-bottom:5px">Call your bank on the number printed on your card — never a number from a message.</li>
        <li style="margin-bottom:5px">Ask them to block the card and dispute the charge. For a card payment you generally have 60 days from the statement to dispute.</li>
        <li>Write down the date, the time and who you spoke to. It makes the follow-up far easier.</li>
      </ol>
    </div>` : ''}
  </article>`;
}

/* ------------------------------------------------------------- checker --- */

function renderCheck(root, text) {
  const host = root.querySelector('#scam-result');
  if (!text.trim()) { host.innerHTML = ''; return; }

  const res = checkMessage(text);
  const lvl = res.level;

  host.innerHTML = `
    <div class="alert-card sev-${lvl.key}" style="margin-top:20px">
      <div class="row" style="gap:10px;align-items:center">
        ${sevIcon(lvl.key)}
        <h4 style="font-size:1.05rem">${esc(lvl.label)}</h4>
        ${badge(`${res.matched.length} of ${res.checked} patterns matched`, lvl.key)}
      </div>
      <p style="margin:12px 0 0;font-size:0.94rem;color:var(--ink-2)">${esc(lvl.summary)}</p>

      ${res.matched.length ? `
        <h5 style="margin:18px 0 10px;font-size:0.88rem;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)">
          What matched</h5>
        <ul class="signal-list">
          ${res.matched.map((m) => `<li>
            ${ICONS.alert}
            <span><b>${esc(m.label)}</b>
              ${esc(m.text)}
              <span class="muted" style="display:block;margin-top:6px;font-size:0.85rem">
                Matched the words: “${esc(m.phrase)}”</span>
            </span></li>`).join('')}
        </ul>` : ''}

      <h5 style="margin:18px 0 10px;font-size:0.88rem;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)">
        What to do</h5>
      <ul class="signal-list">
        ${NEXT_STEPS.slice(0, res.matched.length ? 5 : 2).map((t) =>
          `<li>${ICONS.check}<span>${esc(t)}</span></li>`).join('')}
      </ul>

      <p class="field-hint" style="margin-top:16px">
        This checker recognises known patterns in the words you give it. A convincing scam may use none of
        them, and a legitimate message may use several — so treat the result as a prompt to check,
        never as a verdict.</p>
    </div>`;
  host.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function wire(root) {
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    const input = root.querySelector('#scam-input');

    if (act === 'filter') { ui.filter = btn.dataset.v; store.update(() => {}); }

    if (act === 'recognize' || act === 'investigate' || act === 'unmark') {
      const status = act === 'recognize' ? 'recognized' : act === 'investigate' ? 'investigating' : 'none';
      store.update((s) => {
        const t = s.transactions.find((x) => x.id === btn.dataset.id);
        if (t) t.status = status;
      });
    }

    if (act === 'check') renderCheck(root, input.value);
    if (act === 'clear-check') { input.value = ''; root.querySelector('#scam-result').innerHTML = ''; input.focus(); }
    if (act === 'example') {
      input.value = EXAMPLES[Number(btn.dataset.i)].text;
      renderCheck(root, input.value);
    }
  });

  root.querySelector('#scam-input')?.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') renderCheck(root, e.target.value);
  });
}
