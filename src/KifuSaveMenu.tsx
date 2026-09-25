import { useEffect, useRef, useState } from "react";

import {
  downloadBytes,
  readKifuFormat,
  writeKifuFormat,
  type KifuFormat,
  type KifuRecord,
} from "./kifu";
import type { Locale } from "./localization";

/**
 * Shared "save the record" control: one compact format select plus one save
 * button, remembering the chosen format on this device only. The record is
 * captured synchronously at save time and serialized in a lazily imported
 * module; nothing here touches game state, consent or the network.
 */

const FORMAT_LABELS: Record<KifuFormat, { ja: string; en: string }> = {
  kif: { ja: "KIF", en: "KIF" },
  ki2: { ja: "KI2", en: "KI2" },
  csa: { ja: "CSA", en: "CSA" },
  usi: { ja: "USI", en: "USI" },
};

export function KifuSaveMenu({
  locale,
  describe,
  prefix,
}: {
  locale: Locale;
  /** Captures the immutable record inputs at the moment the button is pressed. */
  describe: () => KifuRecord | null;
  prefix: string;
}) {
  const t = (ja: string, en: string) => (locale === "ja" ? ja : en);
  const [format, setFormat] = useState<KifuFormat>(readKifuFormat);
  const [status, setStatus] = useState<string | null>(null);
  const busy = useRef(false);
  // The format chunk loads from the same origin once; later saves reuse it.
  useEffect(() => {
    void import("./kifu-export");
  }, []);
  const save = () => {
    if (busy.current) return;
    const record = describe();
    if (record === null) return;
    busy.current = true;
    setStatus(null);
    void import("./kifu-export")
      .then(({ buildKifuFile }) => buildKifuFile(record, format, prefix))
      .then((file) => {
        downloadBytes(file.fileName, file.bytes);
        setStatus(
          file.note === "utf8-fallback"
            ? t(
                `Shift_JISで表現できない文字があるため、UTF-8（${file.fileName}）で保存しました。`,
                `Some characters are not representable in Shift_JIS; saved as UTF-8 (${file.fileName}).`,
              )
            : t(`保存しました：${file.fileName}`, `Saved: ${file.fileName}`),
        );
      })
      .catch(() => {
        setStatus(t("保存できませんでした。", "Could not save the record."));
      })
      .finally(() => {
        busy.current = false;
      });
  };
  return (
    <div className="kifu-save">
      <label className="kifu-save__format">
        {t("棋譜形式", "Record format")}{" "}
        <select
          onChange={(event) => {
            const next = event.target.value as KifuFormat;
            setFormat(next);
            writeKifuFormat(next);
          }}
          value={format}
        >
          {(Object.keys(FORMAT_LABELS) as KifuFormat[]).map((value) => (
            <option key={value} value={value}>
              {FORMAT_LABELS[value][locale === "ja" ? "ja" : "en"]}
            </option>
          ))}
        </select>
      </label>
      <button type="button" onClick={save}>
        {t("棋譜を保存", "Save record")}
      </button>
      {status === null ? null : (
        <p className="kifu-save__status" role="status">
          {status}
        </p>
      )}
    </div>
  );
}
