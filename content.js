(function () {
  'use strict';

  const host = location.hostname;
  const rules = AOC_RULES.filter(
    (rule) => host === rule.site || host.endsWith('.' + rule.site),
  );

  if (rules.length === 0) return;

  // Watchers switch off after a while so idle tabs stay cheap. Single-page apps
  // swap content without a reload, so a URL change switches them back on (or
  // extends them if still running).
  const rearmers = [];

  function timedWatcher(ms, start, stop) {
    let timer = null;
    const arm = () => {
      if (timer === null) start();
      else clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        stop();
      }, ms);
    };
    rearmers.push(arm);
    arm();
  }

  // Page JS calls history.pushState in its own world, which a content script
  // can't hook. A client-side navigation always mutates the DOM, so compare the
  // URL on each mutation batch instead.
  let lastUrl = location.href;
  const checkUrl = () => {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    for (const arm of rearmers) arm();
  };
  new MutationObserver(checkUrl).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('popstate', checkUrl);

  // Pre-set cookies BEFORE anything else, while we're still at document_start
  // and the page's JS hasn't read cookies yet. Some sites gate their entire
  // dismiss state on a single cookie (e.g. heide's `hiaDismissed`), so spoofing
  // it here means the modal never renders at all.
  for (const rule of rules) {
    if (!rule.setCookie) continue;
    for (const [name, value] of Object.entries(rule.setCookie)) {
      document.cookie =
        encodeURIComponent(name) + '=' + encodeURIComponent(value) +
        '; path=/; max-age=2592000; samesite=lax';
    }
  }

  // Same idea for localStorage. localStorage is per-origin and shared between
  // the content script's isolated world and the page world, so writes here
  // are visible to the page JS that subsequently reads them.
  for (const rule of rules) {
    if (!rule.setLocalStorage) continue;
    for (const [key, value] of Object.entries(rule.setLocalStorage)) {
      try { localStorage.setItem(key, value); } catch {}
    }
  }

  // Sites with a click step keep their modal in layout (opacity:0) so the site's
  // own dismiss animation runs and its scroll-lock cleanup callback fires.
  // Pure hide-only entries get display:none so footer banners don't leave a gap.
  const displayNone = [];
  const clickHide = [];
  const clickSelectors = [];
  const unlockSelectors = [];

  for (const rule of rules) {
    const hides = rule.hide || [];
    const clicks = rule.click || [];
    const unlocks = rule.unlock || [];
    const target = clicks.length > 0 ? clickHide : displayNone;
    target.push(...hides);
    clickSelectors.push(...clicks);
    unlockSelectors.push(...unlocks);
  }

  // CSS bundles to inject into the main document AND every open shadow root.
  // Some design systems (e.g. unimelb's Lit-based components) render their
  // footer inside a shadow root; main-document styles don't pierce it.
  const cssBundles = [];

  queueStyle(
    dedupe(displayNone),
    'display: none !important; visibility: hidden !important; pointer-events: none !important;',
    'hide-display-none',
  );
  queueStyle(
    dedupe(clickHide),
    'visibility: hidden !important; pointer-events: none !important; clip-path: inset(100%) !important;',
    'hide-visibility-hidden',
  );
  queueStyle(
    dedupe(unlockSelectors),
    'overflow: visible !important; height: auto !important; position: static !important; top: auto !important;',
    'unlock-scroll',
  );

  for (const bundle of cssBundles) {
    if (bundle.label === 'unlock-scroll') {
      // Inject unlock CSS at the END of <body> so it sits after every <head>
      // stylesheet in document order. With same specificity + !important,
      // cascade order decides — site rules in <head> would otherwise beat us
      // (we run at document_start, before their link stylesheets). Body-tail
      // placement guarantees we win.
      injectIntoBodyTail(bundle);
    } else {
      injectInto(document, bundle);
    }
  }
  pierceShadowRoots(document);
  watchForShadowRoots();

  function injectIntoBodyTail(bundle) {
    const place = () => {
      const existing = document.querySelector(`style[data-aoc-blocker="${bundle.label}"]`);
      if (existing) {
        if (existing.parentNode !== document.body) document.body.appendChild(existing);
        return;
      }
      const style = document.createElement('style');
      style.textContent = bundle.css;
      style.dataset.aocBlocker = bundle.label;
      document.body.appendChild(style);
    };
    if (document.body) {
      place();
    } else {
      const obs = new MutationObserver(() => {
        if (document.body) {
          obs.disconnect();
          place();
        }
      });
      obs.observe(document.documentElement, { childList: true, subtree: true });
    }
    // Re-anchor to body tail on later mutations — frameworks sometimes append
    // stylesheets after ours, which would cascade-beat us.
    const reanchor = new MutationObserver(() => {
      const el = document.querySelector(`style[data-aoc-blocker="${bundle.label}"]`);
      if (el && document.body && el !== document.body.lastElementChild) {
        document.body.appendChild(el);
      }
    });
    const start = () => timedWatcher(
      30000,
      () => reanchor.observe(document.body, { childList: true }),
      () => reanchor.disconnect(),
    );
    if (document.body) start();
    else {
      const wait = new MutationObserver(() => {
        if (document.body) {
          wait.disconnect();
          start();
        }
      });
      wait.observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  if (clickSelectors.length > 0) setupClickDismiss(dedupe(clickSelectors));

  // removeText: for acknowledgements that share one element with content we
  // want to keep (vinnies bundles the AoC and the ABN/DGR line in a single <p>,
  // split only by <br><br>). CSS cannot target a text node, so match on a short
  // quote and drop the node plus the <br> padding it sat on.
  const textFragments = dedupe(rules.flatMap((r) => r.removeText || []));
  if (textFragments.length > 0) setupTextRemoval(textFragments);

  function setupTextRemoval(fragments) {
    const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'TITLE']);
    let busy = false;

    // Drop up to two <br> next to the removed text so the paragraph doesn't
    // keep the blank line it occupied. Prefer trailing; fall back to leading
    // for a segment that sat last.
    const stripBrs = (node, dir) => {
      let removed = 0;
      let sib = dir === 'next' ? node.nextSibling : node.previousSibling;
      while (sib && removed < 2) {
        const step = dir === 'next' ? sib.nextSibling : sib.previousSibling;
        if (sib.nodeType === 1 && sib.tagName === 'BR') {
          sib.remove();
          removed++;
        } else if (sib.nodeType === 3 && !sib.nodeValue.trim()) {
          // whitespace between tags, keep walking
        } else {
          break;
        }
        sib = step;
      }
      return removed;
    };

    const sweep = () => {
      const root = document.body || document.documentElement;
      if (!root || busy) return;
      busy = true;
      try {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
          acceptNode(n) {
            if (!n.nodeValue || n.nodeValue.length < 12) return NodeFilter.FILTER_REJECT;
            if (document.designMode === 'on' || n.parentElement?.isContentEditable) return NodeFilter.FILTER_REJECT;
            if (n.parentElement?.closest('input, textarea, select, option')) return NodeFilter.FILTER_REJECT;
            if (n.parentNode && SKIP.has(n.parentNode.nodeName)) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
          },
        });
        const doomed = [];
        let node;
        while ((node = walker.nextNode())) {
          for (const frag of fragments) {
            if (node.nodeValue.indexOf(frag) !== -1) { doomed.push(node); break; }
          }
        }
        for (const n of doomed) {
          if (stripBrs(n, 'next') === 0) stripBrs(n, 'prev');
          n.remove();
        }
      } catch {
        // A malformed fragment must not take the rest of the extension down.
      } finally {
        busy = false;
      }
    };

    // Coalesce mutation batches into one sweep per frame. rAF runs before the
    // next paint, so matched text is still gone before it is drawn.
    let sweepScheduled = false;
    const scheduleSweep = () => {
      if (sweepScheduled) return;
      sweepScheduled = true;
      requestAnimationFrame(() => {
        sweepScheduled = false;
        sweep();
      });
    };

    const obs = new MutationObserver(scheduleSweep);
    const start = () => timedWatcher(
      30000,
      () => {
        sweep();
        obs.observe(document.body || document.documentElement, {
          childList: true,
          subtree: true,
          characterData: true,
        });
      },
      () => obs.disconnect(),
    );

    if (document.body) start();
    else document.addEventListener('DOMContentLoaded', start, { once: true });
  }

  // Reload-once: for sites whose dismiss state is gated on a cookie that's
  // written when the dialog renders. Hide the dialog, wait for it to actually
  // be in DOM (cookie has been written by then), then reload. SessionStorage
  // flag prevents an infinite loop.
  setupReloadOnce(dedupe(rules.map((r) => r.reloadOnce)));

  function setupReloadOnce(triggerSelectors) {
    if (triggerSelectors.length === 0) return;
    const flagKey = 'aoc-blocker-reloaded:' + location.hostname;
    if (sessionStorage.getItem(flagKey)) return;

    let done = false;

    const check = () => {
      if (done) return;
      for (const sel of triggerSelectors) {
        let match;
        try { match = document.querySelector(sel); } catch { continue; }
        if (!match) continue;
        done = true;
        sessionStorage.setItem(flagKey, '1');
        // Delay so the site finishes writing its dismiss cookie before we reload.
        setTimeout(() => location.reload(), 1000);
        return;
      }
    };

    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, { childList: true, subtree: true });
    // Give up after 6s — if the dialog never appears, we're already on a clean load.
    setTimeout(() => { done = true; obs.disconnect(); }, 6000);
  }

  function dedupe(arr) {
    return Array.from(new Set(arr.filter(Boolean)));
  }

  function queueStyle(selectors, declarations, label) {
    if (selectors.length === 0) return;
    const css = selectors.join(',\n') + ' {\n  ' + declarations + '\n}\n';
    cssBundles.push({ css, label });
  }

  function injectInto(root, bundle) {
    // Skip if we've already injected this bundle into this root.
    if (root.querySelector(`style[data-aoc-blocker="${bundle.label}"]`)) return;
    const style = document.createElement('style');
    style.textContent = bundle.css;
    style.dataset.aocBlocker = bundle.label;
    const host = root === document
      ? (document.head || document.documentElement)
      : root;
    host.appendChild(style);
  }

  // Shadow roots already injected into and observed, so re-pierces are idempotent.
  const piercedRoots = new WeakSet();

  function pierceShadowRoots(root) {
    // Walk every element under `root`, including elements already inside open
    // shadow roots (custom elements often nest other custom elements). For each
    // newly seen open shadow root, inject every bundle and attach a
    // MutationObserver — mutations inside a shadow root do NOT bubble out, so we
    // need an observer per root to catch later attachShadow calls in that subtree.
    const all = root.querySelectorAll('*');
    for (const el of all) {
      const sr = el.shadowRoot;
      if (!sr || piercedRoots.has(sr)) continue;
      piercedRoots.add(sr);
      for (const bundle of cssBundles) injectInto(sr, bundle);
      observeRoot(sr);
      pierceShadowRoots(sr);
    }
  }

  // Throttle re-pierces to one per animation frame.
  let pierceScheduled = false;
  function schedulePierce() {
    if (pierceScheduled) return;
    pierceScheduled = true;
    requestAnimationFrame(() => {
      pierceScheduled = false;
      pierceShadowRoots(document);
    });
  }

  function observeRoot(root) {
    const obs = new MutationObserver(schedulePierce);
    obs.observe(root, { childList: true, subtree: true });
    setTimeout(() => obs.disconnect(), 30000);
  }

  function watchForShadowRoots() {
    // The outer observer can't synchronously check `node.shadowRoot` on each
    // added node — custom elements typically attachShadow inside their
    // connectedCallback, which fires AFTER this mutation event. Instead,
    // schedule a deferred full re-pierce. Cheap thanks to the rAF throttle and
    // the WeakSet of already-pierced roots.
    //
    // Belt-and-braces: also re-pierce on a slow timer while armed. Some sites
    // attach shadow roots in async callbacks well after surrounding mutations
    // settle, and rAF won't fire if the tab is backgrounded.
    const outer = new MutationObserver(schedulePierce);
    let interval;
    timedWatcher(
      30000,
      () => {
        outer.observe(document.documentElement, { childList: true, subtree: true });
        interval = setInterval(() => pierceShadowRoots(document), 500);
      },
      () => {
        outer.disconnect();
        clearInterval(interval);
      },
    );
  }

  function setupClickDismiss(selectors) {
    let lastAttempt = 0;

    const fireFullClick = (el) => {
      try { el.focus({ preventScroll: true }); } catch {}
      const opts = { bubbles: true, cancelable: true, button: 0, view: window };
      for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
        const Ctor = type.startsWith('pointer') && typeof PointerEvent !== 'undefined'
          ? PointerEvent
          : MouseEvent;
        try { el.dispatchEvent(new Ctor(type, opts)); } catch {}
      }
      try { el.click(); } catch {}
    };

    const tryDismiss = () => {
      const now = Date.now();
      if (now - lastAttempt < 80) return;
      lastAttempt = now;
      for (const sel of selectors) {
        let el;
        try {
          el = document.querySelector(sel);
        } catch {
          continue;
        }
        if (!el) continue;
        fireFullClick(el);
      }
    };

    const observer = new MutationObserver(tryDismiss);
    let interval;
    timedWatcher(
      15000,
      () => {
        tryDismiss();
        observer.observe(document.documentElement, { childList: true, subtree: true });
        interval = setInterval(tryDismiss, 200);
      },
      () => {
        observer.disconnect();
        clearInterval(interval);
      },
    );
  }
})();
