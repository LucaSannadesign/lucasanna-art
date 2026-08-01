/**
 * Invio server-side delle richieste dai form del sito.
 *
 * Tutta la configurazione SMTP arriva da variabili d'ambiente: nessuna
 * credenziale viene mai esposta al frontend. Il modulo e' condiviso fra il
 * form generale (/contatti) e il form "richiesta opera" (/opere/...), che si
 * differenziano solo per oggetto e campi extra dell'email.
 */
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

/** Limiti di lunghezza: proteggono da payload abnormi e da abuso del form. */
export const LIMITS = {
    nome: 120,
    email: 254,
    tipoRichiesta: 80,
    messaggio: 5000,
    operaTitolo: 200,
    operaSlug: 200,
    operaUrl: 500,
} as const;

/** Tempo minimo di compilazione: sotto questa soglia si tratta quasi certamente di un bot. */
const MIN_FILL_MS = 2500;

/** Finestra e soglia del rate limit per IP. */
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 5;

export type ContactKind = "contatti" | "richiesta-opera";

export interface ContactPayload {
    kind: ContactKind;
    nome: string;
    email: string;
    tipoRichiesta: string;
    messaggio: string;
    operaTitolo?: string;
    operaSlug?: string;
    operaUrl?: string;
}

export class ValidationError extends Error {
    readonly code: string;

    constructor(code: string, message: string) {
        super(message);
        this.name = "ValidationError";
        this.code = code;
    }
}

/* -------------------------------------------------------------------------- */
/* Sanitizzazione                                                             */
/* -------------------------------------------------------------------------- */

/** Escape HTML: usato per OGNI valore interpolato nel corpo HTML dell'email. */
export function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/**
 * Ripulisce un valore di intestazione (oggetto, replyTo) da CR/LF per evitare
 * header injection, e normalizza gli spazi.
 */
function sanitizeHeaderValue(value: string): string {
    return value.replace(/[\r\n]+/g, " ").trim();
}

/** Caratteri di controllo da rimuovere dal testo libero (tab e newline restano). */
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000D\u000E-\u001F\u007F]/g;

/** Normalizza il testo libero: rimuove i caratteri di controllo, mantiene i ritorni a capo. */
function normalizeText(value: unknown): string {
    if (typeof value !== "string") return "";
    return value
        .replace(/\r\n/g, "\n")
        .replace(CONTROL_CHARS, "")
        .trim();
}

/** Validazione email volutamente conservativa: un solo @, niente spazi, TLD presente. */
export function isValidEmail(value: string): boolean {
    if (value.length > LIMITS.email) return false;
    return /^[^\s@,;:<>()[\]\\]+@[^\s@.,;:<>()[\]\\]+(\.[^\s@.,;:<>()[\]\\]+)+$/.test(
        value,
    );
}

function requireField(value: string, field: string, max: number): string {
    if (!value) {
        throw new ValidationError("campi", `Il campo "${field}" e' obbligatorio.`);
    }
    if (value.length > max) {
        throw new ValidationError(
            "lunghezza",
            `Il campo "${field}" supera la lunghezza massima consentita.`,
        );
    }
    return value;
}

/* -------------------------------------------------------------------------- */
/* Antispam                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Rate limit in memoria, per IP. Best effort: su piattaforme serverless lo
 * stato non e' condiviso fra istanze, quindi vale come freno agli invii
 * ripetuti dallo stesso client, non come protezione forte.
 */
const submissions = new Map<string, number[]>();

export function enforceRateLimit(ip: string): void {
    const now = Date.now();
    const recent = (submissions.get(ip) ?? []).filter(
        (ts) => now - ts < RATE_LIMIT_WINDOW_MS,
    );

    if (recent.length >= RATE_LIMIT_MAX) {
        throw new ValidationError(
            "rate-limit",
            "Hai gia' inviato diverse richieste. Riprova tra un'ora.",
        );
    }

    recent.push(now);
    submissions.set(ip, recent);

    // Evita che la mappa cresca indefinitamente sulle istanze longeve.
    if (submissions.size > 500) {
        for (const [key, values] of submissions) {
            if (values.every((ts) => now - ts >= RATE_LIMIT_WINDOW_MS)) {
                submissions.delete(key);
            }
        }
    }
}

/**
 * Controlli antibot: honeypot (deve restare vuoto) e tempo minimo di
 * compilazione. Il timestamp e' impostato via JS al caricamento del form:
 * se manca (utente senza JS) il controllo temporale viene saltato.
 */
