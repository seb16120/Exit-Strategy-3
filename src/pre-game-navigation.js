(() => {
  'use strict';

  const phaseCard = document.querySelector('#phaseCard');
  const newGameButton = document.querySelector('#newGameButton');
  if (!phaseCard || !newGameButton) return;

  const TRAINED_PROFILE_PATH = 'downloads/cpuplus-trained-profile-2026-07-14.json';
  const TRAINED_PROFILE_NAME = 'exit-strategy-3-cpuplus-trained-profile-2026-07-14.json';

  const style = document.createElement('style');
  style.textContent = `
    .pre-game-return-menu{margin-top:clamp(.75rem,1.5vh,1rem)}
    @media(max-width:620px){.pre-game-return-menu{width:100%}}
  `;
  document.head.appendChild(style);

  function shouldShow() {
    if (document.body.classList.contains('analysis-mode')) return false;
    const text = phaseCard.textContent || '';
    if (!text || text.includes('How do you want to play?') || text.includes('CURRENT TURN')) return false;
    return /STEP 1 · TURN ORDER|CHOICE MAKER|CPU CHOICE MAKER|SECRET SETUP|PRIVATE HANDOFF/.test(text);
  }

  function syncReturnButton() {
    const existing = phaseCard.querySelector('#preGameReturnMenu');
    if (!shouldShow()) {
      existing?.remove();
      return;
    }
    if (existing) return;
    const button = document.createElement('button');
    button.id = 'preGameReturnMenu';
    button.className = 'secondary-button pre-game-return-menu';
    button.type = 'button';
    button.textContent = 'Return to main menu';
    button.addEventListener('click', () => newGameButton.click());
    phaseCard.appendChild(button);
  }

  function installTrainedProfileDownload() {
    if (document.querySelector('#downloadTrainedCpuPlusProfile')) return;
    const actions = document.querySelector('#cpuPlusDataActions > div');
    if (!actions) return;
    const button = document.createElement('button');
    button.id = 'downloadTrainedCpuPlusProfile';
    button.className = 'secondary-button compact-button';
    button.type = 'button';
    button.textContent = 'Download trained profile';
    button.title = 'Download a starter CPU+ profile with 14 placements and 43 recorded results.';
    button.addEventListener('click', () => {
      const link = document.createElement('a');
      link.href = TRAINED_PROFILE_PATH;
      link.download = TRAINED_PROFILE_NAME;
      document.body.appendChild(link);
      link.click();
      link.remove();
    });
    actions.appendChild(button);
  }

  function sync() {
    syncReturnButton();
    installTrainedProfileDownload();
  }

  new MutationObserver(sync).observe(document.body, { childList: true, subtree: true, characterData: true });
  sync();
})();
