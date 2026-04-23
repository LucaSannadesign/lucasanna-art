import { getCollection } from "astro:content";

export const prerender = true;

const SITE_URL = "https://lucasanna.art";

const STATIC_PATHS = ["/", "/blog-arte/", "/opere/"];
const EXCLUDED_PAGE_SLUGS = new Set(["index"]);
const EXCLUDED_POST_SLUGS = new Set(["blog-arte", "luca-sanna-art-shop"]);
const EXCLUDED_OPERE_SLUGS = new Set(["opere"]);

/** Legacy / non-content paths that must not appear in the sitemap (defensive). */
const EXCLUDED_SITEMAP_PATHS = new Set([
  "/comments/feed/",
  "/shop__trashed/",
  "/opere/grafica/inquietudine-",
  "/opere/grafica/inquietudine-/",
]);

function toUrl(path: string): string {
  return new URL(path, SITE_URL).toString();
}

function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export async function GET() {
  const [pages, posts, opere] = await Promise.all([
    getCollection("pages"),
    getCollection("posts"),
    getCollection("opere"),
  ]);

  const urls = new Set<string>();

  for (const path of STATIC_PATHS) urls.add(toUrl(path));

  for (const page of pages) {
    if (EXCLUDED_PAGE_SLUGS.has(page.slug)) continue;
    urls.add(toUrl(`/${page.slug}/`));
  }

  for (const post of posts) {
    if (EXCLUDED_POST_SLUGS.has(post.slug)) continue;
    urls.add(toUrl(`/${post.slug}/`));
  }

  for (const opera of opere) {
    if (EXCLUDED_OPERE_SLUGS.has(opera.slug)) continue;
    urls.add(toUrl(`/opere/${opera.slug}/`));
  }

  for (const u of [...urls]) {
    if (EXCLUDED_SITEMAP_PATHS.has(new URL(u).pathname)) urls.delete(u);
  }

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...urls]
  .sort((a, b) => a.localeCompare(b))
  .map((loc) => `  <url><loc>${xmlEscape(loc)}</loc></url>`)
  .join("\n")}
</urlset>`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
    },
  });
}
