# Design Document

## Overview

This document describes the design for refactoring the podcast player codebase to improve organization and maintainability. The refactoring involves two major changes:

1. **Reorganize by responsibility** - Move from technical layers (services/, repositories/, types/) to domain/feature folders (app/, xmb/, catalog/, components/)
2. **Extract XMB controllers** - Split the large xmb-browser component into smaller, focused modules

## Architecture

### New Folder Structure

```
src/
├── app/
│   └── podcast-player.ts           # Main application component
│
├── xmb/                            # XMB browser feature
│   ├── xmb-browser.ts              # Main XMB component (Lit)
│   ├── playback-orchestrator.ts    # State machine (EventTarget)
│   └── controllers/
│       ├── animation-controller.ts # Animation logic (class)
│       ├── drag-controller.ts      # Input handling (class)
│       └── layout-calculator.ts    # Layout math (pure functions)
│
├── catalog/                        # Data layer
│   ├── media-repository.ts         # Interfaces + types
│   └── audiobookshelf/
│       └── audiobookshelf-repository.ts
│
└── components/                     # Generic UI components
    ├── audio-player.ts             # Audio playback (Lit)
    └── fullscreen-button.ts        # Fullscreen toggle (Lit)
```

### Dependency Graph

```
app/podcast-player.ts
    ├─> xmb/xmb-browser.ts
    │   ├─> xmb/controllers/animation-controller.ts
    │   ├─> xmb/controllers/drag-controller.ts
    │   └─> xmb/controllers/layout-calculator.ts
    ├─> xmb/playback-orchestrator.ts
    │   ├─> catalog/media-repository.ts
    │   └─> components/audio-player.ts
    ├─> components/audio-player.ts
    └─> catalog/audiobookshelf/audiobookshelf-repository.ts
        └─> catalog/media-repository.ts
```

## Components and Interfaces

### Animation Controller

**Purpose:** Manages all animation state and timing calculations for the XMB browser.

**Type:** Plain TypeScript class (not a Lit component)

**Responsibilities:**
- Snap animation (easing, progress, completion)
- Play/pause animation (radial push/collapse)
- Vertical drag fade animation
- Horizontal drag fade animation
- Animation timing and state tracking

**Public Interface:**
```typescript
class AnimationController {
  // Snap animation
  startSnap(offsetX: number, offsetY: number): void;
  isSnapping(): boolean;
  getSnapOffset(): { x: number; y: number };
  
  // Play/pause animation
  startPlayAnimation(): void;
  startPauseAnimation(): void;
  isAnimatingToPlay(): boolean;
  isAnimatingToPause(): boolean;
  getPlayAnimationProgress(): number; // 0-1
  
  // Drag fade animations
  startVerticalDragFade(active: boolean): void;
  getVerticalDragFadeProgress(): number; // 0-1
  startHorizontalDragFade(active: boolean): void;
  getHorizontalDragFadeProgress(): number; // 0-1
  
  // Update loop
  update(timestamp: number): boolean; // Returns true if needs render
}
```

**Design Notes:**
- Uses performance.now() for timing
- Returns boolean from update() to indicate if render needed
- Stateful but encapsulated - all animation state lives here
- No DOM manipulation - just calculations

### Drag Controller

**Purpose:** Handles all drag and touch input, including direction locking and momentum.

**Type:** Plain TypeScript class (not a Lit component)

**Responsibilities:**
- Drag state management (active, direction, offsets)
- Momentum calculations and friction
- Direction locking after threshold
- Tap vs drag detection
- Circular progress dragging
- Drag history tracking for velocity

**Public Interface:**
```typescript
interface DragState {
  active: boolean;
  startX: number;
  startY: number;
  startTime: number;
  direction: 'horizontal' | 'vertical' | null;
  offsetX: number;
  offsetY: number;
  startedOnPlayButton: boolean;
}

interface MomentumState {
  active: boolean;
  velocityX: number;
  velocityY: number;
  startTime: number;
  startOffsetX: number;
  startOffsetY: number;
  direction: 'horizontal' | 'vertical' | null;
}

class DragController {
  // Drag handling
  startDrag(x: number, y: number, startedOnPlayButton: boolean): void;
  updateDrag(x: number, y: number): void;
  endDrag(): { showDelta: number; episodeDelta: number; didDrag: boolean };
  isDragging(): boolean;
  getDragState(): DragState;
  
  // Momentum
  startMomentum(): void;
  updateMomentum(): void;
  isMomentumActive(): boolean;
  getMomentumOffset(): { x: number; y: number };
  stopMomentum(): void;
  
  // Circular progress
  startCircularProgressDrag(angle: number): void;
  updateCircularProgressDrag(angle: number): void;
  endCircularProgressDrag(): number; // Returns final progress 0-1
  isCircularProgressDragging(): boolean;
  
  // Tap detection
  wasQuickTap(): boolean;
  
  // Mode tracking
  isVerticalDragMode(): boolean;
  isHorizontalDragMode(): boolean;
}
```

