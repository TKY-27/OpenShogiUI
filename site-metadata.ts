import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { HtmlTagDescriptor, Plugin } from "vite";
import configuration from "./project.config.json";

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
  const title = "OpenShogiUI — オープンな将棋のAI";
  const description =
    "OpenShogiAIとブラウザーで対局し、学習モデルで局面を解析できます。対局・解析は端末内で行います。";
  const tags: HtmlTagDescriptor[] = [
    { tag: "title", children: title },
    { tag: "meta", attrs: { name: "description", content: description } },
    ...Object.entries({
      "og:title": title,
      "og:description": description,
      "og:type": "website",
      "og:site_name": "OpenShogiUI",
      "og:locale": "ja_JP",
      "og:image:width": "1200",
      "og:image:height": "630",
      "og:image:type": "image/png",
      "og:image:alt": "OpenShogiUI — オープンな将棋のAI。OpenShogiAIを使用。",
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
      attrs: {
        name: "twitter:image:alt",
        content: "OpenShogiUI — オープンな将棋のAI",
      },
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
      return siteTags(
        process.env.OSUI_SITE_ORIGIN ?? configuration.publicOrigin,
        hash,
        process.env.OSUI_ISOLATED_MODELS === "1",
      );
    },
  };
}
