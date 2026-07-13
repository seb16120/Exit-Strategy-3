(() => {
  'use strict';

  const phaseCard = document.querySelector('#phaseCard');
  const sidePanel = document.querySelector('#sidePanel');
  const passDialog = document.querySelector('#passDialog');
  const resultDialog = document.querySelector('#resultDialog');
  const toast = document.querySelector('#toast');
  let resultTimer = null;
  let advancing = false;
  let toastTimer = null;

  const series = {
    active: false,
    stopAfter: false,
    handled: false,
    cyanSeat: 'A',
    seats: { A: 'cpuplus', B: 'cpu3' },
    games: 0,
    wins: { A: 0, B: 0 },
    draws: 0,
    unresolved: 0
  };

  const style = document.createElement('style');
  style.textContent = `
    .auto-chain-choice{margin-top:14px}
    .auto-series-card h2{font-size:1rem}
    .series-score{display:grid;grid-template-columns:1fr auto;gap:7px 12px;margin:12px 0;color:var(--muted)}
    .series-score strong{color:var(--text);text-align:right}
  `;
  document.head.appendChild(style);

  function notify(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 3200);
  }

  function cpuName(level) {
    if (level === 'cpuplus') return 'CPU+';
    if (level === 'cpu3') return 'CPU3';
    return 'CPU1';
  }

  function seatName(seat) {
    const same = series.seats.A === series.seats.B;
    return same ? `${cpuName(series.seats[seat])} ${seat}` : cpuName(series.seats[seat]);
  }

  function installOption() {
    const start = document.querySelector('#startCpuDuelButton');
    const cyan = document.querySelector('#cyanCpuSelect');
    const magenta = document.querySelector('#magentaCpuSelect');
    if (!start || !cyan || !magenta) return;

    let checkbox = document.querySelector('#autoChainGamesChoice');
    if (!checkbox) {
      const label = document.createElement('label');
      label.id = 'autoChainGamesWrapper';
      label.className = 'mode-toggle auto-chain-choice';
      label.innerHTML = `<input id="autoChainGamesChoice" type="checkbox"><span><strong>Automatically chain games</strong><small>Alternate colors, show each result for two seconds, then start the next game.</small></span>`;
      start.closest('.choice-actions')?.insertAdjacentElement('beforebegin', label);
      checkbox = label.querySelector('input');
    }

    const refresh = () => {
      const available = cyan.value === 'cpuplus' || magenta.value === 'cpuplus';
      document.querySelector('#autoChainGamesWrapper').hidden = !available;
      if (!available) checkbox.checked = false;
    };
    if (!cyan.dataset.seriesBound) {
      cyan.dataset.seriesBound = '1';
      cyan.addEventListener('change', refresh);
      magenta.addEventListener('change', refresh);
    }
    if (advancing) checkbox.checked = true;
    refresh();
  }

  function startSeries(cyan, magenta) {
    series.active = true;
    series.stopAfter = false;
    series.handled = false;
    series.cyanSeat = 'A';
    series.seats = { A: cyan, B: magenta };
    series.games = 0;
    series.wins = { A: 0, B: 0 };
    series.draws = 0;
    series.unresolved = 0;
    renderPanel();
  }

  function stopSeries() {
    series.active = false;
    series.stopAfter = false;
    series.handled = false;
    clearTimeout(resultTimer);
    renderPanel();
  }

  function renderPanel() {
    let panel = document.querySelector('#autoSeriesPanel');
    if (!panel && sidePanel) {
      panel = document.createElement('section');
      panel.id = 'autoSeriesPanel';
      panel.className = 'auto-series-card';
      document.querySelector('#cpuControls')?.insertAdjacentElement('afterend', panel);
    }
    if (!panel) return;
    panel.hidden = !(series.active || series.games > 0);
    if (panel.hidden) return;
    const status = series.active ? (series.stopAfter ? 'Stopping after the current game.' : 'Running automatically.') : 'Series finished.';
    panel.innerHTML = `<h2>Automatic series</h2><p>${status}</p><div class="series-score"><span>Games</span><strong>${series.games}</strong><span>${seatName('A')} wins</span><strong>${series.wins.A}</strong><span>${seatName('B')} wins</span><strong>${series.wins.B}</strong><span>Draws</span><strong>${series.draws}</strong>${series.unresolved ? `<span>Unresolved</span><strong>${series.unresolved}</strong>` : ''}</div><button id="stopAutoSeries" class="secondary-button" type="button" ${!series.active || series.stopAfter ? 'disabled' : ''}>${series.stopAfter ? 'Will stop after this game' : 'Stop after this game'}</button>`;
    panel.querySelector('#stopAutoSeries')?.addEventListener('click', () => { series.stopAfter = true; renderPanel(); });
  }

  function detectWinner() {
    const title = document.querySelector('#resultTitle')?.textContent || '';
    if (/^Draw$/i.test(title)) return 'draw';
    const cEsc = Number(document.querySelector('#cyanEscaped')?.textContent || 0);
    const cCap = Number(document.querySelector('#cyanCaptured')?.textContent || 0);
    const mEsc = Number(document.querySelector('#magentaEscaped')?.textContent || 0);
    const mCap = Number(document.querySelector('#magentaCaptured')?.textContent || 0);
    if (cEsc >= 2 || cCap >= 3) return series.cyanSeat;
    if (mEsc >= 2 || mCap >= 3) return series.cyanSeat === 'A' ? 'B' : 'A';

    const cyanName = document.querySelector('#cyanPlayerIdentity')?.textContent || '';
    const magentaName = document.querySelector('#magentaPlayerIdentity')?.textContent || '';
    if (cyanName && cyanName !== magentaName && title.startsWith(cyanName)) return series.cyanSeat;
    if (magentaName && cyanName !== magentaName && title.startsWith(magentaName)) return series.cyanSeat === 'A' ? 'B' : 'A';
    return 'unresolved';
  }

  function waitFor(selector, timeout = 3000) {
    const found = document.querySelector(selector);
    if (found) return Promise.resolve(found);
    return new Promise((resolve, reject) => {
      const observer = new MutationObserver(() => {
        const element = document.querySelector(selector);
        if (!element) return;
        clearTimeout(timer);
        observer.disconnect();
        resolve(element);
      });
      const timer = setTimeout(() => { observer.disconnect(); reject(new Error(`Timed out waiting for ${selector}`)); }, timeout);
      observer.observe(document.body, { childList: true, subtree: true });
    });
  }

  async function nextGame() {
    if (!series.active || series.stopAfter) return;
    advancing = true;
    try {
      const cyanSeat = series.cyanSeat === 'A' ? 'B' : 'A';
      const magentaSeat = cyanSeat === 'A' ? 'B' : 'A';
      document.querySelector('#newGameButton')?.click();
      (await waitFor('#cpuDuelModeButton')).click();
      const cyan = await waitFor('#cyanCpuSelect');
      const magenta = await waitFor('#magentaCpuSelect');
      cyan.value = series.seats[cyanSeat];
      magenta.value = series.seats[magentaSeat];
      cyan.dispatchEvent(new Event('change', { bubbles: true }));
      magenta.dispatchEvent(new Event('change', { bubbles: true }));
      installOption();
      const option = document.querySelector('#autoChainGamesChoice');
      if (option) option.checked = true;
      series.cyanSeat = cyanSeat;
      series.handled = false;
      document.querySelector('#startCpuDuelButton')?.click();
    } catch (error) {
      series.active = false;
      notify(`Automatic series stopped: ${error.message || error}`);
      renderPanel();
    } finally {
      advancing = false;
    }
  }

  function handleResult() {
    if (!resultDialog?.open || !series.active || series.handled) return;
    series.handled = true;
    const winner = detectWinner();
    series.games += 1;
    if (winner === 'A' || winner === 'B') series.wins[winner] += 1;
    else if (winner === 'draw') series.draws += 1;
    else series.unresolved += 1;
    renderPanel();
    if (series.stopAfter) { series.active = false; renderPanel(); return; }
    clearTimeout(resultTimer);
    resultTimer = setTimeout(nextGame, 2000);
  }

  if (passDialog && typeof passDialog.showModal === 'function' && !passDialog.showModal.__autoCpuReveal) {
    const nativeShow = passDialog.showModal.bind(passDialog);
    const patched = function () {
      const cpuReady = document.querySelector('#passText')?.textContent.includes('Both CPU setups are ready.');
      const button = document.querySelector('#passContinueButton');
      if (cpuReady && button) { queueMicrotask(() => button.click()); return; }
      return nativeShow();
    };
    patched.__autoCpuReveal = true;
    passDialog.showModal = patched;
  }

  document.addEventListener('click', (event) => {
    if (event.target.closest?.('#startCpuDuelButton')) {
      const cyan = document.querySelector('#cyanCpuSelect')?.value;
      const magenta = document.querySelector('#magentaCpuSelect')?.value;
      const automatic = document.querySelector('#autoChainGamesChoice')?.checked;
      if (!advancing) {
        if (automatic && (cyan === 'cpuplus' || magenta === 'cpuplus')) startSeries(cyan, magenta);
        else stopSeries();
      }
    }
    if (event.target.closest?.('#newGameButton') && series.active && !advancing) stopSeries();
  }, true);

  phaseCard && new MutationObserver(() => { installOption(); renderPanel(); }).observe(phaseCard, { childList: true, subtree: true });
  resultDialog && new MutationObserver(handleResult).observe(resultDialog, { attributes: true, attributeFilter: ['open'] });

  installOption();
  renderPanel();
})();