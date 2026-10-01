import type { APIRoute } from "astro";
import {
  formatDimensions,
  getSguardoStore,
  sanitizeText,
  sguardoImageKey,
  type SguardoShareMetadata,
} from "../../../lib/sguardoSocial";

export const prerender = false;

const MAX_IMAGE_BYTES = 2_500_000;

export const POST: APIRoute = async ({ request }) => {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");

  if (origin && origin !== requestUrl.origin) {
    return new Response(JSON.stringify({ error: "origin_not_allowed" }), {
      status: 403,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return new Response(JSON.stringify({ error: "invalid_form_data" }), {
      status: 400,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  const file = form.get("image");
  if (!(file instanceof File) || file.type !== "image/jpeg" || file.size < 1 || file.size > MAX_IMAGE_BYTES) {
    return new Response(JSON.stringify({ error: "invalid_image" }), {
      status: 400,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  const title = sanitizeText(form.get("title"), 180);
  const slug = sanitizeText(form.get("slug"), 240);
  const sourceUrlRaw = sanitizeText(form.get("sourceUrl"), 500);
  const caption = sanitizeText(form.get("caption"), 500);
  const requestedFormat = sanitizeText(form.get("format"), 20);
  const dimensions = formatDimensions(requestedFormat);

  if (!title || !slug || !sourceUrlRaw) {
    return new Response(JSON.stringify({ error: "missing_metadata" }), {
      status: 400,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  let sourceUrl: URL;
  try {
    sourceUrl = new URL(sourceUrlRaw);
  } catch {
    return new Response(JSON.stringify({ error: "invalid_source_url" }), {
      status: 400,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  const allowedHosts = new Set(["lucasanna.art", "www.lucasanna.art"]);
  if (!allowedHosts.has(sourceUrl.hostname)) {
    return new Response(JSON.stringify({ error: "invalid_source_host" }), {
      status: 400,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  const id = crypto.randomUUID();
  const metadata: SguardoShareMetadata = {
    id,
    title,
    slug,
    sourceUrl: sourceUrl.href,
    caption: caption || `Una lettura personale di “${title}” di Luca Sanna.`,
    ...dimensions,
    createdAt: new Date().toISOString(),
  };

  try {
    const store = getSguardoStore();
    await store.set(sguardoImageKey(id), file, { metadata });
  } catch (error) {
    console.error("[sguardo-share] blob write failed", error);
    return new Response(JSON.stringify({ error: "storage_unavailable" }), {
      status: 503,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  const pageUrl = new URL(`/sguardo/${id}/`, requestUrl.origin).href;
  const imageUrl = new URL(`/api/sguardo/image/${id}`, requestUrl.origin).href;

  return new Response(
    JSON.stringify({
      id,
      pageUrl,
      imageUrl,
      width: dimensions.width,
      height: dimensions.height,
    }),
    {
      status: 201,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    },
  );
};
