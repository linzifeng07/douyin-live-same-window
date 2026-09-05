(() => {
  if (window.top === window.self) {
    return;
  }

  const LIVE_HOST = "live.douyin.com";
  const originalOpen = window.open.bind(window);
  const originalAnchorClick = HTMLAnchorElement.prototype.click;
  const originalFormSubmit = HTMLFormElement.prototype.submit;
  const roomIdByWebRid = new Map();
  const decimalIdPattern = /^\d{6,24}$/;

  function normalizeId(value) {
    const text = String(value ?? "").trim();
    return decimalIdPattern.test(text) ? text : null;
  }

  function getRoomId(record) {
    if (!record || typeof record !== "object") {
      return null;
    }

    for (const key of ["room_id", "room_id_str", "roomId", "roomIdStr"]) {
      const roomId = normalizeId(record[key]);
      if (roomId) {
        return roomId;
      }
    }

    const looksLikeRoom = record.owner
      && ("stream_url" in record
        || "room_view_stats" in record
        || "status" in record
        || "title" in record);
    if (!looksLikeRoom) {
      return null;
    }

    return normalizeId(record.id_str) || normalizeId(record.id);
  }

  function getWebRid(record) {
    if (!record || typeof record !== "object") {
      return null;
    }

    for (const key of ["web_rid", "webRid"]) {
      const webRid = normalizeId(record[key]);
      if (webRid) {
        return webRid;
      }
    }

    const owner = record.owner;
    if (owner && typeof owner === "object") {
      return normalizeId(owner.web_rid) || normalizeId(owner.webRid);
    }

    return null;
  }

  function rememberRoomMappings(payload) {
    const checked = new WeakSet();
    let visited = 0;

    function inspect(value, depth) {
      if (!value || typeof value !== "object" || depth > 14 || visited > 12000) {
        return;
      }
      if (checked.has(value)) {
        return;
      }

      checked.add(value);
      visited += 1;

      const roomId = getRoomId(value);
      const webRid = getWebRid(value);
      if (roomId && webRid && roomId !== webRid) {
        roomIdByWebRid.set(webRid, roomId);
      }

      let children;
      try {
        children = Array.isArray(value)
          ? value.slice(0, 500)
          : Object.values(value).slice(0, 250);
      } catch {
        return;
      }

      for (const child of children) {
        inspect(child, depth + 1);
      }
    }

    inspect(payload, 0);
  }

  function shouldInspectApi(rawUrl) {
    try {
      const url = new URL(String(rawUrl), location.href);
      return url.hostname === LIVE_HOST
        && (url.pathname.startsWith("/webcast/") || url.pathname.startsWith("/aweme/"));
    } catch {
      return false;
    }
  }

  const originalFetch = typeof window.fetch === "function"
    ? window.fetch.bind(window)
    : null;
  if (originalFetch) {
    window.fetch = function patchedFetch(...args) {
      const result = originalFetch(...args);
      result.then((response) => {
        if (!shouldInspectApi(response.url)) {
          return;
        }
        response.clone().json().then(rememberRoomMappings).catch(() => {});
      }).catch(() => {});
      return result;
    };
  }

  const xhrUrlKey = Symbol("douyinLiveRoomMapUrl");
  const originalXhrOpen = XMLHttpRequest.prototype.open;
  const originalXhrSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function patchedXhrOpen(method, url, ...rest) {
    this[xhrUrlKey] = shouldInspectApi(url) ? String(url) : "";
    return originalXhrOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function patchedXhrSend(...args) {
    if (this[xhrUrlKey]) {
      this.addEventListener("load", () => {
        try {
          if (this.responseType === "json") {
            rememberRoomMappings(this.response);
            return;
          }
          if (this.responseType === "" || this.responseType === "text") {
            rememberRoomMappings(JSON.parse(this.responseText));
          }
        } catch {
          // The response is not JSON or is unavailable to page script.
        }
      }, { once: true });
    }
    return originalXhrSend.apply(this, args);
  };

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

  function findReactRoomId(element) {
    const checked = new WeakSet();
    const scored = [];
    let visited = 0;

    function inspect(value, path, depth) {
      if (value == null || depth > 7 || visited > 1200) {
        return;
      }

      if (typeof value === "string" || typeof value === "number") {
        const roomId = normalizeId(value);
        if (!roomId || roomId.length < 16) {
          return;
        }

        if (/(?:^|\.)(?:room_id|room_id_str|roomId|roomIdStr)$/i.test(path)) {
          scored.push({ score: 100, roomId });
        } else if (/(?:^|\.)room\.id_str$/i.test(path)) {
          scored.push({ score: 90, roomId });
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
        entries = Object.entries(value).slice(0, 120);
      } catch {
        return;
      }

      entries.sort(([left], [right]) => {
        const preferred = /(?:room|id_str|web_?rid|webRid)/i;
        return Number(preferred.test(right)) - Number(preferred.test(left));
      });

      for (const [key, child] of entries) {
        if (/^(?:children|stateNode|alternate|child|sibling)$/i.test(key)) {
          continue;
        }
        inspect(child, path ? `${path}.${key}` : key, depth + 1);
      }
    }

    let node = element;
    for (let nodeDepth = 0; node && nodeDepth < 7; nodeDepth += 1, node = node.parentElement) {
      const propertyNames = Object.getOwnPropertyNames(node);
      for (const propertyName of propertyNames) {
        if (propertyName.startsWith("__reactProps")) {
          inspect(node[propertyName], propertyName, 0);
        }

        if (propertyName.startsWith("__reactFiber")) {
          let fiber = node[propertyName];
          for (let fiberDepth = 0; fiber && fiberDepth < 10; fiberDepth += 1) {
            inspect(fiber.memoizedProps, `fiber${fiberDepth}.memoizedProps`, 0);
            inspect(fiber.pendingProps, `fiber${fiberDepth}.pendingProps`, 0);
            fiber = fiber.return;
          }
        }
      }
    }

    scored.sort((left, right) => right.score - left.score);
    return scored[0]?.roomId ?? null;
  }

  function enrichLiveUrl(rawUrl, element) {
    const normalized = normalizeLiveUrl(rawUrl);
    if (!normalized) {
      return null;
    }

    const url = new URL(normalized);
    if (normalizeId(url.searchParams.get("room_id"))) {
      return url.href;
    }

    const webRid = normalizeId(url.pathname.split("/").filter(Boolean)[0]);
    if (!webRid) {
      return url.href;
    }

    const roomId = roomIdByWebRid.get(webRid) || findReactRoomId(element);
    if (roomId && roomId !== webRid) {
      url.searchParams.set("room_id", roomId);
    }
    return url.href;
  }

  function findLiveAnchor(event) {
    const path = typeof event.composedPath === "function"
      ? event.composedPath()
      : [];

    for (const node of path) {
      if (node instanceof HTMLAnchorElement && normalizeLiveUrl(node.href)) {
        return node;
      }
    }

    return null;
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

    const anchor = findLiveAnchor(event);
    if (anchor?.matches('[data-e2e="live-enter-room"]')) {
      const originalUrl = normalizeLiveUrl(anchor.href);
      const enrichedUrl = enrichLiveUrl(anchor.href, anchor);
      if (enrichedUrl && enrichedUrl !== originalUrl) {
        event.preventDefault();
        event.stopImmediatePropagation();
        location.assign(enrichedUrl);
        return;
      }
    }

    const button = findSpecialLiveButton(event);
    if (!button) {
      return;
    }

    const liveUrl = enrichLiveUrl(findReactLiveUrl(button), button);
    if (!liveUrl) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    location.assign(liveUrl);
  }, true);

  window.open = function patchedWindowOpen(url, target, features) {
    const liveUrl = normalizeLiveUrl(url);
    if (liveUrl && String(target || "").toLowerCase() === "_self") {
      return originalOpen(url, target, features);
    }
    if (liveUrl) {
      location.assign(liveUrl);
      return window;
    }
    return originalOpen(url, target, features);
  };

  HTMLAnchorElement.prototype.click = function patchedAnchorClick() {
    const liveUrl = normalizeLiveUrl(this.href);
    const target = (this.getAttribute("target") || "_self").toLowerCase();
    if (liveUrl && target === "_self") {
      return originalAnchorClick.call(this);
    }
    if (liveUrl) {
      location.assign(liveUrl);
      return;
    }
    return originalAnchorClick.call(this);
  };

  HTMLFormElement.prototype.submit = function patchedFormSubmit() {
    const liveUrl = normalizeLiveUrl(this.action);
    const target = (this.getAttribute("target") || "_self").toLowerCase();
    if (liveUrl && target === "_self") {
      return originalFormSubmit.call(this);
    }
    if (liveUrl) {
      location.assign(liveUrl);
      return;
    }
    return originalFormSubmit.call(this);
  };
})();
