import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import initWasm, {
  WasmBrowserEngine,
} from "../src/generated/open_shogi_wasm.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const aiRoot = resolve(
  process.env.OPENSHOGIAI_ROOT ?? join(root, "../OpenShogiAI"),
);
const names = [
  "open_shogi_wasm.d.ts",
  "open_shogi_wasm.js",
  "open_shogi_wasm_bg.wasm",
  "open_shogi_wasm_bg.wasm.d.ts",
];
const failures = [];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

for (const name of names) {
  let aiBytes;
  let uiBytes;
  try {
    aiBytes = readFileSync(join(aiRoot, "bindings/wasm", name));
  } catch (error) {
    failures.push(`cannot read AI binding ${name}: ${error.message}`);
    continue;
  }
  try {
    uiBytes = readFileSync(join(root, "src/generated", name));
  } catch (error) {
    failures.push(`cannot read UI binding ${name}: ${error.message}`);
    continue;
  }
  if (!aiBytes.equals(uiBytes)) {
    failures.push(
      `${name} differs (AI ${sha256(aiBytes)}, UI ${sha256(uiBytes)})`,
    );
  } else {
    console.log(`OK ${name} ${sha256(uiBytes)}`);
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exitCode = 1;
} else {
  console.log("AI/UI Wasm snapshot is byte-identical");
  let engine;
  try {
    const aiWasm = readFileSync(
      join(aiRoot, "bindings/wasm/open_shogi_wasm_bg.wasm"),
    );
    await initWasm({ module_or_path: aiWasm });
    engine = new WasmBrowserEngine();
    const initial = JSON.parse(engine.snapshot());
    if (
      initial.schema !== "open_shogi_browser_snapshot/v1" ||
      initial.engine?.name !== "OpenShogiAI" ||
      initial.board?.length !== 81 ||
      initial.legalMoves?.length !== 30
    ) {
      throw new Error(
        "initial engine snapshot failed the closed smoke contract",
      );
    }
    const moved = JSON.parse(engine.playMove("7g7f"));
    if (moved.sideToMove !== "white" || moved.moveNumber !== 2) {
      throw new Error("legal-move smoke response has inconsistent game state");
    }
    console.log(
      "AI Wasm instantiated and completed the 7g7f legal-move smoke test",
    );

    const timed = JSON.parse(
      engine.searchWithTimeControl(
        "eco",
        "overall-champion",
        2,
        JSON.stringify({
          schema: "open_shogi_time_control/v1",
          nodes: 120,
          safetyMarginMs: 50,
        }),
      ),
    );
    if (
      timed.timeControlSchema !== "open_shogi_time_control/v1" ||
      timed.timeControlMode !== "nodes" ||
      timed.nodes > 120 ||
      timed.lines?.length !== 2
    ) {
      throw new Error("time-control search failed the closed smoke contract");
    }

    const protocolHash = (digit) => digit.repeat(64);
    const startRequest = (positionSfen) => ({
      schema: "open_shogi_analysis/v1",
      positionSfen,
      modelHash: protocolHash("1"),
      evaluatorConfigHash: protocolHash("2"),
      featureSchemaHash: protocolHash("3"),
      evaluationSemanticsHash: protocolHash("4"),
      searchOptionsHash: protocolHash("5"),
      openingProfileHash: protocolHash("6"),
      multiPv: 3,
    });
    const started = JSON.parse(
      engine.analysisStart(
        "eco",
        "overall-champion",
        JSON.stringify(startRequest(moved.sfen)),
      ),
    );
    if (started.event !== "started") {
      throw new Error("analysis start did not acknowledge the active root");
    }
    const stepped = JSON.parse(
      engine.analysisStep(
        JSON.stringify({
          schema: "open_shogi_analysis/v1",
          nodes: 1_500,
          maxDepth: 3,
          timestampMs: 9,
        }),
      ),
    );
    if (
      stepped.event !== "updates" ||
      stepped.updates?.length === 0 ||
      stepped.updates[0].canonicalPosition !== moved.sfen ||
      stepped.updates[0].multiPv !== 3
    ) {
      throw new Error("analysis slice failed position/MultiPV identity checks");
    }
    const stopped = JSON.parse(engine.analysisStop());
    const failed = JSON.parse(engine.analysisWorkerFailed());
    const restarted = JSON.parse(engine.analysisRestart());
    if (
      stopped.event !== "stopped" ||
      failed.event !== "worker-failed" ||
      restarted.event !== "restarted"
    ) {
      throw new Error(
        "analysis stop/failure/restart lifecycle is inconsistent",
      );
    }
    console.log(
      "AI Wasm completed time-control and continuous-analysis lifecycle smoke tests",
    );

    // Repetition-history identity: the pure search is history-dependent, so
    // two lines that end in the same SFEN are different search contexts even
    // though the wire request (SFEN-keyed) cannot tell them apart. The UI
    // namespaces its caches by initial SFEN plus move list; this pins the
    // engine-level facts that make the namespace necessary.
    const initialSfen = "8k/9/9/9/9/9/9/9/K8 b - 1";
    const historyA = [
      "9i9h",
      "1a1b",
      "9h9i",
      "1b1a",
      "9i9h",
      "1a1b",
      "9h9i",
      "1b1a",
    ];
    const historyB = [
      "9i8i",
      "1a2a",
      "8i8h",
      "2a2b",
      "8h9h",
      "2b1b",
      "9h9i",
      "1b1a",
    ];
    const cycle = ["9i9h", "1a1b", "9h9i", "1b1a"];
    engine.restore(initialSfen, JSON.stringify(historyA));
    const a = JSON.parse(engine.snapshot());
    engine.restore(initialSfen, JSON.stringify(historyB));
    const b = JSON.parse(engine.snapshot());
    if (
      a.sfen !== b.sfen ||
      a.moveNumber !== b.moveNumber ||
      a.moveNumber !== 9 ||
      a.moves.length !== 8 ||
      b.moves.length !== 8
    ) {
      throw new Error(
        "repetition pair must share the final SFEN and move number",
      );
    }
    if (
      !a.legalMoves.some((move) => move.usi === "9i9h") ||
      !b.legalMoves.some((move) => move.usi === "9i9h")
    ) {
      throw new Error("both repetition endpoints must accept the same move");
    }
    engine.restore(initialSfen, JSON.stringify([...historyA, ...cycle]));
    const a4 = JSON.parse(engine.snapshot());
    engine.restore(initialSfen, JSON.stringify([...historyB, ...cycle]));
    const b4 = JSON.parse(engine.snapshot());
    if (a4.sfen !== b4.sfen) {
      throw new Error("the extended cycle must preserve the shared endpoint");
    }
    if (a4.terminal === null || a4.terminal.kind !== "repetition") {
      throw new Error(
        "the four-occurrence history must be judged a repetition draw",
      );
    }
    if (b4.terminal !== null) {
      throw new Error(
        "the three-occurrence history must not be judged a repetition",
      );
    }
    console.log(
      "AI Wasm separated identical-SFN repetition histories (same endpoint, different verdicts)",
    );
  } catch (error) {
    console.error(`FAIL AI Wasm execution smoke failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    engine?.free();
  }
}
