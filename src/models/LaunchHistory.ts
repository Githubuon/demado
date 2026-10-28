import { Model, Types } from "jstorm/chrome/local";
import Mado from "./Mado";
import { LaunchMode } from "../services/MadoLauncher"; // いやーこれ循環参照きもちわるいな

/**
 * LaunchHistory
 *
 * ログイン画面を挟んでリダイレクトされると、どうしてもdemadoとして開いた目印である
 * sessionStorageが消えてしまうので、その情報を一次的にだけ保持するためのモデル
 * Usage側でhisotry.delete()を呼ぶことで、その情報を消すようにすべきだが
 * どこかで自動でLaunchHistory.drop()を呼ぶようにしてもいいかもしれない
 */
export default class LaunchHistory extends Model {
  static override _namespace_ = "LaunchHistory";
  static override schema = {
    mado: Types.model(Mado),
    mode: Types.string,
  }
  public mado: Mado = Mado.new();
  public mode: LaunchMode = LaunchMode.DEFAULT;

  /** Remove orphaned launch records and large icon payloads from active records. */
  public static async cleanup(): Promise<void> {
    const tabs = await chrome.tabs.query({});
    const openTabIds = new Set(tabs.flatMap((tab) => tab.id === undefined ? [] : [`${tab.id}`]));
    const histories = await this.list<LaunchHistory>();

    for (const history of histories) {
      if (!history._id || !openTabIds.has(history._id)) {
        await history.delete();
        continue;
      }

      let changed = Boolean(history.mado.iconUrl);
      history.mado.iconUrl = undefined;
      history.mado.subPages = history.mado.subPages.map((page) => {
        if (page.iconUrl) changed = true;
        return { ...page, iconUrl: undefined };
      });
      if (changed) await history.save();
    }
  }

  public static async draw(tabId: number): Promise<LaunchHistory | null> {
    const history = await this.find(`${tabId}`);
    if (history) await history.delete();
    return history;
  }
}
