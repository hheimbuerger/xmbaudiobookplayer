# XMB Configuration Specification

## Overview

This specification defines the centralized configuration system for the XMB browser component. All layout, animation, and interaction constants are managed through a single source of truth that can be shared between TypeScript and CSS.

## Architecture

### Core Components

The configuration system consists of three main exports from `src/xmb/xmb-config.ts`:

1. **`XMB_CONFIG`** - Base configuration object containing all tunable constants
2. **`XMB_COMPUTED`** - Derived values calculated from base config using getters
3. **`generateCSSVariables()`** - Function that generates CSS custom properties wrapped in `:host` selector

### CSS Integration

**File Structure:**
- Configuration: `src/xmb/xmb-config.ts`
- Styles: `src/xmb/xmb-browser.css` (imported as string with `?inline` suffix)
- Type declarations: `src/vite-env.d.ts`

**Integration Pattern:**
```typescript
import styles from './xmb-browser.css?inline';
import { generateCSSVariables } from './xmb-config.js';

static styles = [
  css`${unsafeCSS(generateCSSVariables())}`,
  css`${unsafeCSS(styles)}`
];
```

**How it works:**
1. CSS variables are generated and wrapped in `:host` selector
2. Variables are injected first in the component's static styles
3. External CSS file is loaded as string and appended
4. All CSS rules can reference variables via `var(--xmb-*)`

## Configuration Categories

### Visual Sizing

Controls the base size and zoom behavior of episode icons.

```typescript
baseIconSize: 72           // Base icon size at minimum zoom (px)
maxZoom: 1.8              // Maximum zoom factor at center
minZoom: 1.0              // Minimum zoom factor at edges
```

**Computed values:**
- `iconSize` = `baseIconSize * maxZoom` (129.6px)

### Spacing

Defines spacing between shows and episodes in icon units (multiplied by `baseIconSize` for pixel values).

```typescript
showSpacing: 2.0          // Horizontal spacing between shows (icon units)
episodeSpacing: 2.0       // Vertical spacing between episodes (icon units)
```

**Computed values:**
- `showSpacingPx` = `showSpacing * baseIconSize` (144px)
- `episodeSpacingPx` = `episodeSpacing * baseIconSize` (144px)

### Layout Behavior

Controls opacity fading, scaling, and radial push effects.

```typescript
fadeRange: 0.5            // Opacity fade distance (icon units)
scaleDistance: 2.0        // Distance over which scaling occurs (icon units)
radialPushDistance: 1.3   // Radial push effect strength during playback
```

**Computed values:**
- `scaleDistancePx` = `scaleDistance * baseIconSize` (144px)

### Playback UI

Defines the appearance of playback controls (play button, progress circle, playhead).

```typescript
progressStrokeWidth: 8           // Circular progress stroke width (px)
progressRadiusMultiplier: 1.5    // Progress radius = baseIconSize * this
progressPadding: 24              // Extra padding for stroke and playhead (px)
playButtonSize: 38.4             // Play/pause button diameter (px)
playButtonIconSize: 16           // Play/pause icon size (px)
playheadRadius: 10               // Playhead circle radius (px)
playheadHitboxRadius: 24         // Playhead touch target radius (px)
```

**Computed values:**
- `progressRadius` = `baseIconSize * progressRadiusMultiplier` (108px)
- `progressCircumference` = `2 * π * progressRadius` (~678px)
- `progressSize` = `progressRadius * 2 + progressPadding` (240px)

### Labels & Badges

Controls text sizing and spacing for episode badges and labels.

```typescript
badgeFontSize: 9           // Episode badge font size (px)
badgePadding: 1.5          // Badge padding vertical (px)
badgePaddingH: 4           // Badge padding horizontal (px)
badgeBorderRadius: 6       // Badge border radius (px)
badgeMinWidth: 14          // Badge minimum width (px)
showTitleFontSize: 12      // Show title font size (px)
episodeTitleFontSize: 14   // Episode title font size (px)
labelSpacing: 16           // Spacing between icon and side labels (px)
verticalLabelOffset: 10    // Offset for vertical show titles (px)
```

**CSS variables:**
- `--xmb-badge-padding-v` - Vertical padding (can be adjusted with calc())
- `--xmb-badge-padding-h` - Horizontal padding

### Animation Timing

Defines duration for all animations in milliseconds.

```typescript
snapDuration: 500                    // Snap to episode animation (ms)
animationDuration: 300               // General animation duration (ms)
verticalDragFadeDuration: 400        // Vertical drag fade (ms)
horizontalDragFadeDuration: 400      // Horizontal drag fade (ms)
```

### Momentum Physics

Controls the feel of momentum/inertia after drag gestures.

```typescript
momentumVelocityScale: 0.8           // Velocity multiplier
momentumBaseDuration: 400            // Base momentum duration (ms)
momentumSpeedInfluence: 100          // Speed influence factor
momentumDistanceInfluence: 100       // Distance influence factor
momentumEasingPower: 3               // Easing curve power (2=gentle, 3=medium, 4=sharp)
```

**How momentum works:**
- Uses easing-based animation (not physics simulation)
- Duration = `baseDuration + min(speed * speedInfluence, speedInfluence * 2) + min(distance * distanceInfluence, distanceInfluence * 2)`
- Easing = `1 - (1 - progress)^easingPower` (ease-out)

### Interaction Thresholds

Defines thresholds for gesture detection.

