
export default class ScriptService {
  private static offsetStyles = new Map<number, string>();

  constructor(
    private readonly mod: typeof chrome.scripting = chrome.scripting,
  ) { }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute<T>(tabId: number, func: (...args: any[]) => T, args: any[] = [], injectImmediately = false) {
    return this.mod.executeScript({
      target: { tabId },
      func, args,
      injectImmediately,
    }).then(res => res[0].result);
  }

  js(tabId: number, jsfiles: string | string[]): Promise<unknown> {
    return this.mod.executeScript({
      target: { tabId },
      files: (typeof jsfiles === "string") ? [jsfiles] : jsfiles,
    }).then(res => res[0].result);
  }

  style(tabId: number, css: string): Promise<void> {
    return this.mod.insertCSS({
      target: { tabId },
      css,
      origin: "USER",
    });
  }

  async offset(tabId: number, offset: { left: number, top: number }, showScroll: boolean): Promise<void> {
    const previousCss = ScriptService.offsetStyles.get(tabId);
    if (previousCss) {
      try {
        await this.mod.removeCSS({
          target: { tabId },
          css: previousCss,
          origin: "USER",
        });
      } catch {
        // The previous document may have navigated since its CSS was inserted.
      }
    }

    const css = `
      html {
        overflow: ${showScroll ? "auto" : "hidden"} !important;
      }
      body {
        position: relative !important;
        left: ${offset.left}px !important;
        top: ${offset.top}px !important;
      }
    `;
    await this.mod.insertCSS({
      target: { tabId },
      css,
      origin: "USER",
    });
    ScriptService.offsetStyles.set(tabId, css);
  }
}
