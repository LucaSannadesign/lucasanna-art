/**
 * Endpoint di invio per i form del sito (contatti generale + richiesta opera).
 *
 * Il form opera usa difese progressive: stesso sito, honeypot, tempo minimo,
 * validazione stretta, rate limit e, quando configurato, Cloudflare Turnstile.
 */
import type { APIRoute } from "astro";
import {
    ValidationError,
    enforceBotChecks,
    enforceRateLimit,
    parseContactPayload,
    sendContactEmail,
} from "../../lib/contact-mailer";

export const prerender = false;

type ContactLocale = "it" | "en";
type ContactFormKind = "contatti" | "richiesta-opera";

type TurnstileResult = {
    success?: boolean;
    hostname?: string;
    action?: string;
    "error-codes"?: string[];
};

const SUCCESS_REDIRECT: Record<ContactLocale, Record<ContactFormKind, string>> = {
    it: {
        contatti: "/grazie-contatti/?ok=1",
        "richiesta-opera": "/grazie-richiesta-opera/?ok=1",
    },
    en: {
        contatti: "/en/thank-you/?ok=1",
        "richiesta-opera": "/grazie-richiesta-opera/?ok=1",
    },
};

const FALLBACK_ERROR_PAGE: Record<ContactLocale, string> = {
    it: "/contatti/",
    en: "/en/contact/",
};

function resolveLocale(value: unknown): ContactLocale {
    return value === "en" ? "en" : "it";
}

function resolveFormKind(value: unknown): ContactFormKind {
    return value === "richiesta-opera" ? "richiesta-opera" : "contatti";
}

function clientIp(request: Request): string {
    const forwarded = request.headers.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0]!.trim();
    return request.headers.get("x-nf-client-connection-ip") ?? "sconosciuto";
}

function wantsJson(request: Request): boolean {
    const accept = request.headers.get("accept") ?? "";
    if (accept.includes("application/json")) return true;
    return (request.headers.get("content-type") ?? "").includes("application/json");
}

function readEnv(key: string): string {
    const fromProcess =
        typeof process !== "undefined" ? process.env?.[key] : undefined;
    if (fromProcess) return fromProcess;

    const meta = import.meta.env as Record<string, string | undefined>;
    return meta?.[key] ?? "";
}

function isTurnstileEnabled(): boolean {
    const siteKey = readEnv("PUBLIC_TURNSTILE_SITE_KEY").trim();
    const secret = readEnv("TURNSTILE_SECRET_KEY").trim();
    if (!siteKey || !secret) return false;

    const context = readEnv("CONTEXT").trim();
    return context !== "deploy-preview" && context !== "branch-deploy";
}

function enforceRequestContext(request: Request): void {
    const fetchSite = request.headers.get("sec-fetch-site");
    if (fetchSite === "cross-site") {
        throw new ValidationError("spam", "Invio non valido.");
    }

    const origin = request.headers.get("origin");
    if (!origin) return;

    let originUrl: URL;
    let requestUrl: URL;

    try {
        originUrl = new URL(origin);
        requestUrl = new URL(request.url);
    } catch {
        throw new ValidationError("spam", "Invio non valido.");
    }

    const sameHost = originUrl.host === requestUrl.host;
    const productionHosts = new Set(["lucasanna.art", "www.lucasanna.art"]);
    const productionAlias =
        productionHosts.has(originUrl.hostname) &&
        productionHosts.has(requestUrl.hostname);

    if (!sameHost && !productionAlias) {
        throw new ValidationError("spam", "Invio non valido.");
    }
}

