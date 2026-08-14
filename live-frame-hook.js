(() => {
  if (window.top === window.self) {
    return;
  }

  const LIVE_HOST = "live.douyin.com";
  const originalOpen = window.open.bind(window);
  const originalAnchorClick = HTMLAnchorElement.prototype.click;
  const originalFormSubmit = HTMLFormElement.prototype.submit;

  function normalizeLiveUrl(rawUrl) {
    try {
      const url = new URL(String(rawUrl), location.href);
      if (url.protocol !== "https:" || url.hostname !== LIVE_HOST) {
        return null;
      }
      return url.href;
    } catch {
      return null;
    }
  }

  function findReactLiveUrl(element) {
    const checked = new WeakSet();
    const scored = [];
    let visited = 0;

    function inspect(value, path, depth) {
      if (value == null || depth > 5 || visited > 600) {
        return;
      }

      if (typeof value === "string" || typeof value === "number") {
        const text = String(value);
        const canBeLiveUrl = /(?:^https?:)?\/\/live\.douyin\.com(?:\/|$)/i.test(text)
          || (/(?:url|href|link)/i.test(path) && /^\/[a-zA-Z0-9_-]{5,}(?:[/?#]|$)/.test(text));
        const directUrl = canBeLiveUrl ? normalizeLiveUrl(text) : null;
        if (directUrl) {
          scored.push({ score: 100, url: directUrl });
          return;
        }

        if (/web_?rid|webRid/i.test(path) && /^[a-zA-Z0-9_-]{5,}$/.test(text)) {
          scored.push({
            score: 90,
            url: `https://${LIVE_HOST}/${encodeURIComponent(text)}`
          });
        }
        return;
      }

      if (typeof value !== "object" || checked.has(value)) {
        return;
      }

      checked.add(value);
      visited += 1;
      let entries;
      try {
        entries = Object.entries(value).slice(0, 80);
      } catch {
        return;
      }

      entries.sort(([left], [right]) => {
        const preferred = /(?:url|web_?rid|webRid|room)/i;
        return Number(preferred.test(right)) - Number(preferred.test(left));
      });

      for (const [key, child] of entries) {
        if (/^(?:children|owner|stateNode|alternate|child|sibling)$/i.test(key)) {
          continue;
        }
        inspect(child, path ? `${path}.${key}` : key, depth + 1);
      }
    }

    let node = element;
    for (let nodeDepth = 0; node && nodeDepth < 6; nodeDepth += 1, node = node.parentElement) {
      const propertyNames = Object.getOwnPropertyNames(node);
      for (const propertyName of propertyNames) {
        if (propertyName.startsWith("__reactProps")) {
          inspect(node[propertyName], propertyName, 0);
        }

        if (propertyName.startsWith("__reactFiber")) {
          let fiber = node[propertyName];
          for (let fiberDepth = 0; fiber && fiberDepth < 8; fiberDepth += 1) {
            inspect(fiber.memoizedProps, `fiber${fiberDepth}.memoizedProps`, 0);
            inspect(fiber.pendingProps, `fiber${fiberDepth}.pendingProps`, 0);
            fiber = fiber.return;
          }
        }
      }
    }

    scored.sort((left, right) => right.score - left.score);
    return scored[0]?.url ?? null;
  }

  function findSpecialLiveButton(event) {
    const path = typeof event.composedPath === "function"
      ? event.composedPath()
      : [];

    for (const node of path) {
      if (!(node instanceof Element)) {
        continue;
      }

      const text = (node.textContent || "").replace(/\s+/g, "").trim();
      if (node.classList.contains("to_other_anchor") || text === "去TA直播间") {
        return node;
      }
    }

    return null;
  }

  document.addEventListener("click", (event) => {
    if (event.button !== 0 || event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) {
      return;
    }

    const button = findSpecialLiveButton(event);
    if (!button) {
      return;
    }

    const liveUrl = findReactLiveUrl(button);
    if (!liveUrl) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    location.assign(liveUrl);
  }, true);

  window.open = function patchedWindowOpen(url, target, features) {
    const liveUrl = normalizeLiveUrl(url);
    if (liveUrl) {
      location.assign(liveUrl);
      return window;
    }
    return originalOpen(url, target, features);
  };

  HTMLAnchorElement.prototype.click = function patchedAnchorClick() {
    const liveUrl = normalizeLiveUrl(this.href);
    if (liveUrl) {
      location.assign(liveUrl);
      return;
    }
    return originalAnchorClick.call(this);
  };

  HTMLFormElement.prototype.submit = function patchedFormSubmit() {
    const liveUrl = normalizeLiveUrl(this.action);
    if (liveUrl) {
      location.assign(liveUrl);
      return;
    }
    return originalFormSubmit.call(this);
  };
})();
