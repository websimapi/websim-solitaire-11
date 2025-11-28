let layoutIndicators = [];

export function setupStockInteraction(container, game, audio, render, clearHint) {
    let startX, startY;
    let isDrag = false;
    let ghost = null;
    let pointerId = null;
    let pressStartTime = 0;

    container.addEventListener('pointerdown', (e) => {
        if (typeof clearHint === 'function') clearHint();
        if (e.button !== 0 && e.type.includes('mouse')) return;

        e.preventDefault();

        startX = e.clientX;
        startY = e.clientY;
        isDrag = false;
        pointerId = e.pointerId;
        pressStartTime = Date.now();
        container.setPointerCapture(pointerId);

        container.addEventListener('pointermove', onMove);
        container.addEventListener('pointerup', onUp);
        container.addEventListener('pointercancel', onUp);
    });

    function onMove(e) {
        if (e.pointerId !== pointerId) return;

        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const elapsed = Date.now() - pressStartTime;

        if (!isDrag && elapsed > 1500 && Math.hypot(dx, dy) > 20) {
            isDrag = true;
            createGhost(e.clientX, e.clientY);
            showLayoutIndicators();
            highlightActiveIndicator(e.clientX, e.clientY);
        }

        if (isDrag && ghost) {
            ghost.style.left = `${e.clientX}px`;
            ghost.style.top = `${e.clientY}px`;
            ghost.style.transform = 'translate(-50%, -50%)';
            highlightActiveIndicator(e.clientX, e.clientY);
        }
    }

    function onUp(e) {
        if (e.pointerId !== pointerId) return;

        container.releasePointerCapture(pointerId);
        container.removeEventListener('pointermove', onMove);
        container.removeEventListener('pointerup', onUp);
        container.removeEventListener('pointercancel', onUp);

        if (isDrag) {
            updateLayout(e.clientX, e.clientY, render);
            if (ghost) ghost.remove();
            ghost = null;
            hideLayoutIndicators();
        } else {
            const result = game.drawFromStock();
            if (result) {
                audio.play('place');
                render();
            }
        }

        isDrag = false;
        pointerId = null;
    }

    function createGhost(x, y) {
        ghost = document.createElement('div');
        ghost.className = 'ghost-deck';
        ghost.style.left = `${x}px`;
        ghost.style.top = `${y}px`;
        ghost.style.transform = 'translate(-50%, -50%)';
        document.body.appendChild(ghost);
    }
}

function updateLayout(x, y, render) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const gameContainer = document.getElementById('game-container');
    const topRow = document.getElementById('top-row');

    const isRight = x > w / 2;
    const isBottom = y > h / 2;

    if (isBottom) {
        gameContainer.classList.add('col-reverse');
    } else {
        gameContainer.classList.remove('col-reverse');
    }

    if (isRight) {
        topRow.classList.add('row-reverse');
    } else {
        topRow.classList.remove('row-reverse');
    }

    // Persist layout preference in localStorage as 'tl', 'tr', 'bl', or 'br'
    const pos = (isBottom ? 'b' : 't') + (isRight ? 'r' : 'l');
    try {
        localStorage.setItem('deckLayout', pos);
    } catch (e) {
        // Ignore storage errors (e.g., private mode)
    }

    // Re-render so waste stack and card orientation update to new layout
    if (typeof render === 'function') {
        render();
    }
}

function showLayoutIndicators() {
    const positions = ['tl', 'tr', 'bl', 'br'];
    positions.forEach(pos => {
        const el = document.createElement('div');
        el.className = `layout-target ${pos}`;
        document.body.appendChild(el);
        layoutIndicators.push(el);
    });
}

function hideLayoutIndicators() {
    layoutIndicators.forEach(el => el.remove());
    layoutIndicators = [];
}

function highlightActiveIndicator(x, y) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const isRight = x > w / 2;
    const isBottom = y > h / 2;

    const targetClass = (isBottom ? 'b' : 't') + (isRight ? 'r' : 'l');

    layoutIndicators.forEach(el => {
        if (el.classList.contains(targetClass)) {
            el.classList.add('active');
        } else {
            el.classList.remove('active');
        }
    });
}