**Design Notes:**
- Encapsulates all drag-related state
- Provides high-level methods for component to call
- Handles threshold calculations internally
- Returns deltas for component to apply to navigation
- No DOM manipulation - just state and calculations

### Layout Calculator

**Purpose:** Pure functions for calculating positions, scales, and opacities.

**Type:** Plain TypeScript module with exported functions (not a class)

**Responsibilities:**
- Position calculations (pixel offsets from logical offsets)
- Scale calculations based on distance from center
- Opacity/fade calculations
- Radial push calculations
- Label positioning

**Public Interface:**
```typescript
interface LayoutConfig {
  iconSize: number;
  showSpacing: number;
  episodeSpacing: number;
  maxScale: number;
  minScale: number;
  scaleDistance: number;
  fadeRange: number;
  radialPushDistance: number;
}

interface EpisodeLayout {
  x: number;
  y: number;
  scale: number;
  opacity: number;
}

interface LabelLayout {
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

// Pure functions
export function calculateEpisodeLayout(
  showIndex: number,
  episodeIndex: number,
  currentShowIndex: number,
  currentEpisodeIndex: number,
  offsetX: number,
  offsetY: number,
  playAnimationProgress: number,
  verticalDragFadeProgress: number,
  config: LayoutConfig
): EpisodeLayout;

export function calculateLabelLayout(
  show: Show,
  episode: Episode,
  episodeLayout: EpisodeLayout,
  showIndex: number,
  currentShowIndex: number,
  verticalDragFadeProgress: number,
  horizontalDragFadeProgress: number,
  config: LayoutConfig
): LabelLayout | null;

export function calculateRadialPush(
  offsetX: number,
  offsetY: number,
  pushDistance: number
): { x: number; y: number };

export function calculateScale(
  distanceFromCenter: number,
  scaleDistance: number,
  maxScale: number,
  minScale: number
): number;

export function calculateOpacity(
  showOffset: number,
  isCurrentEpisode: boolean,
  isCurrentShow: boolean,
  fadeRange: number,
  verticalDragFadeProgress: number,
  playAnimationProgress: number,
  isCenterEpisode: boolean
): number;
```

**Design Notes:**
- All functions are pure (no side effects)
- Easy to test - just input/output
- Can be memoized if needed for performance
- Config object passed in for flexibility
- Returns null from calculateLabelLayout if label shouldn't be shown

### Updated XMB Browser Component

**Changes:**
- Instantiate controllers in constructor
- Replace inline logic with controller calls
- Maintain same public API (properties, methods, events)
- Focus on rendering and coordination

**Before (approximate size):**
- ~1300 lines
- Mixed concerns (rendering, animation, drag, layout)

**After (target size):**
- ~800-900 lines
- Focused on rendering and coordination
- Controllers handle complex logic

**Example refactored code:**
```typescript
export class XmbBrowser extends LitElement {
  // Controllers
  private animationController: AnimationController;
  private dragController: DragController;
  
  constructor() {
    super();
    this.animationController = new AnimationController({
      snapDuration: 500,
      animationDuration: 300,
      // ... other config
    });
    this.dragController = new DragController({
      showSpacing: this.SHOW_SPACING,
      episodeSpacing: this.EPISODE_SPACING,
      // ... other config
    });
  }
  
  private _startAnimation(): void {
    const animate = (): void => {
      const timestamp = performance.now();
      let needsRender = false;
      
      // Delegate to controllers
      needsRender = this.animationController.update(timestamp) || needsRender;
      needsRender = this.dragController.updateMomentum() || needsRender;
      
      if (needsRender) {
        this._render();
      }
      
      this.animationFrameId = requestAnimationFrame(animate);
    };
    animate();
  }
  
  private _render(): void {
    // Get state from controllers
    const snapOffset = this.animationController.getSnapOffset();
    const momentumOffset = this.dragController.getMomentumOffset();
    const dragState = this.dragController.getDragState();
    
    // Calculate which offset to use
    let offsetX = 0, offsetY = 0;
    if (dragState.active) {
      offsetX = dragState.offsetX;
      offsetY = dragState.offsetY;
    } else if (this.dragController.isMomentumActive()) {
      offsetX = momentumOffset.x;
      offsetY = momentumOffset.y;
    } else if (this.animationController.isSnapping()) {
      offsetX = snapOffset.x;
      offsetY = snapOffset.y;
    }
    
    // Use layout calculator for positions
    this.episodeElements.forEach(({ element, showIndex, episodeIndex }) => {
      const layout = calculateEpisodeLayout(
        showIndex,
        episodeIndex,
        this.currentShowIndex,
        currentEpisodeIndex,
        offsetX,
        offsetY,
        this.animationController.getPlayAnimationProgress(),
        this.animationController.getVerticalDragFadeProgress(),
        this.layoutConfig
      );
      
      element.style.transform = `translate(calc(-50% + ${layout.x}px), calc(-50% + ${layout.y}px)) scale(${layout.scale})`;
      element.style.opacity = layout.opacity.toString();
    });
  }
}
```

