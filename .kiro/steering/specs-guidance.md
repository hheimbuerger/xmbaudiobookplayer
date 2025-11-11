---
inclusion: always
---

# Project Specifications Guide

## Overview

The `specs/` folder contains binding specifications that aspirationally declare how this system should behave, be designed, and be implemented. These are living documents that define the intended architecture, features, and user experience.

**Important:** These specs are aspirational and binding. They represent the target state of the system, not necessarily the current implementation.

## When to Read Specs

Don't read all specs by default - they add significant context. Instead, reference specific specs based on your task:

### UX & User Experience Work
- **Read:** `specs/xmb-ux.md`
- When working on: UI components, user interactions, visual design, navigation, controls

### Architecture & System Design
- **Read:** `specs/xmb-architecture.md`, `specs/application-architecture.md`
- When working on: Core system changes, refactoring, module structure, data flow, state management

### Configuration & Styling
- **Read:** `specs/xmb-configuration.md`
- When working on: Layout constants, animation timing, CSS styling, visual tweaks, interaction thresholds

### Feature Implementation
- **Read:** `specs/xmb-orchestration.md` (for XMB features)
- **Read:** `specs/xmb-drag-momentum.md` (for navigation system: drag/coast/snap)
- **Read:** `specs/audiobookshelf-progress-sync.md` (for sync features)
- When working on: New features, integration work, orchestration logic

### Bug Fixes
- **Read:** Relevant architecture spec for the affected area
- When fixing: Internal bugs, edge cases, performance issues

### General Development
- **Read:** `specs/application-architecture.md` first for overall context
- When: Starting work on unfamiliar areas, making cross-cutting changes

## Your Responsibility: Keep Specs Updated

**Critical:** Whenever you make changes, update the relevant specs to reflect reality.

### Update specs when:

1. **New requirements emerge** - User states new features or changes to existing behavior
2. **Architecture changes** - You refactor, restructure, or change system design
3. **Systematic issues found** - You discover patterns, anti-patterns, or architectural problems
4. **Design decisions made** - You make choices about implementation approach or technology
5. **Behavior changes** - Features work differently than specified
6. **New patterns established** - You introduce new conventions or best practices

### How to update specs:

- Make changes inline as you work, don't defer to "later"
- Keep specs concise and actionable, not exhaustive documentation
- Update the relevant section, don't rewrite everything
- If specs conflict with reality, update them to match the new reality
- Add new sections when introducing new concepts or patterns

## Spec Index

```
specs/
├── application-architecture.md       # Overall app structure and patterns
├── xmb-architecture.md              # XMB system design and components
├── xmb-configuration.md             # XMB configuration system
├── xmb-orchestration.md             # XMB feature orchestration logic
├── xmb-ux.md                        # XMB user experience and interactions
├── xmb-drag-momentum.md             # XMB momentum system (navigation: drag/coast/snap)
└── audiobookshelf-progress-sync.md  # Progress sync feature
```

## Philosophy

Specs are not documentation - they're contracts. They define what should be, not what is. Your job is to either:
1. Implement what the spec says, or
2. Update the spec to reflect a better approach

Never leave specs and code out of sync.
