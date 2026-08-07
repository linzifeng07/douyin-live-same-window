(() => {
  if (window.top === window.self) {
    return;
  }

  const LIVE_HOST = "live.douyin.com";
  const originalOpen = window.open.bind(window);
  const originalAnchorClick = HTMLAnchorElement.prototype.click;

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
})();
