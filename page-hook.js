(() => {
  const REQUEST_EVENT = "__douyin_live_popup_request__";
  const REQUEST_ATTRIBUTE = "data-douyin-live-popup-url";
  const LIVE_HOST = "live.douyin.com";
  const originalOpen = window.open.bind(window);

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

  function requestPopup(url) {
    const root = document.documentElement;
    if (!root) {
      return false;
    }

    root.setAttribute(REQUEST_ATTRIBUTE, url);
    document.dispatchEvent(new Event(REQUEST_EVENT));
    return true;
  }

  window.open = function patchedWindowOpen(url, target, features) {
    const liveUrl = normalizeLiveUrl(url);
    if (liveUrl && requestPopup(liveUrl)) {
      return null;
    }
    return originalOpen(url, target, features);
  };
})();
