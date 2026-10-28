
export default class TabService {
  constructor(
    private readonly mod: typeof chrome.tabs = chrome.tabs,
  ) { }

  public zoom: {
    set: (tabId: number, zoomFactor: number) => Promise<void>,
    get: (tabId: number) => Promise<number>,
  } = {
      set: async (tabId: number, zoomFactor: number | string) => {
        await this.mod.setZoomSettings(tabId, { scope: "per-tab" });
        return await this.mod.setZoom(tabId, parseFloat(zoomFactor as string));
      },
      get: (tabId: number) => this.mod.getZoom(tabId),
    }

  query(queryInfo: chrome.tabs.QueryInfo): Promise<chrome.tabs.Tab[]> {
    return new Promise(resolve => this.mod.query(queryInfo, resolve));
  }

  mute(tabId: number, muted: boolean = true): Promise<chrome.tabs.Tab | undefined> {
    return new Promise(resolve => this.mod.update(tabId, { muted }, resolve));
  }
  unmute(tabId: number): Promise<chrome.tabs.Tab | undefined> {
    return this.mute(tabId, false);
  }

  capture(windowId: number, options: chrome.tabs.CaptureVisibleTabOptions = { quality: 1, format: "png" }): Promise<string> {
    return this.mod.captureVisibleTab(windowId, options);
  }

  public options = {
    find: async () => {
      // URL filters can miss extension pages that have a query string (for
      // example, ?mado=...) even though they use the same index.html document.
      const tabs = await this.mod.query({});
      const found: chrome.tabs.Tab[] = [];
      for (let i = 0; i < tabs.length; i++) {
        try {
          const url = new URL(tabs[i].url!);
          const appUrl = new URL(chrome.runtime.getURL("index.html"));
          const route = url.hash.split("?")[0];
          if (
            url.origin === appUrl.origin &&
            url.pathname === appUrl.pathname &&
            (route === "#options" || route === "#/options")
          ) {
            found.push(tabs[i]);
          }
        } catch (e) {
          continue;
        }
      }
      found.sort((a, b) => Number(Boolean(b.active)) - Number(Boolean(a.active)));
      return found;
    },
    open: async (params: Record<string, unknown> = {}) => {
      const url = new URL(chrome.runtime.getURL("index.html"));
      url.search = new URLSearchParams(params as Record<string, string>).toString();
      url.hash = "#options";
      return await this.mod.create({ url: url.toString(), active: true });
    },
    reopen: async (params: Record<string, unknown> = {}) => {
      const tabs = await this.options.find();
      const url = new URL(chrome.runtime.getURL("index.html"));
      url.search = new URLSearchParams(params as Record<string, string>).toString();
      url.hash = "#options";

      // Keep the existing options tab/window so returning from the in-page
      // configuration does not create a second settings window.
      const [tab, ...duplicates] = tabs;
      if (duplicates.length > 0) {
        await this.mod.remove(duplicates.map(duplicate => duplicate.id!));
      }
      if (tab?.id !== undefined) {
        return await this.mod.update(tab.id, { url: url.toString(), active: true });
      }
      return await this.mod.create({ url: url.toString(), active: true });
    },
  }

  public async get(tabId: number): Promise<chrome.tabs.Tab | undefined> {
    return new Promise(resolve => this.mod.get(tabId, resolve));
  }
}
