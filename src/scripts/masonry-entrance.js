/**
 * Masonry Entrance Animation
 * 
 * Uses IntersectionObserver to trigger staggered entrance animations
 * for gallery cards when they enter the viewport.
 * 
 * Performance:
 * - Single pass observation (animates once, then stops observing)
 * - No scroll listeners
 * - No layout thrashing
 * - Efficient DOM queries cached
 */

(function initMasonryEntrance() {
    // Configuration
    const STAGGER_DELAY_MS = 90; // milliseconds between each item animation
    const OBSERVER_THRESHOLD = 0.1; // 10% of item visible to trigger
    const OBSERVER_MARGIN = '50px'; // start observing 50px before viewport

    // Get all gallery cards
    const galleryCards = document.querySelectorAll('[data-gallery-card]');

    if (!galleryCards.length) return; // No gallery to animate

    // Create a map of card -> index for efficient lookup
    const cardIndexMap = new Map();
    galleryCards.forEach((card, index) => {
        cardIndexMap.set(card, index);
    });

    // IntersectionObserver configuration
    const observerOptions = {
        threshold: OBSERVER_THRESHOLD,
        rootMargin: OBSERVER_MARGIN
    };

    // Observer callback
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            // Only process when entering viewport
            if (!entry.isIntersecting) return;

            // Skip if already animated
            if (entry.target.classList.contains('is-visible')) {
                return;
            }

            // Get card index for staggered timing
            const cardIndex = cardIndexMap.get(entry.target);
            const staggerDelay = cardIndex * STAGGER_DELAY_MS;

            // Schedule animation with stagger
            setTimeout(() => {
                entry.target.classList.add('is-visible');
            }, staggerDelay);

            // Stop observing this card after animation triggers
            observer.unobserve(entry.target);
        });
    }, observerOptions);

    // Observe all cards
    galleryCards.forEach((card) => {
        observer.observe(card);
    });

    // Cleanup on page unload (optional but good practice)
    window.addEventListener('beforeunload', () => {
        observer.disconnect();
    });
})();
