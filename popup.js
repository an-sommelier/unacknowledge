(function () {
  'use strict';

  const storage = globalThis.browser?.storage?.local ?? globalThis.chrome?.storage?.local;
  const checkbox = document.querySelector('#greeting-replacement');

  storage.get({ greetingReplacementEnabled: true })
    .then(({ greetingReplacementEnabled }) => {
      checkbox.checked = greetingReplacementEnabled !== false;
    })
    .catch(() => {
      checkbox.checked = true;
    });

  checkbox.addEventListener('change', () => {
    storage.set({ greetingReplacementEnabled: checkbox.checked });
  });
})();
