import Dashboard from "../models/Dashboard";
import Mado from "../models/Mado";
import type { MadoSubPage } from "../models/Mado";
import LaunchHistory from "../models/LaunchHistory";
import GlobalConfig from "../models/GlobalConfig";
import PermissionService from "./PermissionService";
import ScriptService from "./ScriptService";
import TabService from "./TabService";
import WindowService from "./WindowService";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const BROWSER_CONTEXT_SESSION_KEY = `demado_${chrome.runtime.id}_id`;

export enum LaunchMode {
  DEFAULT = "default", // 通常の窓
  PREVIEW = "preview", // 試しに開いてみるやつ
  DYNAMIC = "dynamic", // 画面内設定の窓
}

export default class MadoLauncher {
  constructor(
    private windows: WindowService = new WindowService(),
    private tabs: TabService = new TabService(),
    private scripting: ScriptService = new ScriptService(),
    private permission: PermissionService = new PermissionService(),
  ) {}

  public dashboard = {
    open: async () => {
      const tabs = await this.tabs.query({
        url: chrome.runtime.getURL("index.html"),
      });
      for (let i = 0; i < tabs.length; i++) {
        if (tabs[i].url?.endsWith("#dashboard")) {
          await this.windows.focus(tabs[i].windowId!);
          return;
        }
      }
      const dashboard = await Dashboard.user();
      await this.windows.create(
        chrome.runtime.getURL("index.html#dashboard"),
        dashboard.toCreateData(),
      );
    },
  };

  async launchSubPage(
    parentMado: Mado,
    page: MadoSubPage,
    halfZoom = false,
  ): Promise<chrome.windows.Window> {
    await this.permission.ensure(page.url);
    const showCustomAddressbar = page.addressbar === true && !page.chromeAddressbar;
    const config = halfZoom ? await GlobalConfig.user() : null;
    const wheelClickScale = (config?.wheelClickSizePercent ?? 50) / 100;
    const mado = new Mado();

    mado.name = page.name;
    mado.url = page.url;

    mado.size = {
      width: page.width || 1000,
      height: page.height || 700,
    };

    mado.position = {
      x: page.left ?? 100,
      y: page.top ?? 100,
    };

    // Native Chrome address bars make this a normal browser window and affect
    // Chrome's own window restore bounds. Use a popup with Demado's in-page bar.
    mado.addressbar = page.chromeAddressbar ? "chrome" : false;
    mado.showScroll = page.showScroll ?? false;
    mado.zoom = halfZoom ? wheelClickScale : 1;
    mado.offset = {
      left: 0,
      top: 0,
    };

    const win = await this.windows.open(mado, showCustomAddressbar);
const tab = win.tabs?.[0];

if (tab?.id !== undefined) {
  if (!(await this.waitForTabComplete(tab.id))) return win;
  await this.scripting.offset(tab.id, mado.offset, mado.showScroll, showCustomAddressbar ? 64 : 0);
  if (mado.zoom !== 1) await this.tabs.zoom.set(tab.id, mado.zoom);
  if (showCustomAddressbar) await this.scripting.js(tab.id, "subpage-toolbar.js");
}

if (win.id !== undefined) {
  await chrome.runtime.sendMessage(chrome.runtime.id, {
    _act_: "/mado/subpage:register",
    windowId: win.id,
    madoId: parentMado._id!,
    subPageUrl: page.url,
    customAddressbar: showCustomAddressbar,
    sizeScale: halfZoom ? wheelClickScale : 1,
    bounds: {
      width: win.width,
      height: win.height,
      left: win.left,
      top: win.top,
    },
  });
}

return win;
  }

