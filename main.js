import { SolitaireGame } from './solitaire.js';
import { AudioManager } from './audio-manager.js';
import { render, highlightHint, clearHint } from './renderer.js';
import { setupDragAndDrop } from './drag-drop.js';
import { setupStockInteraction } from './stock-layout.js';

// Calculate correct viewport height, handling mobile URL bars and iframes
function initViewportHeight() {
    const setVh = () => {
        // Use innerHeight to support iframes correctly
        // On mobile, this excludes the browser interface (address bar)
        const vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
    };
    
    setVh();
    window.addEventListener('resize', setVh);
    window.addEventListener('orientationchange', setVh);
}

const game = new SolitaireGame();
const audio = new AudioManager();

const UI = {
    stock: document.getElementById('stock'),
    stockEmpty: document.getElementById('stock-empty'),
    waste: document.getElementById('waste'),
    foundations: [
        document.getElementById('foundation-0'),
        document.getElementById('foundation-1'),
        document.getElementById('foundation-2'),
        document.getElementById('foundation-3')
    ],
    tableau: [
        document.getElementById('tableau-0'),
        document.getElementById('tableau-1'),
        document.getElementById('tableau-2'),
        document.getElementById('tableau-3'),
        document.getElementById('tableau-4'),
        document.getElementById('tableau-5'),
        document.getElementById('tableau-6')
    ],
    winOverlay: document.getElementById('win-overlay'),
    restartBtn: document.getElementById('restart-btn'),
    navUndoBtn: document.getElementById('nav-undo-btn'),
    navHintBtn: document.getElementById('nav-hint-btn'),
    navMenuBtn: document.getElementById('nav-menu-btn'),
    menuOverlay: document.getElementById('menu-overlay'),
    menuNewDealBtn: document.getElementById('menu-new-deal-btn'),
    menuCloseBtn: document.getElementById('menu-close-btn'),
    scoreDisplay: document.getElementById('score-display'),
    timeDisplay: document.getElementById('time-display'),
    movesDisplay: document.getElementById('moves-display')
};

let autoCompleting = false;
let isDealing = false;
let timerInterval = null;

// ---- New Seasonal Background Logic ----
function determineHemisphere() {
    return new Promise((resolve) => {
        if (!navigator.geolocation) {
            resolve('north'); // fallback default
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const lat = pos.coords.latitude;
                resolve(lat >= 0 ? 'north' : 'south');
            },
            () => {
                resolve('north'); // if user denies or error, default to north
            },
            {
                maximumAge: 60 * 60 * 1000,
                timeout: 5000
            }
        );
    });
}

function getSeason(date, hemisphere) {
    const month = date.getMonth(); // 0-11
    // Meteorological seasons for Northern Hemisphere:
    // Winter: Dec(11), Jan(0), Feb(1)
    // Spring: Mar(2), Apr(3), May(4)
    // Summer: Jun(5), Jul(6), Aug(7)
    // Fall:   Sep(8), Oct(9), Nov(10)
    const northSeasons = ['winter','winter','spring','spring','spring','summer','summer','summer','fall','fall','fall','winter'];
    // Southern Hemisphere seasons are inverted by 6 months
    const southSeasons = ['summer','summer','fall','fall','fall','winter','winter','winter','spring','spring','spring','summer'];

    if (hemisphere === 'south') {
        return southSeasons[month];
    }
    return northSeasons[month];
}

function applySeasonalBackground() {
    determineHemisphere().then((hemi) => {
        const season = getSeason(new Date(), hemi);
        let image = 'spring.png';
        if (season === 'summer') image = 'summer.png';
        else if (season === 'fall') image = 'fall.png';
        else if (season === 'winter') image = 'winter.png';

        document.body.style.backgroundImage = `url('${image}')`;
    });
}
// ---- End Seasonal Background Logic ----

// Apply any saved deck layout preference from previous sessions
function applySavedLayout() {
    let pos;
    try {
        pos = localStorage.getItem('deckLayout');
    } catch (e) {
        pos = null;
    }
    if (!pos) return;

    const gameContainer = document.getElementById('game-container');
    const topRow = document.getElementById('top-row');
    if (!gameContainer || !topRow) return;

    // First char: 't' or 'b' (top/bottom)
    if (pos[0] === 'b') {
        gameContainer.classList.add('col-reverse');
    } else {
        gameContainer.classList.remove('col-reverse');
    }

    // Second char: 'l' or 'r' (left/right)
    if (pos[1] === 'r') {
        topRow.classList.add('row-reverse');
    } else {
        topRow.classList.remove('row-reverse');
    }
}

const doRender = () => {
    // If we are in the middle of a deal animation, do not re-render full state yet
    if (isDealing) return;
    
    // Update Stats
    UI.scoreDisplay.textContent = game.score;
    UI.movesDisplay.textContent = game.moves;
    
    render(game, UI, audio);
    if (!autoCompleting && game.isAutoWinState()) {
        startAutoComplete();
    }
};

function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        game.time++;
        UI.timeDisplay.textContent = formatTime(game.time);
        // Ensure time (and full state) is saved every second
        if (typeof game.persist === 'function') {
            game.persist();
        }
    }, 1000);
}

function stopTimer() {
    if (timerInterval) clearInterval(timerInterval);
}

