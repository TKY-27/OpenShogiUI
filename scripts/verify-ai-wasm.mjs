import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import initWasm, {
  WasmBrowserEngine,
} from "../src/generated/open_shogi_wasm.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const aiRoot = resolve(
  process.env.OPENSHOGIAI_ROOT ?? join(root, "../OpenShogiAI-final"),
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
  } catch (error) {
    console.error(`FAIL AI Wasm execution smoke failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    engine?.free();
  }
}
