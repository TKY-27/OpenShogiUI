import { expect, it } from "vitest";
import { siteTags } from "../site-metadata";
it("keeps unknown origins unclaimed, validates public origins, and emits static card metadata once", () => {
  const unset = siteTags(null, "abcd");
  expect(
    unset.some(
      (t) => t.attrs?.rel === "canonical" || t.attrs?.property === "og:url",
    ),
  ).toBe(false);
  expect(unset.find((t) => t.attrs?.name === "robots")?.attrs?.content).toBe(
    "noindex",
  );
  for (const origin of [
    "http://example.invalid",
    "https://example.invalid/path",
    "https://example.invalid/#/match",
    "https://user:pass@example.invalid",
  ])
    expect(() => siteTags(origin, "abcd")).toThrow();
  const tags = siteTags("https://example.invalid", "abcd");
  expect(tags.filter((t) => t.tag === "title")).toHaveLength(1);
  expect(
    tags.find((t) => t.attrs?.property === "og:image")?.attrs?.content,
  ).toBe("https://example.invalid/ogp.png?v=abcd");
  expect(
    tags.find((t) => t.attrs?.property === "og:image:width")?.attrs?.content,
  ).toBe("1200");
  expect(tags.some((t) => t.attrs?.name === "robots")).toBe(false);
  expect(
    siteTags("http://127.0.0.1:5187", "abcd", true).some(
      (t) => t.attrs?.name === "robots",
    ),
  ).toBe(true);
});
