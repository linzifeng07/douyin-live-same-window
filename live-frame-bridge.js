(() => {
  if (window.top === window.self) {
    return;
  }

  const LIVE_HOST = "live.douyin.com";

  function normalizeLiveUrl(rawUrl) {
    if (rawUrl == null) {
      return null;
    }

    const text = String(rawUrl).trim();
    if (!text || text === "null" || text === "undefined") {
      return null;
    }

    try {
      const url = new URL(text, location.href);
      if (url.protocol !== "https:" || url.hostname !== LIVE_HOST) {
        return null;
      }
      return url.href;
    } catch {
      return null;
    }
  }

  function findLiveLink(event) {
    const path = typeof event.composedPath === "function"
      ? event.composedPath()
      : [];

    for (const node of path) {
      if (node instanceof Element) {
        const rawUrl = node.matches?.("a[href]")
          ? node.href
          : node.getAttribute?.("data-url")
            || node.getAttribute?.("data-href")
            || node.getAttribute?.("data-link");
        const url = normalizeLiveUrl(rawUrl);
        if (url) {
          return { element: node, url };
        }
      }
    }

    const target = event.target instanceof Element
      ? event.target.closest("a[href]")
      : null;
    const url = target ? normalizeLiveUrl(target.href) : null;
    return url ? { element: target, url } : null;
  }

  document.addEventListener("click", (event) => {
    if (event.button !== 0 || event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) {
      return;
    }

    const destination = findLiveLink(event);
    if (!destination) {
      return;
    }

    // The live-channel hero card relies on Douyin's own client-side router
    // to carry its selected-room state. Forcing a full reload of its _self
    // link drops that state and makes an active room look ended.
    if (destination.element.matches?.("a[href]")) {
      const target = (destination.element.getAttribute("target") || "_self").toLowerCase();
      if (target === "_self") {
        return;
      }
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    location.assign(destination.url);
  }, true);
})();
