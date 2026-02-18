// Freecell Game Logic

class Card {
    constructor(suit, rank) {
        this.suit = suit;
        this.rank = rank;
        this.value = this.getValue(rank);
        this.color = (suit === 'hearts' || suit === 'diamonds') ? 'red' : 'black';
        this.element = null;
    }

    getValue(rank) {
        const values = { 'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13 };
        return values[rank];
    }

    createElement() {
        const el = document.createElement('div');
        el.className = `card ${this.color}`;
        el.textContent = `${this.rank}${this.suit[0].toUpperCase()}`;
        el.dataset.suit = this.suit;
        el.dataset.rank = this.rank;
        el.dataset.value = this.value;
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
        let cardIndex = 0;
        for (let col = 0; col < 8; col++) {
            const numCards = col < 4 ? 7 : 6;
            for (let i = 0; i < numCards; i++) {
                this.tableau[col].push(this.deck[cardIndex++]);
            }
        }
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

        // Check if move is valid
        if (this.isValidMove(source, dest, cardData)) {
            this.moveCard(source, dest, cardData);
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

    moveCard(source, dest, cardData) {
        // Remove from source
        if (source.classList.contains('cell')) {
            const index = ['free1', 'free2', 'free3', 'free4'].indexOf(source.id);
            this.freeCells[index].pop();
        } else if (source.classList.contains('foundation')) {
            const index = ['found1', 'found2', 'found3', 'found4'].indexOf(source.id);
            this.foundations[index].pop();
        } else if (source.classList.contains('column')) {
            const index = parseInt(source.id.slice(3)) - 1;
            this.tableau[index].pop();
        }

        // Add to dest
        const card = new Card(cardData.suit, cardData.rank);
        if (dest.classList.contains('cell')) {
            const index = ['free1', 'free2', 'free3', 'free4'].indexOf(dest.id);
            this.freeCells[index].push(card);
        } else if (dest.classList.contains('foundation')) {
            const index = ['found1', 'found2', 'found3', 'found4'].indexOf(dest.id);
            this.foundations[index].push(card);
        } else if (dest.classList.contains('column')) {
            const index = parseInt(dest.id.slice(3)) - 1;
            this.tableau[index].push(card);
        }
    }

    checkWin() {
        return this.foundations.every(f => f.length === 13);
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