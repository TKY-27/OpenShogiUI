import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LanguageSwitcher } from "./App";
import {
  applyDocumentLanguage,
  DEFAULT_LOCALE,
  getMessages,
  localeReducer,
} from "./localization";

describe("site localization", () => {
  it("defaults deterministically to Japanese", () => {
    expect(DEFAULT_LOCALE).toBe("ja");
    expect(getMessages(DEFAULT_LOCALE).header.workspace).toBe("ワークスペース");
  });

  it("switches to English through the locale reducer", () => {
    const locale = localeReducer(DEFAULT_LOCALE, {
      type: "select",
      locale: "en",
    });

    expect(locale).toBe("en");
    expect(getMessages(locale).header.evaluationLab).toBe("Evaluation Lab");
  });

  it("updates the document language target", () => {
    const documentElement = { lang: "" };

    applyDocumentLanguage("ja", documentElement);
    expect(documentElement.lang).toBe("ja");
    applyDocumentLanguage("en", documentElement);
    expect(documentElement.lang).toBe("en");
  });

  it("renders an accessible pressed-state language switcher", () => {
    const japanese = renderToStaticMarkup(
      <LanguageSwitcher locale="ja" onSelect={() => undefined} />,
    );
    const english = renderToStaticMarkup(
      <LanguageSwitcher locale="en" onSelect={() => undefined} />,
    );

    expect(japanese).toContain("表示言語");
    expect(japanese).toMatch(/<button[^>]*aria-pressed="true"[^>]*lang="ja"/);
    expect(english).toMatch(/<button[^>]*aria-pressed="true"[^>]*lang="en"/);
  });
});
