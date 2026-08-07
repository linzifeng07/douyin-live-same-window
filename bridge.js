(() => {
  const REQUEST_EVENT = "__douyin_live_popup_request__";
  const REQUEST_ATTRIBUTE = "data-douyin-live-popup-url";
  const LIVE_HOST = "live.douyin.com";
  const OVERLAY_ID = "__douyin_live_same_window_overlay__";
  let restoreOverflow = null;
  let previouslyPlayingMedia = [];

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

  function closeLiveOverlay() {
    document.getElementById(OVERLAY_ID)?.remove();
    if (restoreOverflow) {
      restoreOverflow();
      restoreOverflow = null;
    }

    const mediaToResume = previouslyPlayingMedia;
    previouslyPlayingMedia = [];
    for (const media of mediaToResume) {
      if (media.isConnected) {
        media.play().catch(() => {});
      }
    }
  }

  function pauseBackgroundMedia({ rememberPlaying = false } = {}) {
    const mediaElements = Array.from(document.querySelectorAll("video, audio"));
    if (rememberPlaying) {
      previouslyPlayingMedia = mediaElements.filter((media) => !media.paused);
    }

    for (const media of mediaElements) {
      if (!media.paused) {
        media.pause();
      }
    }
  }

  function createButton(label, title) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.title = title;
    button.setAttribute("aria-label", title);
    Object.assign(button.style, {
      position: "absolute",
      top: "14px",
      left: "14px",
      zIndex: "2147483647",
      height: "38px",
      padding: "0 15px",
      border: "1px solid rgba(255,255,255,.2)",
      borderRadius: "20px",
      color: "#fff",
      background: "rgba(20,20,24,.78)",
      boxShadow: "0 2px 12px rgba(0,0,0,.3)",
      backdropFilter: "blur(10px)",
      cursor: "pointer",
      font: "14px/36px system-ui, sans-serif"
    });
    return button;
  }

  function openLiveOverlay(rawUrl) {
    const url = normalizeLiveUrl(rawUrl);
    if (!url) {
      return;
    }

    const existing = document.getElementById(OVERLAY_ID);
    if (existing) {
      pauseBackgroundMedia();
      const iframe = existing.querySelector("iframe");
      if (iframe && iframe.src !== url) {
        iframe.src = url;
      }
      return;
    }

    pauseBackgroundMedia({ rememberPlaying: true });

    const root = document.documentElement;
    const body = document.body;
    const oldRootOverflow = root.style.overflow;
    const oldBodyOverflow = body?.style.overflow ?? "";
    root.style.overflow = "hidden";
    if (body) {
      body.style.overflow = "hidden";
    }
    restoreOverflow = () => {
      root.style.overflow = oldRootOverflow;
      if (body) {
        body.style.overflow = oldBodyOverflow;
      }
    };

    const overlay = document.createElement("section");
    overlay.id = OVERLAY_ID;
    overlay.setAttribute("aria-label", "抖音直播间");
    Object.assign(overlay.style, {
      position: "fixed",
      inset: "0",
      zIndex: "2147483646",
      width: "100vw",
      height: "100vh",
      margin: "0",
      padding: "0",
      overflow: "hidden",
      background: "#0b0b0f"
    });

    const loading = document.createElement("div");
    loading.textContent = "直播间加载中…";
    Object.assign(loading.style, {
      position: "absolute",
      inset: "0",
      display: "grid",
      placeItems: "center",
      color: "rgba(255,255,255,.75)",
      font: "16px system-ui, sans-serif"
    });

    const iframe = document.createElement("iframe");
    iframe.src = url;
    iframe.title = "抖音直播间";
    iframe.allow = "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture";
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    Object.assign(iframe.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      border: "0",
      background: "#0b0b0f"
    });
    iframe.addEventListener("load", () => loading.remove(), { once: true });

    const closeButton = createButton("← 返回抖音", "关闭直播间并返回抖音");
    closeButton.addEventListener("click", closeLiveOverlay);

    overlay.append(loading, iframe, closeButton);
    root.appendChild(overlay);
  }

  function findLiveLink(event) {
    const path = typeof event.composedPath === "function"
      ? event.composedPath()
      : [];

    for (const node of path) {
      if (!(node instanceof Element)) {
        continue;
      }

      if (node.matches?.("a[href]")) {
        const url = normalizeLiveUrl(node.href);
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
    openLiveOverlay(url);
  }, true);

  document.addEventListener(REQUEST_EVENT, () => {
    const root = document.documentElement;
    const url = root?.getAttribute(REQUEST_ATTRIBUTE);
    root?.removeAttribute(REQUEST_ATTRIBUTE);
    openLiveOverlay(url);
  }, true);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.getElementById(OVERLAY_ID)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeLiveOverlay();
    }
  }, true);

  document.addEventListener("play", (event) => {
    if (!document.getElementById(OVERLAY_ID)) {
      return;
    }

    const media = event.target;
    if (media instanceof HTMLMediaElement) {
      media.pause();
    }
  }, true);
})();
