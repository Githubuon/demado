import Mado from "../models/Mado";

export default class WindowService {
  constructor(private readonly mod: typeof chrome.windows = chrome.windows) {}

  async create(url: string, options: chrome.windows.CreateData, ): Promise<chrome.windows.Window> {
    // -32000問題の対策
    // https://qiita.com/7of9/items/390ff8c1914e5ff6c68c
    // https://stackoverflow.com/questions/1478765/location-coordinates-on-computer-showing-x-32000-y-32000
    // もうめんどくさいので、-32000という値を直狙いでfallbackします
    if (options.left === -32000 || options.top === -32000) {
      options.left = 0;
      options.top = 0;
    }
    try {
      return await this.mod.create({ url, ...options });
    } catch (e) {
      console.warn("[WindowService] Invalid bounds, retrying with default bounds", {
        url,
        options,
        error: e,
      });

      // Discard all configured bounds on retry: the size may itself be invalid,
      // and (0, 0) may be off-screen on a multi-display setup.
      return await this.mod.create({ url, type: options.type });
    }
  }

  async open(mado: Mado): Promise<chrome.windows.Window> {
    return await this.create(mado.url, {
      type: mado.addressbar ? "normal" : "popup",
      left: mado.position.x,
      top: mado.position.y,
      width: Math.round(mado.size.width * mado.zoom),
      height: Math.round(mado.size.height * mado.zoom),
    });
  }

  close(windowId: number): Promise<void> {
    return this.mod.remove(windowId);
  }

  resizeBy(
    windowId: number,
    size: { w: number | string; h: number | string },
  ): Promise<chrome.windows.Window> {
    return new Promise((resolve) => {
      this.mod.get(windowId, { populate: true }, (win) => {
        this.mod.update(
          windowId,
          {
            width: win.width! + parseInt(size.w as string),
            height: win.height! + parseInt(size.h as string),
          },
          resolve,
        );
      });
    });
  }

  get(
    windowId: number,
    getInfo: chrome.windows.QueryOptions,
  ): Promise<chrome.windows.Window> {
    return new Promise((resolve) => this.mod.get(windowId, getInfo, resolve));
  }

  focus(windowId: number): Promise<chrome.windows.Window> {
    return new Promise((resolve) =>
      this.mod.update(windowId, { focused: true }, resolve),
    );
  }
}
