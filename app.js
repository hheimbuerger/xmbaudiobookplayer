// State (expects 'shows' data to be provided by host)
let currentShowIndex = 1;
let dragState = {
    active: false,
    startX: 0,
    startY: 0,
    direction: null, // 'horizontal' or 'vertical'
    offsetX: 0, // Normalized offset in show units
    offsetY: 0  // Normalized offset in episode units
};
let snapState = {
    active: false,
    startOffsetX: 0,
    startOffsetY: 0,
    startTime: 0
};

// Constants
const SNAP_DURATION = 200; // Animation duration in milliseconds
const ICON_SIZE = 72; // Icon size in CSS pixels (device-independent)
const SHOW_SPACING_ICONS = 1.8; // Horizontal spacing between shows (in icon widths)
const EPISODE_SPACING_ICONS = 1.8; // Vertical spacing between episodes (in icon widths)
const DIRECTION_LOCK_THRESHOLD_ICONS = 0.2; // Movement threshold to lock direction (in icon widths)
const FADE_RANGE = 0.5; // Non-current episodes fade out within ±0.5 show offset
const MAX_SCALE = 1.5; // Maximum scale for items at screen center
const SCALE_DISTANCE_ICONS = 3.3; // Distance (in icon widths) that affects scaling

// Derived constants (in CSS pixels)
const SHOW_SPACING = SHOW_SPACING_ICONS * ICON_SIZE;
const EPISODE_SPACING = EPISODE_SPACING_ICONS * ICON_SIZE;
const DIRECTION_LOCK_THRESHOLD = DIRECTION_LOCK_THRESHOLD_ICONS * ICON_SIZE;
const SCALE_DISTANCE = SCALE_DISTANCE_ICONS * ICON_SIZE;

const container = document.getElementById('xmb-container');

// DOM element cache - created once, updated every frame
const episodeElements = [];

// Create all DOM elements at initialization
function createAllElements() {
    shows.forEach((show, showIndex) => {
        show.episodes.forEach((_, episodeIndex) => {
            const episodeEl = document.createElement('div');
            episodeEl.className = 'episode-item';
            episodeEl.style.width = `${ICON_SIZE}px`;
            episodeEl.style.height = `${ICON_SIZE}px`;
            episodeEl.style.left = '50%';
            episodeEl.style.top = '50%';
            episodeEl.style.opacity = '0';

            const iconEl = document.createElement('div');
            iconEl.className = 'icon-main';
            iconEl.style.fontSize = `${ICON_SIZE * 0.75}px`; // 75% of icon size
            iconEl.textContent = show.icon;

            const badgeEl = document.createElement('div');
            badgeEl.className = 'episode-badge';
            badgeEl.textContent = episodeIndex + 1;

            episodeEl.appendChild(iconEl);
            episodeEl.appendChild(badgeEl);
            container.appendChild(episodeEl);

            // Store reference with metadata
            episodeElements.push({
                element: episodeEl,
                showIndex,
                episodeIndex
            });
        });
    });
}

// Persistence
function loadState() {
    try {
        const saved = localStorage.getItem('xmb-state');
        if (saved) {
            const state = JSON.parse(saved);
            currentShowIndex = state.currentShowIndex || 1;
            state.episodes.forEach((episodeIndex, showIndex) => {
                if (shows[showIndex]) {
                    shows[showIndex].currentEpisode = episodeIndex;
                }
            });
        }
    } catch (e) {
        console.error('Failed to load state:', e);
    }
}

function saveState() {
    try {
        const state = {
            currentShowIndex,
            episodes: shows.map(show => show.currentEpisode)
        };
        localStorage.setItem('xmb-state', JSON.stringify(state));
    } catch (e) {
        console.error('Failed to save state:', e);
    }
}

// Rendering - just update properties of existing elements
function render() {
    // Get current normalized offset (in show/episode units)
    const offsetX = dragState.active ? dragState.offsetX : (snapState.active ? getCurrentSnapOffset().x : 0);
    const offsetY = dragState.active ? dragState.offsetY : (snapState.active ? getCurrentSnapOffset().y : 0);

    // Update all episode elements
    episodeElements.forEach(({ element, showIndex, episodeIndex }) => {
        const show = shows[showIndex];

        // Calculate normalized position relative to center
        // offsetX/Y represents how much the grid has moved (positive = grid moved right/down)
        const showOffsetFromCenter = (showIndex - currentShowIndex) + offsetX;

        // Vertical offset only applies to the current show
        const isCurrentShow = showIndex === currentShowIndex;
        const episodeOffsetFromCenter = (episodeIndex - show.currentEpisode) + (isCurrentShow ? offsetY : 0);

        // Convert to pixels for transform
        const showPixelOffsetX = showOffsetFromCenter * SHOW_SPACING;
        const episodePixelOffsetY = episodeOffsetFromCenter * EPISODE_SPACING;

        // Calculate distance from screen center for scaling
        const distanceFromScreenCenter = Math.sqrt(
            showPixelOffsetX * showPixelOffsetX +
            episodePixelOffsetY * episodePixelOffsetY
        );
        const scale = Math.max(1, MAX_SCALE - distanceFromScreenCenter / SCALE_DISTANCE);

        // Calculate opacity
        let opacity = 0;
        const isCenterEpisode = episodeIndex === show.currentEpisode;

        if (isCenterEpisode) {
            // Current episode of any show: always visible
            opacity = 1.0;
        } else {
            // Non-current episodes: fade based on horizontal offset from their show
            const absShowOffset = Math.abs(showOffsetFromCenter);
            if (absShowOffset <= FADE_RANGE) {
                // Linear fade from 1.0 at offset 0.0 to 0.0 at offset ±FADE_RANGE
                opacity = 1.0 - (absShowOffset / FADE_RANGE);
            } else {
                opacity = 0;
            }
        }

        // Update element properties
        element.style.transform = `translate(calc(-50% + ${showPixelOffsetX}px), calc(-50% + ${episodePixelOffsetY}px)) scale(${scale})`;
        element.style.opacity = opacity;
    });
}

