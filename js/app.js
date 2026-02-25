// Freecell Game Logic

class Card {
    constructor(suit, rank) {
        this.suit = suit;
        this.rank = rank;
        this.value = this.getValue(rank);
        this.color = (suit === 'hearts' || suit === 'diamonds') ? 'red' : 'black';
        this.id = `${suit}-${rank}`;
        this.element = this.createElement(); // create once, keep forever
    }

    getValue(rank) {
        const values = { 'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13 };
        return values[rank];
    }

    getSuitSymbol() {
        // Unicode suit symbols for better visuals
        const map = { 'hearts': '\u2665', 'diamonds': '\u2666', 'clubs': '\u2663', 'spades': '\u2660' };
        return map[this.suit] || this.suit[0].toUpperCase();
    }

    // Create a DOM element for this card with appropriate classes and data attributes
    createElement() {
        const el = document.createElement('div');
        el.className = `card ${this.color}`;
        el.dataset.suit = this.suit;
        el.dataset.rank = this.rank;
        el.dataset.value = this.value;
        el.dataset.color = this.color;
        el.dataset.cardId = this.id;
        el.setAttribute('role', 'img');
        el.setAttribute('aria-label', `${this.rank} of ${this.suit}`);

        // Corners: rank top-left / bottom-right, suit top-right / bottom-left
        const suit = this.getSuitSymbol();
        el.innerHTML = `
            <span class="corner tl rank">${this.rank}</span>
            <span class="corner tr suit">${suit}</span>
            <span class="corner bl suit">${suit}</span>
            <span class="corner br rank">${this.rank}</span>
            <div class="center-suit">${suit}</div>
        `;

        // Link DOM → model
        el.cardRef = this;

        return el;
    }
}

class FreecellGame {
    constructor() {
        this.deck = [];
        this.freeCells = [[], [], [], []];      // arrays of Card
        this.foundations = [[], [], [], []];    // arrays of Card
        this.tableau = [[], [], [], [], [], [], [], []]; // arrays of Card

        this.draggedCard = null;   // Card
        this.draggedStack = [];    // Card[]
        this.touchStartX = 0;
        this.touchStartY = 0;
        this.dragNotTap = false;
        this.tapThreshold = 8; // px movement allowed before it's considered a drag
        this.history = []; // for undo
        this.cardMap = {}; // id → Card, permanent lookup for all 52 cards

        this.init();
        this.addEventListeners();  // only once, not inside init so it doesn't re-register on reset
    }

    init() {
        this.createDeck();
        this.shuffleDeck();
        this.dealCards();
        this.renderDOM();    // initial render without auto-move
        this.runAutoMoves(); // then run auto-moves (no animations on deal)
        this.registerServiceWorker();
    }

    // Push new Card instances into this.deck for all 52 standard cards.
    // Also populates cardMap for permanent id → Card lookup.
    createDeck() {
        const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
        const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
        for (let suit of suits) {
            for (let rank of ranks) {
                const card = new Card(suit, rank);
                this.deck.push(card);
                this.cardMap[card.id] = card; // permanent reference, survives deck being cleared
            }
        }
    }

    // Shuffle the deck using Fisher-Yates random algorithm
    shuffleDeck() {
        for (let i = this.deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
        }
    }

    // Pop cards off the shuffled deck into tableau columns
    dealCards() {
        for (let col = 0; col < 8; col++) {
            const numCards = col < 4 ? 7 : 6;
            for (let i = 0; i < numCards; i++) {
                const card = this.deck.pop();
                this.tableau[col].push(card);
            }
        }
        this.deck = []; // clear remaining references
    }

    // ─── Rendering ───────────────────────────────────────────────────────────────

