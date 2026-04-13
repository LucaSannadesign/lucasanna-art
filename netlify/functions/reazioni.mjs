import { promises as fs } from "node:fs";
import path from "node:path";

const ALLOWED_REACTIONS = new Set(["silenzio", "tensione", "risonanza"]);
const DATA_DIR = path.resolve(process.cwd(), "data");
const AGGREGATE_FILE = path.join(DATA_DIR, "reazioni-aggregate.json");

const readAggregate = async () => {
    try {
        const raw = await fs.readFile(AGGREGATE_FILE, "utf8");
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return {};
    }
};

const writeAggregate = async (payload) => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(AGGREGATE_FILE, JSON.stringify(payload, null, 2), "utf8");
};

const isValidSlug = (value) => /^[a-z0-9\-/]+$/i.test(value);

export async function handler(event) {
    if (event.httpMethod !== "POST") {
        return {
            statusCode: 405,
            body: "Method Not Allowed",
        };
    }

    let payload;
    try {
        payload = JSON.parse(event.body || "{}");
    } catch {
        return {
            statusCode: 400,
            body: "Invalid JSON",
        };
    }

    const slug = (payload.slug || "").toString().trim().toLowerCase();
    const reazione = (payload.reazione || "").toString().trim().toLowerCase();

    if (!slug || !isValidSlug(slug)) {
        return {
            statusCode: 400,
            body: "Invalid slug",
        };
    }

    if (!ALLOWED_REACTIONS.has(reazione)) {
        return {
            statusCode: 400,
            body: "Invalid reaction",
        };
    }

    const aggregate = await readAggregate();
    const current = aggregate[slug] || { silenzio: 0, tensione: 0, risonanza: 0 };

    current[reazione] = Number(current[reazione] || 0) + 1;
    aggregate[slug] = current;

    await writeAggregate(aggregate);

    return {
        statusCode: 204,
    };
}
