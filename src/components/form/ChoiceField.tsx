import { ChangeEvent } from "react";

export function ChoiceField({
  name,
  label,
  defaultValue,
  onChange,
}: {
  name: string;
  label: string;
  defaultValue: string;
  onChange: (ev: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="field">
      <label className="label">{label}</label>
      <div className="control">
        <label className="radio">
          <input type="radio" name={name} value={0}
            onChange={onChange}
            defaultChecked={defaultValue === "0"}
          /> 表示しない
        </label>
        <label className="radio">
          <input type="radio" name={name} value={1}
            onChange={onChange}
            defaultChecked={defaultValue === "1"}
          /> あえて表示する
        </label>
      </div>
    </div>
  )
}