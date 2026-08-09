// ─── DragHandler ──────────────────────────────────────────────────────────────
//
// Manages card drag and tap interactions for both touch and mouse/stylus.
// Shared by Freecell and Spider.
//
// Handles the full drag lifecycle — pickup, move, drop, and tap-to-move —
// then delegates to two game-specific hooks:
//   - canPickUp(card, stack):        returns true if the stack is legally moveable
//   - onDrop(targetEl, isDrag):      called when the gesture ends, with the drop
//                                    target element and whether it was a drag or tap
//
// Usage:
//   const handler = new DragHandler({
//       getCardFromElement:  el  => el.cardRef || null,
//       getPileForElement:   el  => game.getPileForElement(el),
//       canPickUp:          (card, stack) => !game.preMoveCheckFailed(),
//       findBestTarget:      ()  => game.findBestTarget(),
//       onDrop:             (targetEl, isDrag) => game.attemptMove(targetEl, isDrag),
//       onResize:            ()  => game.adjustColumnSpacing(),
//   });
//   handler.attach(); // registers all event listeners
//   handler.detach(); // removes all event listeners (e.g. on game reset)
// ─────────────────────────────────────────────────────────────────────────────

class DragHandler {
    constructor(config) {
        this.getCardFromElement = config.getCardFromElement;
        this.getPileForElement  = config.getPileForElement;
        this.canPickUp          = config.canPickUp;
        this.findBestTarget     = config.findBestTarget;
        this.onDrop             = config.onDrop;
        this.onResize           = config.onResize || (() => {});

        // Drag state
        this.draggedCard      = null;
        this.draggedStack     = [];
        this._dragStartRects  = [];
        this._startX          = 0;
        this._startY          = 0;
        this._isDrag          = false;
        this.TAP_THRESHOLD    = 8; // px movement before gesture becomes a drag

        // Bind handlers once so they can be removed by detach()
        this._onTouchStart   = this._handleTouchStart.bind(this);
        this._onTouchMove    = this._handleTouchMove.bind(this);
        this._onTouchEnd     = this._handleTouchEnd.bind(this);
        this._onPointerDown  = this._handlePointerDown.bind(this);
        this._onPointerMove  = this._handlePointerMove.bind(this);
        this._onPointerUp    = this._handlePointerUp.bind(this);
        this._onResize       = this._handleResize.bind(this);
    }

    // ─── Attach / Detach ──────────────────────────────────────────────────────

    attach() {
        // Touch events for iOS (pointer events unreliable on iOS Safari)
        document.addEventListener('touchstart',    this._onTouchStart,  { passive: false });
        document.addEventListener('touchmove',     this._onTouchMove,   { passive: false });
        document.addEventListener('touchend',      this._onTouchEnd,    { passive: false });

        // Pointer events for mouse and stylus — skipped if touch already handled it
        document.addEventListener('pointerdown',   this._onPointerDown);
        document.addEventListener('pointermove',   this._onPointerMove);
        document.addEventListener('pointerup',     this._onPointerUp);
        document.addEventListener('pointercancel', this._onPointerUp);

        window.addEventListener('resize', this._onResize);
    }

    detach() {
        document.removeEventListener('touchstart',    this._onTouchStart);
        document.removeEventListener('touchmove',     this._onTouchMove);
        document.removeEventListener('touchend',      this._onTouchEnd);
        document.removeEventListener('pointerdown',   this._onPointerDown);
        document.removeEventListener('pointermove',   this._onPointerMove);
        document.removeEventListener('pointerup',     this._onPointerUp);
        document.removeEventListener('pointercancel', this._onPointerUp);
        window.removeEventListener('resize',          this._onResize);
    }

    // ─── Touch Handlers ───────────────────────────────────────────────────────

    _handleTouchStart(e) {
        const touch = e.touches[0];
        this._startX = touch.clientX;
        this._startY = touch.clientY;
        this._isDrag = false;

        const targetEl = document.elementFromPoint(touch.clientX, touch.clientY)
            ?.closest('.card');
        if (!targetEl) return;
        log('touchstart', this.getCardFromElement(targetEl).id);

        // Prevent double-tap zoom when touching a card.
        // This must be called before _beginPickUp so the event is still cancelable.
        e.preventDefault();

        this._beginPickUp(targetEl);
    }

    _handleTouchMove(e) {
        e.preventDefault();
        if (!this.draggedCard) return;

        const touch  = e.touches[0];
        const deltaX = touch.clientX - this._startX;
        const deltaY = touch.clientY - this._startY;

        this._trackDragDistance(deltaX, deltaY);
        this._moveDraggedCards(deltaX, deltaY);
    }

