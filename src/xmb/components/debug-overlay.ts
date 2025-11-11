import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import type { DebugStats } from '../controllers/render-loop-controller.js';

/**
 * Debug performance overlay component
 * Click the invisible box in top-left corner to toggle visibility
 */
@customElement('debug-overlay')
export class DebugOverlay extends LitElement {
  @property({ type: Object }) stats!: DebugStats;
  @state() private visible = false;
  private updateIntervalId: number | null = null;

  static styles = css`
    .toggle-area {
      position: fixed;
      top: 0;
      left: 0;
      width: 40px;
      height: 40px;
      z-index: 10001;
      cursor: pointer;
    }

    .overlay {
      position: fixed;
      top: 10px;
      left: 10px;
      background: rgba(0, 0, 0, 0.85);
      color: white;
      padding: 12px;
      border-radius: 8px;
      font-family: 'Courier New', monospace;
      font-size: 11px;
      z-index: 10000;
      pointer-events: none;
      user-select: none;
    }

    .mode {
      margin-bottom: 8px;
      font-weight: bold;
    }

    .stat {
      margin-bottom: 4px;
    }

    .graph-label {
      margin-bottom: 4px;
      margin-top: 8px;
      font-size: 10px;
      opacity: 0.7;
    }

    svg {
      display: block;
      margin-bottom: 8px;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 4px;
    }
  `;

  private _toggleVisibility() {
    this.visible = !this.visible;
    
    if (this.visible) {
      // Start update interval when visible
      this._startUpdateInterval();
    } else {
      // Stop update interval when hidden
      this._stopUpdateInterval();
    }
  }

  private _startUpdateInterval() {
    if (!this.updateIntervalId) {
      // Update at 10fps - enough for smooth stats display
      this.updateIntervalId = window.setInterval(() => {
        // Force re-render even though stats object reference hasn't changed
        // (the stats object is mutated in place by the controller)
        this.requestUpdate('stats');
      }, 100);
    }
  }

  private _stopUpdateInterval() {
    if (this.updateIntervalId) {
      clearInterval(this.updateIntervalId);
      this.updateIntervalId = null;
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._stopUpdateInterval();
  }

  render() {
    const frameTimeData = this.stats.frameTimes.slice(-60);
    const maxFrameTime = 50;
    const graphWidth = 200;
    const graphHeight = 60;
    const barWidth = graphWidth / 60;

    // Generate frame time bars
    const frameTimeBars = frameTimeData
      .map((time, i) => {
        const height = Math.min((time / maxFrameTime) * graphHeight, graphHeight);
        const x = i * barWidth;
        const color = time < 20 ? '#4ade80' : time < 33 ? '#fbbf24' : '#ef4444';
        return `<rect x="${x}" y="${graphHeight - height}" width="${barWidth - 1}" height="${height}" fill="${color}" />`;
      })
      .join('');

    // Generate FPS bars
    const fpsBars = frameTimeData
      .map((time, i) => {
        const fps = 1000 / time;
        const height = Math.min((fps / 60) * graphHeight, graphHeight);
        const x = i * barWidth;
        const color = fps > 50 ? '#4ade80' : fps > 30 ? '#fbbf24' : '#ef4444';
        return `<rect x="${x}" y="${graphHeight - height}" width="${barWidth - 1}" height="${height}" fill="${color}" />`;
      })
      .join('');

    const modeColor =
      this.stats.mode === 'high-freq' ? '#4ade80' : this.stats.mode === 'low-freq' ? '#fbbf24' : '#6b7280';
    const modeText =
      this.stats.mode === 'high-freq'
        ? 'HIGH-FREQ (rAF)'
        : this.stats.mode === 'low-freq'
          ? 'LOW-FREQ (interval)'
          : 'IDLE';

    const fpsColor = this.stats.fps > 50 ? '#4ade80' : this.stats.fps > 30 ? '#fbbf24' : '#ef4444';
    const frameTimeColor =
      this.stats.avgFrameTime < 20 ? '#4ade80' : this.stats.avgFrameTime < 33 ? '#fbbf24' : '#ef4444';

    return html`
      <div class="toggle-area" @click=${this._toggleVisibility}></div>

      ${this.visible
        ? html`
            <div class="overlay">
              <div class="mode" style="color: ${modeColor};">${modeText}</div>

              ${this.stats.mode === 'high-freq'
                ? html`
                    <div class="stat">
                      FPS: <span style="color: ${fpsColor}"> ${this.stats.fps.toFixed(1)} </span>
                    </div>

                    <div class="stat">
                      Frame Time: <span style="color: ${frameTimeColor}"> ${this.stats.avgFrameTime.toFixed(1)}ms </span>
                    </div>
                  `
                : html`
                    <div class="stat" style="opacity: 0.6;">
                      Last FPS: <span style="color: ${fpsColor}"> ${this.stats.fps.toFixed(1)} </span>
                    </div>

                    <div class="stat" style="opacity: 0.6;">
                      Last Frame Time: <span style="color: ${frameTimeColor}"> ${this.stats.avgFrameTime.toFixed(1)}ms </span>
                    </div>
                  `}

              ${this.stats.maxFrameTime
                ? html`
                    <div class="stat" style="font-size: 10px; opacity: 0.8;">
                      Min: ${this.stats.minFrameTime?.toFixed(1)}ms | Max:
                      <span style="color: ${this.stats.maxFrameTime > 33 ? '#ef4444' : '#fbbf24'}">
                        ${this.stats.maxFrameTime.toFixed(1)}ms
                      </span>
                    </div>
                  `
                : ''}
              ${this.stats.frameSpikes !== undefined && this.stats.frameSpikes > 0
                ? html`
                    <div class="stat" style="font-size: 10px; color: #ef4444;">
                      ⚠ ${this.stats.frameSpikes} frame spikes (>33ms)
                    </div>
                  `
                : ''}

              <div class="graph-label">Frame Time (ms)</div>
              <svg width="${graphWidth}" height="${graphHeight}">
                ${unsafeSVG(frameTimeBars)}
                <line
                  x1="0"
                  y1="${graphHeight - (16.67 / maxFrameTime) * graphHeight}"
                  x2="${graphWidth}"
                  y2="${graphHeight - (16.67 / maxFrameTime) * graphHeight}"
                  stroke="rgba(255,255,255,0.3)"
                  stroke-width="1"
                  stroke-dasharray="2,2"
                />
              </svg>

              <div class="graph-label">FPS</div>
              <svg width="${graphWidth}" height="${graphHeight}">
                ${unsafeSVG(fpsBars)}
                <line
                  x1="0"
                  y1="${graphHeight - (60 / 60) * graphHeight}"
                  x2="${graphWidth}"
                  y2="${graphHeight - (60 / 60) * graphHeight}"
                  stroke="rgba(255,255,255,0.3)"
                  stroke-width="1"
                  stroke-dasharray="2,2"
                />
              </svg>
            </div>
          `
        : ''}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'debug-overlay': DebugOverlay;
  }
}
