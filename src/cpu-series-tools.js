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
    .auto-chain-choice{margin-top:clamp(.65rem,1.2vh,.9rem)}
    .auto-series-card h2{font-size:1rem}
    .series-score{display:grid;grid-template-columns:1fr auto;gap:clamp(.3rem,.7vh,.5rem) clamp(.6rem,1vw,.9rem);margin:clamp(.55rem,1.1vh,.8rem) 0;color:var(--muted)}
    .series-score strong{color:var(--text);text-align:right}
    .cpu-return-menu{width:100%;margin-top:clamp(.45rem,.8vh,.7rem)}

    @media (min-width:70rem) and (min-aspect-ratio:4/3) {
      body.cpu-duel-layout .site-header,
      body.cpu-duel-layout .app-shell{width:94vw;max-width:none}
      body.cpu-duel-layout .site-header{padding-top:clamp(.6rem,1.8vh,1.25rem);padding-bottom:clamp(.25rem,.8vh,.65rem)}
      body.cpu-duel-layout .app-shell{
        grid-template-columns:minmax(0,1.55fr) minmax(0,1fr);
        gap:clamp(.7rem,1.2vw,1.45rem);
        padding-top:clamp(.2rem,.6vh,.55rem);
        padding-bottom:clamp(.8rem,2vh,1.8rem)
      }
      body.cpu-duel-layout .side-panel{
        grid-template-columns:repeat(2,minmax(0,1fr));
        gap:clamp(.45rem,.75vw,.8rem);
        align-items:start
      }
      body.cpu-duel-layout .side-panel>section{
        min-width:0;
        padding:clamp(.6rem,.8vw,.95rem);
        border-radius:clamp(.75rem,1vw,1.1rem)
      }
      body.cpu-duel-layout .score-row{
        gap:clamp(.35rem,.6vw,.65rem);
        padding:clamp(.45rem,.65vw,.7rem);
        margin-bottom:clamp(.3rem,.5vw,.5rem)
      }
      body.cpu-duel-layout .score-row>div:last-child{font-size:clamp(.72rem,.68vw,.84rem)}
      body.cpu-duel-layout .turn-counter{padding-top:clamp(.2rem,.4vh,.35rem)}
      body.cpu-duel-layout .cpu-control-actions{gap:clamp(.4rem,.65vw,.65rem)}
      body.cpu-duel-layout .cpu-control-actions>button{min-width:0;flex:1}
      body.cpu-duel-layout .learning-settings{gap:clamp(.45rem,.7vw,.75rem);margin-top:clamp(.45rem,.8vh,.7rem);padding-top:clamp(.45rem,.8vh,.7rem)}
      body.cpu-duel-layout .cpuplus-data-actions{gap:clamp(.35rem,.65vh,.55rem);margin-top:clamp(.45rem,.8vh,.7rem);padding-top:clamp(.45rem,.8vh,.7rem)}
      body.cpu-duel-layout .cpuplus-data-actions>div{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:clamp(.35rem,.55vw,.55rem)}
      body.cpu-duel-layout .cpuplus-data-actions button{min-width:0;padding-inline:clamp(.45rem,.7vw,.75rem)}
      body.cpu-duel-layout .toggle-row{padding:clamp(.35rem,.7vh,.55rem) 0}
      body.cpu-duel-layout .history{max-height:clamp(5rem,16dvh,12rem)}
      body.cpu-duel-layout .phase-card{min-height:clamp(6.7rem,13dvh,8rem);padding:clamp(.8rem,1.1vw,1.25rem);margin-bottom:clamp(.55rem,1vh,.9rem)}
      body.cpu-duel-layout .board-frame{margin-bottom:clamp(.45rem,.9vh,.8rem)}
    }
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

  function isCpuDuelVisible() {
    const playVisible = Boolean(sidePanel && !sidePanel.hidden && phaseCard?.textContent.includes('CURRENT TURN'));
    return playVisible && !document.body.classList.contains('analysis-mode');
  }

  function syncResponsiveLayout() {
    document.body.classList.toggle('cpu-duel-layout', isCpuDuelVisible());
  }

  function returnDialog() {
    let dialog = document.querySelector('#returnToMainMenuDialog');
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.id = 'returnToMainMenuDialog';
    dialog.className = 'modal';
    dialog.innerHTML = `
      <div class="modal-body">
        <p class="eyebrow">LEAVE CPU MATCH</p>
        <h2>Return to the main menu?</h2>
        <p id="returnToMainMenuText">The current CPU match will stop.</p>
        <div class="dialog-actions">
          <button id="cancelReturnToMainMenu" class="secondary-button" type="button">Cancel</button>
          <button id="confirmReturnToMainMenu" class="danger-button" type="button">Return to main menu</button>
        </div>
      </div>`;
    document.body.appendChild(dialog);
    dialog.querySelector('#cancelReturnToMainMenu').addEventListener('click', () => dialog.close());
    dialog.querySelector('#confirmReturnToMainMenu').addEventListener('click', () => {
      clearTimeout(resultTimer);
      advancing = false;
      stopSeries();
      if (dialog.open) dialog.close();
      if (resultDialog?.open) resultDialog.close();
      document.querySelector('#newGameButton')?.click();
      syncResponsiveLayout();
    });
    return dialog;
  }

  function openReturnDialog() {
    const dialog = returnDialog();
    const text = dialog.querySelector('#returnToMainMenuText');
    const finished = Boolean(resultDialog?.open);
    if (text) {
      text.textContent = finished
        ? 'The current result screen and any automatic series will close.'
        : series.active
          ? 'The current game and automatic series will stop. This unfinished game will not count in the series or CPU+ learning.'
          : 'The current CPU match will stop. This unfinished game will not count as a result or CPU+ learning.';
    }
    if (!dialog.open) dialog.showModal();
  }

  function installReturnButton() {
    const controls = document.querySelector('#cpuControls');
    if (!controls || document.querySelector('#returnToMainMenuButton')) return;
    const button = document.createElement('button');
    button.id = 'returnToMainMenuButton';
    button.className = 'secondary-button cpu-return-menu';
    button.type = 'button';
    button.textContent = 'Return to main menu';
    button.addEventListener('click', openReturnDialog);
    controls.appendChild(button);
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

  phaseCard && new MutationObserver(() => {
    installOption();
    installReturnButton();
    renderPanel();
    syncResponsiveLayout();
  }).observe(phaseCard, { childList: true, subtree: true });
  sidePanel && new MutationObserver(syncResponsiveLayout).observe(sidePanel, { attributes: true, attributeFilter: ['hidden'] });
  const cpuControls = document.querySelector('#cpuControls');
  cpuControls && new MutationObserver(syncResponsiveLayout).observe(cpuControls, { attributes: true, attributeFilter: ['hidden'] });
  resultDialog && new MutationObserver(handleResult).observe(resultDialog, { attributes: true, attributeFilter: ['open'] });

  installOption();
  installReturnButton();
  renderPanel();
  syncResponsiveLayout();
})();