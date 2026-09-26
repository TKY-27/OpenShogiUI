import { releaseModels } from "virtual:shogi-runtime";
import type { PrototypeSelection } from "./core-prototype-protocol";
import type { Locale } from "./localization";

const developmentModels = [
  ["r4c4", "OSAI R4", "OSAI R4"],
  ["r4c3", "C3（開発世代）", "C3 (development)"],
  ["r4c1", "C1（開発世代）", "C1 (development)"],
  ["defense", "防御強化 best1536", "Defense best1536"],
  ["candidate", "r3（開発世代）", "r3 (development)"],
  ["baseline", "初期 W256", "Initial W256"],
] as const;
export function modelChoices(
  locale: Locale,
): { value: PrototypeSelection; label: string }[] {
  return import.meta.env.DEV
    ? developmentModels.map(([value, ja, en]) => ({
        value,
        label: locale === "ja" ? ja : en,
      }))
    : releaseModels.map((model) => ({
        value: model.manifest.selection,
        label: model.label,
      }));
}
export function modelLabel(
  selection: PrototypeSelection,
  locale: Locale,
): string {
  return (
    modelChoices(locale).find((model) => model.value === selection)?.label ??
    selection
  );
}
/**
 * Model selection is laid out by its own class names, not the generic
 * segmented-control flex rules: six candidates wrap as an even grid at any
 * pane width and every cell keeps its full border.
 */
export function ModelPicker({
  selection,
  disabled,
  locale,
  onSelect,
}: {
  selection: PrototypeSelection;
  disabled: boolean;
  locale: Locale;
  onSelect: (selection: PrototypeSelection) => void;
}) {
  const ja = locale === "ja";
  return (
    <fieldset className="model-picker" disabled={disabled}>
      <legend>
        {ja ? "最新←→開発初期" : "Newest ←→ earliest development"}
      </legend>
      <div className="model-picker__options">
        {modelChoices(locale).map(({ value, label }) => (
          <button
            type="button"
            key={value}
            aria-pressed={selection === value}
            onClick={() => {
              if (selection !== value) onSelect(value);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="model-picker__note">
        {ja
          ? "開発世代の順です。強さの順位ではありません。C2は同一重み・同一探索の防御候補へ統合しました。"
          : "Development order, not a strength ranking. C2 aliases the identical Defense configuration."}
      </p>
    </fieldset>
  );
}
