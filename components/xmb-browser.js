import { LitElement, html, css } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';

export class XmbBrowser extends LitElement {
    static properties = {
        shows: { type: Array },
        currentShowIndex: { type: Number },
        onStateChange: { type: Function }
    };

    static styles = css`
        :host {
            display: block;
            width: 100%;
            height: 100%;
            position: relative;
            background: #000;
            overflow: hidden;
        }

        .episode-item {
            position: absolute;
            background: rgba(255, 255, 255, 0.15);
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.5);
            transition: none;
        }

        .icon-main {
            position: relative;
        }

        .episode-badge {
            position: absolute;
            bottom: 2px;
            right: 2px;
            background: rgba(0, 0, 0, 0.7);
            color: white;
            font-size: 10px;
            font-weight: bold;
            padding: 2px 4px;
            border-radius: 3px;
            line-height: 1;
            min-width: 14px;
            text-align: center;
        }
    `;

    constructor() {
        super();
        this.shows = [];
        this.currentShowIndex = 0;
        this.onStateChange = null;

        // Constants
        this.SNAP_DURATION = 200;
        this.ICON_SIZE = 72;
        this.SHOW_SPACING_ICONS = 1.8;
        this.EPISODE_SPACING_ICONS = 1.8;
        this.DIRECTION_LOCK_THRESHOLD_ICONS = 0.2;
        this.FADE_RANGE = 0.5;
        this.MAX_SCALE = 1.5;
        this.SCALE_DISTANCE_ICONS = 3.3;

        // Derived constants
        this.SHOW_SPACING = this.SHOW_SPACING_ICONS * this.ICON_SIZE;
        this.EPISODE_SPACING = this.EPISODE_SPACING_ICONS * this.ICON_SIZE;
        this.DIRECTION_LOCK_THRESHOLD = this.DIRECTION_LOCK_THRESHOLD_ICONS * this.ICON_SIZE;
        this.SCALE_DISTANCE = this.SCALE_DISTANCE_ICONS * this.ICON_SIZE;

        // State
        this.dragState = {
            active: false,
            startX: 0,
            startY: 0,
            direction: null,
            offsetX: 0,
            offsetY: 0
        };

        this.snapState = {
            active: false,
            startOffsetX: 0,
            startOffsetY: 0,
            startTime: 0
        };

        this.episodeElements = [];
        this.animationFrameId = null;
    }

    connectedCallback() {
        super.connectedCallback();
        this.addEventListener('mousedown', this._handleMouseDown);
        this.addEventListener('touchstart', this._handleTouchStart);
        document.addEventListener('mousemove', this._handleMouseMove);
        document.addEventListener('mouseup', this._handleMouseUp);
        document.addEventListener('touchmove', this._handleTouchMove);
        document.addEventListener('touchend', this._handleTouchEnd);
        
        this._startAnimation();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.removeEventListener('mousedown', this._handleMouseDown);
        this.removeEventListener('touchstart', this._handleTouchStart);
        document.removeEventListener('mousemove', this._handleMouseMove);
        document.removeEventListener('mouseup', this._handleMouseUp);
        document.removeEventListener('touchmove', this._handleTouchMove);
        document.removeEventListener('touchend', this._handleTouchEnd);
        
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
    }

    firstUpdated() {
        this._cacheElements();
        this._render();
    }

    updated(changedProperties) {
        if (changedProperties.has('shows') || changedProperties.has('currentShowIndex')) {
            this._cacheElements();
            this._render();
        }
    }

    _cacheElements() {
        this.episodeElements = [];
        const items = this.shadowRoot.querySelectorAll('.episode-item');
        let index = 0;
        
        this.shows.forEach((show, showIndex) => {
            show.episodes.forEach((_, episodeIndex) => {
                if (items[index]) {
                    this.episodeElements.push({
                        element: items[index],
                        showIndex,
                        episodeIndex
                    });
                }
                index++;
            });
        });
    }

    _startAnimation() {
        const animate = () => {
            if (this.snapState.active) {
                const elapsed = performance.now() - this.snapState.startTime;
                if (elapsed >= this.SNAP_DURATION) {
                    this.snapState.active = false;
                }
                this._render();
            }
            this.animationFrameId = requestAnimationFrame(animate);
        };
        animate();
    }

    _getCurrentSnapOffset() {
        const elapsed = performance.now() - this.snapState.startTime;
        const progress = Math.min(elapsed / this.SNAP_DURATION, 1);
        const eased = 1 - Math.pow(1 - progress, 3);

        return {
            x: this.snapState.startOffsetX * (1 - eased),
            y: this.snapState.startOffsetY * (1 - eased)
        };
    }

