import type { APIRoute } from "astro";
import {
  getSguardoStore,
  isValidSguardoId,
  sguardoImageKey,
} from "../../../../lib/sguardoSocial";

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const id = params.id;
  if (!isValidSguardoId(id)) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const store = getSguardoStore();
    const entry = await store.getWithMetadata(sguardoImageKey(id), { type: "blob" });

    if (!entry || !(entry.data instanceof Blob)) {
      return new Response("Not found", { status: 404 });
    }

    return new Response(entry.data, {
      status: 200,
      headers: {
        "content-type": "image/jpeg",
        "cache-control": "public, max-age=31536000, immutable",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[sguardo-image] blob read failed", error);
    return new Response("Unavailable", { status: 503 });
  }
};
