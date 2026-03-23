// ─── ColumnLayout ─────────────────────────────────────────────────────────────
//
// Dynamically compresses card overlap in tableau columns so they always fit
// within the visible tableau height. Shared by Freecell and Spider.
//
// When a column has too many cards to display at the default overlap, it
// calculates the tightest overlap that still fits and applies it via the
// CSS custom property --card-offset on the column element. When cards fit
// at the default overlap, the property is removed so CSS takes over.
//
// Usage:
//   const layout = new ColumnLayout({
//       tableauId:    'tableau',         // id of the tableau container element
//       columnPrefix: 'col',             // column elements are col1, col2, ...
//       columnCount:  10,                // 8 for Freecell, 10 for Spider
//   });
//
//   layout.adjust();   // call after every render and on window resize
// ─────────────────────────────────────────────────────────────────────────────

class ColumnLayout {
    // tableauId:    id of the tableau container element
    // columnPrefix: prefix for column element ids (e.g. 'col' → col1, col2, ...)
    // columnCount:  number of columns (8 for Freecell, 10 for Spider)
    constructor({ tableauId = 'tableau', columnPrefix = 'col', columnCount = 10 } = {}) {
        this.tableauId    = tableauId;
        this.columnPrefix = columnPrefix;
        this.columnCount  = columnCount;
    }

    // Recalculates and applies --card-offset for every column.
    // Safe to call frequently — exits early per column when no compression needed.
    adjust() {
        const tableauEl = document.getElementById(this.tableauId);
        if (!tableauEl) return;

        const tableauHeight = tableauEl.getBoundingClientRect().height;
        if (tableauHeight === 0) return; // not yet laid out

        for (let i = 0; i < this.columnCount; i++) {
            const colEl = document.getElementById(`${this.columnPrefix}${i + 1}`);
            if (!colEl) continue;

            const cards = colEl.querySelectorAll('.card');

            // Nothing to compress with 0 or 1 cards
            if (cards.length <= 1) {
                colEl.style.removeProperty('--card-offset');
                continue;
            }

            const firstCard  = cards[0];
            const cardHeight = firstCard.getBoundingClientRect().height;
            const cardWidth  = firstCard.getBoundingClientRect().width;
            if (cardHeight === 0 || cardWidth === 0) continue; // not yet laid out

            // Calculate how much vertical space the column takes at default overlap.
            // defaultMargin of -90 matches the CSS default for --card-offset.
            const defaultMargin  = -90;
            const defaultOverlap = defaultMargin * cardWidth * -0.01;
            const defaultPeak    = cardHeight - defaultOverlap;
            const defaultBottom  = cardHeight + (cards.length - 1) * defaultPeak;

            if (defaultBottom <= tableauHeight) {
                // Column fits at default overlap — remove any override
                colEl.style.removeProperty('--card-offset');
                continue;
            }

            // Column is too tall — calculate the tightest overlap that still fits
            const availableHeight  = tableauHeight - cardHeight;
            const numOverlapping   = cards.length - 1;
            const desiredPeakPx    = availableHeight / numOverlapping;
            const desiredOverlapPx = cardHeight - desiredPeakPx;
            const newMarginTop     = (desiredOverlapPx / cardWidth) * -100;

            colEl.style.setProperty('--card-offset', `${newMarginTop.toFixed(1)}%`);
        }
    }
}