export function enforceBotChecks(honeypot: unknown, startedAt: unknown): void {
    if (typeof honeypot === "string" && honeypot.trim() !== "") {
        throw new ValidationError("spam", "Invio non valido.");
    }

    if (typeof startedAt === "string" && startedAt.trim() !== "") {
        const started = Number.parseInt(startedAt, 10);
        if (Number.isFinite(started) && Date.now() - started < MIN_FILL_MS) {
            throw new ValidationError("spam", "Invio non valido.");
        }
    }
}

/* -------------------------------------------------------------------------- */
/* Parsing e validazione del payload                                          */
/* -------------------------------------------------------------------------- */

export function parseContactPayload(
    data: Record<string, unknown>,
): ContactPayload {
    const kind: ContactKind =
        normalizeText(data["form-name"]) === "richiesta-opera"
            ? "richiesta-opera"
            : "contatti";

    const nome = requireField(normalizeText(data.nome), "Nome", LIMITS.nome);
    const email = requireField(
        normalizeText(data.email).toLowerCase(),
        "Email",
        LIMITS.email,
    );
    const tipoRichiesta = requireField(
        normalizeText(data["tipo-richiesta"]),
        "Tipo richiesta",
        LIMITS.tipoRichiesta,
    );
    const messaggio = requireField(
        normalizeText(data.messaggio),
        "Messaggio",
        LIMITS.messaggio,
    );

    if (!isValidEmail(email)) {
        throw new ValidationError("email", "L'indirizzo email non e' valido.");
    }

    const payload: ContactPayload = {
        kind,
        nome,
        email,
        tipoRichiesta,
        messaggio,
    };

    if (kind === "richiesta-opera") {
        const operaTitolo = normalizeText(data.opera_titolo);
        const operaSlug = normalizeText(data.opera_slug);
        const operaUrl = normalizeText(data.opera_url);

        if (operaTitolo.length > LIMITS.operaTitolo) {
            throw new ValidationError("lunghezza", "Titolo opera troppo lungo.");
        }
        if (operaSlug.length > LIMITS.operaSlug) {
            throw new ValidationError("lunghezza", "Slug opera troppo lungo.");
        }
        if (operaUrl.length > LIMITS.operaUrl) {
            throw new ValidationError("lunghezza", "URL opera troppo lungo.");
        }

        payload.operaTitolo = operaTitolo;
        payload.operaSlug = operaSlug;
        // Accetta solo URL http(s), per non riportare in email schemi arbitrari.
        payload.operaUrl = /^https?:\/\//i.test(operaUrl) ? operaUrl : "";
    }

    return payload;
}

/* -------------------------------------------------------------------------- */
/* Configurazione SMTP                                                        */
/* -------------------------------------------------------------------------- */

export interface SmtpConfig {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    password: string;
    from: string;
    recipient: string;
}

/**
 * Legge la configurazione SMTP dall'ambiente. In Netlify Functions le
 * variabili sono su process.env; in dev Astro le espone anche su import.meta.env.
 */
function readEnv(key: string): string {
    const fromProcess =
        typeof process !== "undefined" ? process.env?.[key] : undefined;
    if (fromProcess) return fromProcess;

    const meta = import.meta.env as Record<string, string | undefined>;
    return meta?.[key] ?? "";
}

export function getSmtpConfig(): SmtpConfig {
    const host = readEnv("SMTP_HOST").trim();
    const portRaw = readEnv("SMTP_PORT").trim();
    const user = readEnv("SMTP_USER").trim();
    const password = readEnv("SMTP_PASSWORD");
    const from = readEnv("SMTP_FROM").trim();
    const recipient = readEnv("CONTACT_RECIPIENT").trim();

    const missing = [
        ["SMTP_HOST", host],
        ["SMTP_PORT", portRaw],
        ["SMTP_USER", user],
        ["SMTP_PASSWORD", password],
        ["SMTP_FROM", from],
        ["CONTACT_RECIPIENT", recipient],
    ]
        .filter(([, value]) => !value)
        .map(([key]) => key);

    if (missing.length > 0) {
        throw new Error(
            `Configurazione SMTP incompleta: variabili mancanti ${missing.join(", ")}`,
        );
    }

    const port = Number.parseInt(portRaw, 10);
    if (!Number.isFinite(port) || port <= 0 || port > 65535) {
        throw new Error(`SMTP_PORT non valida: "${portRaw}"`);
    }

    // Se SMTP_SECURE non e' impostata, si deduce dalla porta (465 = TLS implicito).
    const secureRaw = readEnv("SMTP_SECURE").trim().toLowerCase();
    const secure = secureRaw ? secureRaw === "true" || secureRaw === "1" : port === 465;

    return { host, port, secure, user, password, from, recipient };
}

