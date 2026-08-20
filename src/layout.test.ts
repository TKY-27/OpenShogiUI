/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync(new URL("./index.css", import.meta.url), "utf8");

/**
 * Regression contracts for the desktop page-scroll and breakpoint defects
 * measured on the Phase 1 tree:
 *
 *   1440x900 -> document 1686px, +786px vertical overflow
 *   1280x800 -> document 2358px, +1558px vertical overflow
 *
 * The board must be sized from BOTH axes, panes must scroll instead of the
 * page, and the breakpoint set must be single-direction so declaration order
 * stops deciding which rule wins.
 */
describe("application shell layout contract", () => {
  it("gives the shell a dynamic viewport height instead of legacy vh", () => {
    expect(styles).not.toMatch(/\b100vh\b/);
    expect(styles).toMatch(/\.app-shell\s*\{[^}]*height:\s*100dvh/s);
  });

  it("confines vertical scrolling to panes on desktop", () => {
    expect(styles).toMatch(
      /\.app-shell--fixed\s*\{[^}]*overflow:\s*hidden/s,
    );
    expect(styles).toMatch(/\.app-main\s*\{[^}]*min-height:\s*0/s);
  });

  it("sizes the board from the smaller of available width and height", () => {
    const boardFit = styles.slice(styles.indexOf(".board-fit"));
    expect(boardFit).toMatch(/container-type:\s*size/);
    expect(styles).toMatch(/\.board-square-frame\s*\{[^}]*aspect-ratio:\s*1/s);
    // A height-derived term is what the Phase 1 stylesheet was missing.
    expect(styles).toMatch(/\bcqh\b/);
  });

  it("no longer stretches the history rail to a fixed 48rem", () => {
    expect(styles).not.toMatch(/min-height:\s*48rem/);
  });

  it("uses a single ascending min-width breakpoint ladder", () => {
    expect(styles.match(/@media \(max-width:/g)).toBeNull();
    const widths = [...styles.matchAll(/@media \(min-width:\s*([\d.]+)rem\)/g)]
      .map((match) => Number(match[1]));
    expect(widths.length).toBeGreaterThanOrEqual(2);
    expect([...widths].sort((a, b) => a - b)).toEqual(widths);
    expect(new Set(widths).size).toBe(widths.length);
  });

  it("keeps only one layout system by removing the superseded play-page rules", () => {
    expect(styles).not.toMatch(/\.play-page\b/);
    expect(styles).not.toMatch(/\.play-workspace\b/);
    expect(styles).not.toMatch(/\.board-stage\b/);
  });

  it("reserves 44px targets for coarse pointers rather than every control", () => {
    expect(styles).toMatch(/@media \(pointer:\s*coarse\)/);
  });
});

describe("typography contract", () => {
  it("does not name a webfont the same-origin CSP can never load", () => {
    // style-src 'self' plus no bundled font file means Inter never rendered.
    expect(styles).not.toMatch(/\bInter\b/);
  });

  it("declares a Japanese-capable system UI stack", () => {
    expect(styles).toMatch(/--ui-font:/);
    expect(styles).toMatch(/Hiragino Kaku Gothic ProN/);
  });
});
