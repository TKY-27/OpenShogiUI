import { afterEach, expect, it, vi } from "vitest";
import { fetchArtifact } from "./core-prototype-protocol";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
const bytes = new TextEncoder().encode("verified model");
const asset = {
  url: "/registered-only",
  size: bytes.length,
  sha256: createHash("sha256").update(bytes).digest("hex"),
};
afterEach(() => vi.unstubAllGlobals());
it("uses the fetched bytes once, repairs corrupt HTTP cache once, and rejects an incorrect replacement", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response("corrupt"))
    .mockResolvedValueOnce(new Response(bytes));
  vi.stubGlobal("fetch", fetch);
  expect(new Uint8Array((await fetchArtifact(asset)).bytes)).toEqual(bytes);
  expect(fetch.mock.calls.map((c) => c[1].cache)).toEqual([
    "force-cache",
    "reload",
  ]);
  fetch
    .mockReset()
    .mockImplementation(() => Promise.resolve(new Response(bytes)));
  await fetchArtifact(asset);
  expect(fetch).toHaveBeenCalledTimes(1);
  fetch
    .mockReset()
    .mockImplementation(() => Promise.resolve(new Response("wrong model")));
  await expect(fetchArtifact(asset)).rejects.toThrow();
  expect(fetch).toHaveBeenCalledTimes(2);
  fetch
    .mockReset()
    .mockResolvedValue(new Response("unavailable", { status: 503 }));
  await expect(fetchArtifact(asset)).rejects.toThrow();
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("decodes a static gzip model before verification and repairs invalid compressed bytes once", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response("not gzip"))
    .mockResolvedValueOnce(new Response(gzipSync(bytes)));
  vi.stubGlobal("fetch", fetch);
  expect(
    new Uint8Array(
      (await fetchArtifact({ ...asset, url: "/model/hash/leaf.osaval03.gz" }))
        .bytes,
    ),
  ).toEqual(bytes);
  expect(fetch).toHaveBeenCalledTimes(2);
});
