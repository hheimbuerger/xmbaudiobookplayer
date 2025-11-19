# XMB Audio Player Integration - Implementation Tasks

## Architecture Note

The orchestrator remains responsible for episode loading (calling `mediaRepository.startPlayback()` to get playback URLs). XMB browser receives the playback URL via a `contentUrl` property (similar to how audio-player currently works), then the orchestrator calls `xmbBrowser.play()`. This preserves separation of concerns: orchestrator handles data/business logic, XMB handles UI/playback.

## Tasks

- [x] 1. Integrate audio playback into XMB browser and remove audio-player component
  - [x] 1.1 Add audio element to XMB browser
    - Add `<audio>` element to XMB browser template (not visible in UI)
    - Add internal state properties: `currentTime`, `duration`, `currentEpisodeId`, `contentUrl`
    - Add `@property` for `contentUrl` to receive playback URL from orchestrator
    - Add reference to media repository for progress sync
    - When `contentUrl` changes, load it into audio element
    - _Requirements: 1.1, 2.1_

  - [x] 1.2 Implement audio event handlers
    - [x] 1.2.1 Add event listeners for audio element lifecycle
      - Attach listeners for: play, pause, timeupdate, ended, error, loadstart, canplay
      - Update internal state properties (currentTime, duration) when events fire
      - _Requirements: 1.2, 1.3_
    
    - [x] 1.2.2 Implement playback state updates
      - Set `isPlaying = true` on 'play' event, `isPlaying = false` on 'pause' event
      - Set `isLoading = true` on 'loadstart' event, `isLoading = false` on 'canplay' event
      - Update `playbackProgress` on 'timeupdate' event (currentTime / duration)
      - These property changes will automatically trigger animations via existing `willUpdate()` logic
      - _Requirements: 2.1, 2.2_
    
    - [x] 1.2.3 Implement progress sync to media repository
      - Call `mediaRepository.updateProgress()` on timeupdate events
      - Pass currentEpisodeId, currentTime, and duration
      - _Requirements: 4.1, 4.2_

  - [x] 1.3 Implement playback control methods
    - [x] 1.3.1 Implement play() method
      - Call `audio.play()` on the audio element
      - Should trigger same animations as clicking play button (play/pause button animation, render loop)
      - Do NOT emit play-request event (this is called BY the orchestrator)
      - Audio element will fire 'play' event which updates state
      - _Requirements: 3.1_
    
    - [x] 1.3.2 Implement pause() method
      - Call `audio.pause()` on the audio element
      - Should trigger same animations as clicking pause button
      - Do NOT emit pause-request event (this is called BY the orchestrator)
      - Audio element will fire 'pause' event which updates state
      - _Requirements: 3.2_
    
    - [x] 1.3.3 Implement seek() method
      - Set `audio.currentTime` to the specified value
      - Should trigger same behavior as dragging playhead
      - Audio element will fire 'timeupdate' event which updates state
      - _Requirements: 3.3_
    
    - [x] 1.3.4 Add stub methods for future implementation
      - Add `switchEpisode()` that raises NotImplementedError
      - Add `stop()` that raises NotImplementedError
      - _Requirements: 3.4, 3.5_

  - [x] 1.4 Emit external events for integrations
    - Emit custom events for: play, pause, ended, timeupdate
    - Include currentTime, duration, and episodeId in event detail
    - _Requirements: 6.1, 6.2_

  - [x] 1.5 Update PlaybackOrchestrator to use XMB browser
    - [x] 1.5.1 Replace audio-player references with xmb-browser
      - Change orchestrator constructor to accept `xmbBrowser` instead of `audioPlayer`
      - When loading episode, set `xmbBrowser.contentUrl` instead of `audioPlayer.contentUrl`
      - Call `xmbBrowser.play()` instead of `audioPlayer.play()`
      - Call `xmbBrowser.pause()` instead of `audioPlayer.pause()`
      - Call `xmbBrowser.seek()` instead of `audioPlayer.seekTo()`
      - _Requirements: 5.2_
    
    - [x] 1.5.2 Update event listeners
      - Listen to XMB browser events (play, pause, timeupdate, ended) instead of audio-player events
      - Remove 'ready' event listener (no longer needed - HTML5 audio handles load-then-play)
      - Update event handler logic to work with new event structure
      - Simplify state machine since XMB now manages loading state internally
      - _Requirements: 5.2_

  - [x] 1.6 Update podcast-player app component
    - Remove audio-player component from template
    - Remove audio-player imports
    - Update orchestrator initialization to use xmb-browser reference
    - _Requirements: 5.2_

  - [x] 1.7 Remove audio-player component
    - Delete `src/components/audio-player.ts` file
    - Remove any remaining imports or references
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 1.8 Final checkpoint - Ensure all functionality works
    - Verify play/pause works correctly
    - Verify progress ring updates during playback
    - Verify seeking works via circular progress scrubber
    - Verify episode auto-advance works
    - Verify progress sync to media catalog works
    - Verify loading states display correctly
    - Ensure all tests pass, ask the user if questions arise.
