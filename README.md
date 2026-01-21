# XMB Audiobook Player

> [!NOTE]
> The project name is a placeholder. Please [submit](https://github.com/hheimbuerger/xmbaudiobookplayer/issues) your suggestions! 🤩

A visually unique audiobook player inspired by the [XrossMediaBar](https://en.wikipedia.org/wiki/XrossMediaBar) user interface from early PlayStation devices, featuring smooth animations and intuitive grid-based navigation.  

The navigation grid can be swiped to navigate shows and episodes, with shows arranged side-by-side horizontally and their episodes stacked vertically. Each show remembers its current episode, and each episode remembers its playback progress across sessions.
The episode in the center of the screen is the active episode, which can be played back inline, revealing a circular scrubber for seeking within the episode.

Designed for touch screens first and foremost, but supports mouse input to emulate finger swipes.

Supports multiple media backends, including [audiobookshelf](https://www.audiobookshelf.org/) out-of-the-box, with an extensible architecture for adding custom sources.

> [!TIP]
> 
> [![Launch Live Demo](https://img.shields.io/badge/✨_Launch-Interactive_Demo-success?style=for-the-badge&labelColor=2ea44f)](https://hheimbuerger.github.io/xmbaudiobookplayer/)
> 
> **Recommended:** Tablet or large touchscreen for the best experience  

## Preview

*The animation below is just a preview. Click the demo button above to try the interactive version yourself.*

![Demo](./docs/videos/demo.webp)

## Features

- **XMB-style navigation** - Grid-based interface with smooth momentum scrolling
- **Touch-first design** - Optimized for touch screens, mouse support included
- **Multiple backends** - Audiobookshelf, Archive.org, or sample data
- **Progress sync** - Playback position remembered across sessions
- **Inline playback** - Play episodes directly in the interface

## Quick Start

1. **Download** a release from GitHub
2. **Extract** to your web server directory
3. **Create `config.js`** from the [config.example.js](config.example.js) file.
4. **Configure** your Audiobookshelf server:
   ```javascript
   export const config = {
     repository: {
       type: 'audiobookshelf',
       config: {
         url: 'https://your-audiobookshelf-server.com',
         apiKey: 'your-api-key-here',
         libraryId: 'your-library-id-here',
       },
     },
   };
   ```
5. **Serve** the directory with any static web server

**Finding your Audiobookshelf credentials:**
- **URL**: Your Audiobookshelf server address
- **API Key**: Settings → Users → API Tokens
- **Library ID**: Found in the URL when viewing a library

**Alternative backends:**
- **Archive.org**: Use public domain LibriVox audiobooks (see `config.example.js`)
- **Sample data**: Built-in test data for trying out the interface

For detailed deployment instructions, development setup, and component integration, see [specs/deployment.md](specs/deployment.md).

## Browser Compatibility

Tested and supported on:
- **Chrome/Chromium 100+** (including Android WebView 100 on Android 8.1)
- Modern versions of Firefox, Safari, and Edge

The app uses progressive enhancement to support older browsers where possible, with fallbacks for features like dynamic viewport units (`dvh`) introduced in Chrome 108.

## License

MIT

## Credits

Devised and prompted by @hheimbuerger. Made unique by @cspaeth's idea of inlining the player.  
Implemented by Claude 4.5 Sonnet.
