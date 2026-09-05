(() => {
  const CHANNEL = "douyin-live-media-v1";
  const OVERLAY_ID = "__douyin_live_same_window_overlay__";
  const LIVE_ORIGIN = "https://live.douyin.com";
  const MAIN_ORIGINS = new Set(["https://www.douyin.com", "https://douyin.com"]);
  const isMain = window.top === window && MAIN_ORIGINS.has(location.origin);
  let parentOrigin = "";
  try { parentOrigin = new URL(document.referrer).origin; } catch {}
  if (!MAIN_ORIGINS.has(parentOrigin)) parentOrigin = "";
  const isLive = location.origin === LIVE_ORIGIN && window.parent === window.top
    && window !== window.top;
  if (!isMain && !isLive) return;

  let state = null;
  let current = null;
  let ready = isMain;
  let applying = false;
  let lastInteraction = -Infinity;
  let scanPending = false;
  const known = new WeakMap();

  function valid(value) {
    return value && typeof value.volume === "number" && Number.isFinite(value.volume)
      && value.volume >= 0 && value.volume <= 1 && typeof value.muted === "boolean";
  }
  function read(media) { return { volume: media.volume, muted: media.muted }; }
  function same(a, b) { return a && b && a.volume === b.volume && a.muted === b.muted; }
  function frame() { return document.getElementById(OVERLAY_ID)?.querySelector("iframe"); }

  function selectMedia() {
    const candidates = Array.from(document.querySelectorAll("video, audio"));
    let best = null;
    let bestScore = -1;
    for (const media of candidates) {
      if (!media.isConnected || media.ended) continue;
      const rect = media.getBoundingClientRect();
      const width = Math.max(0, Math.min(rect.right, innerWidth) - Math.max(rect.left, 0));
      const height = Math.max(0, Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0));
      const style = getComputedStyle(media);
      const area = style.display === "none" || style.visibility === "hidden" ? 0 : width * height;
      // Exclude offscreen previews and gift-effect videos, even when playing.
      if (area < 1024 && media.tagName !== "AUDIO" && document.pictureInPictureElement !== media) continue;
      if (media.tagName === "AUDIO" && media.paused) continue;
      const player = media.closest(".douyin-player, .xgplayer");
      const score = area + (player ? 1e7 : 0) + (!media.paused ? 1e8 : 0)
        + (document.pictureInPictureElement === media ? 1e9 : 0);
      if (score > bestScore) { bestScore = score; best = media; }
    }
    return best;
  }

  function renderVolume(media) {
    const player = media.closest(".douyin-player, .xgplayer");
    if (!player) return;
    const percent = Math.round((media.muted ? 0 : media.volume) * 100);
    for (const number of player.querySelectorAll(".douyin-player-volume-number")) {
      if (number.textContent !== String(percent)) number.textContent = String(percent);
    }
    for (const thumb of player.querySelectorAll(".douyin-player-volume-slider-thumb")) {
      const height = `${percent}%`;
      if (thumb.style.height !== height) thumb.style.height = height;
    }
    // Native volumechange events update player icons; keep its accessible value in step too.
    const control = player.querySelector(".douyin-player-volume, .xgplayer-volume");
    if (control) {
      const label = media.muted ? "音量：已静音" : `音量：${percent}%`;
      if (control.getAttribute("aria-label") !== label) control.setAttribute("aria-label", label);
    }
  }

  function apply(media) {
    if (!media || !state || !ready) return;
    applying = true;
    try {
      // Mute first when required; never briefly expose a loud intermediate value.
      if (state.muted && !media.muted) media.muted = true;
      if (media.volume !== state.volume) media.volume = state.volume;
      if (!state.muted && media.muted) media.muted = false;
      known.set(media, read(media));
      renderVolume(media);
    } finally { applying = false; }
  }

  function send(type) {
    const target = isMain ? frame()?.contentWindow : window.parent;
    const origins = isMain ? [LIVE_ORIGIN] : parentOrigin ? [parentOrigin] : [...MAIN_ORIGINS];
    for (const origin of origins) {
      target?.postMessage({ channel: CHANNEL, type, state }, origin);
    }
  }

  function scan() {
    scanPending = false;
    const media = selectMedia();
    if (!media) return;
    if (media !== current) {
      current = media;
      known.set(media, read(media));
      if (!state && isMain && media.readyState > 0) state = read(media);
      apply(media);
    }
    if (!state && isMain && media.readyState > 0) state = read(media);
  }

  function scheduleScan() {
    if (scanPending) return;
    scanPending = true;
    setTimeout(scan, 80);
  }

  window.addEventListener("message", (event) => {
    const data = event.data;
    if (!data || data.channel !== CHANNEL) return;
    if (isMain) {
      if (event.origin !== LIVE_ORIGIN || event.source !== frame()?.contentWindow) return;
      if (data.type === "ready") {
        scan();
        if (!state && valid(data.state)) state = { volume: data.state.volume, muted: data.state.muted };
        send("state");
        return;
      }
      if (data.type !== "change" || !valid(data.state)) return;
    } else {
      if (!MAIN_ORIGINS.has(event.origin) || event.source !== window.parent || data.type !== "state") return;
      parentOrigin = event.origin;
      ready = true;
      if (!valid(data.state)) { scan(); return; }
    }
    state = { volume: data.state.volume, muted: data.state.muted };
    scan();
    apply(current);
  });

  document.addEventListener("volumechange", (event) => {
    const media = event.target;
    if (!(media instanceof HTMLMediaElement) || applying) return;
    if (!media.isConnected || media !== selectMedia()) return;
    const value = read(media);
    if (same(known.get(media), value)) { renderVolume(media); return; }
    if (!ready || media !== current || !known.has(media)) {
      current = media;
      known.set(media, value);
      apply(media);
      return;
    }
    // Paused background pages and startup defaults must not override a live-room choice.
    const userChange = performance.now() - lastInteraction < 1500;
    if ((isMain && frame()) || (!userChange && state)) {
      apply(media);
      return;
    }
    state = value;
    known.set(media, value);
    renderVolume(media);
    send(isMain ? "state" : "change");
  }, true);

  function rememberInteraction(event) {
    if (!event.isTrusted) return;
    const element = event.target instanceof Element ? event.target : null;
    const onVolume = element?.closest(".douyin-player-volume, .xgplayer-volume");
    const onPlayer = element?.closest(".douyin-player, .xgplayer, video, audio");
    if (onVolume || (event.type.startsWith("key") && onPlayer)) lastInteraction = performance.now();
  }
  for (const type of ["pointerdown", "pointermove", "pointerup", "click", "input", "change", "keydown", "keyup", "wheel"]) {
    document.addEventListener(type, rememberInteraction, true);
  }
  for (const type of ["loadedmetadata", "playing", "play", "emptied"]) {
    document.addEventListener(type, (event) => {
      if (!(event.target instanceof HTMLMediaElement)) return;
      scan();
      if (event.target === current) apply(current);
    }, true);
  }
  document.addEventListener("__douyin_live_before_open__", () => {
    scan();
    if (!frame() && current) state = read(current);
  });
  document.addEventListener("__douyin_live_after_close__", () => { scan(); apply(current); });
  window.addEventListener("scroll", scheduleScan, true);
  window.addEventListener("resize", scheduleScan);

  function start() {
    scan();
    const observer = new MutationObserver(scheduleScan);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    if (isLive) {
      send("ready");
      // Retry the handshake when a slow parent or a room navigation delays initialization.
      const retry = setInterval(() => { if (ready) clearInterval(retry); else send("ready"); }, 500);
      window.addEventListener("pagehide", () => { clearInterval(retry); observer.disconnect(); }, { once: true });
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
