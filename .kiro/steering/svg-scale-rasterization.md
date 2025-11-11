# SVG Scale Rasterization Issue

## Problem

When SVG elements are initially rendered at very small scales (e.g., `scale(0)`) and then GPU-transformed to larger sizes, browsers rasterize the SVG at the initial tiny size and simply scale up the low-resolution bitmap. This causes severe blurriness after the first animation.

## Solution

**Always render SVG at full scale, control visibility with opacity only.**

```typescript
// ❌ DON'T: Scale from 0
button.style.transform = `scale(${animatedScale})`;
button.style.opacity = animatedScale > 0 ? '1' : '0';

// ✅ DO: Always full scale, animate opacity
button.style.transform = `scale(1.0)`;
button.style.opacity = animatedScale.toString();
```

## Why This Works

- SVG is rasterized once at full resolution
- Opacity changes don't trigger re-rasterization
- GPU compositing maintains quality
- Visual effect is identical to scaling

## Additional Hints

Add GPU compositing hints to both container and SVG:

```css
.container {
  will-change: transform, opacity;
  transform: translateZ(0);
  backface-visibility: hidden;
}

.container svg {
  transform: translateZ(0);
  backface-visibility: hidden;
  shape-rendering: geometricPrecision;
}
```

## Applied In

- `xmb-browser.ts`: Play/pause button overlay
- `xmb-browser.css`: SVG rendering hints
