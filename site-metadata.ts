import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { HtmlTagDescriptor, Plugin } from "vite";
import configuration from "./project.config.json";

const TITLE = "OpenShogiAI — 将棋AIと対局・局面解析";
const DESCRIPTION =
  "OpenShogiAIとブラウザーで対局し、学習モデルで局面を解析できます。対局・解析は端末内で行います。";
const SITE_NAME = "OpenShogiAI";

/**
 * Operator-approved Cloudflare Web Analytics. The beacon is injected only when
 * a build opts in (OSUI_WEB_ANALYTICS=1, set by build-cloudflare.mjs), so
 * plain builds, local/dev servers and CI never contact the collector. The
 * token is the public beacon token from the dashboard snippet; it identifies
 * the site, not the visitor.
 */
const WEB_ANALYTICS_TOKEN = "8b7f684964cf4d0393346373e68e8497";
const WEB_ANALYTICS_SRC = "https://static.cloudflareinsights.com/beacon.min.js";

export function analyticsBeaconTag(enabled: boolean): HtmlTagDescriptor | null {
  if (!enabled) return null;
  return {
    tag: "script",
    attrs: {
      type: "module",
      src: WEB_ANALYTICS_SRC,
      "data-cf-beacon": JSON.stringify({ token: WEB_ANALYTICS_TOKEN }),
    },
    injectTo: "head",
  };
}

export function siteTags(
  origin: string | null,
  imageHash: string,
  local = false,
): HtmlTagDescriptor[] {
  if (origin !== null) {
    const url = new URL(origin);
    if (
      url.origin !== origin ||
      url.username ||
      url.password ||
      (url.protocol !== "https:" &&
        !(local && url.protocol === "http:" && url.hostname === "127.0.0.1"))
    )
      throw Error(
        "Set a single HTTPS public origin, or a loopback origin for isolated local QA",
      );
  }
  const tags: HtmlTagDescriptor[] = [
    { tag: "title", children: TITLE },
    { tag: "meta", attrs: { name: "description", content: DESCRIPTION } },
    ...Object.entries({
      "og:title": TITLE,
      "og:description": DESCRIPTION,
      "og:type": "website",
      "og:site_name": SITE_NAME,
      "og:locale": "ja_JP",
      "og:image:width": "1200",
      "og:image:height": "630",
      "og:image:type": "image/png",
      "og:image:alt": `${SITE_NAME} — 将棋AIと対局・局面解析`,
    }).map(([property, content]) => ({
      tag: "meta",
      attrs: { property, content },
    })),
    {
      tag: "meta",
      attrs: { name: "twitter:card", content: "summary_large_image" },
    },
  ];
  const image = `${origin ?? ""}/ogp.png?v=${imageHash}`;
  tags.push(
    { tag: "meta", attrs: { property: "og:image", content: image } },
    { tag: "meta", attrs: { name: "twitter:image", content: image } },
    {
      tag: "meta",
      attrs: { name: "twitter:image:alt", content: TITLE },
    },
  );
  if (origin)
    tags.push(
      { tag: "link", attrs: { rel: "canonical", href: `${origin}/` } },
      { tag: "meta", attrs: { property: "og:url", content: `${origin}/` } },
    );
  if (!origin || local)
    tags.push({ tag: "meta", attrs: { name: "robots", content: "noindex" } });
  return tags.map((tag) => ({ ...tag, injectTo: "head" as const }));
}
export function siteMetadata(): Plugin {
  return {
    name: "static-site-metadata",
    transformIndexHtml() {
      const hash = createHash("sha256")
        .update(readFileSync(new URL("./public/ogp.png", import.meta.url)))
        .digest("hex")
        .slice(0, 16);
      // Search visibility is independent of where model assets come from:
      // OSUI_ISOLATED_MODELS only selects the build-time asset mirror, while
      // OSUI_LOCAL_SITE marks loopback QA builds that must stay unindexed.
      const local = process.env.OSUI_LOCAL_SITE === "1";
      const beacon = analyticsBeaconTag(process.env.OSUI_WEB_ANALYTICS === "1");
      return [
        ...siteTags(
          process.env.OSUI_SITE_ORIGIN ?? configuration.publicOrigin,
          hash,
          local,
        ),
        ...(beacon === null ? [] : [beacon]),
      ];
    },
  };
}
