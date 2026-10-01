/**
 * Unica fonte di verità per il livello di movimento.
 *
 * - "none": prefers-reduced-motion: reduce (sistema operativo) → nessun parallax,
 *   nessuna transizione decorativa; tutte le funzioni restano disponibili.
 * - "calm": modalità Silenzio (default del controllo "Riduci animazioni") →
 *   solo movimento percettivo essenziale, ampiezze ridotte.
 * - "full": modalità Rumore → ampiezze piene, profondità allo scroll.
 */
export type MotionLevel = "none" | "calm" | "full";

const reduceQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const hoverQuery = window.matchMedia("(hover: hover) and (pointer: fine)");

export function motionLevel(): MotionLevel {
    if (reduceQuery.matches) return "none";
    return document.documentElement.getAttribute("data-modalita-percettiva") === "rumore" ? "full" : "calm";
}

export const canHover = () => hoverQuery.matches;

/** Notifica i cambi di livello (preferenza di sistema o toggle Silenzio/Rumore). */
export function onMotionChange(callback: (level: MotionLevel) => void): void {
    const notify = () => callback(motionLevel());
    reduceQuery.addEventListener("change", notify);
    new MutationObserver(notify).observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-modalita-percettiva"],
    });
}

/** Legge un token CSS in millisecondi (es. "--vt-duration"). */
export function cssMs(name: string, fallback: number): number {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const value = parseFloat(raw);
    if (!Number.isFinite(value)) return fallback;
    return raw.endsWith("ms") || !raw.endsWith("s") ? value : value * 1000;
}

/**
 * Web Animations API rispettosa del livello di movimento.
 * Con "none" non anima (lo stato finale è sempre quello CSS/inline già applicato).
 */
export function animateIf(
    el: Element | null,
    keyframes: Keyframe[],
    options: KeyframeAnimationOptions,
): Animation | null {
    if (!el || motionLevel() === "none" || typeof el.animate !== "function") return null;
    return el.animate(keyframes, options);
}