let transporter: Transporter | null = null;

function getTransporter(config: SmtpConfig): Transporter {
    if (!transporter) {
        transporter = nodemailer.createTransport({
            host: config.host,
            port: config.port,
            secure: config.secure,
            auth: { user: config.user, pass: config.password },
        });
    }
    return transporter;
}

/* -------------------------------------------------------------------------- */
/* Composizione e invio email                                                 */
/* -------------------------------------------------------------------------- */

export function buildSubject(payload: ContactPayload): string {
    if (payload.kind === "richiesta-opera") {
        const titolo = payload.operaTitolo || "opera non specificata";
        return sanitizeHeaderValue(
            `lucasanna.art — Richiesta opera: ${titolo}`,
        );
    }
    return "lucasanna.art — Nuova richiesta dal sito";
}

/** Righe dell'email, in ordine; i valori sono ancora grezzi (non escapati). */
function buildRows(payload: ContactPayload): Array<[string, string]> {
    const rows: Array<[string, string]> = [];

    if (payload.kind === "richiesta-opera") {
        rows.push(["URL opera", payload.operaUrl || "—"]);
        rows.push(["Titolo opera", payload.operaTitolo || "—"]);
        rows.push(["Slug opera", payload.operaSlug || "—"]);
    }

    rows.push(["Nome", payload.nome]);
    rows.push(["Email", payload.email]);
    rows.push(["Tipo richiesta", payload.tipoRichiesta]);

    return rows;
}

export function buildTextBody(payload: ContactPayload): string {
    const rows = buildRows(payload)
        .map(([label, value]) => `${label}: ${value}`)
        .join("\n");

    return `${buildSubject(payload)}\n\n${rows}\n\nMessaggio:\n${payload.messaggio}\n`;
}

export function buildHtmlBody(payload: ContactPayload): string {
    const rows = buildRows(payload)
        .map(
            ([label, value]) =>
                `<tr><td style="padding:4px 12px 4px 0;color:#666;vertical-align:top;">${escapeHtml(label)}</td><td style="padding:4px 0;color:#111;">${escapeHtml(value)}</td></tr>`,
        )
        .join("");

    // Ogni valore passa da escapeHtml: nessuna interpolazione non sanitizzata.
    const messaggio = escapeHtml(payload.messaggio).replace(/\n/g, "<br />");

    return `<!doctype html>
<html lang="it">
<body style="margin:0;padding:24px;background:#f6f6f6;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;">
  <div style="max-width:640px;margin:0 auto;background:#fff;padding:24px;border:1px solid #e5e5e5;">
    <h1 style="margin:0 0 16px;font-size:16px;font-weight:600;color:#111;">${escapeHtml(buildSubject(payload))}</h1>
    <table style="border-collapse:collapse;width:100%;margin-bottom:16px;">${rows}</table>
    <div style="border-top:1px solid #e5e5e5;padding-top:16px;">
      <p style="margin:0 0 8px;color:#666;">Messaggio</p>
      <div style="color:#111;white-space:normal;">${messaggio}</div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Invia la richiesta. Il mittente resta sempre una casella del dominio
 * (SMTP_FROM); l'indirizzo del visitatore viene usato solo come replyTo.
 * Qualsiasi errore SMTP viene propagato: il chiamante non deve mai
 * confermare l'invio se questa funzione fallisce.
 */
export async function sendContactEmail(payload: ContactPayload): Promise<void> {
    const config = getSmtpConfig();

    await getTransporter(config).sendMail({
        from: config.from,
        to: config.recipient,
        // Forma strutturata: il nome resta solo display name e viene quotato da
        // Nodemailer, quindi parentesi angolari o indirizzi inseriti dal
        // visitatore non possono sostituire l'email validata.
        replyTo: {
            name: sanitizeHeaderValue(payload.nome),
            address: payload.email,
        },
        subject: buildSubject(payload),
        text: buildTextBody(payload),
        html: buildHtmlBody(payload),
    });
}
