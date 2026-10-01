import { netlifyImageSrcSet, netlifyImageUrl } from "../lib/imageCdn";
import type { PercorsoChiave, PercorsoWork } from "../lib/percorso";
import { animateIf, motionLevel } from "./motion/preferences";

/**
 * Percorso curatoriale: ingresso (chiave + sala) → tappe → congedo.
 * Stato serializzato nell'hash (#percorso=chiave/sala/tappa) con replaceState:
 * il link è condivisibile senza riempire la cronologia.
 */

type Data = {
    works: PercorsoWork[];
    chiavi: Record<PercorsoChiave, { label: string; testo: string }>;
    sale: Record<string, string>;
    periodoOrder: Record<string, number>;
    categorie: Record<string, string>;
};

const HASH_PREFIX = "#percorso=";
const KEYS: PercorsoChiave[] = ["tema", "periodo", "emozione"];
const TECNICHE = [
    "acquerello",
    "acrilico",
    "olio",
    "grafite",
    "carboncino",
    "matita",
    "china",
    "pastello",
    "penna",
    "digitale",
    "tecnica mista",
];

const $ = <T extends Element = HTMLElement>(root: ParentNode, selector: string) => root.querySelector<T>(selector)!;

const mainTechnique = (technique: string) => {
    const t = technique.toLowerCase();
    return TECNICHE.find((name) => t.includes(name)) ?? "";
};

const joinIt = (parts: string[]) =>
    parts.length > 1 ? `${parts.slice(0, -1).join(", ")} e ${parts.at(-1)}` : (parts[0] ?? "");

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

/** URL dell'immagine: CDN ridimensionato se disponibile, altrimenti l'originale. */
const imageUrl = (work: PercorsoWork, width: number, quality = 78) =>
    work.cdn ? netlifyImageUrl(work.image, Math.min(width, work.width || width), quality) : work.image;

