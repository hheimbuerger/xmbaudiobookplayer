/**
 * Layout calculator for XMB browser
 * Pure functions for calculating episode positions, scales, and opacities
 */

export interface LayoutConfig {
  showSpacing: number;
  episodeSpacing: number;
  fadeRange: number;
  maxScale: number;
  minScale: number;
  scaleDistance: number;
  radialPushDistance: number;
  baseIconSize: number;
}

export interface EpisodeLayout {
  x: number;
  y: number;
  scale: number;
  opacity: number;
}

export interface LabelLayout {
  showTitle: string;
  episodeTitle: string;
  x: number;
  y: number;
  showTitleOpacity: number;
  episodeTitleOpacity: number;
  sideEpisodeTitleOpacity: number;
  verticalShowTitleOpacity: number;
  showIndex: number;
  scale: number;
  color: string;
}


/**
 * Calculate radial push offset for play mode animation
 * Pushes non-center episodes away from center in a radial pattern
 */
export function calculateRadialPush(
  showOffsetFromCenter: number,
  episodeOffsetFromCenter: number,
  showPixelOffsetX: number,
  episodePixelOffsetY: number,
  pushDistance: number
): { x: number; y: number } {
  // Calculate direction from center
  if (showOffsetFromCenter !== 0 || episodeOffsetFromCenter !== 0) {
    const angle = Math.atan2(episodePixelOffsetY, showPixelOffsetX);
    return {
      x: showPixelOffsetX + Math.cos(angle) * pushDistance,
      y: episodePixelOffsetY + Math.sin(angle) * pushDistance,
    };
  } else {
    // Fallback: push down if exactly at center (shouldn't happen)
    return {
      x: showPixelOffsetX,
      y: episodePixelOffsetY + pushDistance,
    };
  }
}

/**
 * Calculate episode layout (position and scale)
 * 
 * @param showIndex - Index of the show
 * @param episodeIndex - Index of the episode within the show
 * @param currentShowIndex - Index of the currently selected show
 * @param currentEpisodeIndex - Index of the currently selected episode
 * @param offsetX - Horizontal drag/animation offset
 * @param offsetY - Vertical drag/animation offset
 * @param playAnimationProgress - Progress of play animation (0-1)
 * @param inlinePlaybackControls - Whether inline controls are enabled
 * @param config - Layout configuration
 * @returns Episode layout with position and scale
 */
export function calculateEpisodeLayout(
  showIndex: number,
  episodeIndex: number,
  currentShowIndex: number,
  currentEpisodeIndex: number,
  offsetX: number,
  offsetY: number,
  playAnimationProgress: number,
  inlinePlaybackControls: boolean,
  config: LayoutConfig
): EpisodeLayout {
  const showOffsetFromCenter = showIndex - currentShowIndex + offsetX;
  const isCurrentShow = showIndex === currentShowIndex;
  const episodeOffsetFromCenter =
    episodeIndex - currentEpisodeIndex + (isCurrentShow ? offsetY : 0);

  let showPixelOffsetX = showOffsetFromCenter * config.showSpacing;
  let episodePixelOffsetY = episodeOffsetFromCenter * config.episodeSpacing;

  // Apply radial push when playing (only if inline controls enabled)
  const isCenterEpisode = showIndex === currentShowIndex && episodeIndex === currentEpisodeIndex;
  if (!isCenterEpisode && playAnimationProgress > 0 && inlinePlaybackControls) {
    const pushDistance = config.radialPushDistance * config.baseIconSize * playAnimationProgress;
    const pushed = calculateRadialPush(
      showOffsetFromCenter,
      episodeOffsetFromCenter,
      showPixelOffsetX,
      episodePixelOffsetY,
      pushDistance
    );
    showPixelOffsetX = pushed.x;
    episodePixelOffsetY = pushed.y;
  }

  // Calculate distance and scale
  const distanceFromScreenCenter = Math.sqrt(
    showPixelOffsetX * showPixelOffsetX + episodePixelOffsetY * episodePixelOffsetY
  );
  
  const zoomLevel = Math.max(
    config.minScale,
    config.maxScale - distanceFromScreenCenter / config.scaleDistance
  );
  
  const renderScale = zoomLevel / config.maxScale;

  return {
    x: showPixelOffsetX,
    y: episodePixelOffsetY,
    scale: renderScale,
    opacity: 0, // Will be calculated separately
  };
}


/**
 * Calculate scale based on distance from center
 * 
 * @param distanceFromCenter - Distance in pixels from screen center
 * @param config - Layout configuration
 * @returns Scale value (maxScale at center, minScale at distance)
 */
export function calculateScale(
  distanceFromCenter: number,
  config: LayoutConfig
): number {
  const zoomLevel = Math.max(
    config.minScale,
    config.maxScale - distanceFromCenter / config.scaleDistance
  );
  
  // Return render scale (normalized to maxScale)
  return zoomLevel / config.maxScale;
}


