// ─── CardAnimator ─────────────────────────────────────────────────────────────
//
// FLIP-based card animation. Shared by Freecell and Spider.
//
// Both methods use the same double-requestAnimationFrame technique:
//   1. Instantly place card at the "from" position (no transition)
//   2. On the next frame, enable the CSS transition and clear the transform
//      so the browser animates from the inverted position to the natural one
//
// Usage:
//   CardAnimator.animateCards(cardEls, fromRects);
//   CardAnimator.animateSingleCard(cardEl, fromRect, toRect);
// ─────────────────────────────────────────────────────────────────────────────

const CardAnimator = {
    // Duration must match the CSS transition duration so z-index cleanup
    // fires after all transitions have finished.
    DURATION_MS: 300,

    // Animates one or more card elements from their captured pre-render positions
    // to wherever they currently are in the DOM after renderDOM() was called.
    //
    // cardEls:   array of card DOM elements
    // fromRects: array of DOMRect captured BEFORE renderDOM() — same order as cardEls
    animateCards(cardEls, fromRects) {
        const toRects = cardEls.map(el => el.getBoundingClientRect());

        // Collect all destination parents so we can manage z-index on their
        // entire contents, not just the moving cards. This prevents cards already
        // in the destination column from floating above the arriving cards.
        const affectedParents = new Set(
            cardEls.map(el => el.parentElement).filter(Boolean)
        );

        affectedParents.forEach(parent => {
            Array.from(parent.children).forEach((el, i) => {
                el.style.zIndex = 100 + i;
            });
        });

        // Snap each card to its pre-render position
        cardEls.forEach((el, i) => {
            const dx = fromRects[i].left - toRects[i].left;
            const dy = fromRects[i].top  - toRects[i].top;
            if (dx === 0 && dy === 0) return; // card didn't move — skip
            el.style.transition = 'none';
            el.style.transform  = `translate(${dx}px, ${dy}px)`;
        });

        // Double rAF: first frame paints the inverted position,
        // second frame triggers the CSS transition to the natural position
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                cardEls.forEach(el => {
                    el.style.transition = `transform ${CardAnimator.DURATION_MS}ms ease`;
                    el.style.transform  = '';
                    el.addEventListener('transitionend', () => {
                        el.style.transition = '';
                    }, { once: true });
                });

                // Clear z-index overrides after all transitions complete
                setTimeout(() => {
                    affectedParents.forEach(parent => {
                        Array.from(parent.children).forEach(el => {
                            el.style.zIndex = '';
                        });
                    });
                }, CardAnimator.DURATION_MS + 50); // small buffer past transition end
            });
        });
    },

    // Animates a single card element from a captured pre-move position to its
    // current post-render position. Used for auto-moves where fromRect and toRect
    // are both already known.
    //
    // cardEl:   the card DOM element
    // fromRect: DOMRect captured BEFORE the move
    // toRect:   DOMRect captured AFTER renderDOM()
    animateSingleCard(cardEl, fromRect, toRect) {
        const dx = fromRect.left - toRect.left;
        const dy = fromRect.top  - toRect.top;
        if (dx === 0 && dy === 0) return; // card didn't move — skip

        // IIFE captures cardEl in the closure so the animation is correct
        // even if this is called in a loop with multiple cards
        ((el) => {
            el.classList.add('animating');
            el.style.transition = 'none';
            el.style.transform  = `translate(${dx}px, ${dy}px)`;

            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    el.style.transition = `transform ${CardAnimator.DURATION_MS}ms ease`;
                    el.style.transform  = '';
                    el.addEventListener('transitionend', () => {
                        el.style.transition = '';
                        el.classList.remove('animating');
                    }, { once: true });
                });
            });
        })(cardEl);
    },
};
