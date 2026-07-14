(() => {
  'use strict';

  const CPUPlus = window.ExitStrategyCPUPlus;
  const toast = document.querySelector('#toast');
  if (!CPUPlus) return;

  const FORMAT = 'exit-strategy-3-cpuplus-learning';
  const SCHEMA = 1;
  const MERGED_FINGERPRINTS_KEY = 'exit-strategy-cpuplus-merged-fingerprints-v1';
  let pendingEnvelope = null;
  let pendingFingerprint = null;
  let pendingDuplicate = false;
  let toastTimer = null;

  const style = document.createElement('style');
  style.textContent = `
    .version-label{
      display:inline-block;
      margin-left:.55rem;
      padding:.18rem .42rem;
      border:1px solid var(--line);
      border-radius:999px;
      color:var(--muted);
      background:rgba(255,255,255,.035);
      font-size:.82em;
      letter-spacing:.04em;
      vertical-align:middle
    }
    .cpuplus-learning-buttons{display:flex!important;gap:.45rem;align-items:center;justify-content:flex-end;flex-wrap:wrap}
    .cpuplus-merge-textarea{
      width:100%;
      min-height:8rem;
      resize:vertical;
      box-sizing:border-box;
      margin-top:.7rem;
      padding:.75rem;
      border:1px solid var(--line);
      border-radius:.7rem;
      color:var(--text);
      background:var(--panel-soft);
      font:inherit;
      line-height:1.4
    }
    .cpuplus-merge-preview{margin-top:1rem}
    .cpuplus-merge-preview[hidden]{display:none!important}
    .cpuplus-merge-duplicate{color:#ffd89b;font-weight:700}
    @media(max-width:620px){
      .version-label{display:block;width:max-content;margin:.35rem 0 0}
      .learning-settings{align-items:flex-start;flex-wrap:wrap}
      .cpuplus-learning-buttons{width:100%;justify-content:stretch}
      .cpuplus-learning-buttons>button{flex:1 1 8.5rem}
    }
  `;
  document.head.appendChild(style);

  function storage() {
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
    if (!window.crypto?.subtle || typeof TextEncoder === 'undefined') {
      throw new Error('This browser cannot verify CPU+ data.');
    }
    const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text)));
    return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  function decodeText(value) {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
    const binary = atob(padded);
    return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
  }

  function cleanBody(value) {
    return {
      format: FORMAT,
      schemaVersion: SCHEMA,
      exportedAt: typeof value?.exportedAt === 'string' ? value.exportedAt : new Date().toISOString(),
      database: CPUPlus.sanitizeDatabase(value?.database)
    };
  }

  async function readEnvelope(value) {
    if (!value || value.format !== FORMAT || value.schemaVersion !== SCHEMA) {
      throw new Error('This is not a compatible CPU+ export.');
    }
    const body = cleanBody(value);
    const expected = await sha256(JSON.stringify(body));
    if (value.checksum !== expected) throw new Error('The CPU+ data failed its integrity check.');
    return { ...body, checksum: expected };
  }

  function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue);
    if (!value || typeof value !== 'object') return value;
    const output = {};
    Object.keys(value).sort().forEach((key) => {
      if (key !== 'updatedAt') output[key] = stableValue(value[key]);
    });
    return output;
  }

  async function databaseFingerprint(database) {
    return sha256(JSON.stringify(stableValue(CPUPlus.sanitizeDatabase(database))));
  }

  function loadFingerprints() {
    const local = storage();
    if (!local) return [];
    try {
      const parsed = JSON.parse(local.getItem(MERGED_FINGERPRINTS_KEY) || '[]');
      return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string').slice(-500) : [];
    } catch (_) {
      return [];
    }
  }

  function rememberFingerprint(fingerprint) {
    const local = storage();
    if (!local || !fingerprint) return;
    const values = loadFingerprints().filter((item) => item !== fingerprint);
    values.push(fingerprint);
    try { local.setItem(MERGED_FINGERPRINTS_KEY, JSON.stringify(values.slice(-500))); } catch (_) {}
  }

  function mergeDatabases(leftValue, rightValue) {
    const left = CPUPlus.sanitizeDatabase(leftValue);
    const right = CPUPlus.sanitizeDatabase(rightValue);
    const result = CPUPlus.emptyDatabase();
    result.human.score = left.human.score + right.human.score;
    result.human.games = left.human.games + right.human.games;
    const fields = ['weightedScore', 'weightedGames', 'rawGames', 'wins', 'draws', 'losses'];
    const keys = new Set([...Object.keys(left.placements), ...Object.keys(right.placements)]);
    for (const key of keys) {
      result.placements[key] = {};
      for (const field of fields) {
        result.placements[key][field] = (Number(left.placements[key]?.[field]) || 0) + (Number(right.placements[key]?.[field]) || 0);
      }
    }
    result.updatedAt = new Date().toISOString();
    return result;
  }

  function extractHashes(text) {
    const values = [];
    const urlMatches = String(text).match(/https?:\/\/[^\s<>"']+/g) || [];
    const hashMatches = String(text).match(/#cpuplus-(?:share|part)=[A-Za-z0-9._-]+/g) || [];
    for (const raw of [...urlMatches, ...hashMatches]) {
      const cleaned = raw.replace(/[),.;]+$/g, '');
      try {
        const hash = cleaned.startsWith('#') ? cleaned : new URL(cleaned, location.href).hash;
        if (hash.startsWith('#cpuplus-share=') || hash.startsWith('#cpuplus-part=')) values.push(hash);
      } catch (_) {}
    }
    return Array.from(new Set(values));
  }

  async function envelopeFromPastedText(text) {
    const trimmed = String(text || '').trim();
    if (!trimmed) throw new Error('Paste a CPU+ share link, all link parts, or JSON data.');
    if (trimmed.startsWith('{')) return readEnvelope(JSON.parse(trimmed));

    const hashes = extractHashes(trimmed);
    if (!hashes.length) throw new Error('No compatible CPU+ share link was found.');
    const complete = hashes.find((hash) => hash.startsWith('#cpuplus-share='));
    if (complete) return readEnvelope(JSON.parse(decodeText(complete.slice(15))));

    const groups = new Map();
    for (const hash of hashes) {
      const match = hash.slice(14).match(/^([a-f0-9]{16})\.(\d+)\.(\d+)\.([a-f0-9]{64})\.([A-Za-z0-9_-]+)$/);
      if (!match) continue;
      const [, id, indexText, totalText, checksum, chunk] = match;
      const index = Number(indexText);
      const total = Number(totalText);
      if (!Number.isInteger(index) || !Number.isInteger(total) || index < 1 || index > total || total > 999) continue;
      const key = `${id}:${checksum}:${total}`;
      if (!groups.has(key)) groups.set(key, { total, checksum, parts: {} });
      groups.get(key).parts[index] = chunk;
    }

    if (!groups.size) throw new Error('The pasted CPU+ link parts are malformed.');
    const group = Array.from(groups.values()).sort((a, b) => Object.keys(b.parts).length - Object.keys(a.parts).length)[0];
    const received = Object.keys(group.parts).length;
    if (received !== group.total) throw new Error(`Only ${received} of ${group.total} link parts were found. Paste every part together.`);
    const encoded = Array.from({ length: group.total }, (_, index) => group.parts[index + 1]).join('');
    if (await sha256(encoded) !== group.checksum) throw new Error('The assembled share links failed their integrity check.');
    return readEnvelope(JSON.parse(decodeText(encoded)));
  }

  function createDialog() {
    let dialog = document.querySelector('#cpuPlusDedicatedMergeDialog');
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.id = 'cpuPlusDedicatedMergeDialog';
    dialog.className = 'modal';
    dialog.innerHTML = `
      <div class="modal-body">
        <p class="eyebrow">CPU+ DATA MERGE</p>
        <h2>Merge learning data</h2>
        <p>Paste one complete share link, every part of a split share, or choose a JSON backup file. The local reset password is never imported.</p>
        <textarea id="cpuPlusMergeText" class="cpuplus-merge-textarea" placeholder="Paste CPU+ link(s) or JSON here"></textarea>
        <input id="cpuPlusMergeFile" class="hidden-file" type="file" accept="application/json,.json">
        <div class="data-actions">
          <button id="prepareCpuPlusMerge" class="primary-button" type="button">Check pasted data</button>
          <button id="chooseCpuPlusMergeFile" class="secondary-button" type="button">Choose JSON file</button>
        </div>
        <div id="cpuPlusMergePreview" class="cpuplus-merge-preview" hidden>
          <p id="cpuPlusMergeSource"></p>
          <p id="cpuPlusMergeStats" class="share-summary"></p>
          <p id="cpuPlusMergeDuplicate" class="cpuplus-merge-duplicate" hidden>This exact CPU+ dataset has already been merged on this browser.</p>
          <div class="data-actions">
            <button id="confirmCpuPlusMerge" class="primary-button" type="button">Merge with local data</button>
            <button id="confirmCpuPlusMergeAgain" class="danger-button" type="button" hidden>Merge again anyway</button>
          </div>
        </div>
        <p id="cpuPlusMergeError" class="form-error" aria-live="polite"></p>
        <button id="cancelCpuPlusMerge" class="text-button" type="button">Cancel</button>
      </div>`;
    document.body.appendChild(dialog);
    return dialog;
  }

  function resetMergeDialog() {
    pendingEnvelope = null;
    pendingFingerprint = null;
    pendingDuplicate = false;
    const text = document.querySelector('#cpuPlusMergeText');
    const preview = document.querySelector('#cpuPlusMergePreview');
    const error = document.querySelector('#cpuPlusMergeError');
    if (text) text.value = '';
    if (preview) preview.hidden = true;
    if (error) error.textContent = '';
  }

  async function prepareEnvelope(envelope, source) {
    pendingEnvelope = envelope;
    pendingFingerprint = await databaseFingerprint(envelope.database);
    pendingDuplicate = loadFingerprints().includes(pendingFingerprint);
    const localDatabase = CPUPlus.loadDatabase();
    const mergedDatabase = mergeDatabases(localDatabase, envelope.database);
    const incoming = CPUPlus.summary(envelope.database);
    const local = CPUPlus.summary(localDatabase);
    const merged = CPUPlus.summary(mergedDatabase);
    document.querySelector('#cpuPlusMergeSource').textContent = source;
    document.querySelector('#cpuPlusMergeStats').textContent = `Incoming: ${incoming.placements} placements / ${incoming.games} results. Local: ${local.placements} placements / ${local.games} results. After merge: ${merged.placements} placements / ${merged.games} results.`;
    document.querySelector('#cpuPlusMergeDuplicate').hidden = !pendingDuplicate;
    document.querySelector('#confirmCpuPlusMerge').hidden = pendingDuplicate;
    document.querySelector('#confirmCpuPlusMergeAgain').hidden = !pendingDuplicate;
    document.querySelector('#cpuPlusMergePreview').hidden = false;
    document.querySelector('#cpuPlusMergeError').textContent = '';
  }

  async function mergePending(forceDuplicate) {
    if (!pendingEnvelope) return;
    if (pendingDuplicate && !forceDuplicate) return;
    const merged = mergeDatabases(CPUPlus.loadDatabase(), pendingEnvelope.database);
    CPUPlus.saveDatabase(merged);
    rememberFingerprint(pendingFingerprint);
    const dialog = createDialog();
    if (dialog.open) dialog.close();
    notify(forceDuplicate ? 'CPU+ data merged again.' : 'CPU+ data merged.');
    setTimeout(() => location.reload(), 180);
  }

  function installMergeButton() {
    const reset = document.querySelector('#resetLearningButton');
    const learning = reset?.closest('.learning-settings');
    if (!reset || !learning || document.querySelector('#mergeCpuPlusDataButton')) return;
    let actions = learning.querySelector('.cpuplus-learning-buttons');
    if (!actions) {
      actions = document.createElement('div');
      actions.className = 'cpuplus-learning-buttons';
      reset.replaceWith(actions);
      actions.appendChild(reset);
    }
    const merge = document.createElement('button');
    merge.id = 'mergeCpuPlusDataButton';
    merge.className = 'secondary-button compact-button';
    merge.type = 'button';
    merge.textContent = 'Merge';
    actions.insertBefore(merge, reset);
    merge.addEventListener('click', () => {
      resetMergeDialog();
      const dialog = createDialog();
      if (!dialog.open) dialog.showModal();
      setTimeout(() => document.querySelector('#cpuPlusMergeText')?.focus(), 0);
    });
  }

  function installMergeDialogActions() {
    const dialog = createDialog();
    const fileInput = document.querySelector('#cpuPlusMergeFile');
    document.querySelector('#prepareCpuPlusMerge').addEventListener('click', async () => {
      const error = document.querySelector('#cpuPlusMergeError');
      error.textContent = 'Checking…';
      try {
        const envelope = await envelopeFromPastedText(document.querySelector('#cpuPlusMergeText').value);
        await prepareEnvelope(envelope, 'Pasted CPU+ share data.');
      } catch (exception) {
        pendingEnvelope = null;
        document.querySelector('#cpuPlusMergePreview').hidden = true;
        error.textContent = exception.message || String(exception);
      }
    });
    document.querySelector('#chooseCpuPlusMergeFile').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      fileInput.value = '';
      if (!file) return;
      const error = document.querySelector('#cpuPlusMergeError');
      error.textContent = 'Checking…';
      try {
        const envelope = await readEnvelope(JSON.parse(await file.text()));
        await prepareEnvelope(envelope, `JSON backup: ${file.name}`);
      } catch (exception) {
        pendingEnvelope = null;
        document.querySelector('#cpuPlusMergePreview').hidden = true;
        error.textContent = exception.message || String(exception);
      }
    });
    document.querySelector('#confirmCpuPlusMerge').addEventListener('click', () => mergePending(false));
    document.querySelector('#confirmCpuPlusMergeAgain').addEventListener('click', () => mergePending(true));
    document.querySelector('#cancelCpuPlusMerge').addEventListener('click', () => dialog.close());
  }

  function installVersionLabel() {
    const eyebrow = document.querySelector('.site-header .eyebrow');
    if (!eyebrow || document.querySelector('#appVersionLabel')) return;
    const label = document.createElement('span');
    label.id = 'appVersionLabel';
    label.className = 'version-label';
    label.textContent = 'v2026.07 · Learning Lab';
    eyebrow.appendChild(label);
  }

  function syncCpuDuelOptions() {
    const confirm = document.querySelector('#confirmMoves');
    const row = confirm?.closest('.toggle-row') || confirm?.closest('label');
    const sidePanel = document.querySelector('#sidePanel');
    const cpuControls = document.querySelector('#cpuControls');
    if (!row || !sidePanel || !cpuControls) return;
    row.hidden = !sidePanel.hidden && !cpuControls.hidden;
  }

  installVersionLabel();
  installMergeButton();
  installMergeDialogActions();
  syncCpuDuelOptions();

  const sidePanel = document.querySelector('#sidePanel');
  const cpuControls = document.querySelector('#cpuControls');
  if (sidePanel) new MutationObserver(syncCpuDuelOptions).observe(sidePanel, { attributes: true, attributeFilter: ['hidden'] });
  if (cpuControls) new MutationObserver(syncCpuDuelOptions).observe(cpuControls, { attributes: true, attributeFilter: ['hidden'] });
  const phaseCard = document.querySelector('#phaseCard');
  if (phaseCard) new MutationObserver(() => {
    installMergeButton();
    syncCpuDuelOptions();
  }).observe(phaseCard, { childList: true, subtree: true });
})();