import { animateIf } from "./motion/preferences";

/**
 * Filtro per categoria delle gallerie (IT/EN): pulsanti [data-filter] (desktop)
 * e select [data-filter-select] (mobile) sincronizzati. Le card filtrate
 * ricompaiono con una breve dissolvenza; senza JS tutte le opere restano visibili.
 */
export function initGalleryFilter(gridSelector = "#opere-grid"): void {
    const grid = document.querySelector<HTMLElement>(gridSelector);
    if (!grid || grid.dataset.filterBound === "true") return;
    grid.dataset.filterBound = "true";

    const cards = Array.from(grid.querySelectorAll<HTMLElement>("[data-categoria]"));
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("button[data-filter]"));
    const select = document.querySelector<HTMLSelectElement>("[data-filter-select]");

    const apply = (filter: string) => {
        const active = (filter || "all").toLowerCase();
        cards.forEach((card) => {
            const visible = active === "all" || (card.dataset.categoria || "").toLowerCase() === active;
            const wasHidden = card.hidden;
            card.hidden = !visible;
            if (visible && wasHidden) {
                animateIf(card, [{ opacity: 0 }, { opacity: 1 }], { duration: 360, easing: "ease-out" });
            }
        });
        buttons.forEach((button) => button.setAttribute("aria-pressed", String((button.dataset.filter || "all") === active)));
        if (select && select.value !== active) select.value = active;
    };

    buttons.forEach((button) => button.addEventListener("click", () => apply(button.dataset.filter || "all")));
    select?.addEventListener("change", () => apply(select.value));
}
