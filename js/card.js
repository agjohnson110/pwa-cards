// ─── Card ─────────────────────────────────────────────────────────────────────
//
// Represents a single playing card. Shared by Freecell and Spider.
// Creates and owns its own DOM element, which is reused for the life of the
// game rather than recreated on every render.
//
// Usage:
//   const card = new Card('hearts', 'A');        // single deck (Freecell)
//   const card = new Card('hearts', 'A', 0);     // deck 0 of 2 (Spider)
//   const card = new Card('hearts', 'A', 1);     // deck 1 of 2 (Spider)
//
//   card.suit      // 'hearts'
//   card.rank      // 'A'
//   card.value     // 1
//   card.color     // 'red'
//   card.id        // 'hearts-A' or 'hearts-A-1' for multi-deck
//   card.element   // the DOM div element
// ─────────────────────────────────────────────────────────────────────────────

class Card {
    // suit:      'hearts' | 'diamonds' | 'clubs' | 'spades'
    // rank:      'A' | '2' .. '10' | 'J' | 'Q' | 'K'
    // deckIndex: optional number — pass when using multiple decks so IDs stay unique.
    //            Omit (or pass undefined) for single-deck games.
    constructor(suit, rank, deckIndex = undefined) {
        this.suit  = suit;
        this.rank  = rank;
        this.value = Card.getValue(rank);
        this.color = (suit === 'hearts' || suit === 'diamonds') ? 'red' : 'black';
        this.id    = deckIndex !== undefined
            ? `${suit}-${rank}-${deckIndex}`
            : `${suit}-${rank}`;

        this.element = this._createElement();
    }

    // ─── Static helpers ───────────────────────────────────────────────────────

    // Numeric value for a rank. Static so it can be used without a Card instance
    // e.g. to validate moves before cards are created.
    static getValue(rank) {
        const values = {
            'A': 1,  '2': 2,  '3': 3,  '4': 4,  '5': 5,
            '6': 6,  '7': 7,  '8': 8,  '9': 9,  '10': 10,
            'J': 11, 'Q': 12, 'K': 13
        };
        return values[rank];
    }

    // Unicode suit symbol for a suit name.
    static getSuitSymbol(suit) {
        const map = {
            'hearts':   '\u2665',
            'diamonds': '\u2666',
            'clubs':    '\u2663',
            'spades':   '\u2660'
        };
        return map[suit] || suit[0].toUpperCase();
    }

    // All standard suits and ranks — useful for deck creation in both games.
    static get SUITS() { return ['hearts', 'diamonds', 'clubs', 'spades']; }
    static get RANKS() { return ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']; }

    // ─── Instance helpers ─────────────────────────────────────────────────────

    getSuitSymbol() {
        return Card.getSuitSymbol(this.suit);
    }

    // ─── DOM ─────────────────────────────────────────────────────────────────

    // Creates the DOM element once. Called in the constructor and never again.
    _createElement() {
        const el  = document.createElement('div');
        const sym = this.getSuitSymbol();

        el.className = `card ${this.color}`;
        el.dataset.suit   = this.suit;
        el.dataset.rank   = this.rank;
        el.dataset.value  = this.value;
        el.dataset.color  = this.color;
        el.dataset.cardId = this.id;
        el.setAttribute('role',       'img');
        el.setAttribute('aria-label', `${this.rank} of ${this.suit}`);

        // Corners: rank top-left / bottom-right, suit top-right / bottom-left
        el.innerHTML = `
            <span class="corner tl rank">${this.rank}</span>
            <span class="corner tr suit">${sym}</span>
            <span class="corner bl suit">${sym}</span>
            <span class="corner br rank">${this.rank}</span>
            <div class="center-suit">${sym}</div>
        `;

        // Back-reference so drag handlers can get the Card from the element directly
        el.cardRef = this;
        return el;
    }
}
