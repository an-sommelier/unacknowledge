(function () {
  'use strict';

  // Only greeting phrases belong here. Do not add names of peoples, places, or
  // languages: ordinary page content may use those words for other reasons.
  const GREETING_PATTERNS = [
    /\bwomin\s*[- ]?d?jeka\b/giu,                 // Melbourne
    /\bbujari\s+gamar+u+w+a\b/giu,               // Sydney
    /\bbudyeri\s+kamaru\b/giu,                   // Sydney
    /\bkaya\s+wanju\b/giu,                       // Perth
    /\bmärr[-\s]?ŋamathirri\b/giu,                // Darwin
    /\bmarr[-\s]?ngamathirri\b/giu,               // Darwin, ASCII spelling
    /\bgaliga!\s*gu[’']wa,?\s*batji\s+mula\s+ganyam\b/giu, // Darwin
  ];

  const USER_FACING_ATTRIBUTES = ['alt', 'title', 'aria-label', 'placeholder'];

  const replacementFor = (match) => {
    const letters = match.match(/\p{L}/gu) || [];
    if (letters.length === 0) return 'welcome';
    if (letters.every((letter) => letter === letter.toUpperCase())) return 'WELCOME';
    if (letters[0] === letters[0].toUpperCase()) return 'Welcome';
    return 'welcome';
  };

  const replaceText = (text) => {
    let result = text;
    for (const pattern of GREETING_PATTERNS) {
      result = result.replace(pattern, replacementFor);
    }
    return result;
  };

  const shouldSkipTextNode = (node) => {
    const parent = node.parentElement;
    if (document.designMode === 'on' || parent?.isContentEditable) return true;
    if (!parent) return false;
    return parent.closest(
      'script, style, noscript, template, textarea, input, select, option',
    ) !== null;
  };

  const replaceTextNode = (node) => {
    if (node.nodeType !== Node.TEXT_NODE || shouldSkipTextNode(node)) return;
    const replacement = replaceText(node.nodeValue || '');
    if (replacement !== node.nodeValue) node.nodeValue = replacement;
  };

  const replaceAttribute = (element, name) => {
    if (document.designMode === 'on' || element.isContentEditable) return;
    const value = element.getAttribute(name);
    if (value === null) return;
    const replacement = replaceText(value);
    if (replacement !== value) element.setAttribute(name, replacement);
  };

  const replaceTree = (root) => {
    if (root.nodeType === Node.TEXT_NODE) {
      replaceTextNode(root);
      return;
    }

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) replaceTextNode(node);

    if (root.nodeType === Node.ELEMENT_NODE) {
      for (const name of USER_FACING_ATTRIBUTES) replaceAttribute(root, name);
    }
    for (const element of root.querySelectorAll('[alt], [title], [aria-label], [placeholder]')) {
      for (const name of USER_FACING_ATTRIBUTES) replaceAttribute(element, name);
    }
  };

  const observedRoots = new WeakSet();
  const watchTree = (root) => {
    if (observedRoots.has(root)) return;
    observedRoots.add(root);
    replaceTree(root);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') {
          replaceTextNode(mutation.target);
        } else if (mutation.type === 'attributes') {
          replaceAttribute(mutation.target, mutation.attributeName);
        } else {
          for (const node of mutation.addedNodes) {
            replaceTree(node);
            // Scan only the subtree that arrived. A full-tree walk here runs on
            // every mutation batch, which is costly on busy pages.
            if (node.nodeType === Node.ELEMENT_NODE) scanShadowRoots(node);
          }
        }
      }
      // Elements can attach a shadow root without being re-inserted, so still
      // sweep the whole root occasionally — throttled, not once per batch.
      scheduleFullScan(root);
    });
    observer.observe(root, {
      attributes: true,
      attributeFilter: USER_FACING_ATTRIBUTES,
      characterData: true,
      childList: true,
      subtree: true,
    });
    scanShadowRoots(root);
  };

  const lastFullScan = new WeakMap();
  const FULL_SCAN_INTERVAL_MS = 1000;
  const scheduleFullScan = (root) => {
    const now = Date.now();
    if (now - (lastFullScan.get(root) || 0) < FULL_SCAN_INTERVAL_MS) return;
    lastFullScan.set(root, now);
    scanShadowRoots(root);
  };

  const scanShadowRoots = (root) => {
    for (const element of root.querySelectorAll('*')) {
      if (element.shadowRoot) watchTree(element.shadowRoot);
    }
  };

  const storage = globalThis.browser?.storage?.local ?? globalThis.chrome?.storage?.local;
  storage.get({ greetingReplacementEnabled: true })
    .then(({ greetingReplacementEnabled }) => {
      if (greetingReplacementEnabled !== false) watchTree(document);
    })
    // A storage failure should not stop the extension's default behaviour.
    .catch(() => watchTree(document));
})();
