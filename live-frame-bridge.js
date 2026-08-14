(() => {
  if (window.top === window.self) {
    return;
  }

  const LIVE_HOST = "live.douyin.com";

  function normalizeLiveUrl(rawUrl) {
    try {
      const url = new URL(rawUrl, location.href);
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
          return url;
        }
      }
    }

    const target = event.target instanceof Element
      ? event.target.closest("a[href]")
      : null;
    return target ? normalizeLiveUrl(target.href) : null;
  }

  document.addEventListener("click", (event) => {
    if (event.button !== 0 || event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) {
      return;
    }

    const url = findLiveLink(event);
    if (!url) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    location.assign(url);
  }, true);
})();
