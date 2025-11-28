import { SUIT_ICONS, COLORS } from './constants.js';

export class CardRenderer {
    static createCardElement(card) {
        const el = document.createElement('div');
        el.className = 'card';
        el.dataset.suit = card.suit;
        el.dataset.rank = card.rank;
        el.dataset.color = COLORS[card.suit];
        el.dataset.cid = card.id; // unique card id

        if (!card.faceUp) {
            el.classList.add('card-back');
            return el;
        }

        el.classList.add(COLORS[card.suit]);

        const icon = SUIT_ICONS[card.suit];
        
        // Corner Top-Left
        const topDiv = document.createElement('div');
        topDiv.className = 'card-corner top-left';
        topDiv.innerHTML = `<span class="rank">${card.rank}</span><span class="suit">${icon}</span>`;
        el.appendChild(topDiv);

        // Center
        const centerDiv = document.createElement('div');
        centerDiv.className = 'card-center';
        centerDiv.textContent = icon;
        el.appendChild(centerDiv);

        return el;
    }
}