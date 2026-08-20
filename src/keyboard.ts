/**
 * Keyboard shortcut resolution, kept free of DOM types so it can be unit
 * tested without a browser environment.
 */

export type ShortcutAction =
  | "history-previous"
  | "history-next"
  | "history-first"
  | "history-last"
  | "clear-selection"
  | "undo"
  | "redo"
  | "help";

/** The subset of KeyboardEvent this resolver reads. */
export interface ShortcutEvent {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  isComposing?: boolean;
  target?: ShortcutTarget | null;
}

export interface ShortcutTarget {
  tagName?: string;
  isContentEditable?: boolean;
}

const TEXT_ENTRY_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/**
 * True when the event originated inside a text entry surface.
 *
 * Shortcuts must never fire there. Cmd+Z in a comment field has to undo text,
 * not take back a move, and Escape has to belong to the field.
 */
export function isTextEntryTarget(target: ShortcutTarget | null | undefined) {
  if (target === null || target === undefined) return false;
  if (target.isContentEditable === true) return true;
  const tag = target.tagName;
  return typeof tag === "string" && TEXT_ENTRY_TAGS.has(tag.toUpperCase());
}

export function resolveShortcut(event: ShortcutEvent): ShortcutAction | null {
  // Mid-composition keystrokes belong to the IME. Acting on them would cancel
  // a Japanese conversion instead of doing what the user intended.
  if (event.isComposing === true) return null;
  if (isTextEntryTarget(event.target)) return null;
  if (event.altKey === true) return null;

  // Accept either modifier rather than sniffing the platform: Cmd is the mac
  // convention and Ctrl the Windows one, and neither is harmful on the other.
  const command = event.ctrlKey === true || event.metaKey === true;
  const shift = event.shiftKey === true;

  if (command) {
    const key = event.key.toLowerCase();
    if (key === "z") return shift ? "redo" : "undo";
    if (key === "y") return "redo";
    return null;
  }

  switch (event.key) {
    case "ArrowLeft":
      return "history-previous";
    case "ArrowRight":
      return "history-next";
    case "Home":
      return "history-first";
    case "End":
      return "history-last";
    case "Escape":
      return "clear-selection";
    case "?":
      return "help";
    default:
      return null;
  }
}