    // Pure DOM sync: reads model arrays and updates the DOM to match.
    // Does NOT trigger auto-moves. Use render() for normal gameplay.
    renderDOM() {
        // Free cells
        for (let i = 0; i < 4; i++) {
            const cell = document.getElementById(`free${i + 1}`);
            cell.innerHTML = '';
            if (this.freeCells[i].length > 0) {
                cell.appendChild(this.freeCells[i][0].element);
            }
        }

        // Foundations — show only the top card
        for (let i = 0; i < 4; i++) {
            const found = document.getElementById(`found${i + 1}`);
            found.innerHTML = '';
            if (this.foundations[i].length > 0) {
                const top = this.foundations[i][this.foundations[i].length - 1];
                found.appendChild(top.element);
            }
        }

        // Tableau
        for (let i = 0; i < 8; i++) {
            const col = document.getElementById(`col${i + 1}`);
            col.innerHTML = '';
            for (let card of this.tableau[i]) {
                col.appendChild(card.element);
            }
        }
    }

    // Full render: syncs DOM then runs animated auto-moves.
    // Use this after every player move.
    render() {
        this.renderDOM();
        this.runAutoMoves();
    }

    // ─── Animation ───────────────────────────────────────────────────────────────

    // FLIP animation: animates cardEls from fromRects to their current DOM positions.
    // fromRects: array of DOMRect captured BEFORE renderDOM() was called.
    // cardEls:   the corresponding card elements.
    animateCards(cardEls, fromRects) {
        const toRects = cardEls.map(el => el.getBoundingClientRect());

        cardEls.forEach((el, i) => {
            const dx = fromRects[i].left - toRects[i].left;
            const dy = fromRects[i].top  - toRects[i].top;
            // Skip animation if card didn't actually move (e.g. invalid move snapped back)
            if (dx === 0 && dy === 0) return;
            el.classList.add('animating'); // elevate z-index during animation
            el.style.transition = 'none';
            el.style.transform  = `translate(${dx}px, ${dy}px)`;
        });

        // Double rAF: first frame paints the inverted position, second triggers the transition
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                cardEls.forEach(el => {
                    el.style.transition = 'transform 0.2s ease';
                    el.style.transform  = '';
                    el.addEventListener('transitionend', () => {
                        el.style.transition = '';
                        el.classList.remove('animating'); // reset z-index after animation
                    }, { once: true });
                });
            });
        });
    }

    // ─── History / Undo ──────────────────────────────────────────────────────────

    // Snapshot the current state before a player move.
    // movedIds records which cards are about to move, for use by undo animation.
    saveHistory() {
        this.history.push({
            freeCells:   this.freeCells.map(cell => [...cell]),
            foundations: this.foundations.map(f    => [...f]),
            tableau:     this.tableau.map(col      => [...col]),
            movedIds:    this.draggedStack.map(c   => c.id)
        });

        // 5000 entries ≈ ~5MB max. Far exceeds any realistic game length (52 cards),
        // while guarding against degenerate cases.
        if (this.history.length > 5000) this.history.shift();
    }

    undo() {
        if (this.draggedCard)          return; // don't undo mid-drag
        if (this.history.length === 0) return;

        const entry = this.history.pop();

        // Find cards that were auto-moved to foundations after the last player move.
        // These are cards present in the current foundations but absent in the snapshot.
        const autoMovedIds = [];
        for (let i = 0; i < 4; i++) {
            const savedLen   = entry.foundations[i].length;
            const currentLen = this.foundations[i].length;
            for (let j = savedLen; j < currentLen; j++) {
                autoMovedIds.push(this.foundations[i][j].id);
            }
        }

        // Animate both the manually moved cards and any auto-moved cards
        const allMovedIds = [...new Set([...entry.movedIds, ...autoMovedIds])];
        const cardEls     = allMovedIds.map(id => this.cardMap[id].element);
        const fromRects   = cardEls.map(el => el.getBoundingClientRect()); // current = "from" for undo

        // Restore model
        this.freeCells   = entry.freeCells;
        this.foundations = entry.foundations;
        this.tableau     = entry.tableau;

        // Sync DOM to restored state WITHOUT triggering new auto-moves
        this.renderDOM();

        // Animate cards back to their restored positions
        this.animateCards(cardEls, fromRects);
    }

    // ─── Event Listeners ─────────────────────────────────────────────────────────

    addEventListeners() {
        // Touch events for iOS (pointer events unreliable on iOS)
        document.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
        document.addEventListener('touchmove',  this.handleTouchMove.bind(this),  { passive: false });
        document.addEventListener('touchend',   this.handleTouchEnd.bind(this),   { passive: false });

        // Pointer events for mouse on desktop — skip if touch already handled it
        document.addEventListener('pointerdown',   this.handlePointerDown.bind(this));
        document.addEventListener('pointermove',   this.handlePointerMove.bind(this));
        document.addEventListener('pointerup',     this.handlePointerUp.bind(this));
        document.addEventListener('pointercancel', this.handlePointerUp.bind(this));

        document.addEventListener('click', (e) => {
            const button = e.target.closest('.top-button');
            if (!button) return;

            switch (button.dataset.action) {
                case 'undo':     this.undo();            break;
                case 'settings': this.clearCacheAndReset(); break;
            }
        });
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────────

    getCardFromElement(el) {
        return el?.cardRef || null;
    }

    // Returns { type, index, arr } for a pile container element.
    // Reads data-pile-type and data-pile-index attributes set in HTML.
    // Kept separate from CSS classes since classes are for styling and may change.
    getPileForElement(containerEl) {
        if (!containerEl) return null;

        const type  = containerEl.dataset.pileType; // dataset.pileType comes from data-pile-type in html. Separate from class since class is used for styling and may have multiple values, while data-pile-type is strictly for identifying the type of pile.
        const index = parseInt(containerEl.dataset.pileIndex, 10);

        if (isNaN(index) || !type) return null; // element isn't a pile container

        switch (type) {
            case 'cell':       return { type, index, arr: this.freeCells[index] }; //property name can automatch variable name (type: type)
            case 'foundation': return { type, index, arr: this.foundations[index] };
            case 'column':     return { type, index, arr: this.tableau[index] };
            default:           return null;
        }
    }

    // ─── Touch Handlers ──────────────────────────────────────────────────────────

    handleTouchStart(e) {
        const touch = e.touches[0];
        this.touchStartX = touch.clientX;
        this.touchStartY = touch.clientY;
        this.dragNotTap  = false;

        const targetEl = document.elementFromPoint(touch.clientX, touch.clientY)?.closest('.card');
        if (!targetEl) return;

        const card = this.getCardFromElement(targetEl);
        if (!card) return;

        this.draggedCard = card;

        const pile = this.getPileForElement(targetEl.parentElement);
        if (!pile) return;

        const idx = pile.arr.indexOf(card); // Find the position of the touched card
        this.draggedStack = pile.arr.slice(idx); //cards from here to end - shallow copy — card refs, not clones

        if (this.preMoveCheckFailed()) { //trapped or too few empty cells
            this.draggedCard  = null;
            this.draggedStack = [];
            return;
        }

        this.draggedStack.forEach(c => c.element.classList.add('dragging'));
    }

    handleTouchMove(e) {
        e.preventDefault();
        if (!this.draggedCard) return;

        const touch  = e.touches[0];
        const deltaX = touch.clientX - this.touchStartX;
        const deltaY = touch.clientY - this.touchStartY;

        if (!this.dragNotTap && (Math.abs(deltaX) > this.tapThreshold || Math.abs(deltaY) > this.tapThreshold)) {
            this.dragNotTap = true;
        }

        this.draggedStack.forEach(c => {
            c.element.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
        });
    }

    handleTouchEnd(e) {
        if (!this.draggedCard) return;

        this.draggedStack.forEach(c => {
            c.element.classList.remove('dragging');
            c.element.style.transform = '';
        });

        if (this.dragNotTap) {
            const touch    = e.changedTouches[0];
            const targetEl = document.elementFromPoint(touch.clientX, touch.clientY);
            this.attemptMove(targetEl, true);  // drag — no tap animation
        } else {
            const targetEl = this.findBestTarget();
            this.attemptMove(targetEl, false); // tap — animate the move
        }

        this.draggedCard  = null;
        this.draggedStack = [];
    }

    // ─── Pointer Handlers (mouse / stylus) ───────────────────────────────────────

    handlePointerDown(e) {
        if (e.pointerType === 'touch') return; // already handled by touch events
        if (e.isPrimary === false)     return;
        e.preventDefault();

        this.touchStartX = e.clientX;
        this.touchStartY = e.clientY;
        this.dragNotTap  = false;

        const targetEl = document.elementFromPoint(e.clientX, e.clientY)?.closest('.card');
        if (!targetEl) return;

        const card = this.getCardFromElement(targetEl);
        if (!card) return;

        this.draggedCard = card;

        const pile = this.getPileForElement(targetEl.parentElement);
        if (!pile) return;

        const idx = pile.arr.indexOf(card);
        this.draggedStack = pile.arr.slice(idx);

        if (this.preMoveCheckFailed()) {
            this.draggedCard  = null;
            this.draggedStack = [];
            return;
        }

        this.draggedStack.forEach(c => c.element.classList.add('dragging'));
        try { targetEl.setPointerCapture?.(e.pointerId); } catch (err) {}
    }

    handlePointerMove(e) {
        if (e.pointerType === 'touch') return;
        if (!this.draggedCard)         return;
        e.preventDefault();

        const deltaX = e.clientX - this.touchStartX;
        const deltaY = e.clientY - this.touchStartY;

        if (!this.dragNotTap && (Math.abs(deltaX) > this.tapThreshold || Math.abs(deltaY) > this.tapThreshold)) {
            this.dragNotTap = true;
        }

        this.draggedStack.forEach(c => {
            c.element.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
        });
    }

    handlePointerUp(e) {
        if (e.pointerType === 'touch') return;
        if (!this.draggedCard)         return;

        this.draggedStack.forEach(c => {
            c.element.classList.remove('dragging');
            c.element.style.transform = '';
        });

        if (this.dragNotTap) {
            const targetEl = document.elementFromPoint(e.clientX, e.clientY);
            this.attemptMove(targetEl, true);  // drag — no tap animation
        } else {
            const targetEl = this.findBestTarget();
            this.attemptMove(targetEl, false); // tap — animate the move
        }

        try { this.draggedCard.element.releasePointerCapture?.(e.pointerId); } catch (err) {}
        this.draggedCard  = null;
        this.draggedStack = [];
    }

    // ─── Move Logic ──────────────────────────────────────────────────────────────

    // Returns true if the dragged stack cannot legally be picked up.
    preMoveCheckFailed() {
        for (let i = 0; i < this.draggedStack.length - 1; i++) {
            const curr = this.draggedStack[i];
            const next = this.draggedStack[i + 1];
            if (next.color === curr.color)       return true; // same color — not a valid sequence
            if (next.value !== curr.value - 1)   return true; // not descending — not a valid sequence
        }

        const freeCellsAvailable  = this.freeCells.filter(c => c.length === 0).length;
        const emptyColumnsAvailable = this.tableau.filter(col => col.length === 0).length;
        if (this.draggedStack.length > (2 ** emptyColumnsAvailable) * (freeCellsAvailable + 1)) {
            return true; // not enough room to move this stack
        }
        return false;
    }

    // Finds the best destination for a tap move using model-based priority ordering.
    findBestTarget() {
        const card        = this.draggedCard;
        const stack       = this.draggedStack;
        const cardParentEl = card.element.parentElement;
        const currentPile = this.getPileForElement(cardParentEl);

        const columnPiles = this.tableau.map((arr, i) => ({
            type: 'column', index: i, arr,
            el: document.getElementById(`col${i + 1}`)
        }));
        const cellPiles = this.freeCells.map((arr, i) => ({
            type: 'cell', index: i, arr,
            el: document.getElementById(`free${i + 1}`)
        }));
        const foundationPiles = this.foundations.map((arr, i) => ({
            type: 'foundation', index: i, arr,
            el: document.getElementById(`found${i + 1}`)
        }));

        if (stack.length > 1) {
            // Stacks can only go to columns: non-empty first, empty second
            const hit =
                columnPiles.find(p => p.el !== cardParentEl && p.arr.length > 0 && this.isValidMove(card, stack, p)) ||
                columnPiles.find(p => p.el !== cardParentEl && p.arr.length === 0 && this.isValidMove(card, stack, p));
            return hit?.el || cardParentEl;
        }

        // Single card: non-empty columns → free cells → empty columns → foundations
        const hit =
            columnPiles.find(p => p.el !== cardParentEl && p.arr.length > 0  && this.isValidMove(card, stack, p)) ||
            cellPiles.find(p    => currentPile?.type !== 'cell'               && this.isValidMove(card, stack, p)) ||
            columnPiles.find(p => p.el !== cardParentEl && p.arr.length === 0 && this.isValidMove(card, stack, p)) ||
            foundationPiles.find(p =>                                            this.isValidMove(card, stack, p));

        return hit?.el || cardParentEl;
    }

    // Validates and executes a move, then renders and checks for win.
    // isDrag: true when the card was physically dragged (skip tap animation).
    attemptMove(targetEl, isDrag = false) {
        if (!targetEl) return;

        const sourceEl = this.draggedCard.element.parentElement;
        const destEl   = targetEl.closest('.cell, .foundation, .column')
                      || targetEl.parentElement?.closest('.cell, .foundation, .column');

        if (!destEl || sourceEl === destEl) return;

        const destPile = this.getPileForElement(destEl);
        if (!destPile) return;

        if (this.isValidMove(this.draggedCard, this.draggedStack, destPile)) {
            this.saveHistory();

            // Capture positions BEFORE render for tap animation
            const cardEls   = this.draggedStack.map(c => c.element);
            const fromRects = isDrag ? null : cardEls.map(el => el.getBoundingClientRect());

            this.moveCard(sourceEl, destEl, this.draggedCard.id);
            this.render(); // renderDOM + runAutoMoves

            if (!isDrag) this.animateCards(cardEls, fromRects);

            if (this.checkWin()) alert('You win!');
        }
    }

    // Pure model-based move validation.
    // movingCard: Card, movingStack: Card[], destPile: { type, index, arr }
    isValidMove(movingCard, movingStack, destPile) {
        if (!destPile) return false;

        if (destPile.type === 'cell') {
            if (movingStack.length > 1) return false;   // cells hold only one card
            return destPile.arr.length === 0;            // must be empty
        }

        if (destPile.type === 'foundation') {
            if (movingStack.length > 1) return false; //move only one card to foundation at a time
            if (destPile.arr.length === 0) return movingCard.rank === 'A'; // only Aces can go to empty foundation
            const topCard = destPile.arr[destPile.arr.length - 1];
            return topCard.suit === movingCard.suit && topCard.value === movingCard.value - 1; // must be same suit and one rank lower
        }

        if (destPile.type === 'column') {
            if (destPile.arr.length === 0) {
                const freeCellsAvailable    = this.freeCells.filter(c => c.length === 0).length;
                const emptyColumnsAvailable = this.tableau.filter(col => col.length === 0).length - 1; // exclude dest column
                return movingStack.length <= (2 ** emptyColumnsAvailable) * (freeCellsAvailable + 1);
            }
            const topCard = destPile.arr[destPile.arr.length - 1];
            return topCard.color !== movingCard.color && topCard.value === movingCard.value + 1; // must be opposite color and one rank higher
        }

        return false;
    }

    // Moves Card(s) in the model arrays. DOM is updated separately via renderDOM().
    moveCard(sourceEl, destEl, cardId) {
        const sourcePile = this.getPileForElement(sourceEl);
        const destPile   = this.getPileForElement(destEl);
        if (!sourcePile || !destPile) return;

        const startIdx = sourcePile.arr.findIndex(c => c.id === cardId);
        if (startIdx === -1) return;

        // Columns can move a stack; cells and foundations always move exactly one card
        const moving = sourcePile.type === 'column'
            ? sourcePile.arr.splice(startIdx)
            : sourcePile.arr.splice(startIdx, 1);

        if (destPile.type === 'column') {
            destPile.arr.push(...moving);
        } else if (destPile.type === 'cell' || destPile.type === 'foundation') {
            if (moving.length === 1) destPile.arr.push(moving[0]);
        }
    }

    // ─── Auto-move to Foundation ─────────────────────────────────────────────────

    // Finds the next single card that should be automatically moved to a foundation.
    // Returns { card, sourceEl, foundationEl } or null if nothing should move.
    findNextAutoMove() {
        const candidates = [
            ...this.tableau.map((arr, i)   => ({ arr, el: document.getElementById(`col${i + 1}`) })),
            ...this.freeCells.map((arr, i) => ({ arr, el: document.getElementById(`free${i + 1}`) }))
        ].filter(p => p.arr.length > 0);

        for (const source of candidates) {
            const movingCard  = source.arr[source.arr.length - 1];
            const movingValue = movingCard.value;
            const movingColor = movingCard.color;

            for (let j = 0; j < 4; j++) {
                const foundationEl   = document.getElementById(`found${j + 1}`);
                const foundationPile = this.getPileForElement(foundationEl);

                if (!this.isValidMove(movingCard, [movingCard], foundationPile)) continue;

                // Aces and 2s are always safe to auto-move
                if (movingValue <= 2) {
                    return { card: movingCard, sourceEl: source.el, foundationEl };
                }

                // Higher cards only auto-move if both opposite-colour foundations are caught up,
                // meaning the card can never be needed to sequence on in the tableau
                let readyToMove = 0;
                for (let k = 0; k < 4; k++) {
                    const fPile = this.getPileForElement(document.getElementById(`found${k + 1}`));
                    if (!fPile || fPile.arr.length === 0) continue;
                    const topCard = fPile.arr[fPile.arr.length - 1];
                    if (movingColor === 'red') {
                        if ((topCard.suit === 'clubs' || topCard.suit === 'spades') && topCard.value >= movingValue - 2) readyToMove++;
                    } else {
                        if ((topCard.suit === 'hearts' || topCard.suit === 'diamonds') && topCard.value >= movingValue - 2) readyToMove++;
                    }
                }
                if (readyToMove === 2) {
                    return { card: movingCard, sourceEl: source.el, foundationEl };
                }
            }
        }
        return null;
    }

    // Executes all pending auto-moves one at a time, animating each card independently.
    // Called by render() after renderDOM(). Each card animates from its pre-move
    // position to its foundation position.
    runAutoMoves() {
        let next = this.findNextAutoMove();
        while (next) {
            const { card, sourceEl, foundationEl } = next;

            // Capture position BEFORE the move
            const fromRect = card.element.getBoundingClientRect();

            this.moveCard(sourceEl, foundationEl, card.id);
            this.renderDOM(); // sync DOM without recursing into runAutoMoves

            // Capture position AFTER render
            const toRect = card.element.getBoundingClientRect();
            const dx = fromRect.left - toRect.left;
            const dy = fromRect.top  - toRect.top;

            if (dx !== 0 || dy !== 0) {
                // Use an IIFE to capture the correct element reference in the closure
                ((el) => {
                    el.classList.add('animating');
                    el.style.transition = 'none';
                    el.style.transform  = `translate(${dx}px, ${dy}px)`;
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                            el.style.transition = 'transform 0.2s ease';
                            el.style.transform  = '';
                            el.addEventListener('transitionend', () => {
                                el.style.transition = '';
                                el.classList.remove('animating');
                            }, { once: true });
                        });
                    });
                })(card.element);
            }

            next = this.findNextAutoMove();
        }
    }

    // ─── Win Condition ───────────────────────────────────────────────────────────

    checkWin() {
        return this.foundations.every(f => f.length === 13);
    }

    // ─── Reset / Service Worker ──────────────────────────────────────────────────

    clearCacheAndReset() {
        if ('caches' in window) {
            caches.keys().then(names => names.forEach(name => caches.delete(name)));
        }
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => r.unregister()));
        }
        this.resetGame();
    }

    resetGame() {
        this.deck        = [];
        this.cardMap     = {}; // cleared so createDeck() populates fresh Card instances
        this.freeCells   = [[], [], [], []];
        this.foundations = [[], [], [], []];
        this.tableau     = [[], [], [], [], [], [], [], []];
        this.draggedCard  = null;
        this.draggedStack = [];
        this.history      = [];
        this.init();
    }

    registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js')
                .then(() => console.log('SW registered'))
                .catch(() => console.log('SW registration failed'));
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new FreecellGame();
});