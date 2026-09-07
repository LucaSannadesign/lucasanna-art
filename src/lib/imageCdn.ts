export function netlifyImageUrl(
    src: string,
    width: number,
    quality = 78,
    format: "webp" | "avif" | "jpg" = "webp",
): string {
    const params = new URLSearchParams({
        url: src,
        w: String(width),
        fm: format,
        q: String(quality),
    });

    return `/.netlify/images?${params.toString()}`;
}

export function netlifyImageSrcSet(
    src: string,
    widths: number[],
    quality = 78,
    format: "webp" | "avif" | "jpg" = "webp",
): string {
    return widths
        .map((width) => `${netlifyImageUrl(src, width, quality, format)} ${width}w`)
        .join(", ");
}
