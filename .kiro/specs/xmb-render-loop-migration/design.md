# XMB Render Loop Migration - Design

## DOM Reference Caching

```typescript
private domRefs = {
  playPauseButton: null as SVGElement | null,
  playIcon: null as SVGPathElement | null,
  pauseIcon: null as SVGGElement | null,
  progressRing: null as SVGCircleElement | null,
  progressTrack: null as SVGCircleElement | null,
  playhead: null as SVGCircleElement | null,
  playheadHitbox: null as SVGCircleElement | null,
  labels: [] as HTMLElement[]
};

private refreshDOMRefs() {
  const root = this.shadowRoot;
  if (!root) return;

  this.domRefs.playPauseButton = root.querySelector('.play-pause-button');
  this.domRefs.playIcon = root.querySelector('.play-icon');
  this.domRefs.pauseIcon = root.querySelector('.pause-icon');
  this.domRefs.progressRing = root.querySelector('.progress-ring');
  this.domRefs.progressTrack = root.querySelector('.progress-track');
  this.domRefs.playhead = root.querySelector('.playhead');
  this.domRefs.playheadHitbox = root.querySelector('.playhead-hitbox');
  this.domRefs.labels = Array.from(root.querySelectorAll('.xmb-label'));
}

// Call after Lit re-renders
protected updated(changedProperties: PropertyValues) {
  super.updated(changedProperties);
  if (changedProperties.has('shows')) {
    this.refreshDOMRefs();
  }
}
```

## Playback UI Update Pattern

```typescript
private updatePlaybackUI() {
  // Read from properties set by orchestrator
  const { isPlaying, isLoading } = this;
  const progress = this.playbackProgress;
  
  // Update play/pause icon visibility
  if (this.domRefs.playIcon && this.domRefs.pauseIcon) {
    this.domRefs.playIcon.style.display = isPlaying ? 'none' : 'block';
    this.domRefs.pauseIcon.style.display = isPlaying ? 'block' : 'none';
  }
  
  // Update progress ring
  if (this.domRefs.progressRing) {
    const circumference = 2 * Math.PI * 45; // radius = 45
    const offset = circumference * (1 - progress);
    this.domRefs.progressRing.style.strokeDashoffset = offset.toString();
  }
  
  // Update loading state
  if (this.domRefs.progressTrack) {
    if (isLoading) {
      this.domRefs.progressTrack.classList.add('loading');
    } else {
      this.domRefs.progressTrack.classList.remove('loading');
    }
  }
  
  // Update playhead position
  if (this.domRefs.playhead && this.domRefs.playheadHitbox) {
    const shouldShow = isPlaying && progress > 0;
    const display = shouldShow ? 'block' : 'none';
    
    this.domRefs.playhead.style.display = display;
    this.domRefs.playheadHitbox.style.display = display;
    
    if (shouldShow) {
      const angle = progress * 2 * Math.PI - Math.PI / 2;
      const x = 50 + 45 * Math.cos(angle);
      const y = 50 + 45 * Math.sin(angle);
      
      this.domRefs.playhead.setAttribute('cx', x.toString());
      this.domRefs.playhead.setAttribute('cy', y.toString());
      this.domRefs.playheadHitbox.setAttribute('cx', x.toString());
      this.domRefs.playheadHitbox.setAttribute('cy', y.toString());
    }
  }
  
  // Update progress ring visibility
  if (this.domRefs.progressRing && this.domRefs.progressTrack) {
    const shouldShow = this.playbackState.currentEpisodeId !== null;
    const display = shouldShow ? 'block' : 'none';
    this.domRefs.progressRing.style.display = display;
    this.domRefs.progressTrack.style.display = display;
  }
}
```

## Label Update Pattern

