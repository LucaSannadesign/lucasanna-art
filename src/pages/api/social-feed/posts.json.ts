import type { APIRoute } from "astro";
import { getCollection } from "astro:content";

const siteUrl = "https://lucasanna.art";

export const GET: APIRoute = async () => {
    const now = new Date();
    const twelveMonthsAgo = new Date(now);
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const posts = await getCollection("posts");

    const items = posts
        .filter((post) => post.data.socialShare === true)
        .filter((post) => {
            const postDate = new Date(post.data.date);
            return postDate >= twelveMonthsAgo && postDate <= now;
        })
        .sort(
            (a, b) =>
                new Date(b.data.date).getTime() - new Date(a.data.date).getTime(),
        )
        .slice(0, 1)
        .map((post) => {
            const image = post.data.featuredImage
                ? new URL(post.data.featuredImage, siteUrl).toString()
                : "";

            return {
                title: post.data.title,
                description: post.data.description ?? "",
                url: `${siteUrl}/${post.slug}/`,
                image,
                categories: post.data.categories ?? [],
                tags: post.data.tags ?? [],
                date: new Date(post.data.date).toISOString(),
            };
        });

    return new Response(JSON.stringify(items), {
        status: 200,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "public, max-age=300",
        },
    });
};
