import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

/**
 * Metadati immagine calcolati in fase di build (nessun costo a runtime):
 * - width/height reali → attributi <img> per evitare layout shift (CLS);
 * - ambient: colore molto scuro e desaturato derivato dalla tonalità dominante
 *   dell'opera, usato dall'atmosfera cromatica. L'immagine originale non viene toccata.
 *
 * Il colore è vincolato (OKLCH L ≈ 0.2, C ≤ 0.028) così che il testo chiaro
 * mantenga sempre un contrasto WCAG AA abbondante sullo sfondo risultante.
 */

export type ImageMeta = {
    width: number;
    height: number;
    /** Assente se l'immagine non è decodificabile da sharp. */
    ambient?: string;
    /** false: il CDN immagini non può elaborarla → servire l'originale. */
    processable: boolean;
};

const cache = new Map<string, Promise<ImageMeta | null>>();
const PUBLIC_DIR = join(process.cwd(), "public");

const AMBIENT_L = 0.205;
const AMBIENT_C_MAX = 0.028;

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function linearToOklab(r: number, g: number, b: number) {
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return {
        L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
        a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
        b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    };
}

function oklabToLinear(L: number, a: number, b: number) {
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    return [
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ];
}

const hex = (v: number) =>
    Math.round(Math.min(1, Math.max(0, toGamma(Math.max(0, v)))) * 255)
        .toString(16)
        .padStart(2, "0");

/** Media pesata per saturazione: privilegia la tonalità dominante rispetto ai grigi. */
function ambientFromPixels(data: Buffer, channels: number): string {
    let sumA = 0;
    let sumB = 0;
    let weight = 0;
    for (let i = 0; i < data.length; i += channels) {
        const lab = linearToOklab(toLinear(data[i]! / 255), toLinear(data[i + 1]! / 255), toLinear(data[i + 2]! / 255));
        const chroma = Math.hypot(lab.a, lab.b);
        const w = 0.15 + chroma * 4;
        sumA += lab.a * w;
        sumB += lab.b * w;
        weight += w;
    }
    const a = sumA / weight;
    const b = sumB / weight;
    const chroma = Math.hypot(a, b);
    const scale = chroma > 0 ? Math.min(AMBIENT_C_MAX, chroma * 0.3) / chroma : 0;
    const [r, g, bl] = oklabToLinear(AMBIENT_L, a * scale, b * scale);
    return `#${hex(r!)}${hex(g!)}${hex(bl!)}`;
}

/**
 * Lettura minima delle dimensioni dall'header WebP (VP8 / VP8L / VP8X) per i file
 * che il browser mostra ma libwebp rifiuta: almeno width/height restano noti (no CLS).
 */
function webpSize(file: string): { width: number; height: number } | null {
    try {
        const buf = readFileSync(file);
        if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WEBP") return null;
        const chunk = buf.toString("ascii", 12, 16);
        if (chunk === "VP8 ") return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
        if (chunk === "VP8L") {
            const bits = buf.readUInt32LE(21);
            return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
        }
        if (chunk === "VP8X") return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
    } catch {}
    return null;
}

async function compute(publicPath: string): Promise<ImageMeta | null> {
    const file = join(PUBLIC_DIR, decodeURI(publicPath));
    if (!publicPath.startsWith("/") || !existsSync(file)) return null;
    try {
        const image = sharp(file);
        const info0 = await image.metadata();
        // Orientamento EXIF 5–8: il browser ruota l'immagine, quindi lati invertiti.
        const rotated = (info0.orientation ?? 1) >= 5;
        const width = rotated ? info0.height : info0.width;
        const height = rotated ? info0.width : info0.height;
        if (!width || !height) return null;
        const { data, info } = await image
            .clone()
            .resize(24, 24, { fit: "fill" })
            .removeAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });
        return { width, height, ambient: ambientFromPixels(data, info.channels), processable: true };
    } catch {
        const size = file.toLowerCase().endsWith(".webp") ? webpSize(file) : null;
        return size && size.width && size.height ? { ...size, processable: false } : null;
    }
}

export function getImageMeta(publicPath: string | undefined): Promise<ImageMeta | null> {
    if (!publicPath) return Promise.resolve(null);
    let pending = cache.get(publicPath);
    if (!pending) {
        pending = compute(publicPath);
        cache.set(publicPath, pending);
    }
    return pending;
}