    _render() {
        const offsetX = this.dragState.active ? this.dragState.offsetX : 
                       (this.snapState.active ? this._getCurrentSnapOffset().x : 0);
        const offsetY = this.dragState.active ? this.dragState.offsetY : 
                       (this.snapState.active ? this._getCurrentSnapOffset().y : 0);

        this.episodeElements.forEach(({ element, showIndex, episodeIndex }) => {
            const show = this.shows[showIndex];
            if (!show) return;

            const showOffsetFromCenter = (showIndex - this.currentShowIndex) + offsetX;
            const isCurrentShow = showIndex === this.currentShowIndex;
            const episodeOffsetFromCenter = (episodeIndex - show.currentEpisode) + 
                                           (isCurrentShow ? offsetY : 0);

            const showPixelOffsetX = showOffsetFromCenter * this.SHOW_SPACING;
            const episodePixelOffsetY = episodeOffsetFromCenter * this.EPISODE_SPACING;

            const distanceFromScreenCenter = Math.sqrt(
                showPixelOffsetX * showPixelOffsetX +
                episodePixelOffsetY * episodePixelOffsetY
            );
            const scale = Math.max(1, this.MAX_SCALE - distanceFromScreenCenter / this.SCALE_DISTANCE);

            let opacity = 0;
            const isCenterEpisode = episodeIndex === show.currentEpisode;

            if (isCenterEpisode) {
                opacity = 1.0;
            } else {
                const absShowOffset = Math.abs(showOffsetFromCenter);
                if (absShowOffset <= this.FADE_RANGE) {
                    opacity = 1.0 - (absShowOffset / this.FADE_RANGE);
                }
            }

            element.style.transform = `translate(calc(-50% + ${showPixelOffsetX}px), calc(-50% + ${episodePixelOffsetY}px)) scale(${scale})`;
            element.style.opacity = opacity;
        });
    }

    _handleMouseDown = (e) => {
        this._onDragStart(e.clientX, e.clientY);
    }

    _handleMouseMove = (e) => {
        this._onDragMove(e.clientX, e.clientY);
    }

    _handleMouseUp = () => {
        this._onDragEnd();
    }

    _handleTouchStart = (e) => {
        this._onDragStart(e.touches[0].clientX, e.touches[0].clientY);
    }

    _handleTouchMove = (e) => {
        this._onDragMove(e.touches[0].clientX, e.touches[0].clientY);
    }

    _handleTouchEnd = () => {
        this._onDragEnd();
    }

    _onDragStart(x, y) {
        if (this.snapState.active) return;

        this.dragState.active = true;
        this.dragState.startX = x;
        this.dragState.startY = y;
        this.dragState.direction = null;
        this.dragState.offsetX = 0;
        this.dragState.offsetY = 0;
    }

    _onDragMove(x, y) {
        if (!this.dragState.active) return;

        const deltaX = x - this.dragState.startX;
        const deltaY = y - this.dragState.startY;

        if (!this.dragState.direction) {
            if (Math.abs(deltaX) > this.DIRECTION_LOCK_THRESHOLD || 
                Math.abs(deltaY) > this.DIRECTION_LOCK_THRESHOLD) {
                this.dragState.direction = Math.abs(deltaX) > Math.abs(deltaY) ? 'horizontal' : 'vertical';
            }
        }

        if (this.dragState.direction === 'horizontal') {
            this.dragState.offsetX = deltaX / this.SHOW_SPACING;
            this.dragState.offsetY = 0;
        } else if (this.dragState.direction === 'vertical') {
            this.dragState.offsetY = deltaY / this.EPISODE_SPACING;
            this.dragState.offsetX = 0;
        }

        this._render();
    }

    _onDragEnd() {
        if (!this.dragState.active) return;

        let targetShowIndex = this.currentShowIndex;
        let targetEpisodeIndex = this.shows[this.currentShowIndex].currentEpisode;

        if (this.dragState.direction === 'horizontal') {
            const centerShowPosition = this.currentShowIndex - this.dragState.offsetX;
            targetShowIndex = Math.max(0, Math.min(this.shows.length - 1, Math.round(centerShowPosition)));
        } else if (this.dragState.direction === 'vertical') {
            const currentShow = this.shows[this.currentShowIndex];
            const centerEpisodePosition = currentShow.currentEpisode - this.dragState.offsetY;
            targetEpisodeIndex = Math.max(0, Math.min(currentShow.episodes.length - 1, 
                                         Math.round(centerEpisodePosition)));
        }

        let showDelta = 0;
        let episodeDelta = 0;
        let stateChanged = false;

        if (this.dragState.direction === 'horizontal') {
            showDelta = targetShowIndex - this.currentShowIndex;
            if (targetShowIndex !== this.currentShowIndex) {
                this.currentShowIndex = targetShowIndex;
                stateChanged = true;
            }
        } else if (this.dragState.direction === 'vertical') {
            episodeDelta = targetEpisodeIndex - this.shows[this.currentShowIndex].currentEpisode;
            if (targetEpisodeIndex !== this.shows[this.currentShowIndex].currentEpisode) {
                this.shows[this.currentShowIndex].currentEpisode = targetEpisodeIndex;
                stateChanged = true;
            }
        }

        if (stateChanged && this.onStateChange) {
            this.onStateChange({
                currentShowIndex: this.currentShowIndex,
                episodes: this.shows.map(show => show.currentEpisode)
            });
        }

        this.snapState.active = true;
        this.snapState.startOffsetX = this.dragState.offsetX + showDelta;
        this.snapState.startOffsetY = this.dragState.offsetY + episodeDelta;
        this.snapState.startTime = performance.now();

        this.dragState.active = false;
        this.dragState.offsetX = 0;
        this.dragState.offsetY = 0;
        this.dragState.direction = null;
    }

    render() {
        return html`
            ${this.shows.flatMap((show, showIndex) => 
                show.episodes.map((episode, episodeIndex) => html`
                    <div class="episode-item" 
                         style="width: ${this.ICON_SIZE}px; height: ${this.ICON_SIZE}px; left: 50%; top: 50%; opacity: 0;">
                        <div class="icon-main" style="font-size: ${this.ICON_SIZE * 0.75}px;">
                            ${show.icon}
                        </div>
                        <div class="episode-badge">${episodeIndex + 1}</div>
                    </div>
                `)
            )}
        `;
    }
}

customElements.define('xmb-browser', XmbBrowser);
