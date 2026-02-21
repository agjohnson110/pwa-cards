// Freecell Game Logic

class Card {
    constructor(suit, rank) {
        this.suit = suit;
        this.rank = rank;
        this.value = this.getValue(rank);
        this.color = (suit === 'hearts' || suit === 'diamonds') ? 'red' : 'black';
        this.id = `${suit}-${rank}`;
        this.element = null;
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

        this.element = el;
        return el;
    }
}

class FreecellGame {
    constructor() {
        this.deck = [];
        this.freeCells = [[], [], [], []];
        this.foundations = [[], [], [], []];
        this.tableau = [[], [], [], [], [], [], [], []];
        this.draggedCard = null;
        this.draggedStack = [];
        this.touchStartX = 0;
        this.touchStartY = 0;
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

    // Render the game state, using createElement() to display the cards objects in each location.
    render() {
        // Render free cells
        for (let i = 0; i < 4; i++) {
            const cell = document.getElementById(`free${i+1}`);
            cell.innerHTML = '';
            if (this.freeCells[i].length > 0) {
                cell.appendChild(this.freeCells[i][0].createElement());
            }
        }

        // Render foundations
        for (let i = 0; i < 4; i++) {
            const found = document.getElementById(`found${i+1}`);
            found.innerHTML = '';
            if (this.foundations[i].length > 0) {
                found.appendChild(this.foundations[i][this.foundations[i].length - 1].createElement());
            }
        }

        // Render tableau
        for (let i = 0; i < 8; i++) {
            const col = document.getElementById(`col${i+1}`);
            col.innerHTML = '';
            for (let card of this.tableau[i]) {
                col.appendChild(card.createElement());
            }
        }
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

        document.getElementById('new-game').addEventListener('click', () => {
            this.resetGame();
        });
    }

    // Touch event handlers for iOS
    handleTouchStart(e) {
        const touch = e.touches[0]; // Get the first (primary) touch point
        this.touchStartX = touch.clientX; 
        this.touchStartY = touch.clientY;
        const target = document.elementFromPoint(touch.clientX, touch.clientY); //Finds which DOM element is at that touch coordinates
        if (target && target.classList.contains('card')) {
            this.draggedCard = target; // Store the card being dragged
            // Find the stack
            const parent = target.parentElement; // Get the container (column, foundation, etc.)
            const cards = Array.from(parent.children); // Convert child cards to an array
            const index = cards.indexOf(target); // Find the position of the touched card
            this.draggedStack = cards.slice(index); // Get all cards from here to the end
            if (this.preMoveCheckFailed(target)) { // Check if card is trapped by other cards and if there are enough free cells to move the stack
                this.draggedCard = null;
                this.draggedStack = [];
                return;
            }
            // Add dragging class to all cards in the stack
            this.draggedStack.forEach(card => {
                card.classList.add('dragging'); // makes cards transparent while dragging
            });
        }
    }

    handleTouchMove(e) {
        e.preventDefault();
        if (this.draggedCard) {
            const touch = e.touches[0]; // Get the current touch position
            const deltaX = touch.clientX - this.touchStartX; // Calculate how far the touch has moved from the start
            const deltaY = touch.clientY - this.touchStartY;
            // Move all cards in the dragged stack
            this.draggedStack.forEach(card => {
                card.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
            });
        }
    }

    handleTouchEnd(e) {
        if (this.draggedCard) {
            // Reset all cards in the dragged stack
            this.draggedStack.forEach(card => {
                card.classList.remove('dragging'); // Remove the semi-transparent effect
                card.style.transform = ''; // Reset position
            });
            const touch = e.changedTouches[0]; // Get the final touch position (where finger left screen)
            const target = document.elementFromPoint(touch.clientX, touch.clientY);
            this.attemptMove(target); // Check if the move is valid and execute it
            this.draggedCard = null; // Cleanup for next drag
            this.draggedStack = []; // Cleanup for next drag
        }
    }

    // Pointer (mouse + touch unified) handlers so desktop dragging works
    handlePointerDown(e) {
        // Only handle primary button / primary touch
        if (e.isPrimary === false) return;
        e.preventDefault();
        this.touchStartX = e.clientX;
        this.touchStartY = e.clientY;
        const target = document.elementFromPoint(e.clientX, e.clientY); //Finds which DOM element is at that touch coordinates
        if (target && target.classList.contains('card')) {
            this.draggedCard = target; // Store the card being dragged
            const parent = target.parentElement; // Get the container (column, foundation, etc.)
            const cards = Array.from(parent.children); // Convert child cards to an array
            const index = cards.indexOf(target); // Find the position of the touched card
            this.draggedStack = cards.slice(index); // Get all cards from here to the end
            if (this.preMoveCheckFailed(target)) { // Check if card is trapped by other cards and if there are enough free cells to move the stack
                this.draggedCard = null;
                this.draggedStack = [];
                return;
            }
            // Add dragging class to all cards in the stack
            this.draggedStack.forEach(card => {
                card.classList.add('dragging'); // makes cards transparent while dragging
            });
            try { target.setPointerCapture && target.setPointerCapture(e.pointerId); } catch (err) {}
        }
    }

    handlePointerMove(e) {
        if (!this.draggedCard) return;
        e.preventDefault(); // Prevent scrolling while dragging
        const deltaX = e.clientX - this.touchStartX; // Calculate how far the touch has moved from the start
        const deltaY = e.clientY - this.touchStartY;
        // Move all cards in the dragged stack
        this.draggedStack.forEach(card => {
            card.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
        });
    }

    handlePointerUp(e) {
        if (!this.draggedCard) return;
        // Reset all cards in the dragged stack
        this.draggedStack.forEach(card => {
            card.classList.remove('dragging'); // Remove the semi-transparent effect
            card.style.transform = ''; // Reset position to snap back if not moved to a valid spot
        });
        const target = document.elementFromPoint(e.clientX, e.clientY);  //Finds which DOM element is at the release coordinates
        this.attemptMove(target); // Check if the move is valid and execute it
        try { this.draggedCard.releasePointerCapture && this.draggedCard.releasePointerCapture(e.pointerId); } catch (err) {}
        this.draggedCard = null; // Cleanup for next drag
        this.draggedStack = []; // Cleanup for next drag
    }

    // return true if card is trapped by other cards or if there are not enough free cells to move the stack
    preMoveCheckFailed(target) {
        // Check stack order
        for (let i=0; i < this.draggedStack.length - 1; i++) {
            const currCard = this.draggedStack[i];
            const nextCard = this.draggedStack[i+1];
            if (nextCard.dataset.color === currCard.dataset.color) {
                return true; // If adjacent cards are the same color, target is trapped
            }
            if (parseInt(nextCard.dataset.value) !== parseInt(currCard.dataset.value) - 1) {
                return true; // If adjacent cards are not in descending order, target is trapped
            }
        }

        // Check stack size vs free cells
        const freeCellsAvailable = this.freeCells.filter(cell => cell.length === 0).length;
        const emptyColumnsAvailable = this.tableau.filter(col => col.length === 0).length;
        if (this.draggedStack.length > (2 ** emptyColumnsAvailable) * (freeCellsAvailable + 1)) {
            return true; // This rule applies to moving stacks to a non-empty column. Moving to an empty column is more restrictive and checked during the attemptMove.
        }
        return false;
    }

    attemptMove(target) {
        // Determine source and destination
        const source = this.draggedCard.parentElement;
        const dest = target.closest('.cell, .foundation, .column') || target.parentElement.closest('.cell, .foundation, .column');

        if (!dest || source === dest) return;

        // Get card data
        const cardData = {
            suit: this.draggedCard.dataset.suit,
            rank: this.draggedCard.dataset.rank,
            value: parseInt(this.draggedCard.dataset.value),
            color: this.draggedCard.dataset.color
        };

        // Check if move is valid using the same card info as before
        if (this.isValidMove(source, dest, cardData)) {
            const cardId = this.draggedCard.dataset.cardId;
            this.moveCard(source, dest, cardId);
            this.render();
            if (this.checkWin()) {
                alert('You win!');
            }
        }
    }

    isValidMove(source, dest, cardData) {
        //return true; //DEBUG
        // Implement Freecell move rules
        if (dest.classList.contains('cell')) {
            if (this.draggedStack.length > 1) return false; // Can't move multiple cards to a free cell
            return dest.children.length === 0; // Can only place on empty free cell
        } else if (dest.classList.contains('foundation')) {
            if (this.draggedStack.length > 1) return false; // Can't move multiple cards to a foundation
            if (dest.children.length === 0) {
                return cardData.rank === 'A'; // Only Aces can go on empty foundation
            } else {
                const topCardEl = dest.lastElementChild;
                if (topCardEl.dataset.suit !== cardData.suit) return false; // Must be same suit as top foundation card
                return topCardEl.dataset.value === String(cardData.value - 1); // Must be one rank lower than top foundation card
            }
        } else if (dest.classList.contains('column')) {
            if (dest.children.length === 0) {
                // preMoveCheck assumes moving to non-empty column, so we need to check empty column move validity here.
                const freeCellsAvailable = this.freeCells.filter(cell => cell.length === 0).length;
                const emptyColumnsAvailable = this.tableau.filter(col => col.length === 0).length - 1; // Exclude the destination column since it can't be used.
                if (this.draggedStack.length > (2 ** emptyColumnsAvailable) * (freeCellsAvailable + 1)) {
                    return false;
                }
                return true; // Can place any card on empty column
            } else {
                const topCardEl = dest.lastElementChild;
                return topCardEl.dataset.color !== cardData.color && topCardEl.dataset.value === String(cardData.value + 1); // Must be opposite color and one rank higher                
            }
        }
        return false;
    }

    moveCard(source, dest, cardId) {
        // Move the actual Card instance(s) from source arrays to destination arrays
        // Find and remove from the correct source array
        if (source.classList.contains('cell')) {
            const index = ['free1', 'free2', 'free3', 'free4'].indexOf(source.id);
            const arr = this.freeCells[index];
            const i = arr.findIndex(c => c.id === cardId);
            if (i === -1) return;
            const card = arr.splice(i, 1)[0];
            const destIndex = ['free1', 'free2', 'free3', 'free4'].indexOf(dest.id);
            if (dest.classList.contains('cell')) {
                this.freeCells[destIndex].push(card);
            } else if (dest.classList.contains('foundation')) {
                const fIndex = ['found1', 'found2', 'found3', 'found4'].indexOf(dest.id);
                this.foundations[fIndex].push(card);
            } else if (dest.classList.contains('column')) {
                const tIndex = parseInt(dest.id.slice(3)) - 1;
                this.tableau[tIndex].push(card);
            }
            return;
        } else if (source.classList.contains('foundation')) {
            const index = ['found1', 'found2', 'found3', 'found4'].indexOf(source.id);
            const arr = this.foundations[index];
            const i = arr.findIndex(c => c.id === cardId);
            if (i === -1) return;
            const card = arr.splice(i, 1)[0];
            if (dest.classList.contains('cell')) {
                const destIndex = ['free1', 'free2', 'free3', 'free4'].indexOf(dest.id);
                this.freeCells[destIndex].push(card);
            } else if (dest.classList.contains('foundation')) {
                const fIndex = ['found1', 'found2', 'found3', 'found4'].indexOf(dest.id);
                this.foundations[fIndex].push(card);
            } else if (dest.classList.contains('column')) {
                const tIndex = parseInt(dest.id.slice(3)) - 1;
                this.tableau[tIndex].push(card);
            }
            return;
        } else if (source.classList.contains('column')) {
            const index = parseInt(source.id.slice(3)) - 1;
            const arr = this.tableau[index];
            const startIdx = arr.findIndex(c => c.id === cardId);
            if (startIdx === -1) return;
            // Remove the sequence from startIdx to end (support moving stacks)
            const moving = arr.splice(startIdx);
            if (dest.classList.contains('column')) {
                const destIndex = parseInt(dest.id.slice(3)) - 1;
                this.tableau[destIndex].push(...moving);
            } else if (dest.classList.contains('cell')) {
                const destIndex = ['free1', 'free2', 'free3', 'free4'].indexOf(dest.id);
                if (moving.length === 1) this.freeCells[destIndex].push(moving[0]);
            } else if (dest.classList.contains('foundation')) {
                const fIndex = ['found1', 'found2', 'found3', 'found4'].indexOf(dest.id);
                if (moving.length === 1) this.foundations[fIndex].push(moving[0]);
            }
            return;
        }
    }

    checkWin() {
        return this.foundations.every(f => f.length === 13);
    }

    resetGame() {
        this.deck = [];
        this.freeCells = [[], [], [], []];
        this.foundations = [[], [], [], []];
        this.tableau = [[], [], [], [], [], [], [], []];
        this.init();
    }

    registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js')
                .then(registration => console.log('SW registered'))
                .catch(error => console.log('SW registration failed'));
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new FreecellGame();
});