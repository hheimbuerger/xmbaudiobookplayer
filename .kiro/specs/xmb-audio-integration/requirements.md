# XMB Audio Player Integration - Requirements

## Introduction

This specification defines the integration of audio playback functionality directly into the XMB browser component. Currently, audio playback is handled by a separate `audio-player` component that maintains its own state and UI, requiring event-based synchronization with the XMB browser. This integration eliminates the component boundary, making XMB browser the single owner of all playback state and removing the need for state synchronization.

## Glossary

- **XMB Browser**: The Cross Media Bar browser component (`xmb-browser`) that provides the main navigation and browsing interface
- **Audio Player Component**: The separate `audio-player.ts` Lit component that currently handles audio playback
- **Playback State**: The collection of properties describing the current audio playback status (playing, paused, progress, etc.)
- **Media Repository**: The catalog/repository interface that manages media data and handles external sync (e.g., Audiobookshelf)
- **Audio Element**: The HTML5 `<audio>` element that performs actual audio playback

## Requirements

### Requirement 1: Audio Element Integration

**User Story:** As a developer, I want the XMB browser to directly own the audio element, so that there is a single source of truth for playback state.

#### Acceptance Criteria

1. WHEN the XMB browser renders THEN the system SHALL create an `<audio>` element within the XMB browser template
2. WHEN the audio element is created THEN the system SHALL attach event listeners for play, pause, timeupdate, ended, error, loadstart, and canplay events
3. WHEN audio events occur THEN the system SHALL update XMB browser state directly without dispatching custom events

### Requirement 2: Playback State Management

**User Story:** As a developer, I want all playback state to live in the XMB browser, so that I can eliminate state synchronization complexity.

#### Acceptance Criteria

1. WHEN playback state changes THEN the XMB browser SHALL maintain isPlaying, isLoading, playbackProgress, currentEpisodeId, duration, and currentTime properties
2. WHEN the audio element fires events THEN the XMB browser SHALL update its playback state properties directly
3. WHEN playback state is needed THEN the system SHALL read from XMB browser properties without querying external components

### Requirement 3: Playback Control

**User Story:** As a developer, I want the XMB browser to provide playback control methods, so that playback can be controlled programmatically.

#### Acceptance Criteria

1. WHEN play is called THEN the XMB browser SHALL start or resume playback of the currently selected episode
2. WHEN pause is called THEN the XMB browser SHALL pause the audio element
3. WHEN seek is called with a time value THEN the XMB browser SHALL set the audio element currentTime to the specified value
4. WHEN switchEpisode is called with an episode ID THEN the system SHALL raise a NotImplementedError
5. WHEN stop is called THEN the system SHALL raise a NotImplementedError

### Requirement 4: Progress Synchronization

**User Story:** As a user, I want my playback progress to sync with the media catalog, so that my listening position is preserved.

#### Acceptance Criteria

1. WHEN playback progress updates THEN the XMB browser SHALL notify the media repository with the current episode ID, time, and duration
2. WHEN progress sync occurs THEN the system SHALL maintain the existing media repository interface without architectural changes

### Requirement 5: Component Removal

**User Story:** As a developer, I want the audio-player component removed, so that the codebase has a simpler architecture.

#### Acceptance Criteria

1. WHEN integration is complete THEN the system SHALL delete the audio-player.ts file
2. WHEN the audio-player is removed THEN the system SHALL remove all imports and references to the audio-player component
3. WHEN the audio-player UI is removed THEN the system SHALL rely solely on XMB browser's existing playback UI

### Requirement 6: External Integration Support

**User Story:** As a developer integrating XMB browser into a larger application, I want to receive playback events, so that I can respond to playback state changes.

#### Acceptance Criteria

1. WHEN playback state changes THEN the XMB browser SHALL emit custom events for play, pause, ended, and timeupdate
2. WHEN events are emitted THEN the events SHALL include currentTime, duration, and episodeId in the event detail
