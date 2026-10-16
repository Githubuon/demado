import { useMemo, useState } from "react";
import Mado from "../../models/Mado";
import type MadoLauncher from "../../services/MadoLauncher";
import PermissionService from "../../services/PermissionService";
import { useNavigate } from "react-router-dom";

function EditableNumberTag({
  name,
  value,
  step = 1,
  onSave,
}: {
  name: string;
  value: number;
  step?: number;
  onSave: (value: number) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  const commit = async () => {
    if (!draft.trim()) {
      setEditing(false);
      return;
    }
    const nextValue = Number(draft);
    setEditing(false);
    if (!Number.isFinite(nextValue) || nextValue === value) return;
    await onSave(nextValue);
  };

  if (editing) {
    return (
      <span className="tag is-info is-light" onClick={(ev) => ev.stopPropagation()}>
        <label>
          {name}: <input
            autoFocus
            aria-label={name}
            type="number"
            step={step}
            value={draft}
            style={{ width: "5.5em" }}
            onChange={(ev) => setDraft(ev.target.value)}
            onBlur={() => { void commit(); }}
            onKeyDown={(ev) => {
              ev.stopPropagation();
              if (ev.key === "Enter") ev.currentTarget.blur();
              if (ev.key === "Escape") {
                setDraft(String(value));
                setEditing(false);
              }
            }}
          />
        </label>
      </span>
    );
  }

  return (
    <button
      type="button"
      className="tag is-info is-light"
      title={`${name}をクリックして変更`}
      onClick={(ev) => {
        ev.stopPropagation();
        setDraft(String(value));
        setEditing(true);
      }}
      onKeyDown={(ev) => ev.stopPropagation()}
    >
      {name}: {value}
    </button>
  );
}

function ToggleInformationTag({
  name,
  value,
  onToggle,
}: {
  name: string;
  value: boolean;
  onToggle: () => Promise<void>;
}) {
  return (
    <button
      type="button"
      className={`tag ${value ? "is-success" : "is-light"}`}
      aria-pressed={value}
      title={`${name}をクリックして切り替え`}
      onClick={(ev) => {
        ev.stopPropagation();
        void onToggle();
      }}
      onKeyDown={(ev) => ev.stopPropagation()}
    >
      {name}: {value ? "表示" : "非表示"}
    </button>
  );
}

function PermissionAlertIcon({ mado }: { mado: Mado }) {
  const perms = useMemo(() => new PermissionService(), []);
  const navigate = useNavigate();
  return (
    <div className="icon has-text-warning is-clickable"
      title="必要な権限が許可されていない可能性があります"
      onClick={async () => {
        const yes = await perms.ensure(mado.url);
        if (yes) navigate(0);
      }}
    ><i className="fa fa-exclamation-circle" /></div>
  )
}

function PreviewLaunchIcon({mado, launcher}: {mado: Mado, launcher: MadoLauncher}) {
  const perms = useMemo(() => new PermissionService(), []);
  return (
    <div className="icon is-clickable" onClick={async () => {
      const yes = await perms.ensure(mado.url, () => window.alert("必要な権限が許可されていないため操作できません"));
      if (!yes) return;
      await launcher.launch(mado);
    }}><i className="fa fa-window-maximize" /></div>
  )
}

function SubPageIcon({ page, mado, launcher }: {
  page: Mado["subPages"][number];
  mado: Mado;
  launcher: MadoLauncher;
}) {
  return (
    <div
      className="icon is-clickable"
      title={page.name}
      onClick={async (ev) => {
        ev.stopPropagation();
        await launcher.launchSubPage(mado, page);
      }}
    >
      {page.iconUrl ? (
        <img
          src={page.iconUrl}
          alt={page.name}
          style={{
            width: "20px",
            height: "20px",
            objectFit: "contain",
          }}
        />
      ) : (
        <i className="fa fa-globe" />
      )}
    </div>
  );
}

export function MadoCard({
  mado, index, launcher,
  refresh, edit,
  onDragStart,
  onDragEnd,
  onDragOver,
}: {
  mado: Mado, index: number, launcher: MadoLauncher,
  refresh: () => void, edit: () => void,
  onDragStart?: (ev: React.DragEvent<HTMLDivElement>) => void,
  onDragEnd?: (ev: React.DragEvent<HTMLDivElement>) => void,
  onDragOver?: (ev: React.DragEvent<HTMLDivElement>) => void,
 }) {
  const bgcolor = mado.colorcodeByIndex(index);
  const [r, g, b] = bgcolor.replace(/^#/, "").match(/[a-zA-Z0-9]{2}/g)!.map(hex => parseInt(hex, 16));
  const textcolor = (r * 0.299 + g * 0.587 + b * 0.114) > 186 ? "has-text-dark" : "has-text-light";
  return (
    <div className="cell card demado-card" key={mado._id}
      data-id={mado._id}
      style={{
        borderColor: bgcolor,
        marginBottom: '8px', // FIXME: これはどこかで定義されているはず
      }}
      draggable={true}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
    >
      <div className={"card-header"} style={{ backgroundColor: bgcolor }}>
<p className={"card-header-title level " + textcolor}>
  <span className={textcolor}>{mado.displayName()}</span>

  {mado.subPages.map((page, index) => (
    <SubPageIcon
      key={`${page.url}-${index}`}
      page={page}
      mado={mado}
      launcher={launcher}
    />
  ))}
  
  {mado.$permitted
    ? <PreviewLaunchIcon mado={mado} launcher={launcher} />
    : <PermissionAlertIcon mado={mado} />
  }


</p>
      </div>
      <div className="card-content">
        <div className="content is-size-7">
          <div style={{ wordBreak: 'break-all' }}>{mado.url}</div>
          <div className="is-flex is-flex-wrap-wrap" style={{ gap: "0.25rem" }}>
            <EditableNumberTag name="横幅" value={mado.size.width} onSave={async (value) => {
              await mado.update({ size: { ...mado.size, width: value } }); refresh();
            }} />
            <EditableNumberTag name="高さ" value={mado.size.height} onSave={async (value) => {
              await mado.update({ size: { ...mado.size, height: value } }); refresh();
            }} />
            <EditableNumberTag name="横ずれ" value={mado.offset.left} onSave={async (value) => {
              await mado.update({ offset: { ...mado.offset, left: value } }); refresh();
            }} />
            <EditableNumberTag name="縦ずれ" value={mado.offset.top} onSave={async (value) => {
              await mado.update({ offset: { ...mado.offset, top: value } }); refresh();
            }} />
            <EditableNumberTag name="ズーム" value={mado.zoom} step={0.05} onSave={async (value) => {
              await mado.update({ zoom: value }); refresh();
            }} />
            <ToggleInformationTag name="アドレスバー" value={mado.addressbar} onToggle={async () => {
              await mado.update({ addressbar: !mado.addressbar }); refresh();
            }} />
            <ToggleInformationTag name="スクロールバー" value={mado.showScroll} onToggle={async () => {
              await mado.update({ showScroll: !mado.showScroll }); refresh();
            }} />
            <ToggleInformationTag name="カード" value={mado.showLauncherCard} onToggle={async () => {
              await mado.update({ showLauncherCard: !mado.showLauncherCard }); refresh();
            }} />
          </div>
          <div className="control">
            <div className="tags has-addons">
              <span className="tag">窓位置 x{mado.position.x} y:{mado.position.y}</span>
              <a className="tag is-delete pointer" title="(0,0)にリセットする"
                onClick={async () => { await mado.update({ position: { x: 0, y: 0 } }); refresh(); }}
              />
            </div>
          </div>
        </div>
        <div className="columns is-mobile">
          <div className="column is-narrow demado-interactive-icon">
            <i className="fa fa-trash-o" title="削除" onClick={async () => {
              if (!window.confirm(`この窓設定を削除しますか？\n\n${mado.displayName()}\nid: ${mado._id}`)) return;
              await mado.delete(); refresh()
            }} />
          </div>
          <div className="column is-narrow demado-interactive-icon" title="エクスポート" onClick={() => {
            window.open(`?export=${mado._id}#debug`);
          }}>
            <i className="fa fa-paper-plane" />
          </div>
          <div className="column is-narrow demado-interactive-icon" title="編集" onClick={() => edit()}>
            <i className="fa fa-wrench" />
          </div>
        </div>
      </div>
    </div>
  );
}
