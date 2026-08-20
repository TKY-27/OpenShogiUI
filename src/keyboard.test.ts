import { describe, expect, it } from "vitest";

import {
  isTextEntryTarget,
  resolveShortcut,
  type ShortcutEvent,
} from "./keyboard";

const press = (event: ShortcutEvent) => resolveShortcut(event);

describe("history navigation", () => {
  it("maps the arrow and jump keys", () => {
    expect(press({ key: "ArrowLeft" })).toBe("history-previous");
    expect(press({ key: "ArrowRight" })).toBe("history-next");
    expect(press({ key: "Home" })).toBe("history-first");
    expect(press({ key: "End" })).toBe("history-last");
  });

  it("clears the selection on Escape and opens help on question mark", () => {
    expect(press({ key: "Escape" })).toBe("clear-selection");
    expect(press({ key: "?" })).toBe("help");
  });

  it("ignores keys with no binding", () => {
    expect(press({ key: "a" })).toBeNull();
    expect(press({ key: "Enter" })).toBeNull();
    expect(press({ key: "ArrowUp" })).toBeNull();
  });
});

describe("undo and redo across platforms", () => {
  it("accepts Cmd on macOS and Ctrl on Windows for undo", () => {
    expect(press({ key: "z", metaKey: true })).toBe("undo");
    expect(press({ key: "z", ctrlKey: true })).toBe("undo");
    // Some layouts report the shifted key as uppercase.
    expect(press({ key: "Z", metaKey: true, shiftKey: true })).toBe("redo");
  });

  it("maps both redo conventions", () => {
    expect(press({ key: "z", metaKey: true, shiftKey: true })).toBe("redo");
    expect(press({ key: "z", ctrlKey: true, shiftKey: true })).toBe("redo");
    expect(press({ key: "y", ctrlKey: true })).toBe("redo");
  });

  it("does not treat a bare z as undo", () => {
    expect(press({ key: "z" })).toBeNull();
  });

  it("ignores modified keys that have no binding", () => {
    expect(press({ key: "s", metaKey: true })).toBeNull();
    expect(press({ key: "ArrowLeft", metaKey: true })).toBeNull();
  });

  it("ignores anything held with Alt", () => {
    expect(press({ key: "ArrowLeft", altKey: true })).toBeNull();
    expect(press({ key: "z", metaKey: true, altKey: true })).toBeNull();
  });
});

describe("text entry is never hijacked", () => {
  it("recognises every text entry surface", () => {
    expect(isTextEntryTarget({ tagName: "INPUT" })).toBe(true);
    expect(isTextEntryTarget({ tagName: "textarea" })).toBe(true);
    expect(isTextEntryTarget({ tagName: "SELECT" })).toBe(true);
    expect(isTextEntryTarget({ isContentEditable: true })).toBe(true);
    expect(isTextEntryTarget({ tagName: "BUTTON" })).toBe(false);
    expect(isTextEntryTarget(null)).toBe(false);
    expect(isTextEntryTarget(undefined)).toBe(false);
  });

  it("leaves Cmd+Z to the field so text undo keeps working", () => {
    for (const target of [
      { tagName: "INPUT" },
      { tagName: "TEXTAREA" },
      { isContentEditable: true },
    ]) {
      expect(press({ key: "z", metaKey: true, target })).toBeNull();
      expect(press({ key: "z", ctrlKey: true, target })).toBeNull();
      expect(press({ key: "Escape", target })).toBeNull();
      expect(press({ key: "ArrowLeft", target })).toBeNull();
    }
  });
});

describe("IME composition", () => {
  it("ignores keystrokes that belong to an in-progress conversion", () => {
    expect(press({ key: "Escape", isComposing: true })).toBeNull();
    expect(press({ key: "ArrowLeft", isComposing: true })).toBeNull();
    expect(press({ key: "z", metaKey: true, isComposing: true })).toBeNull();
  });
});
