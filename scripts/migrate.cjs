const axios = require('axios');
const cheerio = require('cheerio');
const TurndownService = require('turndown');
const fs = require('fs');
const path = require('path');
const { parseStringPromise } = require('xml2js');

const BASE_URL = 'https://lucasanna.art';
// Adjust paths relative to script location
const PROJECT_ROOT = path.resolve(__dirname, '..');
const CONTENT_DIR = path.join(PROJECT_ROOT, 'src/content');
const ASSET_DIR = path.join(PROJECT_ROOT, 'src/assets/uploads');

// Ensure dirs exist
['pages', 'posts', 'opere'].forEach(dir => {
    fs.mkdirSync(path.join(CONTENT_DIR, dir), { recursive: true });
});
fs.mkdirSync(ASSET_DIR, { recursive: true });

const turndownService = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced'
});
turndownService.keep(['iframe', 'script']);

// Helper to delay
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function downloadImage(url, filename) {
    if (!url) return null;
    try {
        const cleanUrl = url.split('?')[0];
        // Sanitize filename but keep extension
        const ext = path.extname(cleanUrl) || '.jpg';
        const name = path.basename(cleanUrl, ext).replace(/[^a-zA-Z0-9.\-_]/g, '_');
        const safeFilename = `${name}${ext}`;
        const filepath = path.join(ASSET_DIR, safeFilename);

        if (fs.existsSync(filepath)) {
            return `../../assets/uploads/${safeFilename}`;
        }

        // console.log(`Downloading: ${cleanUrl} -> ${safeFilename}`);
        const response = await axios({
            url: cleanUrl,
            method: 'GET',
            responseType: 'stream',
            timeout: 10000,
            headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' }
        });

        const writer = fs.createWriteStream(filepath);
        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', () => resolve(`../../assets/uploads/${safeFilename}`));
            writer.on('error', reject);
        });
    } catch (e) {
        // console.error(`Failed to download image ${url}:`, e.message);
        return null;
    }
}

