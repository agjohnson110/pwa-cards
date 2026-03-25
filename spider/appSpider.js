// Spider Solitaire

const VERSION = '0.2.0';

const DEBUG = true;
function log(...args) {
    if (DEBUG) console.log(...args);
}

class SpiderGame {
    constructor() {
        // ─── Game state ───────────────────────────────────────────────────────
        this.deck        = [];
        this.cardMap     = {};
        this.stock       = [[], [], [], [], []]; // 5
        this.foundations = [[], [], [], [], [], [], [], []]; // 8
        this.tableau     = [[], [], [], [], [], [], [], [], [], []]; // 10
        this.history     = [];
        this.moveCount   = 0;
        this.gameActive  = false;

        // ─── Shared: Storage ─────────────────────────────────────────────────
        this.settingsStorage = new StorageManager('spider-settings');
        this.statsStorage    = new StorageManager('spider-stats');

        // ─── Shared: Settings ────────────────────────────────────────────────
        this.settings = new SettingsManager(
            this.settingsStorage,
            {
                showScore:     true,
                showMoves:     true,
                showTime:      true,
                showNumberBar: true,
                showGrouping:  true,
                darkMode:      false,
                difficulty:    1,    // 1 = one suit, 2 = two suits, 4 = four suits
            },
            {
                darkMode:      'dark-mode',
                showScore:     'hide-score',
                showMoves:     'hide-moves',
                showTime:      'hide-time',
                showNumberBar: 'hide-number-bar',
            },
            () => this.updateSequenceOutlines() // onApply hook
        );

        // ─── Shared: Stats ───────────────────────────────────────────────────
        this.stats = new StatsManager(
            this.statsStorage,
            {
                gamesPlayed:   0,
                gamesWon:      0,
                bestMoves:     null,
                bestTime:      null,
                bestScore:     null,
                currentStreak: 0,
                bestStreak:    0,
                totalMoves:    0,
                totalTime:     0,
                totalScore:    0,
            }
        );

        // ─── Shared: Timer ───────────────────────────────────────────────────
        this.timer = new GameTimer(formatted => {
            document.getElementById('timer').textContent = `Time: ${formatted}`;
        });

        // ─── Shared: Column layout ───────────────────────────────────────────
        this.layout = new ColumnLayout({
            tableauId:    'tableau',
            columnPrefix: 'col',
            columnCount:  10,
        });

        // ─── Shared: Settings UI ─────────────────────────────────────────────
        this.settingsUI = new SettingsUI({
            version:  VERSION,
            settings: this.settings,
            stats:    this.stats,
            toggles: [
                { key: 'showScore',     label: 'Show Score'              },
                { key: 'showMoves',     label: 'Show Moves'              },
                { key: 'showTime',      label: 'Show Timer'              },
                { key: 'showNumberBar', label: 'Show Number Bar'         },
                { key: 'showGrouping',  label: 'Highlight Grouped Cards' },
                { key: 'darkMode',      label: 'Dark Mode'               },
            ],
            statFields: [
                { key: 'gamesPlayed',   label: 'Games Played',   isTime: false },
                { key: 'gamesWon',      label: 'Games Won',      isTime: false },
                { key: 'bestMoves',     label: 'Best Moves',     isTime: false },
                { key: 'totalMoves',    label: 'Total Moves',    isTime: false },
                { key: 'bestTime',      label: 'Best Time',      isTime: true  },
                { key: 'totalTime',     label: 'Total Time',     isTime: true  },
                { key: 'bestScore',     label: 'Best Score',     isTime: false },
                { key: 'totalScore',    label: 'Total Score',    isTime: false },
                { key: 'bestStreak',    label: 'Best Streak',    isTime: false },
                { key: 'currentStreak', label: 'Current Streak', isTime: false },
            ],
            rulesHTML: `
                <h3>Objective</h3>
                <p>Build 8 complete sequences of cards from King down to Ace in the same suit. Each completed sequence is removed from the tableau.</p>
                <h3>Tableau</h3>
                <p>Cards are dealt into 10 columns. You can move a card onto any card that is one rank higher. You can only move a sequence of cards together if they are all the same suit.</p>
                <h3>Stock</h3>
                <p>When you run out of moves, click the stock to deal one card face-up onto each column.</p>
                <h3>Difficulty</h3>
                <p>One suit: All cards are spades — easiest.<br>
                   Two suits: Cards are spades and hearts.<br>
                   Four suits: All four suits — hardest.</p>
            `,
            onNewGame: () => {
                this.settingsNewGame();
            },
            onRestart: () => {
                this.settingsRestartGame();
            },
        });

        // ─── Shared: Drag handler ────────────────────────────────────────────
        this.dragHandler = new DragHandler({
            getCardFromElement: el => el?.cardRef || null,
            getPileForElement:  el => this.getPileForElement(el),
            canPickUp: (card, stack) => {
                // Keep game state in sync so preMoveCheckFailed() can read it
                this.draggedCard  = card;
                this.draggedStack = stack;
                return !this.preMoveCheckFailed();
            },
            findBestTarget: () => this.findBestTarget(),
            onDrop:   (targetEl, isDrag) => this.attemptMove(targetEl, isDrag),
            onResize: () => this.layout.adjust(),
        });

        // ─── Init ────────────────────────────────────────────────────────────
        this.settings.apply();
        this.addEventListeners();
        this.registerServiceWorker();
        this.startGame();
    }

