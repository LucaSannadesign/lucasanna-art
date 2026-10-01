import { animateIf, canHover, motionLevel } from "./motion/preferences";

/**
 * Homepage: la frase-manifesto e l'immagine d'apertura si rispondono.
 * Quando la frase entra nel campo visivo emerge lentamente e, nello stesso
 * momento, l'opera in apertura passa dal grigio al colore (una sola volta):
 * "ciò che resiste mentre si trasforma". Senza JS o con riduzione del movimento
 * tutto è subito visibile; su desktop senza JS resta il comportamento originale (hover).
 */
const MANIFESTO = ".home-manifesto, .home-editorial-content > p:has(> em:only-child)";

export function initHome(): void {
    const manifesto = document.querySelector<HTMLElement>(MANIFESTO);
    const hero = document.querySelector<HTMLImageElement>("[data-home-hero]");
    if (!manifesto) return;

    const awaken = () => {
        manifesto.classList.add("is-revealed");
        if (!hero || hero.dataset.awakening === "true") return;
        hero.dataset.awakening = "true";
        const wasGrey = canHover() && getComputedStyle(hero).filter.includes("grayscale");
        const animation = wasGrey
            ? animateIf(hero, [{ filter: "grayscale(1)" }, { filter: "grayscale(0)" }], {
                  duration: motionLevel() === "full" ? 2400 : 3200,
                  easing: "cubic-bezier(0.37, 0, 0.63, 1)",
              })
            : null;
        // Lo stato finale (colore) è fissato via classe a fine animazione.
        if (animation) animation.finished.then(() => hero.classList.add("is-awake")).catch(() => hero.classList.add("is-awake"));
        else hero.classList.add("is-awake");
    };

    if (motionLevel() === "none" || !("IntersectionObserver" in window)) {
        awaken();
        return;
    }

    const observer = new IntersectionObserver(
        (entries) => {
            if (!entries.some((entry) => entry.isIntersecting)) return;
            observer.disconnect();
            animateIf(
                manifesto,
                [
                    { opacity: 0, filter: "blur(3px)", letterSpacing: "0.04em" },
                    { opacity: 1, filter: "blur(0px)", letterSpacing: "0.01em" },
                ],
                { duration: motionLevel() === "full" ? 1400 : 1800, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "backwards" },
            );
            awaken();
        },
        { threshold: 0.6 },
    );
    observer.observe(manifesto);
}
