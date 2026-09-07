/**
 * Endpoint di invio per i form del sito (contatti generale + richiesta opera).
 *
 * Reso on-demand: senza `prerender = false` Astro lo trasformerebbe in un file
 * statico in fase di build e il POST non verrebbe mai eseguito.
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

const SUCCESS_REDIRECT: Record<ContactLocale, Record<string, string>> = {
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

    const fail = (status: number, code: string, message: string): Response => {
        if (json) {
            return new Response(JSON.stringify({ ok: false, code, message }), {
                status,
                headers: { "content-type": "application/json; charset=utf-8" },
            });
        }

        const target = `${FALLBACK_ERROR_PAGE[requestLocale]}?errore=${encodeURIComponent(code)}`;
        return new Response(null, { status: 303, headers: { location: target } });
    };

    let payload;

    try {
        const data = await readBody(request);
        requestLocale = resolveLocale(data.locale);
        enforceBotChecks(data["bot-field"], data["form-started-at"]);
        enforceRateLimit(clientIp(request));
        payload = parseContactPayload(data);
    } catch (error) {
        if (error instanceof ValidationError) {
            if (error.code === "spam") {
                return json
                    ? new Response(JSON.stringify({ ok: true }), {
                          status: 200,
                          headers: {
                              "content-type": "application/json; charset=utf-8",
                          },
                      })
                    : new Response(null, {
                          status: 303,
                          headers: { location: SUCCESS_REDIRECT[requestLocale].contatti! },
                      });
            }
            const status = error.code === "rate-limit" ? 429 : 400;
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
            location: SUCCESS_REDIRECT[requestLocale][payload.kind]!,
        },
    });
};

export const GET: APIRoute = ({ request }) => {
    const locale = new URL(request.url).searchParams.get("locale") === "en" ? "en" : "it";
    return new Response(null, {
        status: 303,
        headers: { location: FALLBACK_ERROR_PAGE[locale] },
    });
};