    _handleTouchEnd(e) {
        if (!this.draggedCard) return;

        this._releaseDraggedCards();

        if (this._isDrag) {
            const touch    = e.changedTouches[0];
            const targetEl = document.elementFromPoint(touch.clientX, touch.clientY);
            this.onDrop(targetEl, true); // drag — no tap animation
        } else {
            this.onDrop(this.findBestTarget(), false); // tap — animate the move
        }

        this._clearDragState();
    }

    // ─── Pointer Handlers (mouse / stylus) ────────────────────────────────────

    _handlePointerDown(e) {
        if (e.pointerType === 'touch') return; // already handled by touch events
        if (e.isPrimary === false)     return;
        e.preventDefault();

        this._startX = e.clientX;
        this._startY = e.clientY;
        this._isDrag = false;

        const targetEl = (document.elementFromPoint(e.clientX, e.clientY) || e.target)
            ?.closest('.card');
        if (!targetEl) return;

        log('pointerdown', this.getCardFromElement(targetEl).id);
        this._beginPickUp(targetEl);

        try { targetEl.setPointerCapture?.(e.pointerId); } catch {}
    }

    _handlePointerMove(e) {
        if (e.pointerType === 'touch') return;
        if (!this.draggedCard)         return;
        e.preventDefault();

        const deltaX = e.clientX - this._startX;
        const deltaY = e.clientY - this._startY;

        this._trackDragDistance(deltaX, deltaY);
        this._moveDraggedCards(deltaX, deltaY);
    }

    _handlePointerUp(e) {
        if (e.pointerType === 'touch') return;
        if (!this.draggedCard)         return;

        this._releaseDraggedCards();

        if (this._isDrag) {
            const targetEl = document.elementFromPoint(e.clientX, e.clientY);
            this.onDrop(targetEl, true);  // drag — no tap animation
        } else {
            this.onDrop(this.findBestTarget(), false); // tap — animate the move
        }

        try { this.draggedCard.element.releasePointerCapture?.(e.pointerId); } catch {}
        this._clearDragState();
    }

    // ─── Resize Handler ───────────────────────────────────────────────────────

    _handleResize() {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                this.onResize();
            });
        });
    }

    // ─── Shared pickup / move / release helpers ───────────────────────────────

    // Attempts to pick up a card stack starting from targetEl.
    // Calls canPickUp() to let the game decide if the move is legal.
    _beginPickUp(targetEl) {
        const card = this.getCardFromElement(targetEl);
        if (!card) return;

        const pile = this.getPileForElement(targetEl.parentElement);
        if (!pile) return;

        const idx         = pile.arr.indexOf(card);
        const draggedStack = pile.arr.slice(idx); // cards from here to end of pile

        if (!this.canPickUp(card, draggedStack)) return;

        this.draggedCard  = card;
        this.draggedStack = draggedStack;

        // Capture natural positions BEFORE adding .dragging so we can
        // pin each card to where it visually was before the class shifts layout
        this._dragStartRects = this.draggedStack.map(c => c.element.getBoundingClientRect());

        this.draggedStack.forEach((c, i) => {
            const r = this._dragStartRects[i];
            c.element.style.left  = `${r.left}px`;
            c.element.style.top   = `${r.top}px`;
            c.element.style.width = `${r.width}px`;
            c.element.classList.add('dragging');
        });
    }

    // Tracks whether the gesture has moved far enough to be a drag vs a tap.
    _trackDragDistance(deltaX, deltaY) {
        if (!this._isDrag && (
            Math.abs(deltaX) > this.TAP_THRESHOLD ||
            Math.abs(deltaY) > this.TAP_THRESHOLD
        )) {
            this._isDrag = true;
        }
    }

    // Repositions dragged cards to follow the pointer/touch.
    _moveDraggedCards(deltaX, deltaY) {
        this.draggedStack.forEach((c, i) => {
            const origin = this._dragStartRects[i];
            c.element.style.left  = `${origin.left + deltaX}px`;
            c.element.style.top   = `${origin.top  + deltaY}px`;
            c.element.style.width = `${origin.width}px`;
        });
    }

    // Removes drag CSS from all dragged cards after a gesture ends.
    _releaseDraggedCards() {
        this.draggedStack.forEach(c => {
            c.element.classList.remove('dragging');
            c.element.style.transform = '';
            c.element.style.left      = '';
            c.element.style.top       = '';
            c.element.style.width     = '';
        });
    }

    // Resets all drag state after a gesture completes.
    _clearDragState() {
        this.draggedCard     = null;
        this.draggedStack    = [];
        this._dragStartRects = [];
        this._isDrag         = false;
    }
}