    // ─── Game Lifecycle ───────────────────────────────────────────────────────

    startGame() {
        this.gameActive = true;
        this.moveCount  = 0;
        this.updateMovesAndScore();
        //this.stats.recordStart(); //probably not needed
        this.timer.start();

        document.getElementById('win-message').style.display         = 'none';
        document.getElementById('win-stats').style.display           = 'none';
        document.getElementById('middle-btn-new-game').style.display = 'none';

        // ─── Game state reset ───────────────────────────────────────────────────────
        this.deck        = [];
        this.cardMap     = {};
        this.stock       = [[], [], [], [], []]; // 5
        this.foundations = [[], [], [], [], [], [], [], []]; // 8
        this.tableau     = [[], [], [], [], [], [], [], [], [], []]; // 10
        this.history     = [];
        this.createDeck();
        this.shuffleDeck();
        this.dealCards();
        this.renderDOM();
        log('Spider game started');
    }

    settingsNewGame() {
        if (this.gameActive) this.stats.recordAbandoned();
        this.startGame();
    }

    settingsRestartGame() {
        // TODO just set board state to beginning - need history
    }

    checkWin() {
        return this.foundations.every(f => f.length === 13);
    }

    showWinState() {
        this.gameActive = false;
        const timeSecs   = this.timer.getElapsed();
        const finalScore = Math.max(0, 500 - this.moveCount);

        this.timer.stop();

        const flags = this.stats.recordWin({
            moves:    this.moveCount,
            timeSecs: timeSecs,
            score:    finalScore,
        });

        const s = this.stats.get();

        const row = (label, thisVal, bestVal, isBest) => `
            <tr>
                <td class="win-stat-label">${label}</td>
                <td class="win-stat-this">${thisVal}</td>
                <td class="win-stat-best ${isBest ? 'is-best' : ''}">${bestVal}${isBest ? ' ★' : ''}</td>
            </tr>`;

        document.getElementById('win-stats').innerHTML = `
            <table>
                <tr>
                    <td class="win-stat-label"></td>
                    <td class="win-stat-this"><u>This Game</u></td>
                    <td class="win-stat-best"><u>Best</u></td>
                </tr>
                ${row('Time',   GameTimer.format(timeSecs), GameTimer.format(s.bestTime), flags.isNewBestTime)}
                ${row('Score',  finalScore,        s.bestScore,     flags.isNewBestScore)}
                ${row('Moves',  this.moveCount,    s.bestMoves,     flags.isNewBestMoves)}
                ${row('Streak', s.currentStreak,   s.bestStreak,    flags.isNewBestStreak)}
            </table>`;

        document.getElementById('win-message').style.display         = 'block';
        document.getElementById('win-stats').style.display           = 'block';
        document.getElementById('middle-btn-new-game').style.display = 'flex';
    }