async function scrapeUrl(urlData, type) {
    const url = urlData.loc;
    console.log(`Processing [${type}] ${url}`);

    try {
        const { data } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const $ = cheerio.load(data);

        // Metadata extraction
        let title = $('h1').first().text().trim();
        if (!title) title = $('title').text().replace(' - Luca Sanna', '').replace(' | Luca Sanna', '').trim();

        // Date
        let date = $('meta[property="article:published_time"]').attr('content') || urlData.lastmod || new Date().toISOString();

        // Description
        const description = $('meta[name="description"]').attr('content') ||
            $('meta[property="og:description"]').attr('content') || '';

        // Content Area Selection
        let $contentArea = $('.elementor-widget-theme-post-content');
        if (!$contentArea.length) $contentArea = $('.entry-content');
        if (!$contentArea.length) $contentArea = $('#content');
        if (!$contentArea.length) $contentArea = $('article');
        if (!$contentArea.length) $contentArea = $('body'); // Fallback

        // Download Images in Content
        const imgs = $contentArea.find('img');
        const imgPromises = [];
        // Sequential download better to avoid rate limits? Or parallel?
        // Let's gather URLs first
        const toDownload = [];
        imgs.each((i, el) => {
            const src = $(el).attr('src');
            if (src && src.startsWith('http')) {
                toDownload.push({ el, src });
            }
        });

        for (const item of toDownload) {
            const filename = path.basename(item.src.split('?')[0]);
            const localPath = await downloadImage(item.src, filename);
            if (localPath) {
                $(item.el).attr('src', localPath);
                $(item.el).removeAttr('srcset');
                $(item.el).removeAttr('sizes');
                $(item.el).removeAttr('loading');
            }
        }

        // Feature Image
        const ogImage = $('meta[property="og:image"]').attr('content');
        let featuredImage = '';
        if (ogImage) {
            const filename = path.basename(ogImage.split('?')[0]);
            const localPath = await downloadImage(ogImage, filename);
            if (localPath) featuredImage = localPath;
        }

        // Additional Metadata for Opere
        let extraFrontmatter = '';
        if (type === 'opere') {
            // Try to extract year and technique from text content if structured
            const text = $contentArea.text();
            const yearMatch = text.match(/Anno di esecuzione:?\s*(\d{4})/i);
            if (yearMatch) extraFrontmatter += `year: ${yearMatch[1]}\n`;

            const techniqueMatch = text.match(/Tecnica:?\s*([^\n]+)/i);
            if (techniqueMatch) extraFrontmatter += `technique: "${techniqueMatch[1].trim()}"\n`;
        }

        // Categories & Tags
        const tags = [];
        $('meta[property="article:tag"]').each((i, el) => tags.push($(el).attr('content')));
        const section = $('meta[property="article:section"]').attr('content');
        const categories = section ? [section] : [];

        // Convert Content to Markdown
        let markdown = turndownService.turndown($contentArea.html() || '');

        // Cleanup Markdown
        // Remove empty links or useless divs that Turndown kept
        markdown = markdown.replace(/<div.*?>/g, '').replace(/<\/div>/g, '');

        // Frontmatter
        const frontmatter = `---
title: "${title.replace(/"/g, '\\"')}"
date: ${date}
description: "${description.replace(/"/g, '\\"').replace(/\n/g, ' ')}"
featuredImage: "${featuredImage}"
${extraFrontmatter}tags: ${JSON.stringify(tags)}
categories: ${JSON.stringify(categories)}
originalUrl: "${url}"
---

`;

        // Determine filename and path
        let slug = url.replace(BASE_URL, '').split('/').filter(Boolean).pop();
        if (!slug) slug = 'index'; // Home

        let destDir = path.join(CONTENT_DIR, type);

        if (type === 'opere') {
            // Structure: /opere/category/slug
            // We want src/content/opere/category/slug.md? 
            // Or src/content/opere/slug.md with category in frontmatter?
            // To maintain URL structure easily in Astro with dynamic routes, 
            // nested folders is best: src/content/opere/category/slug.md
            // The URL path parts
            const parts = url.replace(BASE_URL, '').split('/').filter(Boolean);
            // parts[0] = 'opere', parts[1] = category, parts[2] = slug
            if (parts.length >= 3) {
                const categorySlug = parts[1];
                slug = parts[2];
                destDir = path.join(CONTENT_DIR, 'opere', categorySlug);

                // If category is not in frontmatter, add it?
                // But wait, category logic above used 'article:section'.
                // Let's rely on folder structure for URL generation.
            }
        }

        if (type === 'pages' && slug === 'index') {
            // Check if it's the home page
            if (url === BASE_URL + '/') slug = 'index';
        }

        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

        fs.writeFileSync(path.join(destDir, `${slug}.md`), frontmatter + markdown);

    } catch (e) {
        console.error(`Error processing ${url}:`, e.message);
    }
}


async function main() {
    console.log('Fetching sitemap index...');
    try {
        const { data } = await axios.get(BASE_URL + '/sitemap.xml');
        const result = await parseStringPromise(data);

        if (result.sitemapindex) {
            for (const sitemap of result.sitemapindex.sitemap) {
                const loc = sitemap.loc[0];
                let type = '';
                if (loc.includes('post-sitemap')) type = 'posts';
                else if (loc.includes('page-sitemap')) type = 'pages';
                else if (loc.includes('opere-sitemap')) type = 'opere';

                if (type) {
                    console.log(`Scanning sitemap: ${loc} (${type})`);
                    const { data: childData } = await axios.get(loc);
                    const childResult = await parseStringPromise(childData);

                    if (childResult.urlset && childResult.urlset.url) {
                        const urls = childResult.urlset.url;
                        // Limit concurrent requests?
                        // Sequential for safety
                        for (const u of urls) {
                            const urlData = {
                                loc: u.loc[0],
                                lastmod: u.lastmod ? u.lastmod[0] : null
                            };
                            await scrapeUrl(urlData, type);
                            await delay(200);
                        }
                    }
                }
            }
        }
    } catch (e) {
        console.error(e);
    }
}

main();
