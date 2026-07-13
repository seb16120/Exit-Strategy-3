(() => {
  'use strict';

  const CPUPlus = window.ExitStrategyCPUPlus;
  if (!CPUPlus) return;

  const FORMAT = 'exit-strategy-3-cpuplus-learning';
  const SCHEMA = 1;
  const MAX_LINK = 8000;
  const PART_PREFIX = 'exit-strategy-cpuplus-import-parts-v1:';
  const toast = document.querySelector('#toast');
  let toastTimer = null;
  let pendingImport = null;
  let pendingPartKey = null;

  const style = document.createElement('style');
  style.textContent = `
    .header-actions{display:flex;gap:9px;align-items:center}
    .cpuplus-data-actions{display:grid;gap:8px;margin-top:12px;padding-top:12px;border-top:1px solid var(--line)}
    .cpuplus-data-actions>div{display:flex;gap:8px;flex-wrap:wrap}
    .share-summary{padding:12px;border:1px solid var(--line);border-radius:12px;background:var(--panel-soft);color:var(--muted)}
    .share-links{display:grid;gap:10px;max-height:42vh;overflow:auto;margin:14px 0}
    .share-link{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center}
    .share-link code{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:9px;border-radius:9px;background:#101217;color:var(--muted)}
    .data-warning{color:#ffd89b;font-weight:700}
    .data-actions{display:grid;gap:9px;margin-top:18px}
    .help-list{color:var(--muted);padding-left:22px}.help-list li{margin:7px 0}
    .hidden-file{display:none!important}
    @media(max-width:620px){.header-actions{flex-direction:column;align-items:stretch}.header-actions>button{width:100%}.share-link{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);

  function store() {
    try { return window.localStorage; } catch (_) { return null; }
  }

  function notify(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 3200);
  }

  async function sha256(text) {
    if (!crypto?.subtle || typeof TextEncoder === 'undefined') return null;
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text)));
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  function encodeText(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function decodeText(value) {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
    const binary = atob(padded);
    return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
  }

  function cleanBody(value) {
    return {
      format: FORMAT,
      schemaVersion: SCHEMA,
      exportedAt: typeof value?.exportedAt === 'string' ? value.exportedAt : new Date().toISOString(),
      database: CPUPlus.sanitizeDatabase(value?.database)
    };
  }

  async function makeEnvelope(database = CPUPlus.loadDatabase()) {
    const body = cleanBody({ exportedAt: new Date().toISOString(), database });
    return { ...body, checksum: await sha256(JSON.stringify(body)) };
  }

  async function readEnvelope(value) {
    if (!value || value.format !== FORMAT || value.schemaVersion !== SCHEMA) throw new Error('This is not a compatible CPU+ export.');
    const body = cleanBody(value);
    const expected = await sha256(JSON.stringify(body));
    if (!expected || value.checksum !== expected) throw new Error('The CPU+ data failed its integrity check.');
    return { ...body, checksum: expected };
  }

  function mergeDatabases(aValue, bValue) {
    const a = CPUPlus.sanitizeDatabase(aValue);
    const b = CPUPlus.sanitizeDatabase(bValue);
    const result = CPUPlus.emptyDatabase();
    result.human.score = a.human.score + b.human.score;
    result.human.games = a.human.games + b.human.games;
    const fields = ['weightedScore', 'weightedGames', 'rawGames', 'wins', 'draws', 'losses'];
    const keys = new Set([...Object.keys(a.placements), ...Object.keys(b.placements)]);
    for (const key of keys) {
      result.placements[key] = {};
      for (const field of fields) result.placements[key][field] = (Number(a.placements[key]?.[field]) || 0) + (Number(b.placements[key]?.[field]) || 0);
    }
    result.updatedAt = new Date().toISOString();
    return result;
  }

  function createDialog(id, html, className = 'modal') {
    let dialog = document.querySelector(`#${id}`);
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.id = id;
    dialog.className = className;
    dialog.innerHTML = html;
    document.body.appendChild(dialog);
    return dialog;
  }

  function download(filename, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function backupName() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `exit-strategy-3-cpuplus-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
  }

  async function downloadBackup() {
    const envelope = await makeEnvelope();
    download(backupName(), `${JSON.stringify(envelope, null, 2)}\n`);
  }

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); }
    catch (_) {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    notify('Copied to clipboard.');
  }

  function randomId() {
    const bytes = new Uint8Array(8);
    if (crypto?.getRandomValues) crypto.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
    return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  function partName(index) {
    let n = index + 1;
    let out = '';
    while (n > 0) { n -= 1; out = String.fromCharCode(65 + n % 26) + out; n = Math.floor(n / 26); }
    return out;
  }

  async function buildLinks() {
    const encoded = encodeText(JSON.stringify(await makeEnvelope()));
    const base = `${location.origin}${location.pathname}${location.search}`;
    const single = `${base}#cpuplus-share=${encoded}`;
    if (single.length <= MAX_LINK) return { encodedLength: encoded.length, links: [single], split: false };

    const id = randomId();
    const checksum = await sha256(encoded);
    let size = Math.max(500, MAX_LINK - base.length - 170);
    let links;
    for (;;) {
      const chunks = [];
      for (let i = 0; i < encoded.length; i += size) chunks.push(encoded.slice(i, i + size));
      links = chunks.map((chunk, i) => `${base}#cpuplus-part=${id}.${i + 1}.${chunks.length}.${checksum}.${chunk}`);
      const longest = Math.max(...links.map((link) => link.length));
      if (longest <= MAX_LINK || size <= 500) break;
      size = Math.max(500, size - (longest - MAX_LINK) - 20);
    }
    return { encodedLength: encoded.length, links, split: true };
  }

  function installHelp() {
    const rules = document.querySelector('#rulesButton');
    if (!rules || document.querySelector('#helpButton')) return;
    const actions = document.createElement('div');
    actions.className = 'header-actions';
    rules.replaceWith(actions);
    actions.appendChild(rules);
    const help = document.createElement('button');
    help.id = 'helpButton';
    help.className = 'icon-button';
    help.type = 'button';
    help.textContent = 'Help';
    actions.appendChild(help);

    const dialog = createDialog('helpDialog', `
      <form method="dialog" class="modal-body">
        <div class="rules-heading"><div><p class="eyebrow">DATA &amp; SUPPORT</p><h2>Help</h2></div><button class="icon-button" value="close">Close</button></div>
        <div class="rules-copy">
          <h3>Where CPU+ learning is stored</h3>
          <p>CPU+ learning is stored locally in this browser profile. It survives normal page reloads and site updates.</p>
          <p>It may be lost when you:</p>
          <ul class="help-list"><li>reset CPU+ learning;</li><li>clear this site's browser data;</li><li>use another browser, browser profile or device;</li><li>use private browsing and close the private session.</li></ul>
          <p>The reset password protects the reset button, but it does not back up the learning data.</p>
          <h3>Backups</h3><p>Use <strong>Share / backup</strong> in Options to download a JSON backup. A protected reset also offers a backup before deleting anything.</p>
          <h3>Sharing links</h3><p>Share links contain CPU+ learning data, never the local password. Large exports are split into Part A, Part B, Part C, and so on. Open all parts in the same browser profile.</p>
          <h3>Merge or replace</h3><p><strong>Merge</strong> adds imported results to local results. <strong>Replace</strong> discards current local learning and uses only the imported data.</p>
        </div>
      </form>`, 'modal rules-modal');
    help.addEventListener('click', () => dialog.showModal());
  }

  function installDataButtons() {
    const learning = document.querySelector('.learning-settings');
    if (!learning || document.querySelector('#cpuPlusDataActions')) return;
    const block = document.createElement('div');
    block.id = 'cpuPlusDataActions';
    block.className = 'cpuplus-data-actions';
    block.innerHTML = `<strong>CPU+ data</strong><div><button id="shareCpuPlusButton" class="secondary-button compact-button" type="button">Share / backup</button><button id="restoreCpuPlusButton" class="secondary-button compact-button" type="button">Restore backup</button></div><input id="restoreCpuPlusInput" class="hidden-file" type="file" accept="application/json,.json">`;
    learning.insertAdjacentElement('afterend', block);

    const dialog = createDialog('cpuPlusShareDialog', `<div class="modal-body"><p class="eyebrow">CPU+ DATA</p><h2>Share or back up learning</h2><p id="shareStats"></p><div id="shareSummary" class="share-summary">Preparing…</div><p id="shareWarning" class="data-warning" hidden></p><div id="shareLinks" class="share-links"></div><div class="data-actions"><button id="copyAllShareLinks" class="primary-button" type="button" hidden>Copy all links</button><button id="downloadBackupButton" class="secondary-button" type="button">Download JSON backup</button><button id="closeShareDialog" class="text-button" type="button">Close</button></div></div>`);

    document.querySelector('#shareCpuPlusButton').addEventListener('click', async () => {
      const info = CPUPlus.summary(CPUPlus.loadDatabase());
      document.querySelector('#shareStats').textContent = `${info.placements} placements and ${info.games} results are stored in this browser.`;
      const summary = document.querySelector('#shareSummary');
      const warning = document.querySelector('#shareWarning');
      const list = document.querySelector('#shareLinks');
      const copyAll = document.querySelector('#copyAllShareLinks');
      summary.textContent = 'Preparing…'; warning.hidden = true; list.innerHTML = ''; copyAll.hidden = true;
      dialog.showModal();
      try {
        const result = await buildLinks();
        const longest = Math.max(...result.links.map((link) => link.length));
        summary.textContent = result.links.length === 1 ? `${result.encodedLength.toLocaleString()} data characters · ${longest.toLocaleString()} characters in the link.` : `${result.encodedLength.toLocaleString()} data characters · ${result.links.length} links · longest link: ${longest.toLocaleString()} characters.`;
        warning.hidden = !result.split;
        warning.textContent = result.split ? 'The export is too long for one reliable copy-and-paste link. Open every part in the same browser profile.' : '';
        result.links.forEach((link, i) => {
          const row = document.createElement('div');
          row.className = 'share-link';
          row.innerHTML = `<code>${result.links.length === 1 ? 'Share link' : `Part ${partName(i)} of ${result.links.length}`} · ${link.length.toLocaleString()} characters</code>`;
          const button = document.createElement('button');
          button.className = 'secondary-button compact-button'; button.type = 'button'; button.textContent = 'Copy'; button.addEventListener('click', () => copy(link));
          row.appendChild(button); list.appendChild(row);
        });
        copyAll.hidden = result.links.length <= 1;
        copyAll.onclick = () => copy(result.links.map((link, i) => `Part ${partName(i)}: ${link}`).join('\n\n'));
      } catch (error) { summary.textContent = `Could not prepare data: ${error.message || error}`; }
    });

    document.querySelector('#downloadBackupButton').addEventListener('click', async () => { await downloadBackup(); notify('Backup download started.'); });
    document.querySelector('#closeShareDialog').addEventListener('click', () => dialog.close());

    const input = document.querySelector('#restoreCpuPlusInput');
    document.querySelector('#restoreCpuPlusButton').addEventListener('click', () => input.click());
    input.addEventListener('change', async () => {
      const file = input.files?.[0]; input.value = '';
      if (!file) return;
      try { openImport(await readEnvelope(JSON.parse(await file.text())), `Backup file: ${file.name}`); }
      catch (error) { showImportError(error.message || String(error)); }
    });
  }

  function importDialog() {
    return createDialog('cpuPlusImportDialog', `<div class="modal-body"><p class="eyebrow">CPU+ DATA IMPORT</p><h2 id="importTitle">Import learning data?</h2><p id="importText"></p><p id="importStats" class="share-summary"></p><div class="data-actions"><button id="mergeImport" class="primary-button" type="button">Merge with local data</button><button id="replaceImport" class="danger-button" type="button">Replace local data</button><button id="discardParts" class="secondary-button" type="button" hidden>Discard incomplete import</button><button id="cancelImport" class="text-button" type="button">Cancel</button></div></div>`);
  }

  function openImport(envelope, source) {
    pendingImport = envelope; pendingPartKey = null;
    const dialog = importDialog();
    const incoming = CPUPlus.summary(envelope.database);
    const local = CPUPlus.summary(CPUPlus.loadDatabase());
    document.querySelector('#importTitle').textContent = 'Import CPU+ learning data?';
    document.querySelector('#importText').textContent = `${source}. Choose how to apply it.`;
    document.querySelector('#importStats').textContent = `Imported: ${incoming.placements} placements / ${incoming.games} results. Local: ${local.placements} placements / ${local.games} results.`;
    document.querySelector('#mergeImport').hidden = false; document.querySelector('#replaceImport').hidden = false; document.querySelector('#discardParts').hidden = true;
    if (!dialog.open) dialog.showModal();
  }

  function showIncomplete(key, received, total) {
    pendingImport = null; pendingPartKey = key;
    const dialog = importDialog();
    document.querySelector('#importTitle').textContent = 'Share-link part received';
    document.querySelector('#importText').textContent = `This browser has ${received} of ${total} parts. Open the remaining links in this same browser profile.`;
    document.querySelector('#importStats').textContent = `${total - received} part${total - received === 1 ? '' : 's'} still missing.`;
    document.querySelector('#mergeImport').hidden = true; document.querySelector('#replaceImport').hidden = true; document.querySelector('#discardParts').hidden = false;
    if (!dialog.open) dialog.showModal();
  }

  function showImportError(message) {
    pendingImport = null; pendingPartKey = null;
    const dialog = importDialog();
    document.querySelector('#importTitle').textContent = 'Could not import CPU+ data';
    document.querySelector('#importText').textContent = message;
    document.querySelector('#importStats').textContent = 'No local data was changed.';
    document.querySelector('#mergeImport').hidden = true; document.querySelector('#replaceImport').hidden = true; document.querySelector('#discardParts').hidden = true;
    if (!dialog.open) dialog.showModal();
  }

  function installImportActions() {
    const dialog = importDialog();
    document.querySelector('#mergeImport').addEventListener('click', () => { if (!pendingImport) return; CPUPlus.saveDatabase(mergeDatabases(CPUPlus.loadDatabase(), pendingImport.database)); dialog.close(); location.reload(); });
    document.querySelector('#replaceImport').addEventListener('click', () => { if (!pendingImport) return; CPUPlus.saveDatabase(pendingImport.database); dialog.close(); location.reload(); });
    document.querySelector('#discardParts').addEventListener('click', () => { if (pendingPartKey) store()?.removeItem(pendingPartKey); pendingPartKey = null; dialog.close(); notify('Incomplete import discarded.'); });
    document.querySelector('#cancelImport').addEventListener('click', () => dialog.close());
  }

  async function processHash() {
    const hash = location.hash || '';
    if (!hash.startsWith('#cpuplus-share=') && !hash.startsWith('#cpuplus-part=')) return;
    history.replaceState(null, '', `${location.pathname}${location.search}`);
    try {
      if (hash.startsWith('#cpuplus-share=')) {
        openImport(await readEnvelope(JSON.parse(decodeText(hash.slice(15)))), 'Complete share link');
        return;
      }
      const match = hash.slice(14).match(/^([a-f0-9]{16})\.(\d+)\.(\d+)\.([a-f0-9]{64})\.([A-Za-z0-9_-]+)$/);
      if (!match) throw new Error('This share-link part is malformed.');
      const [, id, indexText, totalText, checksum, chunk] = match;
      const index = Number(indexText), total = Number(totalText);
      if (!Number.isInteger(index) || !Number.isInteger(total) || index < 1 || index > total || total > 999) throw new Error('This share-link part has invalid numbering.');
      const local = store();
      if (!local) throw new Error('This browser cannot store share-link parts.');
      const key = `${PART_PREFIX}${id}`;
      let record;
      try { record = JSON.parse(local.getItem(key) || 'null'); } catch (_) { record = null; }
      if (!record || record.total !== total || record.checksum !== checksum) record = { total, checksum, parts: {} };
      record.parts[index] = chunk; record.updatedAt = new Date().toISOString(); local.setItem(key, JSON.stringify(record));
      const received = Object.keys(record.parts).length;
      if (received < total) { showIncomplete(key, received, total); return; }
      const encoded = Array.from({ length: total }, (_, i) => record.parts[i + 1]).join('');
      if (await sha256(encoded) !== checksum) throw new Error('The assembled share links failed their integrity check.');
      const envelope = await readEnvelope(JSON.parse(decodeText(encoded)));
      local.removeItem(key); openImport(envelope, `All ${total} share-link parts`);
    } catch (error) { showImportError(error.message || String(error)); }
  }

  function installResetBackup() {
    const form = document.querySelector('#resetLearningForm');
    const resetDialog = document.querySelector('#resetLearningDialog');
    if (!form) return;
    const confirm = createDialog('resetBackupDialog', `<div class="modal-body"><p class="eyebrow">FINAL CONFIRMATION</p><h2>Delete CPU+ learning data?</h2><p id="resetBackupStats"></p><p class="data-warning">This cannot be undone unless you keep a backup.</p><div class="data-actions"><button id="backupAndReset" class="primary-button" type="button">Download backup and reset</button><button id="resetNoBackup" class="danger-button" type="button">Reset without backup</button><button id="cancelResetBackup" class="text-button" type="button">Cancel</button></div></div>`);

    form.addEventListener('submit', async (event) => {
      event.preventDefault(); event.stopImmediatePropagation();
      const error = document.querySelector('#resetLearningError');
      if (error) error.textContent = 'Checking…';
      const valid = await CPUPlus.verifyResetPassword(document.querySelector('#resetLearningPassword')?.value || '');
      if (!valid) return;
      if (error) error.textContent = '';
      if (resetDialog?.open) resetDialog.close();
      const info = CPUPlus.summary(CPUPlus.loadDatabase());
      document.querySelector('#resetBackupStats').textContent = `${info.placements} placements and ${info.games} recorded results will be deleted from this browser.`;
      confirm.showModal();
    }, true);

    const clearAndReload = () => { CPUPlus.clearDatabase(); confirm.close(); setTimeout(() => location.reload(), 80); };
    document.querySelector('#backupAndReset').addEventListener('click', async () => {
      const button = document.querySelector('#backupAndReset'); button.disabled = true;
      try { await downloadBackup(); clearAndReload(); }
      catch (error) { button.disabled = false; notify(`Backup failed; nothing was reset. ${error.message || error}`); }
    });
    document.querySelector('#resetNoBackup').addEventListener('click', clearAndReload);
    document.querySelector('#cancelResetBackup').addEventListener('click', () => confirm.close());
  }

  installHelp();
  installDataButtons();
  installImportActions();
  installResetBackup();
  processHash();
})();