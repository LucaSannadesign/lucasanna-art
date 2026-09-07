import { featuredWorksEn } from "./featuredWorks.en";

export type Locale = "it" | "en";

export const localeConfig = {
    it: {
        htmlLang: "it",
        ogLocale: "it_IT",
        alternateOgLocale: "en_US",
        nav: {
            home: "Home",
            works: "Opere",
            bio: "Bio",
            blog: "Blog",
            contact: "Contatti",
        },
        closeMenu: "Chiudi menu",
        languageSwitchLabel: "Passa alla versione inglese",
        rights: "Tutti i diritti riservati.",
        returns: "Politica dei Resi",
    },
    en: {
        htmlLang: "en",
        ogLocale: "en_US",
        alternateOgLocale: "it_IT",
        nav: {
            home: "Home",
            works: "Works",
            bio: "Biography",
            blog: "Art Blog",
            contact: "Contact",
        },
        closeMenu: "Close menu",
        languageSwitchLabel: "Switch to the Italian version",
        rights: "All rights reserved.",
        returns: "Returns policy (Italian)",
    },
} as const;

export const localizedRoutes = {
    home: { it: "/", en: "/en/" },
    works: { it: "/opere/", en: "/en/works/" },
    bio: { it: "/biografia-luca-sanna/", en: "/en/biography/" },
    blog: { it: "/blog-arte/", en: "/en/art-blog/" },
    contact: { it: "/contatti/", en: "/en/contact/" },
    contactThanks: { it: "/grazie-contatti/", en: "/en/thank-you/" },
} as const;

const localizedArtworkRoutes = featuredWorksEn.map((work) => ({
    it: `/opere/${work.itSlug}/`,
    en: `/en/works/${work.enSlug}/`,
}));

export type LocalizedRouteKey = keyof typeof localizedRoutes;

export function localizedPath(key: LocalizedRouteKey, locale: Locale): string {
    return localizedRoutes[key][locale];
}

function normalizePath(pathname: string): string {
    if (pathname === "/") return pathname;
    return pathname.endsWith("/") ? pathname : `${pathname}/`;
}

export function alternatePath(pathname: string, locale: Locale): string | null {
    const currentPath = normalizePath(pathname);
    const alternateLocale: Locale = locale === "it" ? "en" : "it";

    for (const route of Object.values(localizedRoutes)) {
        if (normalizePath(route[locale]) === currentPath) {
            return route[alternateLocale];
        }
    }

    for (const route of localizedArtworkRoutes) {
        if (normalizePath(route[locale]) === currentPath) {
            return route[alternateLocale];
        }
    }

    return null;
}

export function languageSwitcherPath(pathname: string, locale: Locale): string {
    return alternatePath(pathname, locale) ?? localizedRoutes.home[locale === "it" ? "en" : "it"];
}
