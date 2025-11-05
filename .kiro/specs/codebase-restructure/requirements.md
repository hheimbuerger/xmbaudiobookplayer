# Requirements Document

## Introduction

This specification describes a comprehensive refactoring of the podcast player codebase to improve organization, maintainability, and separation of concerns. The refactoring will reorganize files by responsibility rather than technical layer, and extract complex logic from the XMB browser component into dedicated controller modules.

## Glossary

- **XMB Browser**: The Cross Media Bar browser component that provides the visual interface for navigating shows and episodes
- **Playback Orchestrator**: The state machine that coordinates playback between UI components, audio player, and media repository
- **Controller**: A plain TypeScript class that encapsulates specific logic (animation, drag handling, layout calculations) without rendering UI
- **Catalog**: The data layer that defines media repository interfaces and implementations
- **Repository**: An implementation of the MediaRepository interface that fetches data from a specific backend (e.g., Audiobookshelf)
- **Component**: A Lit web component that renders UI
- **App Component**: The top-level podcast-player component that wires together all features

## Requirements

### Requirement 1: Organize Codebase by Responsibility

**User Story:** As a developer, I want the codebase organized by responsibility (feature/domain) rather than technical layer, so that I can easily find related code and understand the system architecture.

#### Acceptance Criteria

1. THE System SHALL create a new folder structure with four top-level directories: `app/`, `xmb/`, `catalog/`, and `components/`
2. THE System SHALL place the podcast-player component in `app/` to indicate it is the main application component
3. THE System SHALL place all XMB-related code (browser, orchestrator, controllers) in `xmb/` to group the feature together
4. THE System SHALL place all data layer code (repository interface and implementations) in `catalog/` to separate data concerns
5. THE System SHALL place generic, reusable UI components (audio-player, fullscreen-button) in `components/` to distinguish them from feature-specific code

### Requirement 2: Consolidate Catalog Types

**User Story:** As a developer, I want Show, Episode, and MediaRepository types in a single file, so that I can see the complete data contract in one place.

#### Acceptance Criteria

1. THE System SHALL merge the contents of `types/shows.ts` into `types/media-repository.ts`
2. THE System SHALL export Episode, Show, PlaybackSession, and MediaRepository interfaces from the merged file
3. THE System SHALL update all imports throughout the codebase to reference the consolidated file
4. THE System SHALL delete the original `types/shows.ts` file after migration
5. THE System SHALL move the merged file to `catalog/media-repository.ts` in the new structure

### Requirement 3: Organize Repository Implementations

**User Story:** As a developer, I want repository implementations in dedicated subfolders, so that each implementation can have its own supporting files and the structure can accommodate multiple backends.

#### Acceptance Criteria

1. THE System SHALL create a subfolder `catalog/audiobookshelf/` for the Audiobookshelf implementation
2. THE System SHALL move `repositories/audiobookshelf.ts` to `catalog/audiobookshelf/audiobookshelf-repository.ts`
3. THE System SHALL update all imports to reference the new location
4. THE System SHALL delete the original `repositories/` folder after migration
5. THE System SHALL preserve all existing functionality of the Audiobookshelf repository

### Requirement 4: Extract Animation Controller

**User Story:** As a developer, I want animation logic extracted from the XMB browser component, so that animation behavior is isolated, testable, and easier to maintain.

#### Acceptance Criteria

1. THE System SHALL create `xmb/controllers/animation-controller.ts` as a plain TypeScript class
2. THE System SHALL extract snap animation logic (state, timing, easing) from xmb-browser into the animation controller
3. THE System SHALL extract play/pause animation logic (radial push/collapse) from xmb-browser into the animation controller
4. THE System SHALL extract vertical/horizontal drag fade animations from xmb-browser into the animation controller
5. THE System SHALL provide methods for starting animations, checking animation state, and getting current animation values
6. THE System SHALL maintain the animation loop in xmb-browser but delegate calculations to the controller
7. THE System SHALL preserve all existing animation behavior and timing

### Requirement 5: Extract Drag Controller

**User Story:** As a developer, I want drag and touch handling logic extracted from the XMB browser component, so that input handling is isolated and easier to test.

#### Acceptance Criteria

