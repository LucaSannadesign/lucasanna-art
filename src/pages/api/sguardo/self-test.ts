import type { APIRoute } from "astro";
import { getSguardoStore, sguardoImageKey, type SguardoShareMetadata } from "../../../lib/sguardoSocial";

export const prerender = false;

// Temporary QA route: deploy previews only. Removed before merge.
export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const qaKey = "qa-8f4a6d9c1b7347f0b3d256ec";
  const isPreview = url.hostname.startsWith("deploy-preview-");
  const isAuthorizedProductionProbe =
    process.env.CONTEXT === "production" && url.searchParams.get("key") === qaKey;

  if (!isPreview && !isAuthorizedProductionProbe) {
    return new Response("Not found", { status: 404 });
  }

  const id = crypto.randomUUID();
  // Tiny valid JPEG used only to verify Blob write/read + dynamic OG page plumbing.
  const bytes = Uint8Array.from(
    atob("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9k="),
    (char) => char.charCodeAt(0),
  );
  const blob = new Blob([bytes], { type: "image/jpeg" });
  const metadata: SguardoShareMetadata = {
    id,
    title: "QA Castello di Bran",
    slug: "grafica/castello-di-bran-veduta-interna",
    sourceUrl: "https://lucasanna.art/opere/grafica/castello-di-bran-veduta-interna/",
    caption: "Anteprima tecnica Il mio sguardo.",
    format: "portrait",
    width: 1080,
    height: 1350,
    createdAt: new Date().toISOString(),
  };

  const store = getSguardoStore();
  await store.set(sguardoImageKey(id), blob, { metadata });
  const saved = await store.getWithMetadata(sguardoImageKey(id), { type: "blob" });

  return new Response(
    JSON.stringify({
      ok: Boolean(saved?.data),
      id,
      bytes: saved?.data instanceof Blob ? saved.data.size : 0,
      pageUrl: new URL(`/sguardo/${id}/`, url.origin).href,
      imageUrl: new URL(`/api/sguardo/image/${id}`, url.origin).href,
      metadata: saved?.metadata ?? null,
    }),
    {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    },
  );
};
