import React, { useEffect, useMemo, useState } from "react";
import Mado from "../../models/Mado";
import LaunchHistory from "../../models/LaunchHistory";
import PermissionService from "../../services/PermissionService";
import type MadoLauncher from "../../services/MadoLauncher";
import { ChoiceField } from "../form/ChoiceField";
import { MatrixField } from "../form/MatrixField";
import { InputField } from "../form/InputField";
import { ColorField } from "../form/ColorField";
import { MadoAdvancedConfigs } from "./MadoAdvancedConfigs";
import { LaunchMode } from "../../services/MadoLauncher";
import { extractPageFaviconUrl, FaviconImage, siteFaviconUrl } from "./FaviconImage";

async function readIconFile(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 128 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("アイコン画像を処理できません");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) resolve(result);
      else reject(new Error("アイコン画像を圧縮できません"));
    }, "image/webp", 0.82);
  });
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string"
      ? resolve(reader.result)
      : reject(new Error("アイコン画像を読み込めません"));
    reader.onerror = () => reject(reader.error ?? new Error("アイコン画像を読み込めません"));
    reader.readAsDataURL(blob);
  });
}

export function MadoConfigModal({
  active,
  close,
  launcher,
  mado,
  draft = false,
  update,
  refresh,
}: {
  active: boolean;
  close: () => void;
  launcher: MadoLauncher;
  mado?: Mado | null;
  draft?: boolean;
  update: (mado: Mado) => void;
  refresh: () => void;
}) {
  const [showAdvanced, setShowAdvanced] = React.useState(true);
  const [draftStarted, setDraftStarted] = useState(false);
  const draftMode = draft || draftStarted;

  const [subPageName, setSubPageName] = useState("");
  const [subPageUrl, setSubPageUrl] = useState("");
  const [draggedSubPageIndex, setDraggedSubPageIndex] = useState<number | null>(
    null,
  );
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setDraftStarted(draft);
  }, [draft, mado]);

  const perm = useMemo(() => new PermissionService(), []);
  const fallback = () => window.alert("許可がないため、操作できません");
  const cleanup = () => {
    setShowAdvanced(false);
    close();
  };
  if (!mado) return null;
  return (
    <div className={"modal " + (active ? "is-active" : "")}>
      <div
        className="modal-background" /* onClick={cleanup} // 背景黒領域で閉じるかどうか悩ましい */
      ></div>
      <div className="modal-card">
        <header className="modal-card-head">
          <p className="modal-card-title">
            {mado._id && !draftMode ? "窓の設定変更" : "窓の新規登録"}
          </p>
          <span className="is-size-6 has-text-grey-light">{mado._id}</span>
        </header>
        <section className="modal-card-body">
          {saveError && <div className="notification is-danger is-light" role="alert">{saveError}</div>}
          <InputField
            label="窓のURL"
            type="url"
            icon="fa fa-link"
            help=""
            defaultValue={mado.url}
            placeholder="http://www.dmm.com/netgame/social/-/gadgets/=/app_id=854854"
            onChange={(ev) => {
              mado.url = ev.target.value;
              update(mado);
            }}
          />
          <InputField
            label="窓の名前"
            type="text"
            icon="fa fa-tag"
            help=""
            defaultValue={mado.name}
            placeholder="艦これ（ながらプレイ用）"
            required={false}
            onChange={(ev) => {
              mado.name = ev.target.value;
              update(mado);
            }}
          />
          <div className="field">
            <label className="label">窓のアイコン</label>
            <p className="help mb-2">窓のURLから取得した favicon を使うか、画像ファイルを選べます。</p>
            <div className="is-flex is-align-items-center" style={{ gap: "0.75rem" }}>
              {mado.iconUrl === "" ? <span className="icon"><i className="fa fa-globe" /></span> : mado.iconUrl || siteFaviconUrl(mado.url) ? <FaviconImage pageUrl={mado.url} iconUrl={mado.iconUrl} alt="窓のアイコン" style={{ width: 32, height: 32, objectFit: "contain" }} /> : <span className="icon"><i className="fa fa-globe" /></span>}
              <button type="button" className="button is-small" onClick={async () => {
                try {
                  const parsed = new URL(mado.url);
                  if (parsed.protocol === "http:" || parsed.protocol === "https:") {
                    mado.iconUrl = await extractPageFaviconUrl(mado.url);
                    update(mado);
                  }
                } catch { /* URLが有効になるまで何もしない */ }
              }}>URLから取得</button>
              <label className="button is-small">
                ファイルを選択
                <input
                  type="file"
                  accept="image/*,.ico"
                  hidden
                  onChange={(ev) => {
                    const file = ev.target.files?.[0];
                    if (!file) return;
                    void readIconFile(file).then((iconUrl) => {
                        mado.iconUrl = iconUrl;
                        update(mado);
                    }).catch((error: unknown) => {
                      setSaveError(error instanceof Error ? error.message : "アイコン画像を処理できません");
                    });
                    ev.target.value = "";
                  }}
                />
              </label>
              {mado.iconUrl && <button type="button" className="button is-small is-light" onClick={() => { mado.iconUrl = ""; update(mado); }}>クリア</button>}
            </div>
          </div>
          <div className="field">
            <label className="label">攻略・関連ページ</label>

            {mado.subPages.map((page, index) => (
              <div
                key={`${page.url}-${index}`}
                className="box"
                draggable
                onDragStart={(ev) => {
                  setDraggedSubPageIndex(index);
                  ev.dataTransfer.effectAllowed = "move";
                  ev.dataTransfer.setData("text/plain", String(index));
                }}
                onDragOver={(ev) => {
                  ev.preventDefault();
                  ev.dataTransfer.dropEffect = "move";
                }}
                onDrop={(ev) => {
                  ev.preventDefault();

                  const fromIndex = draggedSubPageIndex;
                  if (fromIndex === null || fromIndex === index) {
                    setDraggedSubPageIndex(null);
                    return;
                  }

                  const subPages = [...mado.subPages];
                  const [moved] = subPages.splice(fromIndex, 1);
                  subPages.splice(index, 0, moved);

                  mado.subPages = subPages;
                  update(mado);

                  setDraggedSubPageIndex(null);
                }}
                onDragEnd={() => {
                  setDraggedSubPageIndex(null);
                }}
                style={{
                  marginBottom: "0.5rem",
                  padding: "0.75rem",
                  cursor: "grab",
                  opacity: draggedSubPageIndex === index ? 0.5 : 1,
                }}
              >
                <div className="is-flex is-justify-content-space-between is-align-items-center">
                  <div className="is-flex is-align-items-center">
                    <span
                      className="icon has-text-grey-light mr-2"
                      title="ドラッグして並び替え"
                    >
                      <i className="fa fa-bars" />
                    </span>

                    <div>
                      <strong>{page.name}</strong>
                      <div className="is-size-7 has-text-grey">{page.url}</div>
                      <div className="is-flex is-align-items-center mt-2" style={{ gap: "0.5rem" }}>
                        {page.iconUrl === "" ? (
                          <span className="icon has-text-grey"><i className="fa fa-globe" /></span>
                        ) : page.iconUrl || siteFaviconUrl(page.url) ? (
                          <FaviconImage pageUrl={page.url} iconUrl={page.iconUrl} style={{ width: 20, height: 20, objectFit: "contain" }} />
                        ) : <span className="icon has-text-grey"><i className="fa fa-globe" /></span>}
                        <label className="button is-small">
                          アイコンを選択
                          <input
                            type="file"
                            accept="image/*,.ico"
                            hidden
                            onChange={(ev) => {
                              const file = ev.target.files?.[0];
                              if (!file) return;
                            void readIconFile(file).then((iconUrl) => {
                              mado.subPages[index] = { ...page, iconUrl };
                              update(mado);
                            }).catch((error: unknown) => {
                              setSaveError(error instanceof Error ? error.message : "アイコン画像を処理できません");
                            });
                              ev.target.value = "";
                            }}
                          />
                        </label>
                        {page.iconUrl && (
                          <button
                            type="button"
                            className="button is-small is-light"
                            onClick={() => {
                              mado.subPages[index] = { ...page, iconUrl: "" };
                              update(mado);
                            }}
                          >
                            アイコンをクリア
                          </button>
                        )}
                      </div>
                      <div className="is-flex is-flex-wrap-wrap mt-2" style={{ gap: "0.75rem" }}>
                        <label className="checkbox" onClick={(ev) => ev.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={page.addressbar ?? false}
                            onChange={(ev) => {
                              mado.subPages[index] = { ...page, addressbar: ev.target.checked };
                              update(mado);
                            }}
                          /> {" "}アドレスバーを表示
                        </label>
                        <label className="checkbox" onClick={(ev) => ev.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={page.showScroll ?? false}
                            onChange={(ev) => {
                              mado.subPages[index] = { ...page, showScroll: ev.target.checked };
                              update(mado);
                            }}
                          /> {" "}スクロールバーを表示
                        </label>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="button is-small is-danger is-light"
                    onClick={() => {
                      mado.subPages.splice(index, 1);
                      update(mado);
                    }}
                  >
                    削除
                  </button>
                </div>
              </div>
            ))}

            <div className="field">
              <label className="label is-small">ページURL</label>
              <div className="control">
                <input
                  className="input"
                  type="url"
                  value={subPageUrl}
                  placeholder="https://example.com/wiki"
                  onChange={(ev) => setSubPageUrl(ev.target.value)}
                />
              </div>
            </div>

            <div className="field">
              <label className="label is-small">ページ名</label>
              <div className="control">
                <input
                  className="input"
                  type="text"
                  value={subPageName}
                  placeholder="攻略Wiki"
                  onChange={(ev) => setSubPageName(ev.target.value)}
                />
              </div>
            </div>

            <button
              type="button"
              className="button is-link is-light"
              disabled={!subPageName.trim() || !subPageUrl.trim()}
              onClick={async () => {
                const url = subPageUrl.trim();

                let iconUrl: string | undefined;

                try {
                  const parsed = new URL(url);
                  if (parsed.protocol === "http:" || parsed.protocol === "https:") {
                    iconUrl = await extractPageFaviconUrl(url);
                  }
                } catch {
                  // URLが不正ならアイコンなし
                }

                mado.subPages.push({
                  name: subPageName.trim(),
                  url,
                  iconUrl,
                  addressbar: false,
                  showScroll: false,
                  width: 1200,
                  height: 720,
                });

                update(mado);

                setSubPageName("");
                setSubPageUrl("");
              }}
            >
              <span className="icon">
                <i className="fa fa-plus" />
              </span>
              <span>ページを追加</span>
            </button>
          </div>
          <MatrixField
            label="窓のサイズ"
            items={[
              {
                label: "横幅",
                key: "width",
                icon: "fa fa-arrows-h",
                placeholder: 1200,
                defaultValue: mado.size.width,
              },
              {
                label: "高さ",
                key: "height",
                icon: "fa fa-arrows-v",
                placeholder: 720,
                defaultValue: mado.size.height,
              },
            ]}
            onChange={(ev, key: "width" | "height") => {
              mado.size[key] = parseInt(ev.target.value);
              update(mado);
            }}
          />
          <MatrixField
            label="窓内コンテンツの意図的ズレ"
            items={[
              {
                label: "右方向",
                key: "left",
                icon: "fa fa-long-arrow-right",
                placeholder: 0,
                defaultValue: mado.offset.left,
              },
              {
                label: "下方向",
                key: "top",
                icon: "fa fa-long-arrow-down",
                placeholder: -76,
                defaultValue: mado.offset.top,
              },
            ]}
            onChange={(ev, key: "left" | "top") => {
              mado.offset[key] = parseInt(ev.target.value);
              update(mado);
            }}
          />
          <ChoiceField
            name="addressbar"
            label="アドレスバー表示"
            defaultValue={mado.addressbar ? "1" : "0"}
            offLabel="表示しない"
            onLabel="あえて表示する"
            onChange={(ev) => {
              mado.addressbar = ev.target.value == "1";
              update(mado);
            }}
          />
          <ChoiceField
            name="showScroll"
            label="スクロールバー表示"
            defaultValue={mado.showScroll ? "1" : "0"}
            offLabel="表示しない"
            onLabel="あえて表示する"
            onChange={(ev) => {
              mado.showScroll = ev.target.value == "1";
              update(mado);
            }}
          />
          <ChoiceField
            name="showLauncherCard"
            label="「demadoの設定」以外での表示"
            defaultValue={mado.showLauncherCard ? "1" : "0"}
            offLabel="表示しない"
            onLabel="表示する"
            onChange={(ev) => {
              mado.showLauncherCard = ev.target.value == "1";
              update(mado);
            }}
          />
          <ChoiceField
            name="showIcon"
            label="アイコン表示"
            defaultValue={mado.showIcon === false ? "0" : "1"}
            offLabel="表示しない"
            onLabel="表示する"
            onChange={(ev) => {
              mado.showIcon = ev.target.value === "1";
              update(mado);
            }}
          />
          <InputField
            label="ズーム倍率"
            type="number"
            icon="fa fa-search"
            help=""
            placeholder="0.5"
            defaultValue={mado.zoom}
            onChange={(ev) => {
              mado.zoom = parseFloat(ev.target.value);
              update(mado);
            }}
          />
          <ColorField
            label="窓の色（管理用）"
            value={mado.colorcode}
            onChange={(ev) => {
              mado.colorcode = ev.target.value;
              update(mado);
            }}
          />

          <MadoAdvancedConfigs
            mado={mado}
            update={update}
            active={showAdvanced}
            toggle={() => setShowAdvanced(!showAdvanced)}
          />
        </section>
        <footer className="modal-card-foot">
          <div className="buttons">
            <button
              className="button is-success"
              disabled={!mado.hasValidURL()}
              onClick={async () => {
                setSaveError(null);
                try {
                  const yes = await perm.ensure(mado.url, fallback);
                  if (!yes) return;
                  await LaunchHistory.cleanup();
                  await mado.save();
                  cleanup();
                  refresh();
                } catch (error) {
                  const message = String(error);
                  if (/quota|bytes|storage/i.test(message)) {
                    const used = await chrome.storage.local.getBytesInUse(null).catch(() => undefined);
                    const usage = typeof used === "number" ? ` 現在の使用量は約${(used / 1024 / 1024).toFixed(1)} MBです。` : "";
                    setSaveError(`Chromeの保存容量上限に達したため登録できません。既存の窓の大きなカスタムアイコンを削除してから再度お試しください。${usage}`);
                  } else {
                    setSaveError(`保存できませんでした: ${message}`);
                  }
                }
              }}
            >
              これでよし
            </button>
            <button className="button" onClick={async () => {
              if (draftMode && mado._id) {
                await mado.delete();
                refresh();
              }
              cleanup();
            }}>
              やっぱりやめる
            </button>
            <button
              className="button is-warning"
              disabled={!mado.hasValidURL()}
              onClick={async () => {
                setSaveError(null);
                const isNew = !mado._id;
                try {
                  const yes = await perm.ensure(mado.url, fallback);
                  if (!yes) return;
                  if (isNew) {
                    await LaunchHistory.cleanup();
                    await mado.save();
                    setDraftStarted(true);
                    update(mado);
                  }
                  await launcher.launch(mado, LaunchMode.DYNAMIC, draftMode || isNew);
                } catch (error) {
                  if (isNew && mado._id) await mado.delete();
                  const message = String(error);
                  if (/quota|bytes|storage/i.test(message)) {
                    setSaveError("Chromeの保存容量上限に達したため画面内設定を開けません。既存の窓の大きなカスタムアイコンを削除してから再度お試しください。");
                  } else {
                    setSaveError(`画面内設定を開けませんでした: ${message}`);
                  }
                }
              }}
            >
              画面内設定を開く
            </button>
            <button
              className="button is-info"
              disabled={!mado.hasValidURL()}
              onClick={async () => {
                const yes = await perm.ensure(mado.url, fallback);
                if (yes) await launcher.launch(mado, LaunchMode.PREVIEW);
              }}
            >
              試しに開く
            </button>
            {(!mado._id || draftMode) && (
              <p className="help">
                ※ 画面内設定を開くと下書き保存されます。「やっぱりやめる」で削除できます
              </p>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
