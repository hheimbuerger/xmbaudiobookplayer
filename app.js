// Persistence utilities (separate from component)
function loadState(shows) {
    try {
        const saved = localStorage.getItem('xmb-state');
        if (saved) {
            const state = JSON.parse(saved);
            const currentShowIndex = state.currentShowIndex || 1;
            state.episodes.forEach((episodeIndex, showIndex) => {
                if (shows[showIndex]) {
                    shows[showIndex].currentEpisode = episodeIndex;
                }
            });
            return currentShowIndex;
        }
    } catch (e) {
        console.error('Failed to load state:', e);
    }
    return 1; // Default
}

function saveState(state) {
    try {
        localStorage.setItem('xmb-state', JSON.stringify(state));
    } catch (e) {
        console.error('Failed to save state:', e);
    }
}

// Initialize the component
import './components/xmb-browser.js';

async function init() {
    await window.fetchPodcasts();
    const browser = document.querySelector('xmb-browser');
    browser.shows = window.shows;
    browser.currentShowIndex = loadState(window.shows);
    browser.onStateChange = (state) => {
        saveState(state);
    };
}

init();
