import { CardRenderer } from './card-renderer.js';
import { makeCardInteractive } from './drag-drop.js';

export function clearHint() {
    document.querySelectorAll('.hint-overlay').forEach(e => e.remove());
}

export function render(game, UI, audio) {
    // Update stats immediately on render
    if (UI.scoreDisplay) UI.scoreDisplay.textContent = game.score;
    if (UI.movesDisplay) UI.movesDisplay.textContent = game.moves;

    // 1. Stock
    UI.stock.innerHTML = '';
    if (game.stock.length > 0) {
        // Just show a back card
        const cardEl = document.createElement('div');
        cardEl.className = 'card card-back';
        UI.stock.appendChild(cardEl);
        UI.stock.style.display = 'block';
        UI.stockEmpty.style.display = 'none';
    } else {
        UI.stock.style.display = 'none';
        UI.stockEmpty.style.display = 'flex';
    }

    // 2. Waste
    UI.waste.innerHTML = '';
    if (game.waste.length > 0) {
        // Show last 3 cards drawn
        const visibleWaste = game.waste.slice(-3);
        const topRow = document.getElementById('top-row');
        const stackOnRight = topRow.classList.contains('row-reverse');
        const fanRight = !stackOnRight;

        visibleWaste.forEach((c, i) => {
            const el = CardRenderer.createCardElement(c);

            // Fan direction depends on deck position:
            // - When deck is on the left (normal), fan to the right.
            // - When deck is on the right (row-reverse), fan to the left.
            // Additionally, when the deck is on the right, the most recent
            // card (top of waste) should sit closest to the deck.
            const offsetIndex = stackOnRight
                ? (visibleWaste.length - 1 - i) // reverse spacing order on the right
                : i;

            el.style.top = '0px';
            if (fanRight) {
                el.style.right = '';
                el.style.left = `${offsetIndex * 62}%`;
            } else {
                el.style.left = '';
                el.style.right = `${offsetIndex * 62}%`;
            }

            UI.waste.appendChild(el);

            // Only the top-most card is interactive
            if (i === visibleWaste.length - 1) {
                makeCardInteractive(el, { type: 'waste' }, c);
            }
        });
    }

    // 3. Foundations
    game.foundations.forEach((pile, idx) => {
        const container = UI.foundations[idx];
        container.innerHTML = '';
        if (pile.length > 0) {
            const topCard = pile[pile.length - 1];
            const el = CardRenderer.createCardElement(topCard);
            container.appendChild(el);
            makeCardInteractive(el, { type: 'foundation', index: idx }, topCard);
        }
    });

    // 4. Tableau
    game.tableau.forEach((pile, idx) => {
        const container = UI.tableau[idx];
        container.innerHTML = '';

        let currentTop = 0;

        pile.forEach((card, cardIndex) => {
            const el = CardRenderer.createCardElement(card);

            // Position card using cumulative offset to prevent jumps
            el.style.top = `${currentTop}%`;

            // Calculate offset for the next card
            // 12% for face-down cards to show a strip of the back
            // 35% for face-up cards to ensure the large header (rank + suit) is visible
            currentTop += card.faceUp ? 35 : 12;

            container.appendChild(el);

            if (card.faceUp) {
                makeCardInteractive(el, { type: 'tableau', index: idx, cardIndex }, card);
            }
        });
    });

    // 5. Check win
    if (game.checkWin()) {
        UI.winOverlay.classList.remove('hidden');
        audio.play('win');
    }
}

export function highlightHint(UI, hint) {
    // Collect all elements involved in the hint (e.g., entire substack for tableau)
    const elementsToHighlight = [];

    if (hint.type === 'draw') {
        if (UI.stock.style.display !== 'none') {
            elementsToHighlight.push(UI.stock.lastElementChild || UI.stock);
        } else {
            elementsToHighlight.push(UI.stockEmpty);
        }
    } else if (hint.type === 'move') {
        if (hint.source === 'waste') {
            elementsToHighlight.push(UI.waste.lastElementChild);
        } else if (hint.source === 'tableau') {
            const pileContainer = UI.tableau[hint.index];
            // If cardIndex is provided, it's the start of the moving stack.
            // If not, default to the top card.
            const startIndex = (hint.cardIndex !== undefined) ? hint.cardIndex : (pileContainer.children.length - 1);
            
            // Add the card and all subsequent cards (the stack on top of it)
            for (let i = startIndex; i < pileContainer.children.length; i++) {
                if (pileContainer.children[i]) {
                    elementsToHighlight.push(pileContainer.children[i]);
                }
            }
        }
    }

    // Remove any existing hint overlays
    clearHint();

    if (elementsToHighlight.length > 0) {
        // Calculate the union bounding box of all highlighted elements
        let minTop = Infinity, minLeft = Infinity;
        let maxBottom = -Infinity, maxRight = -Infinity;

        elementsToHighlight.forEach(el => {
            const rect = el.getBoundingClientRect();
            if (rect.top < minTop) minTop = rect.top;
            if (rect.left < minLeft) minLeft = rect.left;
            if (rect.bottom > maxBottom) maxBottom = rect.bottom;
            if (rect.right > maxRight) maxRight = rect.right;
        });

        // Create a single overlay element to outline the group
        const overlay = document.createElement('div');
        overlay.className = 'hint-overlay';
        overlay.style.top = `${minTop}px`;
        overlay.style.left = `${minLeft}px`;
        overlay.style.width = `${maxRight - minLeft}px`;
        overlay.style.height = `${maxBottom - minTop}px`;
        
        document.body.appendChild(overlay);
        
        // Auto remove after 2 seconds
        setTimeout(() => {
            overlay.remove();
        }, 2000);
    }
}