/**
 * XMB Browser Configuration
 * Single source of truth for all layout, animation, and interaction constants
 */

export const XMB_CONFIG = {
  // ===== Visual Sizing =====
  baseIconSize: 72,           // Base icon size (minimum zoom)
  maxZoom: 1.8,               // Maximum zoom at center
  minZoom: 1.0,               // Minimum zoom at edges
  
  // ===== Spacing (in icon units) =====
  showSpacing: 2.0,           // Horizontal spacing between shows
  episodeSpacing: 2.0,        // Vertical spacing between episodes
  
  // ===== Layout Behavior =====
  fadeRange: 0.5,             // Opacity fade distance
  scaleDistance: 2.0,         // Distance over which scaling occurs (icon units)
  radialPushDistance: 1.3,    // Radial push effect strength
  
  // ===== Playback UI =====
  progressStrokeWidth: 8,     // Circular progress stroke width
  progressRadiusMultiplier: 1.5, // Progress radius = baseIconSize * this
  progressPadding: 24,        // Extra padding for stroke and playhead
  playButtonSize: 38.4,       // Play/pause button diameter
  playButtonIconSize: 16,     // Play/pause icon size
  playheadRadius: 10,         // Playhead circle radius
  playheadHitboxRadius: 24,   // Playhead touch target radius
  
  // ===== Labels & Badges =====
  badgeFontSize: 9,           // Episode badge font size
  badgePadding: 1.5,          // Badge padding (vertical)
  badgePaddingH: 4,           // Badge padding (horizontal)
  badgeBorderRadius: 6,       // Badge border radius
  badgeMinWidth: 12,          // Badge minimum width
  showTitleFontSize: 12,      // Show title font size
  episodeTitleFontSize: 14,   // Episode title font size
  
  // ===== Spacing & Offsets =====
  labelSpacing: 16,           // Spacing between icon and side labels
  verticalLabelOffset: 10,    // Offset for vertical show titles
  playbackTitleTopOffset: 40, // Offset for playback show title
  playbackTitleBottomOffset: 20, // Offset for playback episode title
  
  // ===== Animation Timing =====
  snapDuration: 500,          // Snap animation duration (ms)
  animationDuration: 300,     // General animation duration (ms)
  verticalDragFadeDuration: 400,   // Vertical drag fade duration (ms)
  horizontalDragFadeDuration: 400, // Horizontal drag fade duration (ms)
  
  // ===== Momentum Physics =====
  momentumVelocityScale: 2.0,      // Velocity multiplier (higher = more throw distance)
  momentumFriction: 0.6,          // Friction coefficient (0.9 = high friction, 0.98 = low friction)
  momentumMinDuration: 1000,       // Minimum animation duration (ms) - SLOWED FOR TUNING
  momentumMaxDuration: 1000,       // Maximum animation duration (ms) - SLOWED FOR TUNING
  momentumVelocityThreshold: 0.01, // Minimum velocity to trigger momentum (offset units per frame)
  
  // ===== Interaction Thresholds =====
  directionLockThreshold: 0.2,     // Direction lock threshold (icon units)
  tapTimeThreshold: 200,           // Max time for tap (ms)
  tapDistanceThreshold: 10,        // Max distance for tap (px)
} as const;

/**
 * Computed values derived from base config
 * These are calculated once and cached
 */
export const XMB_COMPUTED = {
  get iconSize(): number {
    return XMB_CONFIG.baseIconSize * XMB_CONFIG.maxZoom;
  },
  
  get progressRadius(): number {
    return XMB_CONFIG.baseIconSize * XMB_CONFIG.progressRadiusMultiplier;
  },
  
  get progressCircumference(): number {
    return 2 * Math.PI * this.progressRadius;
  },
  
  get progressSize(): number {
    return this.progressRadius * 2 + XMB_CONFIG.progressPadding;
  },
  
  // Pixel-based spacing values (computed from icon units)
  get showSpacingPx(): number {
    return XMB_CONFIG.showSpacing * XMB_CONFIG.baseIconSize;
  },
  
  get episodeSpacingPx(): number {
    return XMB_CONFIG.episodeSpacing * XMB_CONFIG.baseIconSize;
  },
  
  get directionLockThresholdPx(): number {
    return XMB_CONFIG.directionLockThreshold * XMB_CONFIG.baseIconSize;
  },
  
  get scaleDistancePx(): number {
    return XMB_CONFIG.scaleDistance * XMB_CONFIG.baseIconSize;
  },
} as const;

/**
 * Generate CSS custom properties from config
 * These can be used in external CSS files
 */
export function generateCSSVariables(): string {
  return `
    :host {
      --xmb-base-icon-size: ${XMB_CONFIG.baseIconSize}px;
      --xmb-icon-size: ${XMB_COMPUTED.iconSize}px;
      --xmb-max-zoom: ${XMB_CONFIG.maxZoom};
      --xmb-progress-radius: ${XMB_COMPUTED.progressRadius}px;
      --xmb-progress-stroke: ${XMB_CONFIG.progressStrokeWidth};
      --xmb-play-button-size: ${XMB_CONFIG.playButtonSize}px;
      --xmb-play-button-icon-size: ${XMB_CONFIG.playButtonIconSize}px;
      --xmb-playhead-radius: ${XMB_CONFIG.playheadRadius}px;
      --xmb-badge-font-size: ${XMB_CONFIG.badgeFontSize}px;
      --xmb-badge-padding-v: ${XMB_CONFIG.badgePadding}px;
      --xmb-badge-padding-h: ${XMB_CONFIG.badgePaddingH}px;
      --xmb-badge-border-radius: ${XMB_CONFIG.badgeBorderRadius}px;
      --xmb-badge-min-width: ${XMB_CONFIG.badgeMinWidth}px;
      --xmb-show-title-font-size: ${XMB_CONFIG.showTitleFontSize}px;
      --xmb-episode-title-font-size: ${XMB_CONFIG.episodeTitleFontSize}px;
      --xmb-label-spacing: ${XMB_CONFIG.labelSpacing}px;
    }
  `.trim();
}