```typescript
directionLockThreshold: 0.2          // Direction lock threshold (icon units)
tapTimeThreshold: 200                // Max time for tap (ms)
tapDistanceThreshold: 10             // Max distance for tap (px)
```

**Computed values:**
- `directionLockThresholdPx` = `directionLockThreshold * baseIconSize` (14.4px)

## Usage Patterns

### TypeScript Usage

```typescript
import { XMB_CONFIG, XMB_COMPUTED } from './xmb-config.js';

// Use base config values
const duration = XMB_CONFIG.snapDuration;
const maxZoom = XMB_CONFIG.maxZoom;

// Use computed values
const iconSize = XMB_COMPUTED.iconSize;
const spacing = XMB_COMPUTED.showSpacingPx;
const progressRadius = XMB_COMPUTED.progressRadius;

// Initialize controllers with config
this.dragController = new DragController({
  showSpacing: XMB_COMPUTED.showSpacingPx,
  episodeSpacing: XMB_COMPUTED.episodeSpacingPx,
  directionLockThreshold: XMB_COMPUTED.directionLockThresholdPx,
  momentumVelocityScale: XMB_CONFIG.momentumVelocityScale,
  // ... other config values
});
```

### CSS Usage

```css
.episode-badge {
  font-size: var(--xmb-badge-font-size);
  padding-top: calc(var(--xmb-badge-padding-v) + 1px);
  padding-bottom: calc(var(--xmb-badge-padding-v) - 1px);
  padding-left: var(--xmb-badge-padding-h);
  padding-right: var(--xmb-badge-padding-h);
  border-radius: var(--xmb-badge-border-radius);
  min-width: var(--xmb-badge-min-width);
}

.play-pause-overlay {
  width: var(--xmb-play-button-size);
  height: var(--xmb-play-button-size);
}

.play-pause-overlay svg {
  width: var(--xmb-play-button-icon-size);
  height: var(--xmb-play-button-icon-size);
}

.circular-progress .track {
  stroke-width: var(--xmb-progress-stroke);
}
```

## Type Declarations

The `src/vite-env.d.ts` file provides TypeScript support for CSS imports with the `?inline` suffix:

```typescript
/// <reference types="vite/client" />

declare module '*.css?inline' {
  const content: string;
  export default content;
}
```

This allows Vite to import CSS files as strings for use in Lit's `unsafeCSS()`.

## Design Principles

### Single Source of Truth

All configuration values are defined once in `XMB_CONFIG`. Derived values are calculated in `XMB_COMPUTED` using getters. This ensures:
- No duplicate definitions
- Changes propagate automatically
- Easy to find and modify values

### Type Safety

The configuration is a TypeScript object with `as const` assertion, providing:
- Autocomplete in IDEs
- Type checking at compile time
- Prevents accidental modifications

### CSS Integration

CSS variables bridge the gap between TypeScript and CSS:
- TypeScript defines the values
- CSS references them via custom properties
- Changes in config automatically update CSS
- No need to manually sync values

### Clear Organization

Configuration is grouped by category:
- Visual Sizing - How big things are
- Spacing - How far apart things are
- Layout Behavior - How things fade and scale
- Playback UI - Playback control appearance
- Labels & Badges - Text and badge styling
- Animation Timing - How long animations take
- Momentum Physics - How momentum feels
- Interaction Thresholds - When gestures trigger

## Maintenance Guidelines

### Adding New Configuration

1. Add to `XMB_CONFIG` object in `src/xmb/xmb-config.ts`
2. If it's a derived value, add to `XMB_COMPUTED` as a getter
3. If CSS needs it, add to `generateCSSVariables()` function
4. Update this specification
5. Update `specs/xmb-architecture.md` if it affects architecture

### Removing Configuration

1. Search for all usages in TypeScript and CSS
2. Remove from `XMB_CONFIG` or `XMB_COMPUTED`
3. Remove from `generateCSSVariables()` if present
4. Update this specification
5. Update `specs/xmb-architecture.md` if it affects architecture

### Modifying Configuration

1. Update value in `XMB_CONFIG`
2. If it affects computed values, verify `XMB_COMPUTED` logic
3. Test in browser to verify visual changes
4. Update documentation if the meaning or purpose changed

## Migration History

### Removed Legacy Parameters

The following parameters were removed from `DragConfig` as they were unused:
- `momentumFriction` - Not used in easing-based momentum
- `momentumMinVelocity` - Not used in easing-based momentum

The new momentum system uses easing-based animation with configurable duration and easing power instead of physics-based friction simulation.

### CSS Variable Scoping Fix

Initially, CSS variables were generated without a `:host` selector, causing them to not be available to CSS rules. This was fixed by wrapping all variables in `:host` in the `generateCSSVariables()` function.

### Badge Padding Split

Badge padding was split from a shorthand (`padding: 1.5px 4px`) into separate vertical and horizontal variables (`--xmb-badge-padding-v` and `--xmb-badge-padding-h`) to allow asymmetric padding adjustments for better vertical centering of badge numbers.

## Benefits

1. **Single Source of Truth** - All constants in one place, no duplication
2. **Type Safety** - TypeScript ensures correct usage and prevents typos
3. **CSS Integration** - CSS and TypeScript share the same values automatically
4. **Easy Experimentation** - Change one value, see it everywhere instantly
5. **Clear Organization** - Constants grouped by category with documentation
6. **No Magic Numbers** - All values are named and their purpose is clear
7. **Computed Values** - Derived values calculated automatically, no manual sync
8. **Maintainability** - Easy to find, modify, and understand configuration
