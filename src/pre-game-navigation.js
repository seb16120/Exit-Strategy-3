(() => {
  'use strict';

  const phaseCard = document.querySelector('#phaseCard');
  const newGameButton = document.querySelector('#newGameButton');
  if (!phaseCard || !newGameButton) return;

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

  function sync() {
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

  new MutationObserver(sync).observe(phaseCard, { childList: true, subtree: true, characterData: true });
  sync();
})();
