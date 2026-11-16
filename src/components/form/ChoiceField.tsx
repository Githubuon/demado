import { ChangeEvent } from "react";

export function ChoiceField({
  name,
  label,
  defaultValue,
  offLabel = "表示しない",
  onLabel = "あえて表示する",
  choices,
  onChange,
}: {
  name: string;
  label: string;
  defaultValue: string;
  offLabel?: string;
  onLabel?: string;
  choices?: { value: string; label: string }[];
  onChange: (ev: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="field">
      <label className="label">{label}</label>
      <div className="control">
        {choices ? choices.map((choice) => (
          <label className="radio" key={choice.value}>
            <input type="radio" name={name} value={choice.value} onChange={onChange} defaultChecked={defaultValue === choice.value} />{" "}
            {choice.label}
          </label>
        )) : <>
          <label className="radio">
            <input
              type="radio"
              name={name}
              value={0}
              onChange={onChange}
              defaultChecked={defaultValue === "0"}
            />{" "}
            {offLabel}
          </label>
          <label className="radio">
            <input
              type="radio"
              name={name}
              value={1}
              onChange={onChange}
              defaultChecked={defaultValue === "1"}
            />{" "}
            {onLabel}
          </label>
        </>}
      </div>
    </div>
  );
}