  async launch(
    mado: Mado,
    mode: LaunchMode = LaunchMode.DEFAULT,
    draft = false,
    allowDuplicate = false,
    trackHalfZoomPosition = false,
  ): Promise<chrome.windows.Window> {
    const exists = allowDuplicate ? null : await this.retrieve(mado);
    if (exists && mode == LaunchMode.DEFAULT) {
      // すでにlaunch済みなら、focusして終了
      this.windows.focus(exists.win.id!);
      return exists.win;
    }
    if (exists && (mode == LaunchMode.PREVIEW || mode == LaunchMode.DYNAMIC)) {
      this.windows.close(exists.win.id!);
    }

    const win = await this.windows.open(mado, mado.addressbar === true);
    const tab = win.tabs![0];
    const historyMado = Mado.new({
      ...mado.export(),
      iconUrl: undefined,
      subPages: mado.subPages.map((page) => ({ ...page, iconUrl: undefined })),
    }, mado._id || undefined);
    await LaunchHistory.create({ _id: tab.id, mado: historyMado, mode, trackHalfZoomPosition });

    if (!(await this.waitForTabComplete(tab.id!))) return win;
    await this.scripting.offset(tab.id!, mado.offset, mado.showScroll, mado.addressbar === true ? 64 : 0);
    if (mado.stylesheet) await this.scripting.style(tab.id!, mado.stylesheet);
    await this.scripting.js(tab.id!, "content-script.js");
    if (mado.addressbar === true) await this.scripting.js(tab.id!, "subpage-toolbar.js");

    await chrome.tabs.sendMessage(tab.id!, {
      _act_: "/injected:__init__",
      id: mado._id,
      mado: mado.export(),
      mode,
      trackHalfZoomPosition,
    });

    // ここではウィンドウを新規作成しているので、Bazelを考慮したresizeが必要
    await this.resize(tab);

    if (mode == LaunchMode.DYNAMIC) {
      // 何らかの方法で現在の設定値をページに継承しなければならない
      await this.scripting.execute(
        tab.id!,
        function (portablestr, draft) {
          // FIXME: ここのkeyはどこかに定義しないとdynamic-confg.jsとの整合性があぶない
          const config = JSON.parse(portablestr);
          config.demadoDraft = draft;
          sessionStorage.setItem("demado_default_config_value", JSON.stringify(config));
        },
        [JSON.stringify(mado.export()), draft],
      );
      await this.scripting.js(tab.id!, "dynamic-config.js");
    }

    return win;
  }

  async launchAtWheelClickSize(mado: Mado): Promise<chrome.windows.Window> {
    const config = await GlobalConfig.user();
    const wheelClickScale = (config.wheelClickSizePercent ?? 50) / 100;
    const halfZoomMado = Mado.new({ ...mado.export(), zoom: mado.zoom * wheelClickScale }, mado._id || undefined);
    halfZoomMado.position = mado.halfZoomPosition ?? mado.position;
    return this.launch(halfZoomMado, LaunchMode.DEFAULT, false, true, true);
  }

