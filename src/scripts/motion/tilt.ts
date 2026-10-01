import { canHover, motionLevel, onMotionChange } from "./preferences";

/**
 * Inclinazione prospettica leggerissima delle card al passaggio del mouse.
 * - Solo puntatori fini con hover (desktop); su touch nessun effetto.
 * - Contenitore [data-tilt-target]: rotateX/rotateY (max 1.4° Silenzio, 2.6° Rumore).
 * - Immagine interna: proprietà `translate` indipendente (non tocca `transform`,
 *   usato da hover e reveal) per una minima differenza di profondità.
 * - Un solo requestAnimationFrame per card, solo mentre si muove.
 */
const MAX_DEG = { none: 0, calm: 1.4, full: 2.6 } as const;
const DEPTH_PX = 0.9;

export function initTilt(selector = "[data-tilt]"): void {
    if (!canHover()) return;

    document.querySelectorAll<HTMLElement>(selector).forEach((card) => {
        if (card.dataset.tiltBound === "true") return;
        card.dataset.tiltBound = "true";

        const target = card.querySelector<HTMLElement>("[data-tilt-target]") ?? card;
        const img = target.querySelector<HTMLImageElement>("img");
        let goalX = 0;
        let goalY = 0;
        let x = 0;
        let y = 0;
        let frame = 0;

        const render = () => {
            x += (goalX - x) * 0.12;
            y += (goalY - y) * 0.12;
            const settled = Math.abs(goalX - x) < 0.01 && Math.abs(goalY - y) < 0.01;
            if (settled && goalX === 0 && goalY === 0) {
                target.style.removeProperty("transform");
                img?.style.removeProperty("translate");
                frame = 0;
                return;
            }
            target.style.transform = `perspective(1100px) rotateX(${x.toFixed(3)}deg) rotateY(${y.toFixed(3)}deg)`;
            img?.style.setProperty("translate", `${(-y * DEPTH_PX).toFixed(2)}px ${(x * DEPTH_PX).toFixed(2)}px`);
            frame = settled ? 0 : requestAnimationFrame(render);
        };

        const schedule = () => {
            if (!frame) frame = requestAnimationFrame(render);
        };

        card.addEventListener("pointermove", (event) => {
            if (event.pointerType !== "mouse") return;
            const max = MAX_DEG[motionLevel()];
            if (!max) return;
            const rect = target.getBoundingClientRect();
            const px = (event.clientX - rect.left) / rect.width - 0.5;
            const py = (event.clientY - rect.top) / rect.height - 0.5;
            goalX = -py * max;
            goalY = px * max;
            schedule();
        });

        card.addEventListener("pointerleave", () => {
            goalX = 0;
            goalY = 0;
            schedule();
        });
    });

    onMotionChange((level) => {
        if (level !== "none") return;
        document.querySelectorAll<HTMLElement>("[data-tilt-target]").forEach((el) => {
            el.style.removeProperty("transform");
            el.querySelector("img")?.style.removeProperty("translate");
        });
    });
}
