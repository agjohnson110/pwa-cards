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
        this.history = []; // for undo later

        this.init();
    }

    init() {
        this.createDeck();
        this.shuffleDeck();
        this.dealCards();
        this.render();
        this.addEventListeners();
        this.registerServiceWorker();
    }

    // push new Card instances into this.deck, of all 52 standard cards
    createDeck() {
        const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
        const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
        for (let suit of suits) {
            for (let rank of ranks) {
                this.deck.push(new Card(suit, rank));
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
        // Clear any remaining references in the deck. Shouldn't be necessary
        this.deck = [];
    }

    // Render from model → DOM, reusing existing elements
    render() {
        // Free cells
        for (let i = 0; i < 4; i++) {
            const cell = document.getElementById(`free${i + 1}`);
            cell.innerHTML = '';
            if (this.freeCells[i].length > 0) {
                cell.appendChild(this.freeCells[i][0].element);
            }
        }

        // Foundations (top card only for now)
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

        // After rendering, attempt to auto-move any cards to foundations
        this.autoMoveToFoundation();
    }

    addEventListeners() {
        // Touch events for iOS. iOS pointer events are unreliable.
        document.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
        document.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
        document.addEventListener('touchend', this.handleTouchEnd.bind(this), { passive: false });

        // Pointer events for mouse + touch (covers Windows mouse dragging)
        document.addEventListener('pointerdown', this.handlePointerDown.bind(this));
        document.addEventListener('pointermove', this.handlePointerMove.bind(this));
        document.addEventListener('pointerup', this.handlePointerUp.bind(this));
        document.addEventListener('pointercancel', this.handlePointerUp.bind(this));

        document.addEventListener('click', (e) => {
            const button = e.target.closest('.top-btn');
            if (!button) return;

            const action = button.dataset.action;

            switch (action) {
                case 'undo':
                    //undoLastMove();
                    break;

                case 'options':
                    this.clearCacheAndReset();
                    //openOptionsMenu();
                    break;
            }
        });
    }

    // Helpers to go from DOM → Card and container arrays

    getCardFromElement(el) {
        return el?.cardRef || null;
    }

    getPileForElement(containerEl) {
        if (!containerEl) return null;
        if (containerEl.classList.contains('cell')) {
            const idx = ['free1', 'free2', 'free3', 'free4'].indexOf(containerEl.id);
            return { type: 'cell', index: idx, arr: this.freeCells[idx] };
        }
        if (containerEl.classList.contains('foundation')) {
            const idx = ['found1', 'found2', 'found3', 'found4'].indexOf(containerEl.id);
            return { type: 'foundation', index: idx, arr: this.foundations[idx] };
        }
        if (containerEl.classList.contains('column')) {
            const idx = parseInt(containerEl.id.slice(3), 10) - 1;
            return { type: 'column', index: idx, arr: this.tableau[idx] };
        }
        return null;
    }

    // Touch handlers

    handleTouchStart(e) {
        const touch = e.touches[0];
        this.touchStartX = touch.clientX;
        this.touchStartY = touch.clientY;
        this.dragNotTap = false;

        const targetEl = document.elementFromPoint(touch.clientX, touch.clientY)?.closest('.card'); //Finds which DOM element is at that touch coordinates
        if (!targetEl) return;

        const card = this.getCardFromElement(targetEl);
        if (!card) return;

        this.draggedCard = card; // Store the card being dragged

        const parentEl = targetEl.parentElement;
        const pile = this.getPileForElement(parentEl);
        if (!pile) return;

        const idx = pile.arr.indexOf(card); // Find the position of the touched card
        this.draggedStack = pile.arr.slice(idx); // Get all cards from here to the end

        if (this.preMoveCheckFailed()) { // Check if card is trapped by other cards and if there are enough free cells to move the stack
            this.draggedCard = null;
            this.draggedStack = [];
            return;
        }

        this.draggedStack.forEach(c => {
            c.element.classList.add('dragging');
        });
    }

    handleTouchMove(e) {
        e.preventDefault();
        if (!this.draggedCard) return;

        const touch = e.touches[0]; // Get the current touch position
        const deltaX = touch.clientX - this.touchStartX;
        const deltaY = touch.clientY - this.touchStartY;

        // If not a drag yet and movement exceeds tap threshold, consider it a drag
        if (!this.dragNotTap) {
            if (Math.abs(deltaX) > this.tapThreshold || Math.abs(deltaY) > this.tapThreshold) {
                this.dragNotTap = true;
            }
        }

        // Move all cards in the dragged stack
        this.draggedStack.forEach(c => {
            c.element.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
        });
    }

    handleTouchEnd(e) {
        if (!this.draggedCard) return;

        this.draggedStack.forEach(c => {
            c.element.classList.remove('dragging');
            c.element.style.transform = ''; // Reset position
        });

        if (this.dragNotTap) {
            const touch = e.changedTouches[0]; // Get the final touch position (where finger left screen)
            const targetEl = document.elementFromPoint(touch.clientX, touch.clientY);
            this.attemptMove(targetEl);
        } else { // This was a tap/click, not a drag.
            const targetEl = this.findBestTarget();
            this.attemptMove(targetEl);
        }

        this.draggedCard = null; // Cleanup for next drag
        this.draggedStack = [];  // Cleanup for next drag
    }

    // Pointer handlers for mouse

    handlePointerDown(e) {
        if (e.isPrimary === false) return;
        e.preventDefault();

        this.touchStartX = e.clientX;
        this.touchStartY = e.clientY;
        this.dragNotTap = false;

        const targetEl = document.elementFromPoint(e.clientX, e.clientY)?.closest('.card');
        if (!targetEl) return;

        const card = this.getCardFromElement(targetEl);
        if (!card) return;

        this.draggedCard = card;

        const parentEl = targetEl.parentElement;
        const pile = this.getPileForElement(parentEl);
        if (!pile) return;

        const idx = pile.arr.indexOf(card);
        this.draggedStack = pile.arr.slice(idx);

        if (this.preMoveCheckFailed()) {
            this.draggedCard = null;
            this.draggedStack = [];
            return;
        }

        this.draggedStack.forEach(c => {
            c.element.classList.add('dragging');
        });

        try { targetEl.setPointerCapture && targetEl.setPointerCapture(e.pointerId); } catch (err) {}
    }

    handlePointerMove(e) {
        if (!this.draggedCard) return;
        e.preventDefault();

        const deltaX = e.clientX - this.touchStartX;
        const deltaY = e.clientY - this.touchStartY;

        if (!this.dragNotTap) {
            if (Math.abs(deltaX) > this.tapThreshold || Math.abs(deltaY) > this.tapThreshold) {
                this.dragNotTap = true;
            }
        }

        this.draggedStack.forEach(c => {
            c.element.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
        });
    }

    handlePointerUp(e) {
        if (!this.draggedCard) return;

        this.draggedStack.forEach(c => {
            c.element.classList.remove('dragging');
            c.element.style.transform = '';
        });

        if (this.dragNotTap) {
            const targetEl = document.elementFromPoint(e.clientX, e.clientY);
            this.attemptMove(targetEl);
        } else {
            const targetEl = this.findBestTarget();
            this.attemptMove(targetEl);
        }

        try { this.draggedCard.element.releasePointerCapture && this.draggedCard.element.releasePointerCapture(e.pointerId); } catch (err) {}
        this.draggedCard = null;
        this.draggedStack = [];
    }

    // return true if card is trapped by other cards or if there are not enough free cells to move the stack
    preMoveCheckFailed() {
        // stack order
        for (let i = 0; i < this.draggedStack.length - 1; i++) {
            const curr = this.draggedStack[i];
            const next = this.draggedStack[i + 1];
            if (next.color === curr.color) return true; // If adjacent cards are the same color, target is trapped
            if (next.value !== curr.value - 1) return true; // If adjacent cards are not in descending order, target is trapped
        }

        // Check stack size vs free cells
        const freeCellsAvailable = this.freeCells.filter(c => c.length === 0).length;
        const emptyColumnsAvailable = this.tableau.filter(col => col.length === 0).length;
        if (this.draggedStack.length > (2 ** emptyColumnsAvailable) * (freeCellsAvailable + 1)) {
            return true; // This rule applies to moving stacks to a non-empty column. Moving to an empty column is more restrictive and checked during the attemptMove.
        }
        return false;
    }

    findBestTarget() {
        const currentParentEl = this.draggedCard.element.parentElement;
        const currentPile = this.getPileForElement(currentParentEl);

        if (!currentPile) return currentParentEl;

        if (this.draggedStack.length > 1) {
            // stacks → only columns
            for (let i = 0; i < 8; i++) {
                const colEl = document.getElementById(`col${i + 1}`);
                if (colEl === currentParentEl) continue; // Can't move to the same column
                if (colEl.children.length !== 0 && this.isValidMove(currentParentEl, colEl)) return colEl; // non empty columns first
            }
            for (let i = 0; i < 8; i++) {
                const colEl = document.getElementById(`col${i + 1}`);
                if (colEl === currentParentEl) continue; // Can't move to the same column
                if (colEl.children.length === 0 && this.isValidMove(currentParentEl, colEl)) return colEl; // empty columns second (more restrictive, so lower priority)
            }
        } else {
            // single card
            for (let i = 0; i < 8; i++) {
                const colEl = document.getElementById(`col${i + 1}`);
                if (colEl === currentParentEl) continue; // Can't move to the same column
                if (colEl.children.length !== 0 && this.isValidMove(currentParentEl, colEl)) return colEl; // non empty columns first
            }
            for (let i = 0; i < 4; i++) {
                const cellEl = document.getElementById(`free${i + 1}`); // free cells before empty columns for single cards, since free cells are more flexible for future moves
                if (this.isValidMove(currentParentEl, cellEl)) return cellEl;
            }
            for (let i = 0; i < 8; i++) {
                const colEl = document.getElementById(`col${i + 1}`);
                if (colEl === currentParentEl) continue; // Can't move to the same column
                if (colEl.children.length === 0 && this.isValidMove(currentParentEl, colEl)) return colEl; // empty columns next (more restrictive, so lower priority)
            }
            for (let i = 0; i < 4; i++) {
                const foundEl = document.getElementById(`found${i + 1}`); // foundations last since they are most restrictive and can only take single cards
                if (this.isValidMove(currentParentEl, foundEl)) return foundEl;
            }
        }

        return currentParentEl; // No valid move, return original parent to snap back
    }

    attemptMove(targetEl) {
        if (!targetEl) return;

        const sourceEl = this.draggedCard.element.parentElement;
        const destEl = targetEl.closest('.cell, .foundation, .column') || targetEl.parentElement?.closest('.cell, .foundation, .column');

        if (!destEl || sourceEl === destEl) return;

        if (this.isValidMove(sourceEl, destEl)) {
            this.moveCard(sourceEl, destEl, this.draggedCard.id);
            this.render();
            if (this.checkWin()) {
                alert('You win!');
            }
        }
    }

    // isValidMove now uses model via draggedCard / piles, but still keyed by DOM containers
    isValidMove(sourceEl, destEl) {
        if (!destEl) return false;

        const sourcePile = this.getPileForElement(sourceEl);
        const destPile = this.getPileForElement(destEl);
        if (!sourcePile || !destPile) return false;

        const movingCard = this.draggedCard;
        if (!movingCard) return false;

        if (destEl.classList.contains('cell')) {
            if (this.draggedStack.length > 1) return false; // Can't move multiple cards to a free cell
            return destEl.children.length === 0; // Can only place on empty free cell
        }

        if (destEl.classList.contains('foundation')) {
            if (this.draggedStack.length > 1) return false; // Can't move multiple cards to a foundation
            if (destEl.children.length === 0) {
                return movingCard.rank === 'A'; // Only Aces can go on empty foundation
            } else {
                const topCard = destPile.arr[destPile.arr.length - 1];
                if (topCard.suit !== movingCard.suit) return false; // Must be same suit as top foundation card
                return topCard.value === movingCard.value - 1; // Must be one rank lower than top foundation card
            }
        }

        if (destEl.classList.contains('column')) {
            if (destEl.children.length === 0) {
                const freeCellsAvailable = this.freeCells.filter(c => c.length === 0).length;
                const emptyColumnsAvailable = this.tableau.filter(col => col.length === 0).length - 1; // Exclude the destination column since it can't be used.
                if (this.draggedStack.length > (2 ** emptyColumnsAvailable) * (freeCellsAvailable + 1)) {
                    return false;
                }
                return true; // Can place any card on empty column
            } else {
                const topCard = destPile.arr[destPile.arr.length - 1];
                return topCard.color !== movingCard.color && topCard.value === movingCard.value + 1; // Must be opposite color and one rank higher
            }
        }

        return false;
    }

    // Move Card(s) in model arrays, DOM follows via render()
    moveCard(sourceEl, destEl, cardId) {
        const sourcePile = this.getPileForElement(sourceEl);
        const destPile = this.getPileForElement(destEl);
        if (!sourcePile || !destPile) return;

        const arr = sourcePile.arr;

        const startIdx = arr.findIndex(c => c.id === cardId);
        if (startIdx === -1) return;

        let moving;
        if (sourcePile.type === 'column') {
            moving = arr.splice(startIdx);
        } else {
            moving = arr.splice(startIdx, 1);
        }

        if (destPile.type === 'column') {
            destPile.arr.push(...moving);
        } else if (destPile.type === 'cell' || destPile.type === 'foundation') {
            if (moving.length === 1) destPile.arr.push(moving[0]);
        }
    }

    autoMoveToFoundation() {
        // iterate columns + free cells
        for (let i = 1; i <= 12; i++) {
            let containerEl;
            if (i <= 8) {
                containerEl = document.getElementById(`col${i}`);
            } else {
                containerEl = document.getElementById(`free${i - 8}`);
            }
            if (!containerEl || containerEl.children.length === 0) continue; // If empty no card to move

            const pile = this.getPileForElement(containerEl);
            if (!pile || pile.arr.length === 0) continue;

            const movingCard = pile.arr[pile.arr.length - 1];
            this.draggedCard = movingCard;
            this.draggedStack = [movingCard];

            const movingValue = movingCard.value;
            const movingColor = movingCard.color;

            if (movingValue === 1 || movingValue === 2) { // Ace or 2 can always move to foundation without additional check.
                for (let j = 0; j < 4; j++) {
                    const foundationEl = document.getElementById(`found${j + 1}`);
                    if (this.isValidMove(containerEl, foundationEl)) {
                        this.moveCard(containerEl, foundationEl, movingCard.id);
                        this.render();
                        this.draggedCard = null;
                        this.draggedStack = [];
                        return;
                    }
                }
            } else {
                let foundationTargetEl = null;
                for (let j = 0; j < 4; j++) {
                    const foundationEl = document.getElementById(`found${j + 1}`);
                    if (this.isValidMove(containerEl, foundationEl)) {
                        foundationTargetEl = foundationEl;
                        break;
                    }
                }
                if (!foundationTargetEl) {
                    continue; // No valid foundation to move to, skip checks
                }

                // Only move if the card is not needed in the tableau anymore
                let readyToMove = 0;
                for (let j = 0; j < 4; j++) {
                    const foundationEl = document.getElementById(`found${j + 1}`);
                    const fPile = this.getPileForElement(foundationEl);
                    if (!fPile || fPile.arr.length === 0) continue;

                    const topFoundationCard = fPile.arr[fPile.arr.length - 1];

                    if (movingColor === 'red') {
                        if (topFoundationCard.suit === 'clubs' && topFoundationCard.value >= movingValue - 2) {
                            readyToMove++;
                        }
                        if (topFoundationCard.suit === 'spades' && topFoundationCard.value >= movingValue - 2) {
                            readyToMove++;
                        }
                    } else { // movingColor === 'black'
                        if (topFoundationCard.suit === 'hearts' && topFoundationCard.value >= movingValue - 2) {
                            readyToMove++;
                        }
                        if (topFoundationCard.suit === 'diamonds' && topFoundationCard.value >= movingValue - 2) {
                            readyToMove++;
                        }
                    }
                }

                if (readyToMove === 2) {
                    this.moveCard(containerEl, foundationTargetEl, movingCard.id);
                    this.render();
                    this.draggedCard = null;
                    this.draggedStack = [];
                    return;
                }
            }
        }

        this.draggedCard = null;
        this.draggedStack = [];
    }

    checkWin() {
        return this.foundations.every(f => f.length === 13);
    }

    clearCacheAndReset() {
        if ('caches' in window) {
            caches.keys().then(names => {
                names.forEach(name => {
                    caches.delete(name);
                });
            });
        }

        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then(registrations => {
                registrations.forEach(registration => {
                    registration.unregister();
                });
            });
        }

        this.resetGame();
    }

    resetGame() {
        this.deck = [];
        this.freeCells = [[], [], [], []];
        this.foundations = [[], [], [], []];
        this.tableau = [[], [], [], [], [], [], [], []];
        this.draggedCard = null;
        this.draggedStack = [];
        this.history = [];
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