export function initPercorso(): void {
    const dialog = document.querySelector<HTMLDialogElement>("[data-percorso]");
    if (!dialog || dialog.dataset.bound === "true") return;
    dialog.dataset.bound = "true";

    let data: Data;
    try {
        data = JSON.parse(dialog.querySelector("[data-percorso-data]")?.textContent || "");
    } catch {
        return;
    }
    if (!data.works?.length) return;

    const ui = {
        heading: $(dialog, "[data-percorso-heading]"),
        back: $<HTMLButtonElement>(dialog, "[data-percorso-back]"),
        close: $<HTMLButtonElement>(dialog, "[data-percorso-close]"),
        ingresso: $(dialog, "[data-percorso-ingresso]"),
        keys: Array.from(dialog.querySelectorAll<HTMLButtonElement>("[data-percorso-keys] [data-key]")),
        keyText: $(dialog, "[data-percorso-key-text]"),
        sale: $(dialog, "[data-percorso-sale]"),
        sala: $(dialog, "[data-percorso-sala]"),
        salaLabel: $(dialog, "[data-percorso-sala-label]"),
        count: $(dialog, "[data-percorso-count]"),
        bar: $(dialog, "[data-percorso-bar]"),
        barFill: $(dialog, "[data-percorso-bar-fill]"),
        stage: $(dialog, "[data-percorso-stage]"),
        img: $<HTMLImageElement>(dialog, "[data-percorso-img]"),
        info: $(dialog, "[data-percorso-info]"),
        salaText: $(dialog, "[data-percorso-sala-text]"),
        title: $(dialog, "[data-percorso-title]"),
        meta: $(dialog, "[data-percorso-meta]"),
        desc: $(dialog, "[data-percorso-desc]"),
        link: $<HTMLAnchorElement>(dialog, "[data-percorso-link]"),
        next: $(dialog, "[data-percorso-next]"),
        nextThumb: $<HTMLImageElement>(dialog, "[data-percorso-next-thumb]"),
        nextTitle: $(dialog, "[data-percorso-next-title]"),
        nextRel: $(dialog, "[data-percorso-next-rel]"),
        end: $(dialog, "[data-percorso-end]"),
        endText: $(dialog, "[data-percorso-end-text]"),
        prevBtn: $<HTMLButtonElement>(dialog, "[data-percorso-prev]"),
        nextBtn: $<HTMLButtonElement>(dialog, "[data-percorso-next-btn]"),
        restart: $<HTMLButtonElement>(dialog, "[data-percorso-restart]"),
        other: $<HTMLButtonElement>(dialog, "[data-percorso-other]"),
        live: $(dialog, "[data-percorso-live]"),
    };

    const state = {
        key: "tema" as PercorsoChiave,
        sala: "",
        list: [] as PercorsoWork[],
        /** Indice della tappa; list.length = congedo. */
        index: 0,
    };
    let opener: HTMLElement | null = null;

    /* ---------- dati ---------- */

    const valueOf = (work: PercorsoWork, key = state.key) => work[key];

    const roomsFor = (key: PercorsoChiave) => {
        const groups = new Map<string, PercorsoWork[]>();
        data.works.forEach((work) => {
            const value = valueOf(work, key);
            if (!value) return;
            groups.set(value, [...(groups.get(value) ?? []), work]);
        });
        return Array.from(groups.entries()).sort(([a, wa], [b, wb]) => {
            if (key === "periodo") return (data.periodoOrder[a] ?? 99) - (data.periodoOrder[b] ?? 99);
            return wb.length - wa.length || a.localeCompare(b, "it");
        });
    };

    /** Ordine narrativo: periodo, poi data/anno, poi titolo. */
    const narrativeSort = (list: PercorsoWork[]) =>
        [...list].sort((a, b) => {
            const period = (data.periodoOrder[a.periodo] ?? 99) - (data.periodoOrder[b.periodo] ?? 99);
            if (period) return period;
            const year = (Number(a.year) || 0) - (Number(b.year) || 0);
            if (year) return year;
            return a.title.localeCompare(b.title, "it");
        });

    const salaText = (value: string) => data.sale[value] ?? data.chiavi[state.key].testo;

    const relation = (a: PercorsoWork, b: PercorsoWork) => {
        const shared: string[] = [];
        const ta = mainTechnique(a.technique);
        const tb = mainTechnique(b.technique);
        if (ta && ta === tb) shared.push(`la tecnica (${ta})`);
        if (a.category === b.category) shared.push(`la sezione ${data.categorie[b.category] ?? b.category}`);
        if (state.key !== "periodo" && a.periodo === b.periodo) shared.push(`il periodo «${b.periodo}»`);
        if (state.key !== "emozione" && a.emozione === b.emozione) shared.push(`la tonalità «${b.emozione}»`);
        if (state.key !== "tema" && a.tema === b.tema) shared.push(`il tema «${b.tema}»`);
        if (shared.length) return `Condivide con quest'opera ${joinIt(shared.slice(0, 2))}.`;
        if (a.year && b.year && a.year !== b.year) return `Un salto nel tempo: dal ${a.year} al ${b.year}.`;
        if (ta && tb) return `Cambia la materia: da ${ta} a ${tb}.`;
        return "Un cambio di tono, dentro la stessa sala.";
    };

    /* ---------- hash ---------- */

    const writeHash = () => {
        const value =
            state.sala && dialog.open
                ? `${HASH_PREFIX}${encodeURIComponent(state.key)}/${encodeURIComponent(state.sala)}/${state.index + 1}`
                : dialog.open
                  ? `${HASH_PREFIX}${state.key}`
                  : "";
        const url = location.pathname + location.search + value;
        if (url !== location.pathname + location.search + location.hash) history.replaceState(history.state, "", url);
    };

    const readHash = () => {
        if (!location.hash.startsWith(HASH_PREFIX)) return null;
        const [key, sala, step] = location.hash.slice(HASH_PREFIX.length).split("/").map(decodeURIComponent);
        if (!KEYS.includes(key as PercorsoChiave)) return null;
        return { key: key as PercorsoChiave, sala: sala ?? "", step: Math.max(1, Number(step) || 1) };
    };

    /* ---------- ingresso ---------- */

    const renderIngresso = (key: PercorsoChiave) => {
        state.key = key;
        state.sala = "";
        ui.keys.forEach((btn) => btn.setAttribute("aria-pressed", String(btn.dataset.key === key)));
        ui.keyText.textContent = data.chiavi[key].testo;
        ui.heading.textContent = "Una mostra in cammino";
        ui.sale.replaceChildren(
            ...roomsFor(key).map(([value, works]) => {
                const li = document.createElement("li");
                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = "percorso__room";
                btn.dataset.sala = value;

                const thumbs = document.createElement("span");
                thumbs.className = "percorso__room-thumbs";
                thumbs.setAttribute("aria-hidden", "true");
                narrativeSort(works)
                    .slice(0, 3)
                    .forEach((work) => {
                        if (!work.image) return;
                        const img = document.createElement("img");
                        img.src = imageUrl(work, 160, 70);
                        img.alt = "";
                        img.loading = "lazy";
                        img.decoding = "async";
                        thumbs.append(img);
                    });

                const name = document.createElement("span");
                name.className = "percorso__room-name";
                name.textContent = capitalize(value);
                const count = document.createElement("span");
                count.className = "percorso__room-count";
                count.textContent = works.length === 1 ? "1 opera" : `${works.length} opere`;
                const text = document.createElement("span");
                text.className = "percorso__room-text";
                text.textContent = data.sale[value] ?? "";

                btn.append(thumbs, name, count, text);
                btn.addEventListener("click", () => enterSala(value, 0));
                li.append(btn);
                return li;
            }),
        );
        ui.ingresso.hidden = false;
        ui.sala.hidden = true;
        ui.back.hidden = true;
        dialog.style.removeProperty("--percorso-ambient");
        writeHash();
    };

    /* ---------- sala ---------- */

    const enterSala = (value: string, index: number) => {
        const list = narrativeSort(data.works.filter((work) => valueOf(work) === value));
        if (!list.length) return renderIngresso(state.key);
        state.sala = value;
        state.list = list;
        state.index = Math.min(index, list.length - 1);
        ui.ingresso.hidden = true;
        ui.sala.hidden = false;
        ui.back.hidden = false;
        ui.heading.textContent = capitalize(value);
        ui.salaLabel.textContent = `${data.chiavi[state.key].label} · ${value}`;
        ui.bar.setAttribute("aria-valuemax", String(list.length));
        render(0);
        ui.heading.focus({ preventScroll: true });
    };

    let running: Animation[] = [];

    const render = (direction: -1 | 0 | 1) => {
        const total = state.list.length;
        const atEnd = state.index >= total;
        const work = state.list[Math.min(state.index, total - 1)]!;
        const following = state.list[state.index + 1];

        ui.count.textContent = atEnd ? "Congedo" : `Tappa ${state.index + 1} di ${total}`;
        ui.bar.setAttribute("aria-valuenow", String(Math.min(state.index + 1, total)));
        ui.bar.setAttribute("aria-valuetext", ui.count.textContent);
        ui.barFill.style.setProperty("--progress", String(Math.min(state.index + 1, total) / total));
        ui.prevBtn.disabled = state.index <= 0;
        ui.nextBtn.disabled = atEnd;

        ui.stage.hidden = atEnd;
        ui.end.hidden = !atEnd;
        if (atEnd) {
            ui.endText.textContent = `Hai attraversato ${total === 1 ? "l'unica opera" : `le ${total} opere`} della sala «${state.sala}». ${salaText(state.sala)}`;
            ui.live.textContent = "Fine della sala";
            writeHash();
            return;
        }

        if (work.ambient) dialog.style.setProperty("--percorso-ambient", work.ambient);

        ui.img.alt = work.alt;
        if (work.width && work.height) {
            ui.img.width = work.width;
            ui.img.height = work.height;
        }
        const widths = [480, 768, 1024, 1400].filter((w) => !work.width || w <= work.width);
        ui.img.sizes = "(max-width: 860px) calc(100vw - 2rem), 56vw";
        ui.img.srcset = work.image && work.cdn && widths.length ? netlifyImageSrcSet(work.image, widths) : "";
        ui.img.src = work.image ? imageUrl(work, 1024) : "";

        // Il testo della sala accompagna la prima tappa, poi lascia spazio all'opera.
        ui.salaText.hidden = state.index !== 0;
        ui.salaText.textContent = salaText(state.sala);
        ui.title.textContent = work.title;
        ui.meta.textContent = [work.year, work.technique].filter(Boolean).join(" · ");
        ui.desc.textContent = work.description;
        ui.desc.hidden = !work.description;
        ui.link.href = work.href;

        ui.next.hidden = !following;
        if (following) {
            ui.nextThumb.src = following.image ? imageUrl(following, 160, 70) : "";
            ui.nextTitle.textContent = following.title;
            ui.nextRel.textContent = relation(work, following);
            // Precarica l'opera successiva: il passaggio resta immediato.
            if (following.image) new Image().src = imageUrl(following, 1024);
        }

        ui.live.textContent = `Tappa ${state.index + 1} di ${total}: ${work.title}`;
        writeHash();

        // Passaggio breve: dissolvenza, scala minima, 14 px nella direzione del cammino.
        running.forEach((animation) => animation.cancel());
        running = [];
        if (direction !== 0) {
            const shift = motionLevel() === "full" ? 16 : 10;
            const options: KeyframeAnimationOptions = {
                duration: motionLevel() === "full" ? 420 : 320,
                easing: "cubic-bezier(0.22, 1, 0.36, 1)",
            };
            const frames = [
                { opacity: 0, transform: `translateX(${direction * shift}px) scale(0.99)` },
                { opacity: 1, transform: "none" },
            ];
            [ui.img, ui.info].forEach((el, i) => {
                const anim = animateIf(el, frames, { ...options, delay: i * 50, fill: "backwards" });
                if (anim) running.push(anim);
            });
        }
    };

    const go = (delta: -1 | 1) => {
        if (ui.sala.hidden) return;
        const next = state.index + delta;
        if (next < 0 || next > state.list.length) return;
        state.index = next;
        render(delta);
    };

    /* ---------- apertura / chiusura ---------- */

    const open = () => {
        if (dialog.open) return;
        opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        dialog.showModal();
        document.documentElement.classList.add("percorso-open");
        const fromHash = readHash();
        if (fromHash?.sala) {
            state.key = fromHash.key;
            renderIngresso(fromHash.key);
            enterSala(fromHash.sala, fromHash.step - 1);
        } else {
            renderIngresso(fromHash?.key ?? state.key);
            ui.heading.focus({ preventScroll: true });
        }
    };

    dialog.addEventListener("close", () => {
        document.documentElement.classList.remove("percorso-open");
        writeHash();
        (opener && document.contains(opener) ? opener : document.querySelector<HTMLElement>("[data-percorso-open]"))?.focus({
            preventScroll: true,
        });
    });

    document.querySelectorAll<HTMLElement>("[data-percorso-open]").forEach((trigger) => trigger.addEventListener("click", open));
    ui.close.addEventListener("click", () => dialog.close());
    ui.back.addEventListener("click", () => {
        renderIngresso(state.key);
        ui.heading.focus({ preventScroll: true });
    });
    ui.keys.forEach((btn) => btn.addEventListener("click", () => renderIngresso(btn.dataset.key as PercorsoChiave)));
    ui.prevBtn.addEventListener("click", () => go(-1));
    ui.nextBtn.addEventListener("click", () => go(1));
    ui.restart.addEventListener("click", () => {
        state.index = 0;
        render(-1);
        ui.nextBtn.focus();
    });
    ui.other.addEventListener("click", () => {
        renderIngresso(state.key);
        ui.heading.focus({ preventScroll: true });
    });

    dialog.addEventListener("keydown", (event) => {
        if (event.altKey || event.ctrlKey || event.metaKey || ui.sala.hidden) return;
        if (event.key === "ArrowLeft") go(-1);
        else if (event.key === "ArrowRight") go(1);
        else return;
        event.preventDefault();
    });

    // Swipe orizzontale sulle tappe (touch); lo scroll verticale resta libero.
    let touchStart: { x: number; y: number } | null = null;
    ui.stage.addEventListener(
        "touchstart",
        (event) => {
            const t = event.changedTouches[0];
            touchStart = t ? { x: t.clientX, y: t.clientY } : null;
        },
        { passive: true },
    );
    ui.stage.addEventListener("touchend", (event) => {
        const t = event.changedTouches[0];
        if (!touchStart || !t) return;
        const dx = t.clientX - touchStart.x;
        const dy = t.clientY - touchStart.y;
        touchStart = null;
        if (Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.4) go(dx < 0 ? 1 : -1);
    });

    // Link condiviso con #percorso=…: la mostra si apre direttamente
    // (anche quando cambia solo l'hash, senza ricaricare la pagina).
    const fromLink = () => {
        const target = readHash();
        if (!target) return;
        if (!dialog.open) return open();
        const current = `${state.key}/${state.sala}/${state.index + 1}`;
        if (`${target.key}/${target.sala}/${target.step}` === current) return;
        renderIngresso(target.key);
        if (target.sala) enterSala(target.sala, target.step - 1);
    };
    window.addEventListener("hashchange", fromLink);
    fromLink();
}
