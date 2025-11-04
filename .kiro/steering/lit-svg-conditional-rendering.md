---
title: Lit SVG Conditional Rendering
inclusion: always
---

# Lit SVG Conditional Rendering Best Practices

## The Problem

When conditionally rendering SVG elements in Lit using this pattern:

```typescript
${condition ? html`<circle cx="50" cy="50" r="10" />` : ''}
```

**The elements will not render**, even though they appear in the DOM.

## Root Cause

Lit's `html` tag function creates elements in the **HTML namespace** when used for conditional content, even inside an SVG context. Browsers only render SVG elements that are in the **SVG namespace** (`http://www.w3.org/2000/svg`).

### Technical Details

1. When you use `${condition ? html`...` : ''}`, Lit inserts comment markers as boundaries
2. Content inserted between these markers is created using the `html` tag's default namespace (HTML)
3. The SVG namespace context from the parent `<svg>` element doesn't propagate through the comment markers
4. Elements are created in the wrong namespace: `http://www.w3.org/1999/xhtml` instead of `http://www.w3.org/2000/svg`
5. HTML `<circle>` elements don't render (not a valid HTML tag)
6. Once created in the wrong namespace, elements cannot be fixed by editing attributes

## The Solution

**Always render SVG elements and control visibility with CSS:**

```typescript
// ❌ DON'T: Conditional rendering
${this.showCircle ? html`
  <circle cx="50" cy="50" r="10" />
` : ''}

// ✅ DO: Always render with display control
<circle 
  cx="50" cy="50" r="10"
  style="display: ${this.showCircle ? 'block' : 'none'}"
/>

// ✅ ALSO GOOD: visibility or opacity
<circle 
  cx="50" cy="50" r="10"
  style="visibility: ${this.showCircle ? 'visible' : 'hidden'}"
/>

<circle 
  cx="50" cy="50" r="10"
  style="opacity: ${this.showCircle ? 1 : 0}"
/>
```

## Why This Works

When elements are present in the initial template (not conditionally added):
- Lit correctly infers the SVG namespace from the parent `<svg>` element
- Elements are created in the correct namespace from the start
- CSS properties don't affect namespace
- No DOM insertion/removal, just property changes

## Performance Considerations

**Q: Doesn't always rendering waste memory?**

**A:** For typical use cases, no. A single SVG `<circle>` element uses ~300 bytes. Even 10 hidden circles use only ~3KB, which is negligible.

**Q: When should I use conditional rendering?**

**A:** Only when:
- You have many SVG elements (>50) that significantly impact performance
- The SVG structure changes, not just visibility
- You're using Lit's `svg` tag function (see alternative solution below)

## Alternative Solution: Use the `svg` Tag Function

Lit provides a separate `svg` tag function specifically for SVG content:

```typescript
import { svg } from 'lit';

${this.showCircle ? svg`
  <circle cx="50" cy="50" r="10" />
` : svg``}
```

**Why this exists:** The `svg` tag function ensures proper SVG namespace handling. Lit's documentation states that SVG elements must be created in the SVG namespace, and the `svg` tag guarantees this.

**Pros:**
- Proper SVG namespace handling
- Elements removed from DOM when hidden
- Official Lit solution for SVG content

**Cons:**
- Requires importing `svg` tag
- More complex than CSS control
- Still has conditional rendering complexity

**Recommendation:** Use CSS control for simple visibility toggling. Use `svg` tag when you need true conditional rendering (structure changes, not just visibility).

## Real-World Example

From `xmb-browser.ts` - showing playhead only in playing mode:

```typescript
// ❌ BROKEN: Conditional rendering
${this.isPlaying ? html`
  <circle class="playhead" cx="${x}" cy="${y}" r="10" />
` : ''}

// ✅ FIXED: Always render with display control
<circle 
  class="playhead" 
  cx="${x}" 
  cy="${y}" 
  r="10"
  style="display: ${this.isPlaying ? 'block' : 'none'}"
/>
```

## Debugging Tip

If SVG elements appear in the DOM but don't render, check their namespace:

```javascript
const element = document.querySelector('.my-svg-element');
console.log(element.namespaceURI);
// Should be: "http://www.w3.org/2000/svg"
// If it's: "http://www.w3.org/1999/xhtml" - wrong namespace!
```

## How Lit's Conditional Rendering Works

When you use `${condition ? html`...` : ''}`, Lit:
1. Creates comment markers as placeholders: `<!--?lit$...$-->`
2. Inserts/removes content between these markers when the condition changes
3. Creates a "Part" that can be empty or contain content

**The namespace problem:** When conditionally inserting SVG elements, the `html` tag function creates them in the HTML namespace by default, even though they're inside an `<svg>` parent. The comment markers break the namespace context chain.

## Verified Root Cause

**Test results confirmed:**
```javascript
// Conditionally rendered (broken)
element.namespaceURI === "http://www.w3.org/1999/xhtml"  // Wrong!

// Always rendered (working)
element.namespaceURI === "http://www.w3.org/2000/svg"    // Correct!
```

Browsers only render SVG elements in the SVG namespace. HTML `<circle>` elements don't render because `<circle>` isn't a valid HTML tag.

## Finding More Information

**Search Lit GitHub Issues:**
- https://github.com/lit/lit/issues
- Search: "svg namespace", "svg conditional", "svg html tag"

**Stack Overflow:**
- Search: `[lit-element] svg namespace`
- Search: `[lit] svg conditional rendering`

**Lit Documentation:**
- SVG templates: https://lit.dev/docs/api/templates/#svg
- Conditional rendering: https://lit.dev/docs/templates/conditionals/

## Summary

**Rule of thumb:** In Lit, always render SVG elements and control visibility with CSS. Don't use conditional rendering with the `html` tag inside SVG contexts unless you use the `svg` tag function.
