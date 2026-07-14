(() => {
  'use strict';

  const phaseCard = document.querySelector('#phaseCard');
  let refreshQueued = false;

  const style = document.createElement('style');
  style.textContent = `
    .analysis-help-copy h3{margin:1.1rem 0 .35rem}
    .analysis-help-copy p{margin:.35rem 0;color:var(--muted)}
    .analysis-help-copy ul{margin:.4rem 0;padding-left:1.3rem;color:var(--muted)}
    .analysis-help-copy li{margin:.38rem 0}
  `;
  document.head.appendChild(style);

  function forceCoordinatesOn() {
    const checkbox = document.querySelector('#showCoordinates');
    if (!checkbox) return;
    if (!checkbox.checked) {
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const row = checkbox.closest('label') || checkbox.parentElement;
    if (row && row.isConnected) row.remove();
  }

  function helpDialog() {
    let dialog = document.querySelector('#analysisHelpDialog');
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.id = 'analysisHelpDialog';
    dialog.className = 'modal rules-modal';
    dialog.innerHTML = `
      <form method="dialog" class="modal-body">
        <div class="rules-heading">
          <div><p class="eyebrow">GAME REVIEW</p><h2>How to analyze a game</h2></div>
          <button class="icon-button" value="close" aria-label="Close analysis help">Close</button>
        </div>
        <div class="rules-copy analysis-help-copy">
          <h3>Review the original game</h3>
          <p>Select <strong>Initial position</strong> or any move in <strong>Move history</strong>. The board shows the position immediately after the selected move.</p>
          <h3>Explore a variation</h3>
          <p>From a selected position, choose a piece and play another legal move. This creates an analysis variation without changing the saved original game.</p>
          <p>Timers are disabled and analysis moves never affect CPU+ learning or the automatic-series statistics.</p>
          <h3>CPU turns</h3>
          <p>During analysis, every CPU is paused by default. When it is a CPU's turn, use <strong>Next CPU move</strong> to make it calculate and play exactly one move.</p>
          <h3>Analysis buttons</h3>
          <ul>
            <li><strong>Return to original game</strong>: discard the current variation and restore the original recorded game.</li>
            <li><strong>Return to result</strong>: reopen the end-of-game window.</li>
            <li><strong>Return to menu</strong>: leave the game and return to the main mode selection.</li>
            <li><strong>Copy ES3-PGN</strong>: copy the complete game, including its setup, moves, players and result.</li>
            <li><strong>Copy current ES3-FEN</strong>: copy only the position currently displayed and the player whose turn it is.</li>
            <li><strong>Paste / import</strong>: paste an ES3-PGN or ES3-FEN, then either review it or start a playable position from it.</li>
          </ul>
          <h3>Coordinates</h3>
          <p>Board coordinates are always displayed, including during analysis.</p>
        </div>
      </form>`;
    document.body.appendChild(dialog);
    return dialog;
  }

  function isAnalysisOpen() {
    return Boolean(phaseCard && /ANALYSIS/i.test(phaseCard.textContent));
  }

  function installAnalysisHelpButton() {
    const analysisOpen = isAnalysisOpen();
    const header = document.querySelector('.site-header');
    if (!header) return;

    let button = Array.from(header.querySelectorAll('button')).find((node) => {
      const text = node.textContent.trim().toLowerCase();
      return node.dataset.analysisHelp === '1' || text === 'analysis' || text === 'analysis help';
    });

    if (!analysisOpen) {
      if (button?.dataset.analysisHelpCreated === '1') button.remove();
      return;
    }

    if (!button) {
      button = document.createElement('button');
      button.className = 'icon-button';
      button.type = 'button';
      button.dataset.analysisHelpCreated = '1';
      const rules = document.querySelector('#rulesButton');
      const actions = rules?.parentElement?.classList.contains('header-actions') ? rules.parentElement : header;
      actions.insertBefore(button, rules || actions.firstChild);
    }

    button.disabled = false;
    button.removeAttribute('disabled');
    button.dataset.analysisHelp = '1';
    button.textContent = 'Analysis help';
    button.setAttribute('aria-haspopup', 'dialog');
    button.title = 'Explain the analysis controls';
    if (button.dataset.analysisHelpBound !== '1') {
      button.dataset.analysisHelpBound = '1';
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const dialog = helpDialog();
        if (!dialog.open) dialog.showModal();
      }, true);
    }
  }

  function refresh() {
    forceCoordinatesOn();
    installAnalysisHelpButton();
  }

  function queueRefresh() {
    if (refreshQueued) return;
    refreshQueued = true;
    requestAnimationFrame(() => {
      refreshQueued = false;
      refresh();
    });
  }

  new MutationObserver(queueRefresh).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['hidden', 'disabled']
  });

  refresh();
})();