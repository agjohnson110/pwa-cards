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
        const map = { 'hearts': '\u2665', 'diamonds': '\u2666', 'clubs': '\u2663', 'spades': '\u2660' };
        return map[this.suit] || this.suit[0].toUpperCase();
    }

    createElement() {
        const el = document.createElement('div');
        el.className = `card ${this.color}`;
        el.dataset.suit = this.suit;
        el.dataset.rank = this.rank;
        el.dataset.value = this.value;
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

    createDeck() {
        const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
        const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
        for (let suit of suits) {
            for (let rank of ranks) {
                this.deck.push(new Card(suit, rank));
            }
        }
    }

    shuffleDeck() {
        for (let i = this.deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
        }
    }

    dealCards() {
        // Pop cards off the shuffled deck into tableau columns so the
        // deck no longer holds references to dealt cards.
        for (let col = 0; col < 8; col++) {
            const numCards = col < 4 ? 7 : 6;
            for (let i = 0; i < numCards; i++) {
                const card = this.deck.pop();
                this.tableau[col].push(card);
            }
        }
        // Clear any remaining references in the deck
        this.deck = [];
    }

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
        document.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
        document.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
        document.addEventListener('touchend', this.handleTouchEnd.bind(this), { passive: false });

        document.getElementById('new-game').addEventListener('click', () => {
            this.resetGame();
        });
    }

    handleTouchStart(e) {
        const touch = e.touches[0];
        this.touchStartX = touch.clientX;
        this.touchStartY = touch.clientY;
        const target = document.elementFromPoint(touch.clientX, touch.clientY);
        if (target.classList.contains('card')) {
            this.draggedCard = target;
            this.draggedCard.classList.add('dragging');
            // Find the stack
            const parent = target.parentElement;
            const cards = Array.from(parent.children);
            const index = cards.indexOf(target);
            this.draggedStack = cards.slice(index);
        }
    }

    handleTouchMove(e) {
        e.preventDefault();
        if (this.draggedCard) {
            const touch = e.touches[0];
            const deltaX = touch.clientX - this.touchStartX;
            const deltaY = touch.clientY - this.touchStartY;
            this.draggedCard.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
        }
    }

    handleTouchEnd(e) {
        if (this.draggedCard) {
            this.draggedCard.classList.remove('dragging');
            this.draggedCard.style.transform = '';
            const touch = e.changedTouches[0];
            const target = document.elementFromPoint(touch.clientX, touch.clientY);
            this.attemptMove(target);
            this.draggedCard = null;
            this.draggedStack = [];
        }
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
            value: parseInt(this.draggedCard.dataset.value)
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
        // Implement Freecell move rules
        // This is simplified; full rules would check sequences, etc.
        if (dest.classList.contains('cell')) {
            return dest.children.length === 0;
        } else if (dest.classList.contains('foundation')) {
            const suitIndex = ['hearts', 'diamonds', 'clubs', 'spades'].indexOf(cardData.suit);
            const foundation = this.foundations[suitIndex];
            if (foundation.length === 0) {
                return cardData.rank === 'A';
            } else {
                const topCard = foundation[foundation.length - 1];
                return topCard.value + 1 === cardData.value;
            }
        } else if (dest.classList.contains('column')) {
            if (dest.children.length === 0) {
                return true; // Can place any card on empty column
            } else {
                const topCardEl = dest.lastElementChild;
                const topCardData = {
                    suit: topCardEl.dataset.suit,
                    color: topCardEl.classList.contains('red') ? 'red' : 'black',
                    value: parseInt(topCardEl.dataset.value)
                };
                return topCardData.color !== cardData.color && topCardData.value === cardData.value + 1;
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