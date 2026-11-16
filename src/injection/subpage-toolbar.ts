(() => {
  const hostId = "demado-subpage-toolbar";
  if (document.getElementById(hostId)) return;

  const host = document.createElement("div");
  host.id = hostId;
  host.style.cssText = "all:initial;position:fixed!important;inset:0 0 auto 0!important;z-index:2147483647!important;";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      .bar { box-sizing:border-box; height:39px; padding:5px 10px; color:#202124; background:#f1f3f4;
        border-bottom:1px solid #dadce0; font:13px/1.2 Arial,sans-serif; box-shadow:0 1px 3px #0002; }
      .controls { height:29px; display:flex; align-items:center; gap:5px; }
      button { box-sizing:border-box; height:25px; border:1px solid #dadce0; border-radius:4px; padding:0 8px;
        color:#202124; background:#fff; font:12px Arial,sans-serif; white-space:nowrap; cursor:pointer; }
      button:hover { background:#e8eaed; }
      button:disabled { opacity:.45; cursor:default; }
      [hidden] { display:none!important; }
      .nav { width:28px; padding:0; font-size:16px; }
      form { min-width:50px; flex:1; display:flex; }
      input { box-sizing:border-box; width:100%; height:25px; border:1px solid #c6c9cc; border-radius:4px;
        padding:0 8px; color:#202124; background:#fff; font:12px Arial,sans-serif; outline:none; }
      input:focus { border-color:#4285f4; box-shadow:0 0 0 1px #4285f4; }
      .status { position:absolute; right:10px; top:39px; color:#5f6368; font-size:11px; }
      .share-menu { position:absolute; right:10px; top:34px; display:flex; gap:4px; padding:5px; background:#fff;
        border:1px solid #dadce0; border-radius:5px; box-shadow:0 2px 8px #0003; }
    </style>
    <div class="bar" role="region" aria-label="Demadoページ操作">
      <div class="controls">
        <button class="nav back" type="button" aria-label="戻る" title="戻る">‹</button>
        <button class="nav forward" type="button" aria-label="進む" title="進む">›</button>
        <button class="nav reload" type="button" aria-label="再読み込み" title="再読み込み">↻</button>
        <form><input type="text" aria-label="URL" spellcheck="false" autocomplete="url"></form>
        <button class="copy" type="button">URLコピー</button>
        <button class="share" type="button">共有</button>
      </div>
      <div class="share-menu" hidden>
        <button type="button" data-share="line">LINE</button>
        <button type="button" data-share="x">X</button>
        <button type="button" data-share="mail">メール</button>
      </div>
      <span class="status" aria-live="polite"></span>
    </div>`;

  (document.documentElement || document).appendChild(host);
  const root = shadow;
  const input = root.querySelector<HTMLInputElement>("input")!;
  const status = root.querySelector<HTMLElement>(".status")!;
  let lastUrl = "";
  let statusTimer: number | undefined;

  const showStatus = (message: string) => {
    status.textContent = message;
    window.clearTimeout(statusTimer);
    statusTimer = window.setTimeout(() => { status.textContent = ""; }, 2200);
  };

  const refreshPageInfo = () => {
    if (input !== root.activeElement && location.href !== lastUrl) input.value = location.href;
    lastUrl = location.href;
  };

  const runAction = async (action: string) => {
    try {
      const result = await chrome.runtime.sendMessage({ _act_: `/mado/subpage-toolbar:${action}` });
      if (result?.error) showStatus(result.error);
    } catch {
      showStatus("操作できませんでした");
    }
  };

  root.querySelector(".back")!.addEventListener("click", () => { void runAction("back"); });
  root.querySelector(".forward")!.addEventListener("click", () => { void runAction("forward"); });
  root.querySelector(".reload")!.addEventListener("click", () => { void runAction("reload"); });

  root.querySelector("form")!.addEventListener("submit", async (event) => {
    event.preventDefault();
    const raw = input.value.trim();
    if (!raw) return;
    const isLocalAddress = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|[^/]+\.local)(:\d+)?([/?#]|$)/i.test(raw);
    const destination = /^https?:\/\//i.test(raw)
      ? raw
      : `${isLocalAddress ? "http" : "https"}://${raw}`;
    try {
      const parsed = new URL(destination);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("Unsupported URL scheme");
      const result = await chrome.runtime.sendMessage({
        _act_: "/mado/subpage-toolbar:navigate",
        url: parsed.href,
      });
      if (result?.error) showStatus(result.error);
    } catch {
      showStatus("URLを確認してください");
    }
  });

  root.querySelector(".copy")!.addEventListener("click", async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(location.href);
      } else {
        input.value = location.href;
        input.focus();
        input.select();
        if (!document.execCommand("copy")) throw new Error("Clipboard copy failed");
      }
      showStatus("URLをコピーしました");
    } catch {
      try {
        input.value = location.href;
        input.focus();
        input.select();
        if (!document.execCommand("copy")) throw new Error("Clipboard copy failed");
        showStatus("URLをコピーしました");
      } catch {
        showStatus("URLをコピーできませんでした");
      }
    }
  });

  root.querySelector(".share")!.addEventListener("click", async () => {
    const menu = root.querySelector<HTMLElement>(".share-menu")!;
    if (!navigator.share) {
      menu.hidden = !menu.hidden;
      return;
    }
    try {
      await navigator.share({ title: document.title || location.hostname, url: location.href });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        showStatus("共有できませんでした");
      }
    }
  });

  root.querySelectorAll<HTMLButtonElement>("[data-share]").forEach((button) => {
    button.addEventListener("click", () => {
      const sharedText = `${document.title} ${location.href}`;
      const encodedUrl = encodeURIComponent(location.href);
      const encodedText = encodeURIComponent(sharedText);
      const target = button.dataset.share === "line"
        ? `https://line.me/R/msg/text/?${encodedText}`
        : button.dataset.share === "x"
          ? `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodeURIComponent(document.title)}`
          : `mailto:?subject=${encodeURIComponent(document.title)}&body=${encodeURIComponent(location.href)}`;
      window.open(target, "_blank", "noopener,noreferrer");
      root.querySelector<HTMLElement>(".share-menu")!.hidden = true;
    });
  });

  refreshPageInfo();
  const observer = new MutationObserver(refreshPageInfo);
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  window.addEventListener("popstate", refreshPageInfo);
  window.addEventListener("hashchange", refreshPageInfo);
  window.setInterval(refreshPageInfo, 700);
})();
