(() => {
  'use strict';

  const scriptUrl = new URL(document.currentScript.src);
  const sourceUrl = new URL('game-review-tools.source.js', scriptUrl);

  async function boot() {
    const response = await fetch(sourceUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Could not load game-review source (${response.status}).`);
    const source = await response.text();
    (0, eval)(source);
  }

  boot().catch((error) => {
    console.error('Exit Strategy 3 review tools failed to load.', error);
    const toast = document.querySelector('#toast');
    if (!toast) return;
    toast.textContent = error.message || String(error);
    toast.classList.add('visible');
  });
})();
