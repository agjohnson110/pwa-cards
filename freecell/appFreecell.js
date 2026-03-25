// Freecell Game Logic

const VERSION = '0.6.1';

class FreecellGame {
    constructor() {
        // ─── Game state ───────────────────────────────────────────────────────
        this.deck        = [];
        this.cardMap     = {};
        this.freeCells   = [[], [], [], []];
        this.foundations = [[], [], [], []];
        this.tableau     = [[], [], [], [], [], [], [], []];
        this.history     = [];
        this.moveCount   = 0;
        this.gameActive  = false;

        // ─── Shared: Storage ─────────────────────────────────────────────────
        this.settingsStorage = new StorageManager('freecell-settings');
        this.statsStorage    = new StorageManager('freecell-stats');

        // ─── Shared: Settings ────────────────────────────────────────────────
        this.settings = new SettingsManager(
            this.settingsStorage,
            {
                showScore:     true,
                showMoves:     true,
                showTime:      true,
                autoMove:      true,
                showNumberBar: true,
                showGrouping:  true,
                darkMode:      false,
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
            columnCount:  8,
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
                { key: 'autoMove',      label: 'Auto-move to Foundation' },
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
                <p>Move all 52 cards to the four foundation piles. The game is won when all cards are on the foundations.</p>
                <h3>Foundations</h3>
                <p>The four foundation piles in the top left are built up by suit from Ace to King.</p>
                <h3>Free Cells</h3>
                <p>The four cells in the top right can each hold any one card temporarily.</p>
                <h3>Tableau</h3>
                <p>Cards placed on a column must be one rank lower and opposite in color to the card they're placed on.</p>
                <h3>Moves</h3>
                <p>You move cards one at a time. You may move a sequence of cards if you have enough free cells and empty columns.</p>
            `,
            onNewGame: () => {
                this.stats.recordAbandoned();
                this.resetGame();
            },
            onRestart: () => {
                this.stats.recordAbandoned();
                this.restartGame();
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
        this.init();
    }

    // ─── Init ─────────────────────────────────────────────────────────────────

    init() {
        document.getElementById('win-message').style.display          = 'none';
        document.getElementById('win-stats').style.display            = 'none';
        document.getElementById('middle-btn-new-game').style.display  = 'none';
        this.updateMovesAndScore();
        this.createDeck();
        this.shuffleDeck();
        this.dealCards();
        this.renderDOM();
        this.runAutoMoves();
        this.registerServiceWorker();
        this.stats.recordStart();
        this.timer.start();
    }

    // ─── Reset / Restart ──────────────────────────────────────────────────────

    restartGame() {
        if (this.history.length === 0) return;

        const initial    = this.history[0];
        this.freeCells   = initial.freeCells.map(cell => [...cell]);
        this.foundations = initial.foundations.map(f    => [...f]);
        this.tableau     = initial.tableau.map(col      => [...col]);
        this.history     = [];
        this.moveCount   = 0;

        this.timer.start();
        this.renderDOM();
        this.runAutoMoves();
        this.updateMovesAndScore();
    }

    resetGame() {
        this.timer.stop();
        this.deck        = [];
        this.cardMap     = {};
        this.freeCells   = [[], [], [], []];
        this.foundations = [[], [], [], []];
        this.tableau     = [[], [], [], [], [], [], [], []];
        this.draggedCard  = null;
        this.draggedStack = [];
        this.history     = [];
        this.moveCount   = 0;
        this.gameActive  = false;
        this.init();
    }

    checkWin() {
        return this.foundations.every(f => f.length === 13);
    }

    showWinState() {
        const timeSecs   = this.timer.getElapsed();
        const finalScore = 520 - this.moveCount;

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
        for (const suit of Card.SUITS) {
            for (const rank of Card.RANKS) {
                const card = new Card(suit, rank);
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
        for (let col = 0; col < 8; col++) {
            const numCards = col < 4 ? 7 : 6;
            for (let i = 0; i < numCards; i++) {
                this.tableau[col].push(this.deck.pop());
            }
        }
        this.deck = [];
    }

    // ─── Rendering ────────────────────────────────────────────────────────────

    // Pure DOM sync — does not trigger auto-moves.
    renderDOM() {
        for (let i = 0; i < 4; i++) {
            const cell = document.getElementById(`free${i + 1}`);
            cell.innerHTML = '';
            if (this.freeCells[i].length > 0) cell.appendChild(this.freeCells[i][0].element);
        }
        for (let i = 0; i < 4; i++) {
            const found = document.getElementById(`found${i + 1}`);
            found.innerHTML = '';
            for (const card of this.foundations[i]) found.appendChild(card.element);
        }
        for (let i = 0; i < 8; i++) {
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
    }

    // Full render: syncs DOM then runs animated auto-moves.
    render() {
        this.renderDOM();
        this.runAutoMoves();
    }

    // Animation
    animateCards(cardEls, fromRects) {
        CardAnimator.animateCards(cardEls, fromRects);
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
            case 'cell':       return { type, index, arr: this.freeCells[index] }; //property name can automatch variable name (type: type)
            case 'foundation': return { type, index, arr: this.foundations[index] };
            case 'column':     return { type, index, arr: this.tableau[index] };
            default:           return null;
        }
    }

    // Don't start moving a card/stack that is trapped
    preMoveCheckFailed() {
        for (let i = 0; i < this.draggedStack.length - 1; i++) {
            const curr = this.draggedStack[i];
            const next = this.draggedStack[i + 1];
            if (next.color === curr.color)     return true; // same color — not a valid sequence
            if (next.value !== curr.value - 1) return true; // not descending — not a valid sequence
        }
        const freeCellsAvailable    = this.freeCells.filter(c => c.length === 0).length;
        const emptyColumnsAvailable = this.tableau.filter(col => col.length === 0).length;
        return this.draggedStack.length > (2 ** emptyColumnsAvailable) * (freeCellsAvailable + 1);
    }

    // Finds the best destination for a tap move using model-based priority ordering.
    findBestTarget() {
        const card         = this.draggedCard;
        const stack        = this.draggedStack;
        const cardParentEl = card.element.parentElement;
        const currentPile  = this.getPileForElement(cardParentEl);

        const columnPiles = this.tableau.map((arr, i) => ({
            type: 'column', index: i, arr, el: document.getElementById(`col${i + 1}`)
        }));
        const cellPiles = this.freeCells.map((arr, i) => ({
            type: 'cell', index: i, arr, el: document.getElementById(`free${i + 1}`)
        }));
        const foundationPiles = this.foundations.map((arr, i) => ({
            type: 'foundation', index: i, arr, el: document.getElementById(`found${i + 1}`)
        }));

        if (stack.length > 1) {
            // Stacks can only go to columns: non-empty first, empty second
            const hit =
                columnPiles.find(p => p.el !== cardParentEl && p.arr.length > 0  && this.isValidMove(card, stack, p)) ||
                columnPiles.find(p => p.el !== cardParentEl && p.arr.length === 0 && this.isValidMove(card, stack, p));
            return hit?.el || cardParentEl;
        }

        // Single card: non-empty columns → free cells → empty columns → foundations
        const hit =
            columnPiles.find(p    => p.el !== cardParentEl && p.arr.length > 0  && this.isValidMove(card, stack, p)) ||
            cellPiles.find(p      => currentPile?.type !== 'cell'                && this.isValidMove(card, stack, p)) ||
            columnPiles.find(p    => p.el !== cardParentEl && p.arr.length === 0 && this.isValidMove(card, stack, p)) ||
            foundationPiles.find(p =>                                               this.isValidMove(card, stack, p));

        return hit?.el || cardParentEl;
    }

    // Validates and executes a move, then renders and checks for win.
    // isDrag: true when the card was physically dragged (skip tap animation).
    attemptMove(targetEl, isDrag = false) {
        if (!this.draggedCard || !targetEl) return;

        const sourceEl = this.draggedCard.element.parentElement;
        const destEl   = targetEl.closest('.cell, .foundation, .column')
                      || targetEl.parentElement?.closest('.cell, .foundation, .column');

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

        if (this.isValidMove(this.draggedCard, this.draggedStack, destPile)) {
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

            if (this.checkWin()) this.showWinState();
        } else {
            this.draggedCard  = null;
            this.draggedStack = [];
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

    // ─── Auto-move ────────────────────────────────────────────────────────────

    findNextAutoMove() {
        if (!this.settings.get('autoMove')) return null;

        const candidates = [
            ...this.tableau.map((arr, i)    => ({ arr, el: document.getElementById(`col${i + 1}`) })),
            ...this.freeCells.map((arr, i)  => ({ arr, el: document.getElementById(`free${i + 1}`) })),
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
            CardAnimator.animateSingleCard(card.element, fromRect, toRect);

            next = this.findNextAutoMove();
        }
    }

    // ─── Event Listeners ──────────────────────────────────────────────────────

    addEventListeners() {
        this.dragHandler.attach();

        document.addEventListener('click', e => {
            const button = e.target.closest('.top-button');
            if (!button) return;
            switch (button.dataset.action) {
                case 'undo':     this.undo();             break;
                case 'settings': this.settingsUI.open();  break;
            }
        });

        document.getElementById('middle-btn-new-game').addEventListener('click', () => {
            this.resetGame();
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
        const toHighlight = new Set();

        if (Card.SUITS.includes(value)) {
            const foundationPile  = this.foundations.find(f => f.length > 0 && f[0].suit === value);
            const foundationCount = foundationPile ? foundationPile.length : 0;
            const nextValues      = [foundationCount + 1, foundationCount + 2, foundationCount + 3]
                .filter(v => v <= 13);
            nextValues.forEach(v => {
                const card = Object.values(this.cardMap).find(c => c.suit === value && c.value === v);
                if (card) toHighlight.add(card.id);
            });
        }

        document.querySelectorAll('.card').forEach(el => {
            const card = el?.cardRef || null;
            if (!card) return;
            const matches = Card.SUITS.includes(value)
                ? toHighlight.has(card.id)
                : card.rank === value;
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

        for (let i = 0; i < 8; i++) {
            const col = this.tableau[i];
            if (col.length === 0) continue;

            // Find all sequence boundaries in this column.
            // A sequence break occurs when the next card is NOT the correct alternating color
            // and descending rank from the current card.
            const breaksBefore = new Set(); // indices where a new sequence starts
            breaksBefore.add(0);            // first card always starts a sequence

            for (let j = 0; j < col.length - 1; j++) {
                const curr = col[j];
                const next = col[j + 1];
                const isSequence = next.color !== curr.color && next.value === curr.value - 1;
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
        this.history.push({
            freeCells:   this.freeCells.map(cell => [...cell]),
            foundations: this.foundations.map(f    => [...f]),
            tableau:     this.tableau.map(col      => [...col]),
            movedIds:    this.draggedStack.map(c   => c.id),
        });

        // 5000 entries ≈ ~5MB max. Far exceeds any realistic game length (52 cards),
        // while guarding against degenerate cases.
        if (this.history.length > 5000) this.history.shift();
    }

    undo() {
        if (this.draggedCard || this.history.length === 0) return;

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
        const fromRects   = cardEls.map(el => el.getBoundingClientRect());

        // Restore model
        this.freeCells   = entry.freeCells;
        this.foundations = entry.foundations;
        this.tableau     = entry.tableau;

        // Sync DOM to restored state WITHOUT triggering new auto-moves
        this.renderDOM();
        CardAnimator.animateCards(cardEls, fromRects);
    }

    // ─── Score / Moves ────────────────────────────────────────────────────────

    updateMovesAndScore() {
        document.getElementById('moves').textContent = `Moves: ${this.moveCount}`;
        if (this.settings.get('showScore')) {
            const score = 520 - this.moveCount;
            // Alternative scoring: 520 - moveCount (10 pts per foundation card - 1 per move)
            // Alternative scoring: Math.max(0, 500 - this.moveCount * 5 + Math.floor((Date.now() - this.gameStartTime) / 1000));
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
    new FreecellGame();
});
