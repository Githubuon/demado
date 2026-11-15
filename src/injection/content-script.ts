import type GlobalConfig from "../models/GlobalConfig";
import { type MadoPortableObject } from "../models/Mado";

(() => {
  const globalState = globalThis as typeof globalThis & { __demadoContentScriptInitialized?: boolean };
  if (globalState.__demadoContentScriptInitialized) return;
  globalState.__demadoContentScriptInitialized = true;

  let id: string | null;
  let mode: string | null;
  let trackHalfZoomPosition = false;
  let mado: MadoPortableObject;
  let interval: number | undefined;

  chrome.runtime.onMessage.addListener(async (msg) => {
    switch (msg._act_) {
    case "/injected:__init__": {
      id = msg.id; mado = msg.mado; mode = msg.mode;
      trackHalfZoomPosition = Boolean(msg.trackHalfZoomPosition);
      const ext = chrome.runtime.id;
      sessionStorage.setItem(`demado_${ext}_id`, id as string);
      sessionStorage.setItem(`demado_${ext}_madojson`, JSON.stringify(mado));
      if (mode) {
        sessionStorage.setItem(`demado_${ext}_mode`, mode as string);
      }
      return await __init__();
    }
    }
  });


  const __init__ = async () => {

    if (!mado) {
      const res: { mado: MadoPortableObject } = await chrome.runtime.sendMessage(chrome.runtime.id, { _act_: "/mado:get", id });
      mado = res.mado;
    }

    if (mado.zoom !== 1) {
      await chrome.runtime.sendMessage(chrome.runtime.id, { _act_: "/mado/zoom:set", value: mado.zoom });
    }

    window.clearInterval(interval);
    interval = window.setInterval(() => {
      chrome.runtime.sendMessage(chrome.runtime.id, {
        _act_: "/mado/position:track",
        id,
        position: { x: window.screenX, y: window.screenY },
        trackHalfZoomPosition,
      });
    }, 1000);

    const { config }: { config: GlobalConfig } = await chrome.runtime.sendMessage({ _act_: "/global-config:get" });
    if (config.alertOnClose) {
      window.onbeforeunload = (ev: BeforeUnloadEvent) => {
        window.clearInterval(interval);
        ev.stopPropagation();
        return true;
      };
    }
  }

})();
