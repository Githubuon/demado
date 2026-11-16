import { Router } from "chromite";
import Mado, { MadoLikeParams } from "../models/Mado";
import LaunchHistory from "../models/LaunchHistory";
import TabService from "../services/TabService";
import GlobalConfig from "../models/GlobalConfig";
import WindowService from "../services/WindowService";
import MadoLauncher, { LaunchMode } from "../services/MadoLauncher";
import ScriptService from "../services/ScriptService";
import PermissionService from "../services/PermissionService";

const r = new Router<chrome.runtime.ExtensionMessageEvent>();
type SubPageWindowInfo = { madoId: string; subPageUrl: string; sizeScale: number; customAddressbar: boolean };
const subPageWindows = new Map<number, SubPageWindowInfo>();
const SUBPAGE_WINDOWS_KEY = "demadoSubPageWindowRegistry";

async function getSubPageWindowInfo(windowId: number) {
  const cached = subPageWindows.get(windowId);
  if (cached) return cached;
  const stored = await chrome.storage.session.get(SUBPAGE_WINDOWS_KEY);
  const registry = stored[SUBPAGE_WINDOWS_KEY] as Record<string, SubPageWindowInfo> | undefined;
  const info = registry?.[String(windowId)];
  if (info) subPageWindows.set(windowId, info);
  return info;
}

async function storeSubPageWindowInfo(windowId: number, info?: SubPageWindowInfo) {
  const stored = await chrome.storage.session.get(SUBPAGE_WINDOWS_KEY);
  const registry = (stored[SUBPAGE_WINDOWS_KEY] ?? {}) as Record<string, SubPageWindowInfo>;
  if (info) {
    subPageWindows.set(windowId, info);
    registry[String(windowId)] = info;
  } else {
    subPageWindows.delete(windowId);
    delete registry[String(windowId)];
  }
  await chrome.storage.session.set({ [SUBPAGE_WINDOWS_KEY]: registry });
}

async function saveSubPageBounds(
  info: { madoId: string; subPageUrl: string; sizeScale: number },
  bounds: { width?: number; height?: number; left?: number; top?: number },
): Promise<void> {
  const mado = await Mado.find(info.madoId);
  if (!mado) return;

  const page = mado.subPages.find((candidate) => candidate.url === info.subPageUrl);
  if (!page) return;

  if (bounds.width !== undefined) page.width = Math.round(bounds.width / info.sizeScale);
  if (bounds.height !== undefined) page.height = Math.round(bounds.height / info.sizeScale);
  if (bounds.left !== undefined) page.left = bounds.left;
  if (bounds.top !== undefined) page.top = bounds.top;

  await mado.update({ subPages: mado.subPages });
}

chrome.windows.onBoundsChanged.addListener(async (win) => {
  if (win.id === undefined) return;

  const info = await getSubPageWindowInfo(win.id);
  if (!info) return;
  await saveSubPageBounds(info, win);
});