    // ─── Deck ─────────────────────────────────────────────────────────────────

    createDeck() {
        const suit = 'spades'; //currently just easy mode
        for (let index = 0; index < 8; index++) {
            for (const rank of Card.RANKS) {
                const card = new Card(suit, rank, index);
                this.deck.push(card);
                this.cardMap[card.id] = card;
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

    dealCards() {
        // to tableau
        for (let col = 0; col < 10; col++) {
            const numCards = col < 4 ? 6 : 5;
            for (let i = 0; i < numCards; i++) {
                this.tableau[col].push(this.deck.pop());
            }
        }

        // to stock
        for (let stockNum = 0; stockNum < 5; stockNum++) {
            for (let stockCount = 0; stockCount < 10; stockCount++) {
                this.stock[stockNum].push(this.deck.pop());
            }
        }

        this.deck = [];
    }

    // ─── Rendering ────────────────────────────────────────────────────────────

    // Pure DOM sync — does not trigger auto-moves.
    renderDOM() {
        for (let i = 0; i < 5; i++) {
            const stock = document.getElementById(`stock${i + 1}`);
            stock.innerHTML = '';
            for (const card of this.stock[i]) stock.appendChild(card.element);
        }
        for (let i = 0; i < 8; i++) {
            const found = document.getElementById(`found${i + 1}`);
            found.innerHTML = '';
            for (const card of this.foundations[i]) found.appendChild(card.element);
        }
        for (let i = 0; i < 10; i++) {
            const col = document.getElementById(`col${i + 1}`);
            col.innerHTML = '';
            for (const card of this.tableau[i]) col.appendChild(card.element);
        }

        this.updateSequenceOutlines();

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                this.layout.adjust();
            });
        });
        log('renderDOM()');
    }

    // Full render: syncs DOM then runs animated auto-moves.
    render() {
        this.renderDOM();
        this.runAutoMoves();
    }

    // Animation
    animateCards(cardEls, fromRects) {
        CardAnimator.animateCards(cardEls, fromRects);
        log('animateCards()');
    }

    // ─── Card Movement and Logic ──────────────────────────────────────────────────────────────

    // Returns { type, index, arr } for a pile container element.
    // Reads data-pile-type and data-pile-index attributes set in HTML.
    // Kept separate from CSS classes since classes are for styling and may change.
    getPileForElement(containerEl) {
        if (!containerEl) return null;
        const type  = containerEl.dataset.pileType; // dataset.pileType comes from data-pile-type in html. Separate from class since class is used for styling and may have multiple values, while data-pile-type is strictly for identifying the type of pile.
        const index = parseInt(containerEl.dataset.pileIndex, 10);
        if (isNaN(index) || !type) return null; // element isn't a pile container
        switch (type) {
            case 'stock':      return { type, index, arr: this.stock[index] }; //property name can automatch variable name (type: type)
            case 'foundation': return { type, index, arr: this.foundations[index] };
            case 'column':     return { type, index, arr: this.tableau[index] };
            default:           return null;
        }
    }

    // Don't start moving a card/stack that is trapped
    preMoveCheckFailed() {
        log('preMoveCheckFailed()');
        // Stock and foundation cards are never draggable
        const sourcePile = this.getPileForElement(this.draggedCard.element.parentElement);
        if (sourcePile?.type === 'stock') return true;
        if (sourcePile?.type === 'foundation') return true;

        for (let i = 0; i < this.draggedStack.length - 1; i++) {
            const curr = this.draggedStack[i];
            const next = this.draggedStack[i + 1];
            if (next.color !== curr.color)     return true; // different color — not a valid sequence
            if (next.value !== curr.value - 1) return true; // not descending — not a valid sequence
        }
        log('preMoveCheckFailed(): false - can be moved');
        return false;
    }

    // Finds the best destination for a tap move using model-based priority ordering.
    findBestTarget() {
        const card         = this.draggedCard;
        const cardParentEl = card.element.parentElement;

        const columnPiles = this.tableau.map((arr, i) => ({
            type: 'column', index: i, arr, el: document.getElementById(`col${i + 1}`)
        }));

        // non-empty columns first, empty second
        const hit =
            columnPiles.find(p => p.el !== cardParentEl && p.arr.length > 0  && this.isValidMove(card, p)) ||
            columnPiles.find(p => p.el !== cardParentEl && p.arr.length === 0 && this.isValidMove(card, p));
        return hit?.el || cardParentEl;
    }

    // Validates and executes a move, then renders and checks for win.
    // isDrag: true when the card was physically dragged (skip tap animation).
    attemptMove(targetEl, isDrag = false) {
        log('attemptMove()');
        if (!this.draggedCard || !targetEl) return;

        const sourceEl = this.draggedCard.element.parentElement;
        const sourcePile = this.getPileForElement(sourceEl);
        if (sourcePile?.type === 'stock') {
            this.draggedCard  = null;
            this.draggedStack = [];
            this.dealFromStock(sourceEl);
            return;
        }

        const destEl   = targetEl.closest('.column')
                      || targetEl.parentElement?.closest('.column');

        if (!destEl || sourceEl === destEl) {
            this.draggedCard  = null;
            this.draggedStack = [];
            return;
        }

        const destPile = this.getPileForElement(destEl);
        if (!destPile) {
            this.draggedCard  = null;
            this.draggedStack = [];
            return;
        }

        if (this.isValidMove(this.draggedCard, destPile)) {
            this.saveHistory();
            this.moveCount++;
            this.updateMovesAndScore();

            // Capture positions BEFORE render for tap animation
            const cardEls   = this.draggedStack.map(c => c.element);
            const fromRects = isDrag ? null : cardEls.map(el => el.getBoundingClientRect());

            this.moveCard(sourceEl, destEl, this.draggedCard.id);

            // Clear before render so undo guard is correct from this point on
            this.draggedCard  = null;
            this.draggedStack = [];

            this.render();

            if (!isDrag) CardAnimator.animateCards(cardEls, fromRects);

        } else {
            this.draggedCard  = null;
            this.draggedStack = [];
        }
    }

    // Pure model-based move validation.
    // movingCard: Card, movingStack: Card[], destPile: { type, index, arr }
    isValidMove(movingCard, destPile) {
        log('isValidMove() to ', destPile.type);
        if (!destPile) return false;

        if (destPile.type === 'column') {
            if (destPile.arr.length === 0) {
                log('isValidMove(): true - empty column');
                return true // empty is OK
            }
            const topCard = destPile.arr[destPile.arr.length - 1];
            log('isValidMove(): ', topCard.value, '=?', movingCard.value + 1);
            return topCard.value === movingCard.value + 1; // must be one rank higher
        }
        log('isValidMove(): false - default')
        return false;
    }

    // Moves Card(s) in the model arrays. DOM is updated separately via renderDOM().
    moveCard(sourceEl, destEl, cardId) {
        log('moveCard()');
        const sourcePile = this.getPileForElement(sourceEl);
        const destPile   = this.getPileForElement(destEl);
        if (!sourcePile || !destPile) return;

        const startIdx = sourcePile.arr.findIndex(c => c.id === cardId);
        if (startIdx === -1) return;

        // Columns can move a stack
        const moving = sourcePile.arr.splice(startIdx);
        destPile.arr.push(...moving);
    }

    // ─── Auto-move ────────────────────────────────────────────────────────────

    findNextAutoMove() {
        for (let i = 0; i < 10; i++) {
            const col = this.tableau[i];
            if (col.length < 13) continue;

            // Check if the bottom 13 cards form a complete K→A same-suit sequence
            const seq = col.slice(-13); // last 13 cards
            const suit = seq[0].suit;

            const isComplete =
                seq[0].value === 13 && // starts with King
                seq.every(c => c.suit === suit) && // all same suit
                seq.every((c, j) => j === 0 || c.value === seq[j - 1].value - 1); // descending

            if (!isComplete) continue;

            // Find an empty foundation
            const foundationIndex = this.foundations.findIndex(f => f.length === 0);
            if (foundationIndex === -1) continue; // no empty foundation available

            const foundationEl = document.getElementById(`found${foundationIndex + 1}`);
            return { colIndex: i, seq, foundationEl };
        }
        return null;
    }

    runAutoMoves() {
        let next = this.findNextAutoMove();
        while (next) {
            const { colIndex, seq, foundationEl } = next;
            const colEl = document.getElementById(`col${colIndex + 1}`);

            // Capture positions BEFORE the move for animation
            const cardEls  = seq.map(c => c.element);
            const fromRects = cardEls.map(el => el.getBoundingClientRect());

            // Move all 13 cards to the foundation in the model
            this.tableau[colIndex].splice(-13);
            const foundationPile = this.getPileForElement(foundationEl);
            foundationPile.arr.push(...seq);

            this.renderDOM();

            // Animate each card to the foundation
            const toRects = cardEls.map(el => el.getBoundingClientRect());
            cardEls.forEach((el, i) => {
                CardAnimator.animateSingleCard(el, fromRects[i], toRects[i]);
            });

            next = this.findNextAutoMove();
        }

        // Check win after all auto-moves are complete
        if (this.checkWin()) this.showWinState();
    }

    // stock move
    dealFromStock(stockEl) {
        const stockPile = this.getPileForElement(stockEl);
        if (!stockPile || stockPile.type !== 'stock') return;
        if (stockPile.arr.length === 0) return;

        // Rule: all 10 columns must have at least one card before dealing
        //if (this.tableau.some(col => col.length === 0)) return;

        // Save history once for the entire deal — undo puts all 10 cards back at once
        this.saveHistoryForDeal(stockPile.index);

        this.moveCount++;
        this.updateMovesAndScore();

        // Capture all card positions before the deal for animation
        const cardEls   = stockPile.arr.map(c => c.element);
        const fromRects = cardEls.map(el => el.getBoundingClientRect());

        // Deal one card from this stock to each tableau column
        for (let i = 0; i < 10; i++) {
            const card = stockPile.arr.pop();
            this.tableau[i].push(card);
        }

        this.render();
        CardAnimator.animateCards(cardEls, fromRects);
    }

    // ─── Event Listeners ──────────────────────────────────────────────────────

    addEventListeners() {
        this.dragHandler.attach();

        document.getElementById('multi-stock').addEventListener('click', e => {
            const stockEl = e.target.closest('.stock');
            if (!stockEl) return;
            this.dealFromStock(stockEl);
        });

        document.addEventListener('click', e => {
            const button = e.target.closest('.top-button');
            if (!button) return;
            switch (button.dataset.action) {
                case 'undo':     this.undo();             break;
                case 'settings': this.settingsUI.open();  break;
            }
        });

        document.getElementById('middle-btn-new-game').addEventListener('click', () => {
            this.startGame();
        });

        // Number bar highlight
        const numBar = document.querySelector('.number-bar');

        numBar.addEventListener('touchstart', e => {
            const num = e.target.closest('.num');
            if (!num) return;
            e.preventDefault(); // prevent the touch from also firing a click
            this.highlightCards(num.dataset.value);
        }, { passive: false });

        numBar.addEventListener('touchend', () => this.clearHighlight());

        numBar.addEventListener('pointerdown', e => {
            if (e.pointerType === 'touch') return;
            const num = e.target.closest('.num');
            if (!num) return;
            this.highlightCards(num.dataset.value);
        });

        numBar.addEventListener('pointerup',    e => { if (e.pointerType !== 'touch') this.clearHighlight(); });
        numBar.addEventListener('pointerleave', e => { if (e.pointerType !== 'touch') this.clearHighlight(); });
    }

    // ─── Card Highlight and Sequence ───────────────────────────────────────────────────────

    highlightCards(value) {
        document.querySelectorAll('.card').forEach(el => {
            const card = el?.cardRef || null;
            if (!card) return;
            const matches = card.rank === value;
            el.classList.toggle('highlighted', matches);
            el.classList.toggle('dimmed',      !matches);
        });
    }

    clearHighlight() {
        document.querySelectorAll('.card').forEach(el => el.classList.remove('highlighted', 'dimmed'));
    }

    updateSequenceOutlines() {
        document.querySelectorAll('.card.seq-top, .card.seq-mid, .card.seq-bot')
            .forEach(el => el.classList.remove('seq-top', 'seq-mid', 'seq-bot'));

        if (!this.settings.get('showGrouping')) return;

        for (let i = 0; i < 10; i++) {
            const col = this.tableau[i];
            if (col.length === 0) continue;

            // Find all sequence boundaries in this column.
            // A sequence break occurs when the next card is NOT the correct same color
            // and descending rank from the current card.
            const breaksBefore = new Set(); // indices where a new sequence starts
            breaksBefore.add(0);            // first card always starts a sequence

            for (let j = 0; j < col.length - 1; j++) {
                const curr = col[j];
                const next = col[j + 1];
                const isSequence = next.color === curr.color && next.value === curr.value - 1;
                if (!isSequence) breaksBefore.add(j + 1);
            }

            // Now assign classes based on where sequences start and end
            for (let j = 0; j < col.length; j++) {
                const isStart = breaksBefore.has(j);
                const isEnd   = breaksBefore.has(j + 1) || j === col.length - 1;

                let cls;
                if      ( isStart &&  isEnd) cls = null;
                else if ( isStart && !isEnd) cls = 'seq-top';
                else if (!isStart &&  isEnd) cls = 'seq-bot';
                else                         cls = 'seq-mid';

                if (cls) col[j].element.classList.add(cls);
            }
        }
    }

    // ─── History / Undo ───────────────────────────────────────────────────────

    saveHistory() {
        log('saveHistory()');
        this.history.push({
            stock:       this.stock.map(stock => [...stock]),
            foundations: this.foundations.map(f    => [...f]),
            tableau:     this.tableau.map(col      => [...col]),
            movedIds:    this.draggedStack.map(c   => c.id),
        });

        // 5000 entries ≈ ~5MB max. Far exceeds any realistic game length (52 cards),
        // while guarding against degenerate cases.
        if (this.history.length > 5000) this.history.shift();
    }

    saveHistoryForDeal(stockIndex) {
        const movedIds = this.stock[stockIndex].map(c => c.id);
        this.history.push({
            stock:       this.stock.map(s => [...s]),
            foundations: this.foundations.map(f => [...f]),
            tableau:     this.tableau.map(col => [...col]),
            movedIds,
        });
        if (this.history.length > 5000) this.history.shift();
    }

    undo() {
        log('undo()');
        if (this.draggedCard || this.history.length === 0) return;

        const entry = this.history.pop();

        // Find cards that were auto-moved to foundations after the last player move.
        // These are cards present in the current foundations but absent in the snapshot.
        const autoMovedIds = [];
        for (let i = 0; i < 8; i++) {
            const savedLen   = entry.foundations[i].length;
            const currentLen = this.foundations[i].length;
            for (let j = savedLen; j < currentLen; j++) {
                autoMovedIds.push(this.foundations[i][j].id);
            }
        }

        // Animate both the manually moved cards and any auto-moved cards
        const allMovedIds = [...new Set([...entry.movedIds, ...autoMovedIds])];
        const cardEls     = allMovedIds.map(id => this.cardMap[id].element);
        const fromRects   = cardEls.map(el => el.getBoundingClientRect());

        // Restore model
        this.stock       = entry.stock;
        this.foundations = entry.foundations;
        this.tableau     = entry.tableau;

        // Sync DOM to restored state WITHOUT triggering new auto-moves
        this.renderDOM();
        CardAnimator.animateCards(cardEls, fromRects);
    }

    // ─── Score / Moves ────────────────────────────────────────────────────────

    updateMovesAndScore() {
        log('updateMovesAndScore()');
        document.getElementById('moves').textContent = `Moves: ${this.moveCount}`;
        if (this.settings.get('showScore')) {
            // Spider scoring: 500 - (moveCount * 1) as a simple placeholder
            // TODO: replace with proper Spider scoring formula
            const score = Math.max(0, 500 - this.moveCount);
            document.getElementById('score').textContent = `Score: ${score}`;
        }
    }

    // ─── Service Worker ───────────────────────────────────────────────────────

    registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js')
                .then(() => console.log('SW registered'))
                .catch(() => console.log('SW registration failed'));
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new SpiderGame();
});
