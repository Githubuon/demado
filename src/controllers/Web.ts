import LaunchHistory from "../models/LaunchHistory";
import MadoLauncher from "../services/MadoLauncher";
import TabService from "../services/TabService";

/**
 * 未ログイン状態でのページリロード時に、DMMなどでログインしたあとに
 * リダイレクトされたときに、窓をactivateしなおす。
 * 起動履歴はタブ単位で作成しているため、遷移先URLが登録URLや
 * ログインURLと異なっていても、このタブの履歴を使って復旧する。
 */
export async function onNavigationCommited(details: chrome.webNavigation.WebNavigationTransitionCallbackDetails) {
  if (details.frameType != "outermost_frame") return;
  const launcher = new MadoLauncher();
  if (details.transitionType == "reload") {
    const mado = await launcher.lookup(details.tabId);
    if (!mado || !mado.$existance) return;
    await launcher.reactivate(mado.$existance!.tab!, mado);
  }
  if (details.transitionQualifiers.includes("server_redirect")) {
    const tab = await new TabService().get(details.tabId);
    if (!tab) return;
    const history = await LaunchHistory.find(`${details.tabId}`);
    if (!history) return;
    // リダイレクトチェーンの途中でログイン画面を経由する場合がある。
    // そのたびに履歴を消すと、次の遷移で復旧できなくなるため、
    // 履歴はタブが閉じられるまで保持する。
    await launcher.anchor(tab, history.mado, history.mode);
    const mado = await launcher.lookup(details.tabId);
    if (!mado || !mado.$existance) return;
    await launcher.reactivate(mado.$existance!.tab!, mado);
  }
}
