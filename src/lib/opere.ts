import { getCollection, type CollectionEntry } from "astro:content";

/**
 * Helper condivisi per le opere (archivio, pagine categoria, pagina opera, home).
 * Sostituiscono le copie duplicate di ordinamento e inferenza curatoriale.
 */

export type Opera = CollectionEntry<"opere">;

export const CATEGORY_LABELS: Record<string, string> = {
    animali: "Animali",
    pittura: "Pittura",
    grafica: "Grafica",
    paesaggio: "Paesaggio",
    ritratti: "Ritratti",
    opere: "Opere",
};

export const CATEGORY_LABELS_EN: Record<string, string> = {
    animali: "Animals",
    pittura: "Painting",
    grafica: "Graphic work",
    paesaggio: "Landscape",
    ritratti: "Portraits",
    opere: "Works",
};

const time = (work: Opera) => new Date(work.data.date || 0).getTime();

export const byDateDesc = (a: Opera, b: Opera) => time(b) - time(a);

/** Tutte le singole opere (esclude le pagine categoria), dalla più recente. */
export async function getArtworks(): Promise<Opera[]> {
    return (await getCollection("opere")).filter((work) => work.slug.includes("/")).sort(byDateDesc);
}

export function getWorkCategory(work: Opera): string {
    const explicitCategory = work.data.categories?.[0]?.toLowerCase();
    if (explicitCategory) return explicitCategory;
    return work.slug.split("/")[0]?.toLowerCase() || "altro";
}

export function inferTema(work: Opera): string {
    if (work.data.tema) return work.data.tema.toLowerCase();
    const category = getWorkCategory(work);
    const tags = (work.data.tags || []).map((tag) => tag.toLowerCase());
    if (tags.some((tag) => tag.includes("natura") || tag.includes("paesaggio"))) return "natura";
    if (tags.some((tag) => tag.includes("ritratto") || tag.includes("volto"))) return "figura";
    if (category === "animali") return "fauna";
    if (category === "grafica") return "segno";
    if (category === "ritratti") return "identità";
    return "luce";
}

export function inferPeriodo(work: Opera): string {
    if (work.data.periodo) return work.data.periodo.toLowerCase();
    const sourceYear = Number(work.data.year || new Date(work.data.date || 0).getFullYear() || 0);
    if (sourceYear && sourceYear <= 2021) return "radici";
    if (sourceYear && sourceYear <= 2023) return "passaggio";
    if (sourceYear && sourceYear <= 2024) return "orizzonti";
    return "contemporaneo";
}

export function inferEmozione(work: Opera): string {
    if (work.data.emozione) return work.data.emozione.toLowerCase();
    const category = getWorkCategory(work);
    if (category === "paesaggio") return "contemplazione";
    if (category === "ritratti") return "intimità";
    if (category === "animali") return "vitalità";
    if (category === "grafica") return "tensione";
    return "meraviglia";
}

/**
 * Opere adiacenti nella stessa sezione, nello stesso ordine della pagina categoria
 * (dalla più recente). Nessun ciclo: la prima non ha precedente, l'ultima non ha successiva.
 */
export function getAdjacentWorks(entry: Opera, all: Opera[]): { prev: Opera | null; next: Opera | null } {
    const category = entry.slug.split("/")[0];
    const siblings = all.filter((work) => work.slug.startsWith(`${category}/`)).sort(byDateDesc);
    const index = siblings.findIndex((work) => work.slug === entry.slug);
    if (index < 0) return { prev: null, next: null };
    return {
        prev: siblings[index - 1] ?? null,
        next: siblings[index + 1] ?? null,
    };
}
