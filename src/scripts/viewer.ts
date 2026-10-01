import { animateIf, motionLevel } from "./motion/preferences";

/**
 * Visore dell'opera: <dialog> modale + zoom/pan.
 * Trasformazione: translate(tx, ty) scale(s) con origine al centro dell'immagine adattata.
 * Il punto sotto il cursore / tra le dita resta fermo durante lo zoom.
 */

const HASH = "#osserva";
const MAX_SCALE = 6;
const DOUBLE_TAP_MS = 320;
const SWIPE_PX = 60;

type Point = { x: number; y: number };

export function initViewer(): void {
    const dialog = document.querySelector<HTMLDialogElement>("[data-viewer]");
    if (!dialog || dialog.dataset.bound === "true") return;
    dialog.dataset.bound = "true";

    const stage = dialog.querySelector<HTMLElement>("[data-viewer-stage]")!;
    const img = dialog.querySelector<HTMLImageElement>("[data-viewer-img]")!;
    const levelNode = dialog.querySelector<HTMLOutputElement>("[data-zoom-level]");
    const zoomInBtn = dialog.querySelector<HTMLButtonElement>("[data-zoom-in]");
    const zoomOutBtn = dialog.querySelector<HTMLButtonElement>("[data-zoom-out]");
    const resetBtn = dialog.querySelector<HTMLButtonElement>("[data-zoom-reset]");
    const closeBtn = dialog.querySelector<HTMLButtonElement>("[data-viewer-close]");
    const hero = document.querySelector<HTMLImageElement>("[data-vt-hero]");
    const openers = Array.from(document.querySelectorAll<HTMLElement>("[data-viewer-open]"));
    const fullSrc = img.dataset.full || img.src;

    let scale = 1;
    let tx = 0;
    let ty = 0;
    let lastFocus: HTMLElement | null = null;
    let pushedHistory = false;
    let closing = false;

    /* ---------- trasformazione ---------- */

    const maxScale = () => {
        const shown = img.offsetWidth || 1;
        const natural = img.naturalWidth || shown * 3;
        return Math.min(MAX_SCALE, Math.max(2.5, (natural / shown) * 1.6));
    };

    const clampPan = () => {
        const limitX = Math.max(0, (img.offsetWidth * scale - stage.clientWidth) / 2 + 24);
        const limitY = Math.max(0, (img.offsetHeight * scale - stage.clientHeight) / 2 + 24);
        tx = scale <= 1 ? 0 : Math.min(limitX, Math.max(-limitX, tx));
        ty = scale <= 1 ? 0 : Math.min(limitY, Math.max(-limitY, ty));
    };

    const transformValue = () => `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) scale(${scale.toFixed(4)})`;

    const apply = (animated = false) => {
        const from = img.style.transform || "none";
        clampPan();
        const to = transformValue();
        img.style.transform = to;
        if (animated && from !== to) {
            animateIf(img, [{ transform: from }, { transform: to }], {
                duration: motionLevel() === "full" ? 260 : 200,
                easing: "cubic-bezier(0.22, 1, 0.36, 1)",
            });
        }
        const zoomed = scale > 1.01;
        stage.classList.toggle("is-zoomed", zoomed);
        if (levelNode) levelNode.value = `${Math.round(scale * 100)}%`;
        if (zoomOutBtn) zoomOutBtn.disabled = !zoomed;
        if (resetBtn) resetBtn.disabled = !zoomed;
        if (zoomInBtn) zoomInBtn.disabled = scale >= maxScale() - 0.01;
    };

    const center = (): Point => {
        const rect = stage.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    };

    /** Zoom mantenendo fermo il punto `at` (coordinate client). */
    const zoomTo = (next: number, at: Point = center(), animated = false) => {
        const c = center();
        const dx = at.x - c.x;
        const dy = at.y - c.y;
        const qx = (dx - tx) / scale;
        const qy = (dy - ty) / scale;
        scale = Math.min(maxScale(), Math.max(1, next));
        tx = dx - scale * qx;
        ty = dy - scale * qy;
        apply(animated);
    };

    const reset = (animated = false) => {
        scale = 1;
        tx = 0;
        ty = 0;
        apply(animated);
    };

    /* ---------- apertura / chiusura ---------- */

    const loadFull = () => {
        if (img.src.endsWith(fullSrc) && img.complete && img.naturalWidth) return;
        const full = new Image();
        full.src = fullSrc;
        full.decode()
            .then(() => {
                img.src = fullSrc;
            })
            .catch(() => {
                img.src = fullSrc;
            });
    };

    const canMorph = () =>
        motionLevel() !== "none" &&
        typeof document.startViewTransition === "function" &&
        hero !== null &&
        hero.getBoundingClientRect().bottom > 0 &&
        hero.getBoundingClientRect().top < window.innerHeight;

    const setName = (el: HTMLElement | null, name: string) => {
        if (!el) return;
        if (name) el.style.setProperty("view-transition-name", name);
        else el.style.removeProperty("view-transition-name");
    };

    const open = async (pushHistory = true) => {
        if (dialog.open) return;
        lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        // Prima immagine: quella già caricata in pagina (istantanea dalla cache), poi l'originale.
        img.loading = "eager";
        if (hero?.currentSrc && !(img.complete && img.naturalWidth)) img.src = hero.currentSrc;
        // Breve attesa della decodifica (mai bloccante oltre 180 ms) per una transizione senza vuoti.
        await Promise.race([img.decode().catch(() => undefined), new Promise((r) => setTimeout(r, 180))]);
        if (dialog.open) return;
        reset();

        const show = () => {
            dialog.showModal();
            document.documentElement.classList.add("viewer-open");
        };

        if (canMorph()) {
            setName(hero, "opera-attiva");
            const transition = document.startViewTransition(() => {
                setName(hero, "none");
                setName(img, "opera-attiva");
                show();
            });
            transition.finished.finally(() => {
                setName(img, "");
                setName(hero, "");
            });
        } else {
            show();
        }

        loadFull();
        if (pushHistory && location.hash !== HASH) {
            history.pushState({ viewer: true }, "", HASH);
            pushedHistory = true;
        }
    };

    const close = () => {
        if (!dialog.open || closing) return;
        closing = true;
        reset();

        const hide = () => dialog.close();
        if (canMorph()) {
            setName(hero, "none");
            setName(img, "opera-attiva");
            const transition = document.startViewTransition(() => {
                setName(img, "");
                setName(hero, "");
                hide();
            });
            transition.finished.finally(() => {
                closing = false;
            });
        } else {
            hide();
            closing = false;
        }
    };

    dialog.addEventListener("close", () => {
        document.documentElement.classList.remove("viewer-open");
        const target = lastFocus && document.contains(lastFocus) ? lastFocus : openers[0];
        target?.focus({ preventScroll: true });
        lastFocus = null;
        if (location.hash === HASH) {
            if (pushedHistory) history.back();
            else history.replaceState(history.state, "", location.pathname + location.search);
        }
        pushedHistory = false;
    });

    // Escape: chiusura animata invece di quella istantanea nativa.
    dialog.addEventListener("cancel", (event) => {
        event.preventDefault();
        close();
    });

    window.addEventListener("popstate", () => {
        if (location.hash === HASH && !dialog.open) {
            void open(false);
        } else if (location.hash !== HASH && dialog.open) {
            pushedHistory = false;
            close();
        }
    });

    openers.forEach((opener) =>
        opener.addEventListener("click", (event) => {
            if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            void open();
        }),
    );

    closeBtn?.addEventListener("click", close);
    zoomInBtn?.addEventListener("click", () => zoomTo(scale * 1.6, center(), true));
    zoomOutBtn?.addEventListener("click", () => zoomTo(scale / 1.6, center(), true));
    resetBtn?.addEventListener("click", () => reset(true));

    // Il layout cambia (rotazione, resize): resta coerente.
    window.addEventListener("resize", () => dialog.open && apply());
    img.addEventListener("load", () => dialog.open && apply());

    /* ---------- navigazione tra opere ---------- */

    const navigate = (direction: "prev" | "next") => {
        dialog.querySelector<HTMLAnchorElement>(`[data-work-nav="${direction}"]`)?.click();
    };

    /* ---------- tastiera ---------- */

    dialog.addEventListener("keydown", (event) => {
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        const step = 64;
        switch (event.key) {
            case "+":
            case "=":
                zoomTo(scale * 1.4, center(), true);
                break;
            case "-":
            case "_":
                zoomTo(scale / 1.4, center(), true);
                break;
            case "0":
                reset(true);
                break;
            case "ArrowLeft":
                if (scale > 1.01) {
                    tx += step;
                    apply(true);
                } else navigate("prev");
                break;
            case "ArrowRight":
                if (scale > 1.01) {
                    tx -= step;
                    apply(true);
                } else navigate("next");
                break;
            case "ArrowUp":
                if (scale <= 1.01) return;
                ty += step;
                apply(true);
                break;
            case "ArrowDown":
                if (scale <= 1.01) return;
                ty -= step;
                apply(true);
                break;
            default:
                return;
        }
        event.preventDefault();
    });

    /* ---------- rotella / trackpad ---------- */

    stage.addEventListener(
        "wheel",
        (event) => {
            event.preventDefault();
            const intensity = event.ctrlKey ? 0.01 : 0.0018;
            zoomTo(scale * Math.exp(-event.deltaY * intensity), { x: event.clientX, y: event.clientY });
        },
        { passive: false },
    );

    stage.addEventListener("dblclick", (event) => {
        zoomTo(scale > 1.01 ? 1 : 2.5, { x: event.clientX, y: event.clientY }, true);
    });

    /* ---------- puntatori: pan, pinch, swipe, doppio tap ---------- */

    const pointers = new Map<number, Point>();
    let panStart = { x: 0, y: 0, tx: 0, ty: 0 };
    let pinchStart = { dist: 1, scale: 1, qx: 0, qy: 0 };
    let gestureWasPinch = false;
    let lastTap = { time: 0, x: 0, y: 0 };

    const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
    const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

    stage.addEventListener("pointerdown", (event) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        try {
            stage.setPointerCapture(event.pointerId);
        } catch {
            // Puntatore non catturabile (es. già rilasciato): il gesto prosegue comunque.
        }
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

        if (pointers.size === 1) {
            gestureWasPinch = false;
            panStart = { x: event.clientX, y: event.clientY, tx, ty };
            stage.classList.add("is-dragging");
        } else if (pointers.size === 2) {
            gestureWasPinch = true;
            const [a, b] = Array.from(pointers.values()) as [Point, Point];
            const mid = midpoint(a, b);
            const c = center();
            pinchStart = {
                dist: distance(a, b) || 1,
                scale,
                qx: (mid.x - c.x - tx) / scale,
                qy: (mid.y - c.y - ty) / scale,
            };
        }
    });

    stage.addEventListener("pointermove", (event) => {
        if (!pointers.has(event.pointerId)) return;
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

        if (pointers.size >= 2) {
            const [a, b] = Array.from(pointers.values()) as [Point, Point];
            const mid = midpoint(a, b);
            const c = center();
            scale = Math.min(maxScale(), Math.max(1, (pinchStart.scale * distance(a, b)) / pinchStart.dist));
            tx = mid.x - c.x - scale * pinchStart.qx;
            ty = mid.y - c.y - scale * pinchStart.qy;
            apply();
            return;
        }

        if (scale > 1.01) {
            tx = panStart.tx + (event.clientX - panStart.x);
            ty = panStart.ty + (event.clientY - panStart.y);
            apply();
        }
    });

    const endPointer = (event: PointerEvent) => {
        if (!pointers.has(event.pointerId)) return;
        pointers.delete(event.pointerId);
        if (pointers.size === 1) {
            // Da pinch a un dito: il pan riparte dal punto attuale.
            const [rest] = Array.from(pointers.values()) as [Point];
            panStart = { x: rest.x, y: rest.y, tx, ty };
            return;
        }
        if (pointers.size > 0) return;
        stage.classList.remove("is-dragging");
        if (event.type === "pointercancel" || gestureWasPinch) return;

        const dx = event.clientX - panStart.x;
        const dy = event.clientY - panStart.y;
        const moved = Math.hypot(dx, dy);

        // Swipe orizzontale a zoom 1: opera precedente / successiva.
        if (scale <= 1.01 && Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.4) {
            navigate(dx < 0 ? "next" : "prev");
            return;
        }

        // Doppio tap (touch/penna): zoom sul punto toccato.
        if (event.pointerType !== "mouse" && moved < 12) {
            const now = performance.now();
            const near = Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y) < 40;
            if (now - lastTap.time < DOUBLE_TAP_MS && near) {
                zoomTo(scale > 1.01 ? 1 : 2.5, { x: event.clientX, y: event.clientY }, true);
                lastTap.time = 0;
            } else {
                lastTap = { time: now, x: event.clientX, y: event.clientY };
            }
        }
    };

    stage.addEventListener("pointerup", endPointer);
    stage.addEventListener("pointercancel", endPointer);

    /* ---------- stato iniziale (deep link già aperto dallo script inline) ---------- */

    if (dialog.open) {
        loadFull();
        apply();
    }
}
