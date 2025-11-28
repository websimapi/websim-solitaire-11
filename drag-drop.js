import { getOverlapArea } from './utils.js';

let gameRef = null;
let UIRef = null;
let audioRef = null;
let renderRef = null;
let clearHintRef = null;

let draggedCards = [];
let dragSource = null; // { type: 'tableau'|'waste'|'foundation', index: number }
let dragStartPos = { x: 0, y: 0 };
let isDragging = false;
let pointerId = null;

export function setupDragAndDrop({ game, UI, audio, render, clearHint }) {
    gameRef = game;
    UIRef = UI;
    audioRef = audio;
    renderRef = render;
    clearHintRef = clearHint;
}

export function makeCardInteractive(el, sourceInfo, cardData) {
    makeDraggable(el, sourceInfo, cardData);
}

function makeDraggable(el, sourceInfo, cardData) {
    el.addEventListener('pointerdown', (e) => onPointerDown(e, el, sourceInfo, cardData));
}

function onPointerDown(e, el, sourceInfo, cardData) {
    if (clearHintRef) clearHintRef();
    if (isDragging) return;
    if (e.button !== 0 && e.type.includes('mouse')) return;

    e.preventDefault();
    e.stopPropagation();

    pointerId = e.pointerId;
    el.setPointerCapture(pointerId);

    dragSource = sourceInfo;
    dragStartPos = { x: e.clientX, y: e.clientY };

    draggedCards = [];

    if (sourceInfo.type === 'tableau') {
        const pile = gameRef.tableau[sourceInfo.index];
        const slice = pile.slice(sourceInfo.cardIndex);
        const container = UIRef.tableau[sourceInfo.index];
        const children = Array.from(container.children);
        const elements = children.slice(sourceInfo.cardIndex);

        slice.forEach((c, i) => {
            draggedCards.push({
                card: c,
                el: elements[i],
                originalTop: elements[i].style.top,
                originalLeft: elements[i].style.left,
                originalParent: elements[i].parentElement
            });
        });
    } else {
        // Single card (Waste or Foundation)
        draggedCards.push({
            card: cardData,
            el: el,
            originalTop: el.style.top,
            originalLeft: el.style.left,
            originalParent: el.parentElement
        });
    }

    isDragging = false;

    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);
}

function onPointerMove(e) {
    if (!pointerId || e.pointerId !== pointerId) return;

    const dx = e.clientX - dragStartPos.x;
    const dy = e.clientY - dragStartPos.y;

    if (!isDragging) {
        if (Math.hypot(dx, dy) > 5) {
            isDragging = true;
            draggedCards.forEach(dc => dc.el.classList.add('dragging'));
        } else {
            return;
        }
    }

    draggedCards.forEach(dc => {
        dc.el.style.transform = `translate(${dx}px, ${dy}px)`;
    });
}

function onPointerUp(e) {
    if (!pointerId || e.pointerId !== pointerId) return;

    const el = draggedCards[0].el;
    el.releasePointerCapture(pointerId);
    el.removeEventListener('pointermove', onPointerMove);
    el.removeEventListener('pointerup', onPointerUp);
    el.removeEventListener('pointercancel', onPointerUp);

    pointerId = null;

    if (!isDragging) {
        const card = draggedCards[0].card;
        handleAutoMove(card, dragSource);
        cleanupDrag();
        return;
    }

    const cardRect = el.getBoundingClientRect();

    let bestTarget = null;
    let maxOverlap = 0;

    // Foundations (only if single card)
    if (draggedCards.length === 1) {
        UIRef.foundations.forEach((fEl, idx) => {
            const fRect = fEl.getBoundingClientRect();
            const overlap = getOverlapArea(cardRect, fRect);
            if (overlap > maxOverlap) {
                maxOverlap = overlap;
                bestTarget = { type: 'foundation', index: idx };
            }
        });
    }

    // Tableau
    UIRef.tableau.forEach((tEl, idx) => {
        const pile = gameRef.tableau[idx];
        let targetRect;

        if (pile.length > 0) {
            const lastCardEl = tEl.lastElementChild;
            targetRect = lastCardEl.getBoundingClientRect();
        } else {
            targetRect = tEl.getBoundingClientRect();
        }

        const overlap = getOverlapArea(cardRect, targetRect);
        if (overlap > maxOverlap) {
            maxOverlap = overlap;
            bestTarget = { type: 'tableau', index: idx };
        }
    });

    if (bestTarget) {
        attemptMove(bestTarget);
    } else {
        cancelMove();
    }
}