```typescript
private updateLabels() {
  // Calculate label data (positions, opacities, colors)
  const labelData = this.calculateLabelData();
  
  // Update DOM directly
  this.domRefs.labels.forEach((label, index) => {
    const data = labelData[index];
    if (!data) return;
    
    // Update text content if changed
    if (label.textContent !== data.text) {
      label.textContent = data.text;
    }
    
    // Update position (already done via transform in existing code)
    label.style.transform = `translate(${data.x}px, ${data.y}px)`;
    
    // Update opacity
    label.style.opacity = data.opacity.toString();
    
    // Update color
    label.style.color = data.color;
  });
}
```

## Render Loop Integration

```typescript
private updateVisuals(timestamp: number) {
  // Existing episode position/scale/opacity updates
  this.updateEpisodeVisuals();
  
  // New: playback UI updates
  this.updatePlaybackUI();
  
  // New: label updates (direct DOM manipulation)
  this.updateLabels();
  
  // Continue animation loop if needed
  const shouldContinue = 
    this.animationState.isAnimating || 
    this.playbackState.isPlaying;
    
  if (shouldContinue) {
    this.animationFrameId = requestAnimationFrame(this.updateVisuals.bind(this));
  } else {
    this.animationFrameId = null;
  }
}
```

## State Change Pattern

**Note:** With the new architecture, XMB browser receives state via properties from the orchestrator. The orchestrator owns the audio element and updates XMB browser properties directly.

```typescript
// Properties are set by orchestrator
@property({ type: Boolean }) isPlaying = false;
@property({ type: Boolean }) isLoading = false;
@property({ type: Number }) playbackProgress = 0;

// In willUpdate, trigger render loop instead of Lit re-render
willUpdate(changedProperties: PropertyValues): void {
  super.willUpdate(changedProperties);
  
  // If playback state changed, ensure render loop is running
  if (changedProperties.has('isPlaying') || 
      changedProperties.has('isLoading') || 
      changedProperties.has('playbackProgress')) {
    this.ensureRenderLoopRunning();
    // Prevent Lit re-render by not calling requestUpdate()
  }
}

private ensureRenderLoopRunning() {
  if (!this.animationFrameId) {
    this.animationFrameId = requestAnimationFrame(this.updateVisuals.bind(this));
  }
}
```

## Template Changes

SVG elements should always be rendered with display control:

```typescript
// Play/pause button - always render both icons
<g class="play-pause-button">
  <path class="play-icon" d="..." style="display: block" />
  <g class="pause-icon" style="display: none">
    <rect ... />
    <rect ... />
  </g>
</g>

// Progress ring - always render
<circle 
  class="progress-track"
  cx="50" cy="50" r="45"
  style="display: none"
/>
<circle 
  class="progress-ring"
  cx="50" cy="50" r="45"
  style="display: none"
/>

// Playhead - always render
<circle 
  class="playhead"
  cx="50" cy="50" r="3"
  style="display: none"
/>
<circle 
  class="playhead-hitbox"
  cx="50" cy="50" r="10"
  style="display: none"
/>
```

## Migration Strategy

1. Add DOM reference caching system
2. Implement `updatePlaybackUI()` method with direct DOM manipulation
3. Convert playback state properties to non-reactive (remove `@property()` decorators)
4. Update audio event handlers to not call `requestUpdate()`
5. Ensure render loop runs during playback via `ensureRenderLoopRunning()`
6. Test playback UI updates work correctly
7. Migrate label updates to direct DOM manipulation
8. Remove `labelData` reactive property
9. Update template to always render SVG elements with display control
10. Verify only `shows` changes trigger Lit re-renders

## Testing Checklist

- [ ] Play/pause icon switches correctly
- [ ] Progress ring animates smoothly during playback
- [ ] Playhead moves around circle during playback
- [ ] Loading state displays correctly
- [ ] Labels update positions/opacity during drag
- [ ] No Lit re-renders during playback (verify in DevTools)
- [ ] No Lit re-renders during drag/momentum (verify in DevTools)
- [ ] Lit re-renders when shows array changes
- [ ] Playback UI survives Lit re-renders (DOM refs refreshed)
- [ ] SVG elements render correctly (not in wrong namespace)
