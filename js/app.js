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
            const button = e.target.closest('.top-button');
            if (!button) return;

            const action = button.dataset.action;

            switch (action) {
                case 'undo':
                    //undoLastMove();
                    break;

                case 'settings':
                    this.clearCacheAndReset();
                    //openSettingsMenu();
                    break;
            }
        });
    }

    // Helpers to go from DOM → Card and container arrays

    getCardFromElement(el) {
        return el?.cardRef || null;
    }

    // return the type of container (free cell, foundation, column) and the corresponding array in the model based on the DOM element
    getPileForElement(containerEl) {
        if (!containerEl) return null;

        const type = containerEl.dataset.pileType; // dataset.pileType comes from data-pile-type in html. Separate from class since class is used for styling and may have multiple values, while data-pile-type is strictly for identifying the type of pile.
        const index = parseInt(containerEl.dataset.pileIndex, 10);

        if (isNaN(index) || !type) return null;  // element isn't a pile container

        switch (type) {
            case 'cell':       return { type, index, arr: this.freeCells[index] }; //property name can automatch variable name (type: type)
            case 'foundation': return { type, index, arr: this.foundations[index] };
            case 'column':     return { type, index, arr: this.tableau[index] };
            default:           return null;
        }
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
        this.draggedStack = pile.arr.slice(idx); // Get all cards from here to the end. slice is shallow copy - has references to orginal card objects, which is what we want since we will be modifying these same objects when we move them between piles.

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
        const card = this.draggedCard;
        const stack = this.draggedStack;
        const cardParentEl = card.element.parentElement;
        const currentPile = this.getPileForElement(cardParentEl);

        // Build candidate piles with their DOM elements attached
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
            // Stacks: non-empty columns first, empty columns second (only columns can take stacks, can't move to own column)
            const hit =
                columnPiles.find(p => p.el !== cardParentEl && p.arr.length > 0 && this.isValidMove(card, stack, p)) ||
                columnPiles.find(p => p.el !== cardParentEl && p.arr.length === 0 && this.isValidMove(card, stack, p));
            return hit?.el || cardParentEl;
        }
        // Single card: non-empty columns → free cells → empty columns → foundations
        const hit =
            columnPiles.find(p => p.el !== cardParentEl && p.arr.length > 0 && this.isValidMove(card, stack, p)) ||
            cellPiles.find(p => currentPile?.type !== 'cell' &&                this.isValidMove(card, stack, p)) ||
            columnPiles.find(p => p.el !== cardParentEl && p.arr.length === 0 && this.isValidMove(card, stack, p)) ||
            foundationPiles.find(p =>                                          this.isValidMove(card, stack, p));

        return hit?.el || cardParentEl; // If no valid move, return original parent to snap back    
    }

    attemptMove(targetEl) {
        if (!targetEl) return;

        const sourceEl = this.draggedCard.element.parentElement;
        const destEl = targetEl.closest('.cell, .foundation, .column') || targetEl.parentElement?.closest('.cell, .foundation, .column');

        if (!destEl || sourceEl === destEl) return;

        const destPile = this.getPileForElement(destEl);
        if (!destPile) return;

        if (this.isValidMove(this.draggedCard, this.draggedStack, destPile)) {
            //FUTURE this.saveHistory();
            this.moveCard(sourceEl, destEl, this.draggedCard.id);
            this.render();
            if (this.checkWin()) alert('You win!');
        }
    }

    // Model based move validation using (Card, Card[], and pile())
    isValidMove(movingCard, movingStack, destPile) {
        if (!destPile) return false;

        if (destPile.type === 'cell') {
            if (movingStack.length > 1) return false; // Can't move multiple cards to a free cell
            return destPile.arr.length === 0; // Can only place on empty free cell
        }

        if (destPile.type === 'foundation') {
            if (movingStack.length > 1) return false; // Can't move multiple cards to a foundation
            if (destPile.arr.length === 0) return movingCard.rank === 'A'; // Only Aces can go on empty foundation
            const topCard = destPile.arr[destPile.arr.length - 1];
            return topCard.suit === movingCard.suit && topCard.value === movingCard.value - 1; //Must be same suit and one rank lower.
        }

        if (destPile.type === 'column') {
            if (destPile.arr.length === 0) {
                const freeCellsAvailable = this.freeCells.filter(c => c.length === 0).length;
                const emptyColumnsAvailable = this.tableau.filter(col => col.length === 0).length - 1; // Exclude the destination column since it can't be used.
                return movingStack.length <= (2 ** emptyColumnsAvailable) * (freeCellsAvailable + 1);
            }
            const topCard = destPile.arr[destPile.arr.length - 1];
            return topCard.color !== movingCard.color && topCard.value === movingCard.value + 1; // Must be opposite color and one rank higher
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

            const movingValue = movingCard.value;
            const movingColor = movingCard.color;

            if (movingValue === 1 || movingValue === 2) { // Ace or 2 can always move to foundation without additional check.
                for (let j = 0; j < 4; j++) {
                    const foundationEl = document.getElementById(`found${j + 1}`);
                    if (this.isValidMove(movingCard, [movingCard], this.getPileForElement(foundationEl))) {
                        this.moveCard(containerEl, foundationEl, movingCard.id);
                        this.render();
                        return;
                    }
                }
            } else {
                let foundationTargetEl = null;
                for (let j = 0; j < 4; j++) {
                    const foundationEl = document.getElementById(`found${j + 1}`);
                    if (this.isValidMove(movingCard, [movingCard], this.getPileForElement(foundationEl))) {
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
                    return;
                }
            }
        }
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