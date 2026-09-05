(() => {
  if (window === window.top || window.parent !== window.top) return;
  const BUTTON_ID = "__douyin_live_pip_button__";
  let pending = false;
  let handledKey = false;
  let noticeTimer;

  function videoForPip() {
    const videos = Array.from(document.querySelectorAll(".douyin-player video, .xgplayer video, video"));
    return videos.filter(video => video.readyState >= 1 && video.videoWidth > 0 && !video.ended)
      .map(video => {
        const rect = video.getBoundingClientRect();
        const area = Math.max(0, Math.min(rect.right, innerWidth) - Math.max(rect.left, 0))
          * Math.max(0, Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0));
        return { video, area, score: area + (!video.paused ? 1e8 : 0) };
      }).filter(item => item.area > 1024).sort((a, b) => b.score - a.score)[0]?.video;
  }

  function notice(text) {
    let node = document.getElementById("__douyin_live_pip_notice__");
    if (!node) {
      node = document.createElement("div");
      node.id = "__douyin_live_pip_notice__";
      node.setAttribute("role", "status");
      Object.assign(node.style, { position: "fixed", top: "65px", left: "14px", zIndex: "2147483647",
        padding: "10px 14px", borderRadius: "8px", background: "#24242bcc", color: "white", font: "14px system-ui" });
      document.documentElement.append(node);
    }
    node.textContent = text;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => node.remove(), 4500);
  }

  async function toggle() {
    if (pending) return;
    if (!document.pictureInPictureEnabled) { notice("当前浏览器不允许视频小窗播放"); return; }
    pending = true;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else {
        const video = videoForPip();
        if (!video) { notice("请等直播画面加载完成后再开启小窗"); return; }
        // Request on the original click/keydown stack to preserve user activation.
        const disabled = video.disablePictureInPicture;
        video.disablePictureInPicture = false;
        try { await video.requestPictureInPicture(); }
        finally { video.disablePictureInPicture = disabled; }
      }
      updateLabel();
    } catch (error) {
      console.warn("[抖音同窗口] 小窗播放失败", error.name, error.message);
      notice("小窗未能打开，请再次点击左上角“小窗播放”");
    } finally { pending = false; }
  }

  function updateLabel() {
    const button = document.getElementById(BUTTON_ID);
    if (!button) return;
    const active = Boolean(document.pictureInPictureElement);
    button.textContent = active ? "退出小窗" : "小窗播放";
    button.setAttribute("aria-label", active ? "退出直播小窗" : "开启直播小窗");
    button.setAttribute("aria-pressed", String(active));
  }

  function isPipControl(element) {
    if (!element) return false;
    if (element.closest(`#${BUTTON_ID}`)) return true;
    const controls = element.closest(".douyin-player-controls, .xgplayer-controls");
    if (!controls) return false;
    let node = element;
    while (node && node !== controls) {
      const label = [node.getAttribute("aria-label"), node.getAttribute("title"), node.textContent].join(" ").trim();
      if (label.length < 90 && /(?:开启|关闭|退出|进入)小窗模式|小窗播放|画中画/.test(label)) return true;
      node = node.parentElement;
    }
    return false;
  }

  window.addEventListener("click", event => {
    if (!event.isTrusted || event.button !== 0 || event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) return;
    if (!isPipControl(event.target instanceof Element ? event.target : null)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void toggle();
  }, true);

  for (const type of ["keydown", "keyup"]) window.addEventListener(type, event => {
    if (!event.isTrusted || event.key.toLowerCase() !== "u" || event.ctrlKey || event.altKey || event.metaKey) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]')) return;
    if (!videoForPip() && !document.pictureInPictureElement) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (type === "keydown" && !event.repeat && !handledKey) { handledKey = true; void toggle(); }
    if (type === "keyup") handledKey = false;
  }, true);
  window.addEventListener("blur", () => { handledKey = false; });
  document.addEventListener("enterpictureinpicture", updateLabel, true);
  document.addEventListener("leavepictureinpicture", updateLabel, true);

  function start() {
    const button = document.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";
    button.title = "直播小窗播放（U）";
    Object.assign(button.style, { position: "fixed", left: "130px", top: "14px", zIndex: "2147483647",
      height: "38px", padding: "0 14px", border: "1px solid #ffffff33", borderRadius: "20px",
      background: "#141418c7", color: "white", cursor: "pointer", font: "14px system-ui" });
    document.documentElement.append(button);
    updateLabel();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