chrome.windows.onRemoved.addListener((windowId) => {
  void storeSubPageWindowInfo(windowId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  void (async () => {
    const scripting = new ScriptService();
    if (tab.windowId !== undefined) {
      const info = await getSubPageWindowInfo(tab.windowId);
      if (info?.customAddressbar) {
        const mado = await Mado.find(info.madoId);
        const page = mado?.subPages.find((candidate) => candidate.url === info.subPageUrl);
        try {
          await scripting.offset(tabId, { left: 0, top: 0 }, page?.showScroll ?? false, 64);
          await scripting.js(tabId, "subpage-toolbar.js");
        } catch {
          // The toolbar can't be injected if the destination has no host permission.
        }
        return;
      }
    }

    const history = await LaunchHistory.find(`${tabId}`);
    if (history?.mado.addressbar !== true) return;
    const launcher = new MadoLauncher();
    const mado = await Mado.find(history.mado._id!);
    if (!mado) return;
    await mado.hydrate(launcher);
    if (mado.$existance) await launcher.reactivate(mado.$existance.tab, mado, history.trackHalfZoomPosition);
  })();
});

// 現状では、Windowが閉じてしまうようなcontext (e.g. popup) から
// launchしたいときのみ利用するendpoint
r.on("/mado/launch", async ({ id, mode }: { id: string; mode: LaunchMode }) => {
  const mado = await Mado.find(id);
  if (!mado) return; // TODO: エラーハンドリング
  const launcher = new MadoLauncher();
  await launcher.launch(mado, mode);
});

r.on("/mado/position:track", async (m) => {
  const mado = await Mado.find(m.id);
  if (!mado) return;

  await mado.update({
    ...(m.trackHalfZoomPosition
      ? { halfZoomPosition: m.position }
      : { position: m.position }),
  });
});

r.on(
  "/mado/subpage:register",
  async (m: {
    windowId: number;
    madoId: string;
    subPageUrl: string;
    sizeScale?: number;
    bounds?: { width?: number; height?: number; left?: number; top?: number };
    customAddressbar?: boolean;
  }) => {
    const info = {
      madoId: m.madoId,
      subPageUrl: m.subPageUrl,
      sizeScale: Number.isFinite(m.sizeScale) && (m.sizeScale ?? 0) > 0 ? m.sizeScale! : 1,
      customAddressbar: Boolean(m.customAddressbar),
    };
    await storeSubPageWindowInfo(m.windowId, info);
    if (m.bounds) await saveSubPageBounds(info, m.bounds);
  },
);

r.on("/mado/subpage-toolbar:back", async (_m, sender) => {
  const tabId = sender.tab?.id;
  if (tabId === undefined) return { error: "タブを特定できません" };
  try {
    await chrome.tabs.goBack(tabId);
    return { ok: true };
  } catch {
    return { error: "戻る履歴がありません" };
  }
});

r.on("/mado/subpage-toolbar:forward", async (_m, sender) => {
  const tabId = sender.tab?.id;
  if (tabId === undefined) return { error: "タブを特定できません" };
  try {
    await chrome.tabs.goForward(tabId);
    return { ok: true };
  } catch {
    return { error: "進む履歴がありません" };
  }
});

r.on("/mado/subpage-toolbar:reload", async (_m, sender) => {
  const tabId = sender.tab?.id;
  if (tabId === undefined) return { error: "タブを特定できません" };
  await chrome.tabs.reload(tabId);
  return { ok: true };
});

r.on("/mado/subpage-toolbar:navigate", async (m: { url: string }, sender) => {
  const tabId = sender.tab?.id;
  if (tabId === undefined) return { error: "タブを特定できません" };
  try {
    const url = new URL(m.url);
    if (url.protocol !== "http:" && url.protocol !== "https:") return { error: "httpまたはhttpsのURLを指定してください" };
    const permission = await new PermissionService().ensure(url.href);
    if (!permission) return { error: "ページへのアクセス許可が必要です" };
    await chrome.tabs.update(tabId, { url: url.href });
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "ページを開けませんでした" };
  }
});

r.on(
  "/mado/dynamic-config:result",
  async (m: { mado: string; params: MadoLikeParams; draft?: boolean }) => {
    const mado = await Mado.find(m.mado);
    if (!mado) return; // TODO: エラーハンドリング
    await mado.update(m.params);
    const tabservice = new TabService();
    await tabservice.options.reopen({
      mado: mado._id!,
      ...(m.draft ? { draft: "1" } : {}),
    });
  },
);

r.on("/mado/dynamic-config/zoom:set", async (m: { value: number }, sender) => {
  const tabservice = new TabService();
  await tabservice.zoom.set(sender.tab!.id!, m.value);
});

r.on(
  "/mado/dynamic-config/offset:set",
  async (m: { mado: string; offset: { left: number; top: number } }, sender) => {
    const tabId = sender.tab?.id;
    if (tabId === undefined) return;
    const mado = await Mado.find(m.mado);
    if (!mado) return;
    await new ScriptService().offset(tabId, m.offset, mado.showScroll);
  },
);

r.on("/global-config:get", async () => {
  const config = await GlobalConfig.user();
  return { config };
});

r.on("/mado:get", async (m: { id: string }) => {
  const mado = await Mado.find(m.id);
  return { mado };
});

r.on(
  "/mado/resize",
  async (
    m: {
      zoom: number;
      frame: {
        outer: { w: number; h: number };
        inner: { w: number; h: number };
      };
    },
    sender,
  ) => {
    const tabs = new TabService();
    const zoom = await tabs.zoom.get(sender.tab!.id!);
    const wins = new WindowService();
    const diff = {
      w: m.frame.outer.w - m.frame.inner.w * zoom,
      h: m.frame.outer.h - m.frame.inner.h * zoom,
    };
    return await wins.resizeBy(sender.tab!.windowId, diff);
  },
);

r.on("/mado/zoom:set", async (m: { value: number }, sender) => {
  const tabservice = new TabService();
  await tabservice.zoom.set(sender.tab!.id!, m.value || 1);
});

r.onNotFound(async (m, s) => {
  console.log("not found", m, s);
  return { status: 404, message: `not found for path: ${m._act_}` };
});

export default r;
