import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrototypeState } from "./core-prototype-session";
import type { PrototypeManifest } from "./core-prototype-protocol";
import CorePrototype from "./CorePrototype";

const view = vi.hoisted(() => ({ state: null as PrototypeState | null }));
vi.mock("./core-prototype-session", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./core-prototype-session")>();
  return { ...actual, initialPrototypeState: () => view.state };
});
const { initialPrototypeState } = await vi.importActual<
  typeof import("./core-prototype-session")
>("./core-prototype-session");

const sha256 = "a".repeat(64);
const artifact = { url: "/test", sha256, size: 1 };
const manifest: PrototypeManifest = {
  schema: "open_shogi_core_prototype_assets/v2",
  selection: "candidate",
  runId: "test-r3-best",
  artifacts: {
    "engine.js": artifact,
    "engine.wasm": artifact,
    "leaf.osaval03": artifact,
    "controller.json": null,
  },
};
function loadedState(): PrototypeState {
  return {
    ...initialPrototypeState(),
    manifest,
    identity: {
      modelId: manifest.runId,
      modelFormat: "OSAVAL03",
      leafSha256: sha256,
      controllerSha256: null,
      jsSha256: sha256,
      wasmSha256: sha256,
      expectedHashVerified: true,
      buildClass: "pure-only",
      evaluationMode: "pure-value",
    },
    snapshot: {
      initialSfen: "test",
      sfen: "test",
      sideToMove: "black",
      moveNumber: 1,
      board: Array.from({ length: 81 }, () => null),
      hands: { black: [], white: [] },
      legalMoves: [],
      moves: [],
      terminal: null,
      leafSha256: sha256,
    },
  };
}
function render() {
  return renderToStaticMarkup(<CorePrototype locale="ja" />);
}
function modelFieldset(html: string) {
  return html.match(
    /<fieldset[^>]*>[\s\S]*?<legend>最新←→開発初期<\/legend>[\s\S]*?<\/fieldset>/,
  )?.[0];
}

describe("learned-model match setup", () => {
  beforeEach(() => {
    view.state = loadedState();
  });

  it("lists C3 and explains C2's canonical defense alias", () => {
    const html = render();
    expect(modelFieldset(html)).toContain("R4-C4");
    expect(modelFieldset(html)).toContain("R4-C3");
    expect(modelFieldset(html)).not.toContain("R4-C2");
    expect(html).toContain("C2は同一重み・同一探索の防御候補へ統合");
  });

  it("keeps model selection available while loading and forbids starting", () => {
    view.state = { ...initialPrototypeState(), phase: "loading", busy: true };
    const html = render();
    expect(modelFieldset(html)).not.toContain('disabled=""');
    expect(html).toContain('class="match-start" type="button" disabled=""');
    expect(html).toContain("読み込み、照合しています");
  });

  it("shows verified runtime identity and separate clock, quality, and controller settings", () => {
    const html = render();
    expect(html).toContain(manifest.runId);
    expect(html).toContain(sha256);
    expect(html).toContain("読み込んだ評価器 SHA-256");
    expect(html).toContain("防御学習候補");
    expect(html).toContain("r3候補");
    expect(html).toContain("旧基準 (W256)");
    expect(html).toContain("持ち時間");
    expect(html).toContain("計算品質");
    expect(html).toContain("思考制御 (開発用)");
    expect(html).not.toContain('class="match-start" type="button" disabled=""');
  });

  it("does not enable play for a declared identity that disagrees with the loaded position", () => {
    view.state!.snapshot!.leafSha256 = "b".repeat(64);
    expect(render()).toContain('class="match-start" type="button" disabled=""');
  });

  it.each(["playing", "stopped"] as const)(
    "locks the model in %s until explicit reset",
    (phase) => {
      view.state!.phase = phase;
      const html = render();
      expect(modelFieldset(html)).toContain('disabled=""');
      expect(html).toContain("対局を終了して設定へ");
      expect(html).not.toContain('class="match-start"');
    },
  );

  it("shows a failed load reason and an explicit same-model retry", () => {
    view.state = {
      ...initialPrototypeState(),
      phase: "error",
      error: "SHA-256 mismatch",
    };
    const html = render();
    expect(html).toContain('role="alert">SHA-256 mismatch');
    expect(html).toContain("同じモデルで再試行");
    expect(html).toContain('class="match-start" type="button" disabled=""');
  });
});
