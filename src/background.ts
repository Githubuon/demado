
import Messages from "./controllers/Messages";
chrome.runtime.onMessage.addListener(Messages.listener());

import Commands from "./controllers/Commands";
chrome.commands.onCommand.addListener(Commands.listener());

import { onNavigationCommited } from "./controllers/Web";
import LaunchHistory from "./models/LaunchHistory";
chrome.webNavigation.onCommitted.addListener(onNavigationCommited);
chrome.tabs.onRemoved.addListener((tabId) => {
  void LaunchHistory.draw(tabId).catch((error: unknown) => {
    console.error("[demado] Failed to remove launch history", error);
  });
});
// chrome.webNavigation.onBeforeNavigate.addListener(onNavigationBeforeNavigate);
