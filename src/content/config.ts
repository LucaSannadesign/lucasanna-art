import { defineCollection, z } from 'astro:content';

const pages = defineCollection({
    type: 'content',
    schema: z.object({
        title: z.string(),
        date: z.date().or(z.string()).optional(),
        description: z.string().optional(),
        featuredImage: z.string().optional(),
    })
});

const posts = defineCollection({
    type: 'content',
    schema: z.object({
        title: z.string(),
        date: z.date().or(z.string()),
        description: z.string().optional(),
        featuredImage: z.string().optional(),
        categories: z.array(z.string()).optional(),
        tags: z.array(z.string()).optional(),
        socialShare: z.boolean().optional(),
        originalUrl: z.string().optional(),
    })
});

const opere = defineCollection({
    type: 'content',
    schema: z.object({
        title: z.string(),
        date: z.date().or(z.string()).optional(), // Creation date
        description: z.string().optional(),
        featuredImage: z.string().optional(),
        year: z.string().or(z.number()).optional(),
        technique: z.string().optional(),
        categories: z.array(z.string()).optional(),
        tags: z.array(z.string()).optional(),
        tema: z.string().optional(),
        periodo: z.string().optional(),
        emozione: z.string().optional(),
        originalUrl: z.string().optional(),
        imageAlt: z.string().optional(),
        imageTitle: z.string().optional(),
        imageCaption: z.string().optional(),
        ogImage: z.string().optional(),
        // Atmosfera cromatica: colore scuro e desaturato dello spazio intorno all'opera.
        ambientColor: z
            .string()
            .regex(/^#[0-9a-fA-F]{6}$/, "ambientColor deve essere un colore esadecimale #rrggbb")
            .optional(),
        // Abilita il prototipo partecipativo “Il mio sguardo” solo sulle opere selezionate.
        interpretationEnabled: z.boolean().optional(),
        seo: z
            .object({
                primary: z.string(),
                secondary: z.tuple([z.string(), z.string()]),
                title: z.string().optional(),
                description: z.string().optional(),
            })
            .optional(),
    })
});

export const collections = {
    pages,
    posts,
    opere
};