function getCurrentSnapOffset() {
    const elapsed = performance.now() - snapState.startTime;
    const progress = Math.min(elapsed / SNAP_DURATION, 1);
    const eased = 1 - Math.pow(1 - progress, 3);

    return {
        x: snapState.startOffsetX * (1 - eased),
        y: snapState.startOffsetY * (1 - eased)
    };
}

// Animation loop
function animate() {
    if (snapState.active) {
        const elapsed = performance.now() - snapState.startTime;
        if (elapsed >= SNAP_DURATION) {
            snapState.active = false;
        }
        render();
    }
    requestAnimationFrame(animate);
}

// Input handlers
function onDragStart(x, y) {
    if (snapState.active) return;

    dragState.active = true;
    dragState.startX = x;
    dragState.startY = y;
    dragState.direction = null;
    dragState.offsetX = 0;
    dragState.offsetY = 0;
}

function onDragMove(x, y) {
    if (!dragState.active) return;

    const deltaX = x - dragState.startX;
    const deltaY = y - dragState.startY;

    // Lock direction
    if (!dragState.direction) {
        if (Math.abs(deltaX) > DIRECTION_LOCK_THRESHOLD || Math.abs(deltaY) > DIRECTION_LOCK_THRESHOLD) {
            dragState.direction = Math.abs(deltaX) > Math.abs(deltaY) ? 'horizontal' : 'vertical';
        }
    }

    if (dragState.direction === 'horizontal') {
        // Convert pixel delta to normalized offset
        dragState.offsetX = deltaX / SHOW_SPACING;
        dragState.offsetY = 0;
    } else if (dragState.direction === 'vertical') {
        // Convert pixel delta to normalized offset
        dragState.offsetY = deltaY / EPISODE_SPACING;
        dragState.offsetX = 0;
    }

    render();
}

function onDragEnd() {
    if (!dragState.active) return;

    // Find which show/episode is closest to center
    let targetShowIndex = currentShowIndex;
    let targetEpisodeIndex = shows[currentShowIndex].currentEpisode;

    if (dragState.direction === 'horizontal') {
        // Current center position in show coordinates
        // Positive offsetX = grid moved right = show to the left is now centered
        const centerShowPosition = currentShowIndex - dragState.offsetX;
        // Round to nearest show and clamp to valid range
        targetShowIndex = Math.max(0, Math.min(shows.length - 1, Math.round(centerShowPosition)));
    } else if (dragState.direction === 'vertical') {
        const currentShow = shows[currentShowIndex];
        // Current center position in episode coordinates
        // Positive offsetY = grid moved down = episode above is now centered
        const centerEpisodePosition = currentShow.currentEpisode - dragState.offsetY;
        // Round to nearest episode and clamp to valid range
        targetEpisodeIndex = Math.max(0, Math.min(currentShow.episodes.length - 1, Math.round(centerEpisodePosition)));
    }

    // Calculate how much the state is changing and update state immediately
    let showDelta = 0;
    let episodeDelta = 0;
    let stateChanged = false;

    if (dragState.direction === 'horizontal') {
        showDelta = targetShowIndex - currentShowIndex;
        if (targetShowIndex !== currentShowIndex) {
            currentShowIndex = targetShowIndex;
            stateChanged = true;
        }
    } else if (dragState.direction === 'vertical') {
        episodeDelta = targetEpisodeIndex - shows[currentShowIndex].currentEpisode;
        if (targetEpisodeIndex !== shows[currentShowIndex].currentEpisode) {
            shows[currentShowIndex].currentEpisode = targetEpisodeIndex;
            stateChanged = true;
        }
    }

    if (stateChanged) {
        saveState();
    }

    // Start snap animation with compensating offset
    // After updating state, we need an offset that keeps things visually where they were
    // If we moved from episode 1 to 2 (delta=+1) with dragOffset=+1.0, 
    // we need startOffset = +1.0 + (+1) = +2.0, which animates back to 0
    snapState.active = true;
    snapState.startOffsetX = dragState.offsetX + showDelta;
    snapState.startOffsetY = dragState.offsetY + episodeDelta;
    snapState.startTime = performance.now();

    // Clear drag state
    dragState.active = false;
    dragState.offsetX = 0;
    dragState.offsetY = 0;
    dragState.direction = null;
}

// Event listeners
document.addEventListener('mousedown', (e) => onDragStart(e.clientX, e.clientY));
document.addEventListener('mousemove', (e) => onDragMove(e.clientX, e.clientY));
document.addEventListener('mouseup', onDragEnd);
document.addEventListener('touchstart', (e) => onDragStart(e.touches[0].clientX, e.touches[0].clientY));
document.addEventListener('touchmove', (e) => onDragMove(e.touches[0].clientX, e.touches[0].clientY));
document.addEventListener('touchend', onDragEnd);

// Initialize
loadState();
createAllElements();
render();
animate();