## Data Layer Consolidation

### Merged media-repository.ts

**Contents:**
```typescript
// From shows.ts
export interface Episode { ... }
export interface Show { ... }

// From media-repository.ts
export interface PlaybackSession { ... }
export interface MediaRepository { ... }
```

**Rationale:**
- These types are tightly coupled
- Repository returns Shows, so they belong together
- Reduces file count and import complexity
- Single source of truth for data contracts

### Audiobookshelf Subfolder

**Structure:**
```
catalog/audiobookshelf/
└── audiobookshelf-repository.ts
```

**Future expansion:**
```
catalog/audiobookshelf/
├── audiobookshelf-repository.ts
├── audiobookshelf-types.ts      # ABS API response types
└── audiobookshelf-config.ts     # ABS-specific constants
```

**Rationale:**
- Room for implementation-specific files
- Clear separation between interface and implementation
- Easy to add new repository implementations (e.g., catalog/spotify/)

## Migration Strategy

### Phase 1: Create New Structure
1. Create new folders (app/, xmb/, catalog/, components/)
2. Create xmb/controllers/ subfolder
3. Create catalog/audiobookshelf/ subfolder

### Phase 2: Consolidate Catalog
1. Merge shows.ts into media-repository.ts
2. Move merged file to catalog/media-repository.ts
3. Update imports in audiobookshelf.ts
4. Move audiobookshelf.ts to catalog/audiobookshelf/audiobookshelf-repository.ts

### Phase 3: Extract Controllers
1. Create animation-controller.ts with extracted logic
2. Create drag-controller.ts with extracted logic
3. Create layout-calculator.ts with extracted functions
4. Update xmb-browser.ts to use controllers
5. Test that all behavior is preserved

### Phase 4: Move Components
1. Move xmb-browser.ts to xmb/
2. Move playback-orchestrator.ts to xmb/
3. Move podcast-player.ts to app/
4. Move audio-player.ts and fullscreen-button.ts to components/
5. Update all imports

### Phase 5: Clean Up
1. Delete old folders (services/, repositories/, types/)
2. Delete old component files
3. Verify build succeeds
4. Test application functionality

## Testing Strategy

### Unit Tests (Future)
- Test animation controller timing and easing
- Test drag controller direction locking
- Test layout calculator pure functions
- Test with various inputs and edge cases

### Integration Testing
- Manual testing of all XMB interactions
- Verify navigation (swipe, snap, momentum)
- Verify playback controls (play, pause, seek)
- Verify animations (radial push, fade)
- Verify loading states
- Verify auto-advance

### Regression Testing
- Compare behavior before and after refactoring
- Check for visual differences
- Check for timing differences
- Verify no console errors

## Error Handling

### Controller Errors
- Controllers should not throw errors
- Invalid inputs should be handled gracefully
- Return safe defaults if calculations fail

### Import Errors
- TypeScript will catch broken imports at compile time
- Verify all imports before committing
- Use IDE refactoring tools when possible

## Performance Considerations

### No Performance Regression
- Controllers add minimal overhead (just function calls)
- Pure functions in layout calculator can be optimized
- Animation loop structure unchanged
- Same requestAnimationFrame approach

### Potential Improvements
- Layout calculator functions could be memoized
- Drag history could be optimized
- Animation state could be more efficient

### Measurement
- Monitor frame rate during animations
- Check for jank during drag operations
- Verify smooth 60fps performance

## Rollback Plan

If issues are discovered:
1. Git revert to previous commit
2. Identify specific problem
3. Fix in isolation
4. Re-apply refactoring incrementally

## Success Criteria

1. All existing functionality works identically
2. No visual or timing regressions
3. Code is more organized and maintainable
4. XMB browser component is significantly smaller
5. Controllers are isolated and testable
6. Import paths are clean and logical
7. Build succeeds without errors
8. No console errors or warnings
