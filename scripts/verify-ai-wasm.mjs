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
  } catch (error) {
    console.error(`FAIL AI Wasm execution smoke failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    engine?.free();
  }
}