function startAutoComplete() {
    autoCompleting = true;
    if (UI.navUndoBtn) UI.navUndoBtn.disabled = true;
    if (UI.navHintBtn) UI.navHintBtn.disabled = true;

    const interval = setInterval(() => {
        if (game.checkWin()) {
            clearInterval(interval);
            autoCompleting = false;
            doRender();
            return;
        }

        const moved = game.attemptAutoMove();
        if (moved) {
            if (!game.checkWin()) audio.play('place');
            render(game, UI, audio);
        } else {
            clearInterval(interval);
            autoCompleting = false;
            if (UI.navUndoBtn) UI.navUndoBtn.disabled = false;
            if (UI.navHintBtn) UI.navHintBtn.disabled = false;
            doRender();
        }
    }, 100);
}

// Sequence for dealing cards with animation
function animateDeal() {
    isDealing = true;
    document.body.classList.add('dealing');
    
    // 1. Render the game state (which places cards in tableau)
    // We bypass doRender's check by calling render directly once
    render(game, UI, audio);

    // 2. Immediately hide all tableau cards so we can animate them in
    UI.tableau.forEach(pile => {
        Array.from(pile.children).forEach(card => {
            card.style.visibility = 'hidden';
        });
    });

    // 3. Loop through the standard deal order
    let dealCount = 0;
    const delayInterval = 60; // ms between cards

    // Get stock position for start of animation
    // If stock is technically empty (shouldn't be at start), use placeholder
    const stockEl = UI.stock.style.display !== 'none' ? UI.stock : UI.stockEmpty;
    const stockRect = stockEl.getBoundingClientRect();

    // Standard Solitaire Deal Order:
    // Row 0: Cols 0-6
    // Row 1: Cols 1-6
    // ...
    // Row 6: Col 6
    for (let i = 0; i < 7; i++) {
        for (let j = i; j < 7; j++) {
            const targetPile = UI.tableau[j];
            // The i-th card in the pile corresponds to this deal round
            const targetCard = targetPile.children[i];
            
            if (targetCard) {
                const currentDelay = dealCount * delayInterval;
                setTimeout(() => {
                    const targetRect = targetCard.getBoundingClientRect();
                    flyCard(stockRect, targetRect, targetCard);
                }, currentDelay);
                dealCount++;
            }
        }
    }

    // 4. Clean up after all animations done
    // Duration approx: count * interval + transition time (250ms)
    const totalTime = (dealCount * delayInterval) + 300;
    setTimeout(() => {
        isDealing = false;
        document.body.classList.remove('dealing');
        doRender(); // Final consistent render
        startTimer();
    }, totalTime);
}

function flyCard(fromRect, toRect, targetEl) {
    // Create flying element
    const flyer = document.createElement('div');
    flyer.className = 'flying-card';
    flyer.style.left = `${fromRect.left}px`;
    flyer.style.top = `${fromRect.top}px`;
    document.body.appendChild(flyer);

    // Force reflow to ensure start position is registered
    flyer.offsetHeight;

    // Animate
    const dx = toRect.left - fromRect.left;
    const dy = toRect.top - fromRect.top;
    flyer.style.transform = `translate(${dx}px, ${dy}px)`;

    // Play sound (slightly varied pitch or just play)
    audio.play('place');

    // On finish
    flyer.addEventListener('transitionend', () => {
        flyer.remove();
        if (targetEl) targetEl.style.visibility = 'visible';
    }, { once: true });
}

(async () => {
    initViewportHeight();
    await audio.load();

    // Restore preferred deck layout before starting the game/render
    applySavedLayout();

    // Apply seasonal background based on current date and hemisphere
    applySeasonalBackground();

    setupDragAndDrop({
        game,
        UI,
        audio,
        render: doRender,
        clearHint
    });

    if (game.load()) {
        doRender();
        startTimer();
    } else {
        startNewGame();
    }

    attachListeners();
})();

function startNewGame() {
    game.start();
    audio.play('shuffle');
    stopTimer();
    UI.timeDisplay.textContent = '00:00';
    animateDeal();
}

function attachListeners() {
    const stockContainer = UI.stock.parentElement;
    setupStockInteraction(stockContainer, game, audio, doRender, clearHint);

    UI.restartBtn.addEventListener('click', () => {
        UI.winOverlay.classList.add('hidden');
        startNewGame();
    });

    // Menu Interactions
    if (UI.navMenuBtn) {
        UI.navMenuBtn.addEventListener('click', () => {
            if (isDealing) return;
            UI.menuOverlay.classList.remove('hidden');
        });
    }

    if (UI.menuCloseBtn) {
        UI.menuCloseBtn.addEventListener('click', () => {
            UI.menuOverlay.classList.add('hidden');
        });
    }

    if (UI.menuNewDealBtn) {
        UI.menuNewDealBtn.addEventListener('click', () => {
            UI.menuOverlay.classList.add('hidden');
            UI.winOverlay.classList.add('hidden');
            startNewGame();
        });
    }

    // Click outside to close menu
    if (UI.menuOverlay) {
        UI.menuOverlay.addEventListener('click', (e) => {
            if (e.target === UI.menuOverlay) {
                UI.menuOverlay.classList.add('hidden');
            }
        });
    }

    if (UI.navHintBtn) {
        UI.navHintBtn.addEventListener('click', () => {
            if (isDealing) return;
            const hint = game.getHint();
            if (hint.type === 'none') {
                if (confirm("Stalemate! Game Over.\nNo moves possible with current deck.\n\nStart a new game?")) {
                    startNewGame();
                }
            } else {
                highlightHint(UI, hint);
            }
        });
    }

    if (UI.navUndoBtn) {
        UI.navUndoBtn.addEventListener('click', () => {
            if (isDealing) return;
            const undone = game.undo();
            if (undone) {
                doRender();
            }
        });
    }
}