/**
 * Calculate opacity for an episode
 * 
 * @param showIndex - Index of the show
 * @param episodeIndex - Index of the episode within the show
 * @param currentShowIndex - Index of the currently selected show
 * @param currentEpisodeIndex - Index of the currently selected episode
 * @param showOffsetFromCenter - Show offset from center (in show units)
 * @param isCurrentShow - Whether this is the current show
 * @param isCenterEpisode - Whether this is the center episode
 * @param verticalDragFadeProgress - Progress of vertical drag fade (0-1)
 * @param playAnimationProgress - Progress of play animation (0-1)
 * @param inlinePlaybackControls - Whether inline controls are enabled
 * @param config - Layout configuration
 * @returns Opacity value (0-1)
 */
export function calculateOpacity(
  _showIndex: number,
  episodeIndex: number,
  _currentShowIndex: number,
  currentEpisodeIndex: number,
  showOffsetFromCenter: number,
  isCurrentShow: boolean,
  isCenterEpisode: boolean,
  verticalDragFadeProgress: number,
  playAnimationProgress: number,
  inlinePlaybackControls: boolean,
  config: LayoutConfig
): number {
  let opacity = 0;
  const isCurrentEpisodeOfShow = episodeIndex === currentEpisodeIndex;

  if (isCurrentEpisodeOfShow) {
    // Current episode of every show is always visible
    opacity = 1.0;
  } else {
    // Non-current episodes only visible when on their show (within fade range)
    const absShowOffset = Math.abs(showOffsetFromCenter);
    if (absShowOffset <= config.fadeRange) {
      opacity = 1.0 - absShowOffset / config.fadeRange;
    }
  }

  // During vertical drag mode, fade non-current shows to 25% opacity
  if (verticalDragFadeProgress > 0 && !isCurrentShow) {
    opacity = opacity * (1 - verticalDragFadeProgress * 0.75);
  }

  // During play mode, fade non-center episodes to 25% opacity (only if inline controls enabled)
  if (inlinePlaybackControls && playAnimationProgress > 0 && !isCenterEpisode) {
    opacity = opacity * (1 - playAnimationProgress * 0.75);
  }

  return opacity;
}


/**
 * Calculate label layout for an episode
 * Returns null if the label should not be shown
 * 
 * @param showTitle - Title of the show
 * @param episodeTitle - Title of the episode
 * @param showIndex - Index of the show
 * @param episodeIndex - Index of the episode within the show
 * @param currentShowIndex - Index of the currently selected show
 * @param currentEpisodeIndex - Index of the currently selected episode
 * @param x - X position of the episode
 * @param y - Y position of the episode
 * @param distanceFromCenter - Distance from screen center
 * @param scale - Scale of the episode
 * @param opacity - Opacity of the episode
 * @param isCurrentShow - Whether this is the current show
 * @param isCurrentEpisodeOfShow - Whether this is the current episode of its show
 * @param verticalDragFadeProgress - Progress of vertical drag fade (0-1)
 * @param horizontalDragFadeProgress - Progress of horizontal drag fade (0-1)
 * @param config - Layout configuration
 * @returns Label layout or null if label should not be shown
 */
export function calculateLabelLayout(
  showTitle: string,
  episodeTitle: string,
  showIndex: number,
  _episodeIndex: number,
  _currentShowIndex: number,
  _currentEpisodeIndex: number,
  x: number,
  y: number,
  distanceFromCenter: number,
  scale: number,
  opacity: number,
  isCurrentShow: boolean,
  isCurrentEpisodeOfShow: boolean,
  verticalDragFadeProgress: number,
  horizontalDragFadeProgress: number,
  config: LayoutConfig
): LabelLayout | null {
  // Don't show label if episode is not visible
  if (opacity <= 0) {
    return null;
  }

  let showTitleOpacity = 0;
  let episodeTitleOpacity = 0;
  let sideEpisodeTitleOpacity = 0;
  let verticalShowTitleOpacity = 0;

  // Side episode titles: show for ALL episodes during vertical drag mode
  if (isCurrentShow && verticalDragFadeProgress > 0) {
    sideEpisodeTitleOpacity = verticalDragFadeProgress;
  }

  // Vertical show titles: show for center episode of each show during horizontal drag mode
  if (isCurrentEpisodeOfShow && horizontalDragFadeProgress > 0) {
    verticalShowTitleOpacity = horizontalDragFadeProgress;
  }

  // Calculate color transition from blue to white based on distance from center
  const colorTransitionDistance = config.scaleDistance;
  const distanceRatio = Math.min(1, distanceFromCenter / colorTransitionDistance);

  // Interpolate between vibrant blue (#3b82f6) and bright white (rgba(255, 255, 255, 1.0))
  // Round to reduce unique color values and improve template caching
  const r = Math.round((59 + (255 - 59) * distanceRatio) / 5) * 5;
  const g = Math.round((130 + (255 - 130) * distanceRatio) / 5) * 5;
  const b = Math.round((246 + (255 - 246) * distanceRatio) / 5) * 5;
  const a = 1.0;
  const color = `rgba(${r}, ${g}, ${b}, ${a})`;

  return {
    showTitle,
    episodeTitle,
    x,
    y,
    showTitleOpacity,
    episodeTitleOpacity,
    sideEpisodeTitleOpacity,
    verticalShowTitleOpacity,
    showIndex,
    scale,
    color,
  };
}