  private async waitForTabComplete(tabId: number): Promise<boolean> {
    return await new Promise<boolean>((resolve) => {
      let settled = false;
      const cleanup = () => {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(onUpdated);
        chrome.tabs.onRemoved.removeListener(onRemoved);
      };
      const finish = (tabStillOpen = true) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(tabStillOpen);
      };
      const onUpdated = (updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
        if (updatedTabId === tabId && changeInfo.status === "complete") finish();
      };
      const onRemoved = (removedTabId: number) => {
        if (removedTabId === tabId) finish(false);
      };
      const timeout = setTimeout(() => {
        console.warn(`[MadoLauncher] Tab ${tabId} did not finish loading in time; injecting scripts anyway`);
        finish();
      }, 15000);

      chrome.tabs.onUpdated.addListener(onUpdated);
      chrome.tabs.onRemoved.addListener(onRemoved);
      void this.tabs.get(tabId).then((tab) => {
        if (tab?.status === "complete") finish();
      }).catch(() => {
        // The tab may have closed between creation and this lookup.
        finish(false);
      });
    });
  }

  /**
   * ベゼルのぶんだけウィンドウをリサイズする
   * 実際は、リサイズしてくれとbackgroundにリクエストをしろとscriptinjectしている
   * @param {chrome.tabs.Tab} tab
   */
  async resize(tab: chrome.tabs.Tab): Promise<void> {
    await sleep(500);
    await this.scripting.execute(
      tab.id!,
      function (ext) {
        return chrome.runtime.sendMessage(ext, {
          _act_: "/mado/resize",
          frame: {
            outer: { w: window.outerWidth, h: window.outerHeight },
            inner: { w: window.innerWidth, h: window.innerHeight },
          },
        });
      },
      [chrome.runtime.id],
    );
  }

  /**
   * このタブをdemadoとして開こうとした目印としてsessionStorageを埋め込むメソッド
   * @param {chrome.tabs.Tab} tab
   * @param {Mado} mado
   * @param {LaunchMode} mode
   */
  async anchor(
    tab: chrome.tabs.Tab,
    mado: Mado,
    mode: LaunchMode = LaunchMode.DEFAULT,
  ): Promise<void> {
    await this.scripting.execute(
      tab.id!,
      function (ext, mado, po, mode) {
        sessionStorage.setItem(`demado_${ext}_id`, mado._id);
        sessionStorage.setItem(`demado_${ext}_madojson`, JSON.stringify(po));
        sessionStorage.setItem(`demado_${ext}_mode`, mode);
      },
      [chrome.runtime.id, mado, mado.export(), mode],
    );
  }

  /**
   * リロードなどの理由で、sessionStorageにはIDがあるが、修飾などがリセットされている場合に、
   * そのウィンドウを再度demadoとして扱うようにする
   * @param {chrome.tabs.Tab} tab
   */
  async reactivate(tab: chrome.tabs.Tab, mado: Mado, trackHalfZoomPosition = false): Promise<void> {
    // ここでは既存のウィンドウを再利用するので、Bazelを考慮したresizeがいらない
    // CSS inserted with insertCSS belongs to the current document and is cleared
    // when the page navigates (for example, from a login page to the target).
    // Navigation callbacks can run before loading finishes. Wait for the new
    // document so the CSS and content script are installed on the final page.
    if (!(await this.waitForTabComplete(tab.id!))) return;
    await this.scripting.offset(tab.id!, mado.offset, mado.showScroll, mado.addressbar === true ? 64 : 0);
    await this.scripting.js(tab.id!, "content-script.js");
    if (mado.addressbar === true) await this.scripting.js(tab.id!, "subpage-toolbar.js");
    await chrome.tabs.sendMessage(tab.id!, {
      _act_: "/injected:__init__",
      id: mado._id,
      mado: mado.export(),
      trackHalfZoomPosition,
    });
  }

  /**
   * あたえられたタブIDから、そのタブがdemadoとして開かれているかどうかを調べ
   * hydrateして返す
   * @param {number} tabId
   * @returns {Promise<Mado | null>}
   */
  async lookup(tabId: number): Promise<Mado | null> {
    try {
      const id = await this.scripting.execute(
        tabId,
        function (k) {
          return sessionStorage.getItem(k);
        },
        [BROWSER_CONTEXT_SESSION_KEY],
      );
      if (!id) return null;
      const mado = await Mado.find(id);
      await mado?.hydrate(this);
      return mado;
    } catch (e) {
      return null;
    }
  }

  /**
   * retrieve は、指定されたMadoが既に開かれているかどうかを確認し、
   * 開かれている場合はそのウィンドウとタブを返します
   * @param mado
   * @returns
   */
  async retrieve(mado: Mado): Promise<{
    win: chrome.windows.Window;
    tab: chrome.tabs.Tab;
    mado: Mado;
  } | null> {
    // {{{ chrome API で ドメインのみのURLではエラーが出るため、URLの最後にスラッシュを追加する
    const u = new URL(mado.url);
    const url = [
      u.pathname == "/" && !mado.url.endsWith("/") ? mado.url + "/" : mado.url,
    ];
    // }}}
    // {{{ おせっかいながら、httpで設定されててhttpsにリダイレクトされているケースを考慮
    if (u.protocol == "http:") url.push(url[0].replace("http:", "https:"));
    // }}}
    const tabs = await this.tabs.query({ url });
    if (!tabs || tabs.length === 0) return null;
    for (let i = 0; i < tabs.length; i++) {
      const tab = tabs[i];
      if ((await this.tabs.query({ windowId: tab.windowId })).length > 1)
        continue; // ウィンドウ内に他のタブがある場合はdemadoではない
      if (!(await this.identify(tab, mado))) continue; // セッションストレージに同一のMado IDがない場合は今開こうとしているmadoではない
      const win = await this.windows.get(tab.windowId!, { populate: true });
      return { win, tab, mado };
    }
    return null;
  }

  /**
   * あたえられたタブとMadoが同一の目印（=sessionStorageに保存されたID）を持っているかどうかを調べる
   * 同一であれば、このタブはまさにこのMadoと同一の存在であるといえる
   * @param {chrome.tabs.Tab} tab
   * @param {Mado} mado
   * @returns {Promise<boolean>}
   */
  private async identify(tab: chrome.tabs.Tab, mado: Mado): Promise<boolean> {
    const id = await this.scripting.execute(
      tab.id!,
      function (k) {
        return sessionStorage.getItem(k);
      },
      [BROWSER_CONTEXT_SESSION_KEY],
    );
    if (id == mado._id) return true;
    return false; // セッションストレージにIDがない場合はdemadoではない
  }

  async mute(mado: Mado, muted: boolean = true): Promise<void> {
    const existance = await this.retrieve(mado);
    if (!existance) return;
    await this.tabs.mute(existance.tab.id!, muted);
  }

  async permitted(mado: Mado): Promise<boolean> {
    return (await this.permission.contains(mado.url)) !== null;
  }
}