async function verifyTurnstile(
    request: Request,
    data: Record<string, unknown>,
    ip: string,
): Promise<void> {
    if (resolveFormKind(data["form-name"]) !== "richiesta-opera") return;
    if (!isTurnstileEnabled()) return;

    const token =
        typeof data["cf-turnstile-response"] === "string"
            ? data["cf-turnstile-response"].trim()
            : "";

    if (!token || token.length > 2048) {
        throw new ValidationError(
            "verifica",
            "La verifica antispam non si e' completata. Riprova.",
        );
    }

    const body = new URLSearchParams({
        secret: readEnv("TURNSTILE_SECRET_KEY").trim(),
        response: token,
    });
    if (ip && ip !== "sconosciuto") body.set("remoteip", ip);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);

    try {
        const response = await fetch(
            "https://challenges.cloudflare.com/turnstile/v0/siteverify",
            {
                method: "POST",
                headers: {
                    "content-type": "application/x-www-form-urlencoded",
                },
                body,
                signal: controller.signal,
            },
        );

        if (!response.ok) {
            throw new Error("Turnstile Siteverify HTTP " + response.status);
        }

        const result = (await response.json()) as TurnstileResult;
        const expectedHosts = new Set([
            new URL(request.url).hostname,
            "lucasanna.art",
            "www.lucasanna.art",
        ]);

        if (
            !result.success ||
            result.action !== "artwork_request" ||
            (result.hostname && !expectedHosts.has(result.hostname))
        ) {
            throw new ValidationError(
                "verifica",
                "La verifica antispam non si e' completata. Riprova.",
            );
        }
    } catch (error) {
        if (error instanceof ValidationError) throw error;

        console.error("[contatti] verifica Turnstile non disponibile:", error);
        throw new ValidationError(
            "verifica",
            "La verifica antispam non e' disponibile in questo momento. Riprova tra poco.",
        );
    } finally {
        clearTimeout(timeout);
    }
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
        const parsed: unknown = await request.json();
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            throw new ValidationError("formato", "Corpo della richiesta non valido.");
        }
        return parsed as Record<string, unknown>;
    }

    const formData = await request.formData();
    const data: Record<string, unknown> = {};
    for (const [key, value] of formData.entries()) {
        if (typeof value === "string") data[key] = value;
    }
    return data;
}

export const POST: APIRoute = async ({ request }) => {
    const json = wantsJson(request);
    let requestLocale: ContactLocale = "it";
    let requestKind: ContactFormKind = "contatti";

    const fail = (status: number, code: string, message: string): Response => {
        if (json) {
            return new Response(JSON.stringify({ ok: false, code, message }), {
                status,
                headers: { "content-type": "application/json; charset=utf-8" },
            });
        }

        const target =
            FALLBACK_ERROR_PAGE[requestLocale] +
            "?errore=" +
            encodeURIComponent(code);
        return new Response(null, { status: 303, headers: { location: target } });
    };

    let payload;

    try {
        const data = await readBody(request);
        requestLocale = resolveLocale(data.locale);
        requestKind = resolveFormKind(data["form-name"]);

        enforceRequestContext(request);
        enforceBotChecks(
            data["bot-field"],
            data["form-started-at"],
            data.website,
            requestKind === "richiesta-opera",
        );

        payload = parseContactPayload(data);

        const ip = clientIp(request);
        await verifyTurnstile(request, data, ip);
        enforceRateLimit(ip);
    } catch (error) {
        if (error instanceof ValidationError) {
            if (error.code === "spam") {
                const redirect = SUCCESS_REDIRECT[requestLocale][requestKind];
                return json
                    ? new Response(
                          JSON.stringify({ ok: true, redirect }),
                          {
                              status: 200,
                              headers: {
                                  "content-type": "application/json; charset=utf-8",
                              },
                          },
                      )
                    : new Response(null, {
                          status: 303,
                          headers: { location: redirect },
                      });
            }

            const status =
                error.code === "rate-limit"
                    ? 429
                    : error.code === "verifica"
                      ? 403
                      : 400;
            return fail(status, error.code, error.message);
        }

        console.error("[contatti] richiesta non leggibile:", error);
        return fail(400, "formato", "Richiesta non valida.");
    }

    try {
        await sendContactEmail(payload);
    } catch (error) {
        console.error("[contatti] invio SMTP fallito:", error);
        return fail(
            502,
            "invio",
            "Non e' stato possibile inviare il messaggio. Riprova piu' tardi o scrivi direttamente via email.",
        );
    }

    if (json) {
        return new Response(
            JSON.stringify({
                ok: true,
                redirect: SUCCESS_REDIRECT[requestLocale][payload.kind],
            }),
            {
                status: 200,
                headers: { "content-type": "application/json; charset=utf-8" },
            },
        );
    }

    return new Response(null, {
        status: 303,
        headers: {
            location: SUCCESS_REDIRECT[requestLocale][payload.kind],
        },
    });
};

export const GET: APIRoute = ({ request }) => {
    const locale =
        new URL(request.url).searchParams.get("locale") === "en" ? "en" : "it";
    return new Response(null, {
        status: 303,
        headers: { location: FALLBACK_ERROR_PAGE[locale] },
    });
};
