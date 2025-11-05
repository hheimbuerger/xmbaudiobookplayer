# Implementation Plan

- [ ] 1. Refactor codebase structure and extract XMB controllers
  - [x] 1.1 Create new folder structure
    - Create `src/app/` directory
    - Create `src/xmb/` directory
    - Create `src/xmb/controllers/` directory
    - Create `src/catalog/` directory
    - Create `src/catalog/audiobookshelf/` directory
    - Create `src/components/` directory (rename from ui)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x] 1.2 Consolidate and move catalog types
    - [x] 1.2.1 Merge shows.ts into media-repository.ts
      - Copy Episode and Show interfaces from `src/types/shows.ts` into `src/types/media-repository.ts`
      - Update import in media-repository.ts to remove shows.ts reference
      - Verify all types are exported
      - _Requirements: 2.1, 2.2_
    
    - [x] 1.2.2 Move merged file to catalog
      - Move `src/types/media-repository.ts` to `src/catalog/media-repository.ts`
      - _Requirements: 2.5_
    
    - [x] 1.2.3 Update imports in audiobookshelf repository
      - Update import in `src/repositories/audiobookshelf.ts` to reference `../catalog/media-repository.js`
      - _Requirements: 2.3_
    
    - [x] 1.2.4 Delete old shows.ts file
      - Delete `src/types/shows.ts`
      - _Requirements: 2.4_

  - [x] 1.3 Move and organize audiobookshelf repository
    - [x] 1.3.1 Move audiobookshelf to catalog subfolder
      - Move `src/repositories/audiobookshelf.ts` to `src/catalog/audiobookshelf/audiobookshelf-repository.ts`
      - _Requirements: 3.1, 3.2_
    
    - [x] 1.3.2 Update imports in audiobookshelf repository
      - Update import to reference `../media-repository.js` (one level up)
      - _Requirements: 3.3_
    
    - [x] 1.3.3 Verify audiobookshelf functionality
      - Ensure all exports are correct
      - Verify no broken imports
      - _Requirements: 3.5_

  - [x] 1.4 Extract animation controller from XMB browser
    - [x] 1.4.1 Create animation controller class
      - Create `src/xmb/controllers/animation-controller.ts`
      - Define AnimationController class with constructor
      - Add configuration interface for animation settings
      - _Requirements: 4.1_
    
    - [x] 1.4.2 Extract snap animation logic
      - Move snap state (startOffsetX, startOffsetY, startTime, active) to controller
      - Implement startSnap(), isSnapping(), getSnapOffset() methods
      - Extract snap easing calculation (cubic ease-out)
      - _Requirements: 4.2, 4.7_
    
    - [x] 1.4.3 Extract play/pause animation logic
      - Move play animation state (progress, startTime, isAnimatingToPlay, isAnimatingToPause) to controller
      - Implement startPlayAnimation(), startPauseAnimation() methods
      - Implement getPlayAnimationProgress(), isAnimatingToPlay(), isAnimatingToPause() methods
      - Extract bouncy easing calculation (ease-out-back and ease-in-back)
      - _Requirements: 4.3, 4.7_
    
    - [x] 1.4.4 Extract vertical drag fade animation
      - Move vertical drag fade state (active, progress, startTime) to controller
      - Implement startVerticalDragFade(), getVerticalDragFadeProgress() methods
      - Extract fade timing and easing
      - _Requirements: 4.4, 4.7_
    
    - [x] 1.4.5 Extract horizontal drag fade animation
      - Move horizontal drag fade state (active, progress, startTime) to controller
      - Implement startHorizontalDragFade(), getHorizontalDragFadeProgress() methods
      - Extract fade timing and easing
      - _Requirements: 4.5, 4.7_
    
    - [x] 1.4.6 Implement animation update loop
      - Create update(timestamp) method that updates all active animations
      - Return boolean indicating if render is needed
      - Handle animation completion and state transitions
      - _Requirements: 4.6, 4.7_

  - [x] 1.5 Extract drag controller from XMB browser
    - [x] 1.5.1 Create drag controller class
      - Create `src/xmb/controllers/drag-controller.ts`
      - Define DragController class with constructor
      - Define DragState, MomentumState, and DragHistoryPoint interfaces
      - Add configuration interface for drag settings
      - _Requirements: 5.1_
    
    - [x] 1.5.2 Extract drag state management
      - Move dragState (active, startX, startY, startTime, direction, offsetX, offsetY, startedOnPlayButton) to controller
      - Implement startDrag(), updateDrag(), endDrag(), isDragging(), getDragState() methods
      - Extract direction locking logic with threshold
      - _Requirements: 5.2, 5.4, 5.8_
    
    - [x] 1.5.3 Extract momentum logic
      - Move momentumState (active, velocityX, velocityY, startTime, startOffsetX, startOffsetY, direction) to controller
      - Move dragHistory array to controller
      - Implement startMomentum(), updateMomentum(), isMomentumActive(), getMomentumOffset(), stopMomentum() methods
      - Extract velocity calculation from drag history
      - Extract friction and minimum velocity constants
      - _Requirements: 5.3, 5.8_
    
    - [x] 1.5.4 Extract tap detection logic
      - Move didDrag, lastTouchTime, quickTapHandled flags to controller
      - Implement wasQuickTap() method
      - Extract tap time and distance thresholds
      - _Requirements: 5.5, 5.8_
    
    - [x] 1.5.5 Extract circular progress dragging
      - Move circularProgressDragging, circularProgressDragAngle, circularProgressLastAngle to controller
      - Implement startCircularProgressDrag(), updateCircularProgressDrag(), endCircularProgressDrag() methods
      - Implement isCircularProgressDragging() method
      - Extract angle jump prevention logic
      - _Requirements: 5.6, 5.8_
    
    - [x] 1.5.6 Extract drag mode tracking
      - Move verticalDragModeActive and horizontalDragModeActive to controller
      - Implement isVerticalDragMode() and isHorizontalDragMode() methods
      - _Requirements: 5.7, 5.8_

  - [x] 1.6 Extract layout calculator from XMB browser
    - [x] 1.6.1 Create layout calculator module
      - Create `src/xmb/controllers/layout-calculator.ts`
      - Define LayoutConfig, EpisodeLayout, and LabelLayout interfaces
      - _Requirements: 6.1_
    
    - [x] 1.6.2 Extract position calculations
      - Implement calculateEpisodeLayout() function
      - Extract show and episode pixel offset calculations
      - Extract radial push calculations for play mode
      - _Requirements: 6.2, 6.5, 6.7_
    
    - [x] 1.6.3 Extract scale calculations
      - Implement calculateScale() function
      - Extract distance from center calculation
      - Extract zoom level calculation (max scale to min scale based on distance)
      - _Requirements: 6.3, 6.7_
    
    - [x] 1.6.4 Extract opacity calculations
      - Implement calculateOpacity() function
      - Extract current episode visibility logic
      - Extract non-current episode fade logic
      - Extract vertical drag mode fade logic
      - Extract play mode fade logic
      - _Requirements: 6.4, 6.7_
    
    - [x] 1.6.5 Extract label positioning
      - Implement calculateLabelLayout() function
      - Extract label position calculations (x, y offsets)
      - Extract label opacity calculations (show title, episode title, side titles, vertical titles)
      - Extract color transition calculation (blue to white based on distance)
      - Return null if label shouldn't be shown
      - _Requirements: 6.6, 6.7_
    
    - [x] 1.6.6 Extract helper functions
      - Implement calculateRadialPush() helper function
      - Ensure all functions are pure (no side effects)
      - Add JSDoc comments for all functions
      - _Requirements: 6.7_

  - [x] 1.7 Update XMB browser to use controllers
    - [x] 1.7.1 Instantiate controllers in constructor
      - Create AnimationController instance with config
      - Create DragController instance with config
      - Create LayoutConfig object for layout calculator
      - Remove old state variables that moved to controllers
      - _Requirements: 7.1, 7.2_
    
    - [x] 1.7.2 Update animation loop to use animation controller
      - Replace inline snap animation logic with controller calls
      - Replace inline play/pause animation logic with controller calls
      - Replace inline fade animation logic with controller calls
      - Use controller.update() to check if render needed
      - _Requirements: 7.2, 7.7_
    
    - [x] 1.7.3 Update drag handlers to use drag controller
      - Replace inline drag state management with controller calls
      - Replace inline momentum logic with controller calls
      - Replace inline tap detection with controller calls
      - Replace inline circular progress dragging with controller calls
      - _Requirements: 7.3, 7.7_
    
    - [x] 1.7.4 Update render method to use layout calculator
      - Replace inline position calculations with calculateEpisodeLayout()
      - Replace inline label calculations with calculateLabelLayout()
      - Pass config object to layout functions
      - _Requirements: 7.4, 7.7_
    
    - [x] 1.7.5 Verify public API unchanged
      - Ensure all @property decorators are unchanged
      - Ensure all public methods (navigateToEpisode, navigateToNextEpisode, getCurrentSelection) work correctly
      - Ensure all events (episode-change, play-request, pause-request, seek) are still emitted
      - _Requirements: 7.5, 7.6, 7.7_
    
    - [x] 1.7.6 Verify file size reduction
      - Check that xmb-browser.ts is at least 30% smaller
      - Verify code is more readable and focused
      - _Requirements: 7.8_

  - [x] 1.8 Move XMB files to new structure
    - [x] 1.8.1 Move XMB browser component
      - Move `src/components/xmb-browser.ts` to `src/xmb/xmb-browser.ts`
      - Update imports in xmb-browser.ts to reference `../catalog/media-repository.js`
      - Update imports to reference `./controllers/animation-controller.js`, etc.
      - _Requirements: 8.2_
    
    - [x] 1.8.2 Move playback orchestrator
      - Move `src/services/playback-orchestrator.ts` to `src/xmb/playback-orchestrator.ts`
      - Update imports to reference `../catalog/media-repository.js`
      - Update imports to reference `../components/audio-player.js`
      - _Requirements: 8.3_

  - [x] 1.9 Move app and UI components
    - [x] 1.9.1 Move podcast player to app
      - Move `src/components/podcast-player.ts` to `src/app/podcast-player.ts`
      - Update imports to reference `../xmb/xmb-browser.js`
      - Update imports to reference `../xmb/playback-orchestrator.js`
      - Update imports to reference `../components/audio-player.js`
      - Update imports to reference `../catalog/audiobookshelf/audiobookshelf-repository.js`
      - _Requirements: 8.1_
    
    - [x] 1.9.2 Move audio player to components
      - Move `src/components/audio-player.ts` to `src/components/audio-player.ts` (already there, just verify)
      - _Requirements: 8.5_
    
    - [x] 1.9.3 Move fullscreen button to components
      - Move `src/components/fullscreen-button.ts` to `src/components/fullscreen-button.ts` (already there, just verify)
      - _Requirements: 8.5_

  - [x] 1.10 Update main entry point
    - Update `index.html` or main entry file to import from `./app/podcast-player.js`
    - Verify application loads correctly
    - _Requirements: 8.6, 8.7_

  - [x] 1.11 Clean up old structure
    - [x] 1.11.1 Delete old services folder
      - Delete `src/services/` directory
      - Verify no broken imports
      - _Requirements: 10.1, 10.6_
    
    - [x] 1.11.2 Delete old repositories folder
      - Delete `src/repositories/` directory
      - Verify no broken imports
      - _Requirements: 10.2, 10.6_
    
    - [x] 1.11.3 Delete old types folder
      - Delete `src/types/` directory
      - Verify no broken imports
      - _Requirements: 10.3, 10.6_
    
    - [x] 1.11.4 Delete old component files
      - Delete `src/components/xmb-browser.ts` (moved to xmb/)
      - Delete `src/components/podcast-player.ts` (moved to app/)
      - Verify no broken imports
      - _Requirements: 10.4, 10.5, 10.6_
    
    - [x] 1.11.5 Verify build succeeds
      - Run build command
      - Check for TypeScript errors
      - Check for import errors
      - _Requirements: 10.7, 8.7_

  - [ ] 1.12 Test functionality
    - [ ] 1.12.1 Test XMB navigation
      - Test swipe left/right to change shows
      - Test swipe up/down to change episodes
      - Test snap animation
      - Test momentum scrolling
      - _Requirements: 9.1_
    
    - [ ] 1.12.2 Test playback controls
      - Test play button
      - Test pause button
      - Test circular progress scrubber
      - Test seek functionality
      - _Requirements: 9.2_
    
    - [ ] 1.12.3 Test animations
      - Test radial push animation when playing
      - Test radial collapse animation when pausing
      - Test snap animation
      - Test vertical drag fade
      - Test horizontal drag fade
      - _Requirements: 9.3_
    
    - [ ] 1.12.4 Test loading states
      - Test loading animation (track pulse)
      - Test navigation locking during load
      - Test intent preservation during load
      - _Requirements: 9.4_
    
    - [ ] 1.12.5 Test auto-advance
      - Test episode auto-advance at end
      - Test that playback continues after advance
      - Test that last episode stops (no advance)
      - _Requirements: 9.5_
    
    - [ ] 1.12.6 Test progress syncing
      - Test progress updates to repository
      - Test progress sync on pause
      - Test progress sync on seek
      - Test periodic sync during playback
      - _Requirements: 9.6_
    
    - [ ] 1.12.7 Test state persistence
      - Test localStorage save on episode change
      - Test localStorage restore on page load
      - Test current episode restoration
      - _Requirements: 9.7_
    
    - [ ] 1.12.8 Test visual appearance
      - Verify no visual regressions
      - Verify animation timing unchanged
      - Verify layout unchanged
      - _Requirements: 9.8_