1. THE System SHALL create `xmb/controllers/drag-controller.ts` as a plain TypeScript class
2. THE System SHALL extract drag state management (active, direction, offsets) from xmb-browser into the drag controller
3. THE System SHALL extract momentum state and calculations from xmb-browser into the drag controller
4. THE System SHALL extract direction locking logic from xmb-browser into the drag controller
5. THE System SHALL extract tap vs drag detection logic from xmb-browser into the drag controller
6. THE System SHALL extract circular progress dragging logic from xmb-browser into the drag controller
7. THE System SHALL provide methods for handling drag start, move, and end events
8. THE System SHALL preserve all existing drag behavior including touch and mouse support

### Requirement 6: Extract Layout Calculator

**User Story:** As a developer, I want layout and positioning calculations extracted from the XMB browser component, so that the mathematical logic is isolated and testable.

#### Acceptance Criteria

1. THE System SHALL create `xmb/controllers/layout-calculator.ts` as a plain TypeScript module with pure functions
2. THE System SHALL extract position calculations (show/episode offsets) from xmb-browser into the layout calculator
3. THE System SHALL extract scale calculations based on distance from center into the layout calculator
4. THE System SHALL extract opacity/fade calculations into the layout calculator
5. THE System SHALL extract radial push calculations into the layout calculator
6. THE System SHALL extract label positioning calculations into the layout calculator
7. THE System SHALL implement all functions as pure functions (no side effects) that take inputs and return outputs
8. THE System SHALL preserve all existing visual layout behavior

### Requirement 7: Update XMB Browser Component

**User Story:** As a developer, I want the XMB browser component to use the extracted controllers, so that the component focuses on rendering and coordination rather than complex logic.

#### Acceptance Criteria

1. THE System SHALL instantiate animation, drag, and layout controllers in the xmb-browser constructor
2. THE System SHALL replace inline animation logic with calls to the animation controller
3. THE System SHALL replace inline drag handling with calls to the drag controller
4. THE System SHALL replace inline layout calculations with calls to the layout calculator
5. THE System SHALL maintain all existing public methods and properties of xmb-browser
6. THE System SHALL maintain all existing events emitted by xmb-browser
7. THE System SHALL preserve all existing visual behavior and interactions
8. THE System SHALL reduce the xmb-browser.ts file size by at least 30%

### Requirement 8: Update All Import Paths

**User Story:** As a developer, I want all import statements updated to reflect the new file structure, so that the application continues to work correctly after the refactoring.

#### Acceptance Criteria

1. THE System SHALL update all imports in podcast-player to reference `../xmb/xmb-browser.js` and `../components/audio-player.js`
2. THE System SHALL update all imports in xmb-browser to reference `../catalog/media-repository.js` and controller files
3. THE System SHALL update all imports in playback-orchestrator to reference `../catalog/media-repository.js` and `../components/audio-player.js`
4. THE System SHALL update all imports in audiobookshelf-repository to reference `../media-repository.js`
5. THE System SHALL update all imports in audio-player and fullscreen-button as needed
6. THE System SHALL verify that all imports use correct relative paths with `.js` extensions
7. THE System SHALL ensure the application builds without errors after all import updates

### Requirement 9: Preserve Existing Functionality

**User Story:** As a user, I want all existing features to work exactly as before, so that the refactoring does not introduce any regressions.

#### Acceptance Criteria

1. THE System SHALL preserve all XMB browser navigation behavior (swipe, snap, momentum)
2. THE System SHALL preserve all playback controls (play, pause, seek)
3. THE System SHALL preserve all animations (radial push, snap, fade)
4. THE System SHALL preserve all loading states and visual feedback
5. THE System SHALL preserve all auto-advance behavior
6. THE System SHALL preserve all progress syncing to the repository
7. THE System SHALL preserve all state persistence to localStorage
8. THE System SHALL maintain the same visual appearance and timing of all interactions

### Requirement 10: Clean Up Old Structure

**User Story:** As a developer, I want old folders and files removed after migration, so that the codebase doesn't have duplicate or obsolete code.

#### Acceptance Criteria

1. THE System SHALL delete the `services/` folder after moving playback-orchestrator
2. THE System SHALL delete the `repositories/` folder after moving audiobookshelf
3. THE System SHALL delete the `types/` folder after consolidating and moving files
4. THE System SHALL delete `components/xmb-browser.ts` after moving to `xmb/`
5. THE System SHALL delete `components/podcast-player.ts` after moving to `app/`
6. THE System SHALL verify no broken imports remain after cleanup
7. THE System SHALL ensure the application still builds and runs after cleanup
