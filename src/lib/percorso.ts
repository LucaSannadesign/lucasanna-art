import { getImageMeta } from "./imageMeta";
import { getWorkCategory, inferEmozione, inferPeriodo, inferTema, type Opera } from "./opere";

/**
 * Dati e testi del Percorso curatoriale (mostra digitale).
 * I testi delle "sale" sono bozze curatoriali brevi: vanno rilette dall'artista.
 */

export type PercorsoChiave = "tema" | "periodo" | "emozione";

export type PercorsoWork = {
    title: string;
    href: string;
    /** Percorso dell'originale: gli URL responsive (CDN) sono costruiti nel client. */
    image: string;
    alt: string;
    width?: number;
    height?: number;
    /** false se l'immagine non è elaborabile dal CDN: si usa l'originale. */
    cdn: boolean;
    ambient?: string;
    year: string;
    technique: string;
    description: string;
    category: string;
    tema: string;
    periodo: string;
    emozione: string;
};

export const PERIODO_ORDER: Record<string, number> = {
    "archivio storico": 0,
    radici: 1,
    passaggio: 2,
    orizzonti: 3,
    contemporaneo: 4,
};

export const PERCORSO_CHIAVI: Record<PercorsoChiave, { label: string; testo: string }> = {
    tema: {
        label: "Tema",
        testo: "Le opere si raccolgono intorno a ciò che osservano: un soggetto, una domanda che ritorna, un modo di stare davanti alla natura e alla figura.",
    },
    periodo: {
        label: "Periodo",
        testo: "Il tempo come ordine di lettura: dalle prime prove alle ricerche più recenti, per vedere ciò che resta e ciò che cambia.",
    },
    emozione: {
        label: "Emozione",
        testo: "Un percorso per risonanze: ogni sala riunisce opere che condividono una temperatura emotiva, oltre la tecnica e la cronologia.",
    },
};

/** Testi brevi per sala; le sale senza testo usano quello della chiave. */
export const PERCORSO_SALE: Record<string, string> = {
    // tema
    natura: "La natura non come sfondo ma come presenza viva: rami, radici, luce e terra osservati da vicino, fino a diventare paesaggio interiore.",
    figura: "Il corpo e il volto come luoghi di passaggio, dove la somiglianza lascia spazio all'interpretazione.",
    fauna: "L'incontro con l'animale: piumaggio, pelo e sguardo diventano linguaggio pittorico, attenzione e memoria.",
    segno: "La linea come pensiero visibile: grafite, carboncino e tratto costruiscono spazi di luce e d'ombra.",
    identità: "Volti e memorie: figure che chiedono di essere guardate a lungo, tra presenza e silenzio.",
    luce: "Colore e luce come materia: superfici in cui la pittura si apre tra figurazione e astrazione.",
    "radici e metamorfosi": "Ciò che resiste mentre si trasforma: forme che germogliano, si torcono e cambiano natura.",
    presenze: "Presenze che affiorano dalla superficie e restano sospese tra apparizione e memoria.",
    "paesaggi interiori": "Il paesaggio come stato d'animo: luoghi che esistono prima di tutto nello sguardo di chi li attraversa.",
    architettura: "Architetture come frammenti di memoria: pietra, ombra e verticalità filtrate dal ricordo del luogo.",
    // periodo
    "archivio storico": "Opere dall'archivio storico: tracce degli anni in cui il linguaggio prendeva forma.",
    radici: "Le radici del percorso: il segno cerca la propria voce tra osservazione e immaginazione.",
    passaggio: "Anni di passaggio: tecniche e soggetti si allargano, la ricerca si fa più libera.",
    orizzonti: "Lo sguardo si apre: paesaggi, figure e materia trovano nuovi equilibri.",
    contemporaneo: "Le ricerche più recenti, dove memoria e trasformazione dialogano apertamente.",
    // emozione
    contemplazione: "Un tempo lento: paesaggi e luci che chiedono di fermarsi e restare.",
    intimità: "La distanza si accorcia: volti e figure osservati da vicino, con discrezione.",
    vitalità: "Energia del vivente: colore, movimento e presenza dell'animale.",
    tensione: "Contrasti, ombre e linee spezzate: il segno trattiene un'inquietudine.",
    meraviglia: "Lo stupore davanti alla materia e al colore, quando l'immagine si apre oltre il soggetto.",
};

const DESCRIPTION_MAX = 280;

function shorten(text: string): string {
    const clean = text.replace(/\s+/g, " ").trim();
    if (clean.length <= DESCRIPTION_MAX) return clean;
    const cut = clean.slice(0, DESCRIPTION_MAX - 1);
    return `${cut.slice(0, cut.lastIndexOf(" ")).trimEnd()}…`;
}

export async function buildPercorsoWorks(works: Opera[]): Promise<PercorsoWork[]> {
    return Promise.all(
        works.map(async (work) => {
            const image = work.data.featuredImage || "";
            const meta = await getImageMeta(image);
            return {
                title: work.data.title,
                href: `/opere/${work.slug}/`,
                image,
                alt: work.data.imageAlt || work.data.title,
                width: meta?.width,
                height: meta?.height,
                cdn: meta?.processable ?? false,
                ambient: work.data.ambientColor || meta?.ambient,
                year: work.data.year ? String(work.data.year) : "",
                technique: work.data.technique || "",
                description: shorten(work.data.description || ""),
                category: getWorkCategory(work),
                tema: inferTema(work),
                periodo: inferPeriodo(work),
                emozione: inferEmozione(work),
            };
        }),
    );
}
