import { releaseModels } from "virtual:shogi-runtime";
import type { PrototypeSelection } from "./core-prototype-protocol";
import type { Locale } from "./localization";

const developmentModels = [
  ["r4c4", "OSAI R4（R4-C4）", "OSAI R4 (R4-C4)"],
  ["r4c3", "R4-C3（比較候補・未採用）", "R4-C3 (comparison only)"],
  ["r4c1", "R4-C1（比較候補・未採用）", "R4-C1 (comparison only)"],
  ["defense", "防御学習候補", "Defense candidate"],
  ["candidate", "r3候補", "r3 candidate"],
  ["baseline", "旧基準 (W256)", "Previous baseline (W256)"],
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
    <fieldset className="segmented-control model-picker" disabled={disabled}>
      <legend>
        {ja ? "最新←→開発初期" : "Newest ←→ earliest development"}
      </legend>
      <div>
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
      <p className="match-setup__note">
        {ja
          ? "開発世代の順です。強さの順位ではありません。C2は同一重み・同一探索の防御候補へ統合しました。"
          : "Development order, not a strength ranking. C2 aliases the identical Defense configuration."}
      </p>
    </fieldset>
  );
}
