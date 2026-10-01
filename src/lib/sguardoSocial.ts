import { getDeployStore, getStore } from "@netlify/blobs";

export const SGUARDO_STORE_NAME = "sguardo-social";

export type SguardoShareMetadata = {
  id: string;
  title: string;
  slug: string;
  sourceUrl: string;
  caption: string;
  format: "square" | "portrait" | "story";
  width: number;
  height: number;
  createdAt: string;
};

export function getSguardoStore() {
  const runtimeContext =
    (globalThis as typeof globalThis & {
      Netlify?: { context?: { deploy?: { context?: string } } };
    }).Netlify?.context?.deploy?.context || "";

  const context = runtimeContext || process.env.CONTEXT || "";

  if (context === "production") {
    return getStore(SGUARDO_STORE_NAME, { consistency: "strong" });
  }

  return getDeployStore(SGUARDO_STORE_NAME);
}

export function sguardoImageKey(id: string) {
  return `cards/${id}.jpg`;
}

export function isValidSguardoId(value: string | undefined): value is string {
  return Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
  );
}

export function sanitizeText(value: FormDataEntryValue | null, maxLength: number) {
  return String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function formatDimensions(format: string) {
  if (format === "square") return { format: "square" as const, width: 1080, height: 1080 };
  if (format === "story") return { format: "story" as const, width: 1080, height: 1920 };
  return { format: "portrait" as const, width: 1080, height: 1350 };
}
