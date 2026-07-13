(() => {
  'use strict';

  const scriptUrl = new URL(document.currentScript.src);
  const payloadUrl = new URL('game-review-tools.payload', scriptUrl);

  async function boot() {
    if (typeof DecompressionStream !== 'function') {
      throw new Error('This browser does not support the game-review module.');
    }

    const response = await fetch(payloadUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Could not load game-review data (${response.status}).`);

    const payload = (await response.text()).trim();
    const bytes = Uint8Array.from(atob(payload), (character) => character.charCodeAt(0));
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    const source = await new Response(stream).text();
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