function cleanupDrag() {
    draggedCards.forEach(dc => {
        dc.el.classList.remove('dragging');
        dc.el.style.transform = '';
    });
    draggedCards = [];
    isDragging = false;
    dragSource = null;
}

function cancelMove() {
    cleanupDrag();
}

function attemptMove(target) {
    let success = false;
    const card = draggedCards[0].card;

    if (target.type === 'foundation') {
        if (gameRef.canMoveToFoundation(card, target.index)) {
            executeMove(target);
            success = true;
        }
    } else if (target.type === 'tableau') {
        if (gameRef.canMoveToTableau(card, target.index)) {
            executeMove(target);
            success = true;
        }
    }

    if (success) {
        audioRef.play('place');
        renderRef();
    } else {
        cancelMove();
    }

    cleanupDrag();
}

function executeMove(target) {
    // We now save state AFTER the move is fully applied so undo reverts exactly one action
    let movingCards = [];
    let scoreDelta = 0;

    if (dragSource.type === 'waste') {
        movingCards = [gameRef.waste.pop()];
        // Waste -> Tableau: +5
        // Waste -> Foundation: +10
        if (target.type === 'tableau') scoreDelta = 5;
        if (target.type === 'foundation') scoreDelta = 10;
        
    } else if (dragSource.type === 'foundation') {
        movingCards = [gameRef.foundations[dragSource.index].pop()];
        // Foundation -> Tableau: -15
        if (target.type === 'tableau') scoreDelta = -15;

    } else if (dragSource.type === 'tableau') {
        const pile = gameRef.tableau[dragSource.index];
        movingCards = pile.splice(dragSource.cardIndex);

        // Tableau -> Foundation: +10
        if (target.type === 'foundation') scoreDelta = 10;

        if (pile.length > 0) {
            const newTop = pile[pile.length - 1];
            if (!newTop.faceUp) {
                newTop.faceUp = true;
                // Reveal card: +5
                scoreDelta += 5;
            }
        }
    }

    if (target.type === 'foundation') {
        gameRef.foundations[target.index].push(movingCards[0]);
    } else if (target.type === 'tableau') {
        gameRef.tableau[target.index].push(...movingCards);
    }
    
    // Update Score and Moves
    gameRef.score = Math.max(0, (gameRef.score || 0) + scoreDelta);
    gameRef.moves = (gameRef.moves || 0) + 1;

    // Save the new state after the move is complete
    if (typeof gameRef.saveState === 'function') {
        gameRef.saveState();
    }
}

function handleAutoMove(card, source) {
    let isSingleCard = true;
    if (source.type === 'tableau') {
        const pile = gameRef.tableau[source.index];
        if (source.cardIndex < pile.length - 1) {
            isSingleCard = false;
        }
    }

    if (isSingleCard) {
        for (let i = 0; i < 4; i++) {
            if (gameRef.canMoveToFoundation(card, i)) {
                executeMove({ type: 'foundation', index: i });
                audioRef.play('place');
                renderRef();
                return;
            }
        }
    }

    for (let i = 0; i < 7; i++) {
        if (source.type === 'tableau' && source.index === i) continue;

        if (gameRef.canMoveToTableau(card, i)) {
            executeMove({ type: 'tableau', index: i });
            audioRef.play('place');
            renderRef();
            return;
        }
    }
}