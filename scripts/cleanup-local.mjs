// Project-local cleanup of classified disposable QA artifacts.
//
// Dry-run by default; `--apply` deletes. Every deletable path is an exact
// allowlist entry below with a reason — nothing is inferred from .gitignore
// and nothing under local/ is deleted wholesale. Protected classes are
// refused even if someone adds them by mistake: git-tracked files, local
// databases (wrangler/miniflare sqlite state), the model asset mirror, the
// durable engine handoff, current QA evidence, dist and node_modules.
//
// `--self-test` exercises the refusal rules (tracked, protected, symlink,
// absent) on tiny fixtures and real repo anchors, then removes the fixtures.
import {
  lstat,
  mkdir,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const apply = process.argv.includes("--apply");
const selfTest = process.argv.includes("--self-test");

/** Exact repository-relative paths classified as disposable QA evidence. */
const DISPOSABLE = [
  ["local/qa-prod", "superseded production QA round"],
  ["local/qa-prod-round1", "superseded production QA round"],
  ["local/qa-prod-round2", "superseded production QA round"],
  ["local/qa-prod-round3", "superseded production QA round"],
  ["local/qa-prod-round4", "superseded production QA round"],
  ["local/qa-prod-followup", "superseded production QA round"],
  ["local/qa-fixed10", "superseded fixed10 QA round"],
  ["local/qa-layout", "superseded layout QA round"],
  ["local/qa-save", "superseded kifu-save QA fixtures"],
  ["local/preview-check", "superseded preview QA round"],
  ["local/ui-check", "superseded local UI QA round"],
  ["local/traffic-measure", "superseded traffic measurement evidence"],
  ["local/collection-browser", "superseded collection browser QA round"],
  ["local/review", "superseded review diffs from the preceding task"],
  ["local/review-osai.diff", "superseded review diff from the preceding task"],
  ["local/review-osui.diff", "superseded review diff from the preceding task"],
  ["local/qa-clock", "superseded play-clock QA round"],
  ["local/usi-name-check", "superseded USI naming QA round"],
  ["local/ui-check-dev.log", "stale dev server log"],
  ["local/wrangler-dev.log", "stale wrangler log"],
  ["local/wrangler-dev2.log", "stale wrangler log"],
  ["output", "old playwright observation evidence"],
  [".playwright-cli", "old browser automation diagnostics"],
];

/** Anything matching these is refused even if listed in DISPOSABLE. */
const PROTECTED = [
  /^local\/model-assets(\/|$)/,
  /^local\/handoff(\/|$)/,
  /^local\/qa-final(\/|$)/,
  /^local\/collection-db(\/|$)/,
  /^local\/collection-deploy-db(\/|$)/,
  /^local\/preview-db(\/|$)/,
  /^local\/wrangler-preview(\/|$)/,
  /^dist(\/|$)/,
  /^node_modules(\/|$)/,
];

const treeSize = async (target, depth = 0) => {
  if (depth > 32) return 0;
  // lstat: a symlink inside a disposable dir counts as itself, never its target.
  const info = await lstat(target).catch(() => null);
  if (info === null) return 0;
  if (!info.isDirectory()) return info.size;
  let total = 0;
  for (const entry of await readdir(target, { withFileTypes: true })) {
    total += await treeSize(join(target, entry.name), depth + 1);
  }
  return total;
};

const formatMb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/** The loop's containment guard, factored out so the self-test exercises it. */
const escapesRoot = (absolute) => !absolute.startsWith(root + sep);

/** Returns null when safe to delete, or a refusal reason. */
const refusalFor = async (relativePath, absolute) => {
  for (const pattern of PROTECTED) {
    if (pattern.test(relativePath)) return "protected class";
  }
  const tracked = spawnSync("git", ["ls-files", "--", relativePath], {
    cwd: root,
    encoding: "utf8",
  });
  if (tracked.status === 0 && tracked.stdout.trim().length > 0)
    return "path is git-tracked";
  const info = await lstat(absolute).catch(() => null);
  if (info === null) return null; // already absent — idempotent no-op
  if (info.isSymbolicLink()) return "symlink (containment guard)";
  if (!info.isDirectory() && !info.isFile()) return "unusual file type";
  const real = await stat(absolute).then(
    (value) => value,
    () => null,
  );
  if (real === null) return "broken symlink target";
  // An active writer touched this path very recently; skip and surface it.
  if (Date.now() - real.mtimeMs < 10 * 60 * 1000)
    return "modified within the last 10 minutes";
  return null;
};

if (selfTest) {
  const fixtures = resolve(root, "local", ".cleanup-selftest");
  await rm(fixtures, { recursive: true, force: true });
  await mkdir(resolve(fixtures, "dir"), { recursive: true });
  await writeFile(resolve(fixtures, "dir/shot.png"), "x");
  const link = resolve(fixtures, "link");
  await symlink("/etc", link);
  const checks = [
    [
      "git-tracked file is refused",
      (await refusalFor("package.json", resolve(root, "package.json"))) ===
        "path is git-tracked",
    ],
    [
      "protected database dir is refused",
      (await refusalFor(
        "local/preview-db",
        resolve(root, "local/preview-db"),
      )) === "protected class",
    ],
    [
      "protected model mirror is refused",
      (await refusalFor(
        "local/model-assets",
        resolve(root, "local/model-assets"),
      )) === "protected class",
    ],
    [
      "dist is refused",
      (await refusalFor("dist", resolve(root, "dist"))) === "protected class",
    ],
    [
      "symlink is refused",
      (await refusalFor("local/.cleanup-selftest/link", link)) ===
        "symlink (containment guard)",
    ],
    [
      "broken symlink is refused, not treated as absent",
      await (async () => {
        const broken = resolve(fixtures, "broken");
        await symlink(resolve(fixtures, "gone-target"), broken);
        return (
          (await refusalFor("local/.cleanup-selftest/broken", broken)) ===
          "symlink (containment guard)"
        );
      })(),
    ],
    [
      "escaping path is refused by the containment guard",
      escapesRoot(resolve(root, "../elsewhere")) &&
        !escapesRoot(resolve(root, "src")),
    ],
    [
      "absent path is an idempotent no-op",
      (await refusalFor(
        "local/.cleanup-selftest/absent",
        resolve(fixtures, "absent"),
      )) === null,
    ],
  ];
  let failures = 0;
  for (const [label, ok] of checks) {
    console.log(`${ok ? "OK " : "FAIL"} self-test: ${label}`);
    if (!ok) failures++;
  }
  await rm(fixtures, { recursive: true, force: true });
  if (failures > 0) {
    console.error(`${failures} cleanup self-test checks failed`);
    process.exitCode = 1;
  } else {
    console.log("cleanup self-test passed; fixtures removed");
  }
  process.exit(process.exitCode ?? 0);
}

console.log(
  apply ? "cleanup APPLY" : "cleanup DRY-RUN (pass --apply to delete)",
);
let classified = 0;
let freed = 0;
for (const [relativePath] of DISPOSABLE) {
  const absolute = resolve(root, relativePath);
  if (escapesRoot(absolute)) {
    console.log(`SKIP    ${relativePath}: escapes the checkout`);
    continue;
  }
  const size = await treeSize(absolute);
  // lstat: a broken symlink at a disposable path is refused below instead of
  // being silently reported absent.
  const exists = await lstat(absolute).then(
    () => true,
    () => false,
  );
  if (!exists) {
    console.log(`absent  ${relativePath}`);
    continue;
  }
  const reason = await refusalFor(relativePath, absolute);
  if (reason !== null) {
    console.log(`SKIP    ${relativePath}: ${reason}`);
    continue;
  }
  classified += size;
  if (apply) {
    await rm(absolute, { recursive: true, force: false });
    freed += size;
    console.log(`DELETE  ${relativePath} (${formatMb(size)})`);
  } else {
    console.log(`WOULD   ${relativePath} (${formatMb(size)})`);
  }
}
console.log(
  apply
    ? `freed ${formatMb(freed)} of ${formatMb(classified)} classified`
    : `classifiable: ${formatMb(classified)}; rerun with --apply to delete`,
);
