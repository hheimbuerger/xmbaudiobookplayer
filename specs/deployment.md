# Deployment Guide

XMB Audiobook Player supports two deployment patterns:

## 1. Self-Hosted App (Recommended for Personal Use)

Deploy as a standalone web application with configuration loaded at runtime from a separate `config.js` file.

**Security Model:**
- Configuration is loaded from a separate `config.js` file (not bundled)
- Anyone with access to the hosted app can view your configuration
- Intended for personal use or trusted networks only
- Not suitable for public deployment with sensitive content

**Benefits:**
- Update configuration without rebuilding
- Switch between different repositories easily
- Keep credentials out of the build artifacts

### Prerequisites

- Node.js 18+ and npm (for building from source)
- An Audiobookshelf server with API access (or use Archive.org)
- A modern web browser (Chrome, Firefox, Safari, Edge)
- Static web hosting (nginx, Apache, Netlify, Vercel, etc.)

### Quick Start (Using Releases)

1. **Download a release** from the GitHub releases page
2. **Extract** the contents to your web server directory
3. **Create `config.js`** by copying `config.example.js`:
   ```bash
   cp config.example.js config.js
   ```
4. **Edit `config.js`** with your Audiobookshelf credentials (see configuration below)
5. **Serve** the directory via any static web server

### Building from Source

#### 1. Clone and Install

```bash
git clone <repository-url>
cd xmb-podcast-player
npm install
```

#### 2. Configure Your Repository

Copy the example config file and customize it:

```bash
cp config.example.js config.js
```

Edit `config.js` with your chosen repository:

##### Option A: Audiobookshelf (Self-Hosted)

```javascript
export const config = {
  repository: {
    type: 'audiobookshelf',
    config: {
      url: 'https://your-audiobookshelf-server.com',
      apiKey: 'your-api-key-here',
      libraryId: 'your-library-id-here',
      // Optional: Exclude specific shows or episodes by ID
      excludeShowIds: [],
      excludeEpisodeIds: [],
    },
  },
  player: {
    tracePerformance: false,
  },
};
```

**Finding your credentials:**
- **URL**: Your Audiobookshelf server address
- **API Key**: Generate in Audiobookshelf under Settings → Users → API Tokens
- **Library ID**: Found in the URL when viewing a library, or via the API

**Optional exclusions:**
- **excludeShowIds**: Array of show IDs to hide from the catalog
- **excludeEpisodeIds**: Array of episode IDs to hide from their shows

##### Option B: Archive.org (Public Domain)

```javascript
export const config = {
  repository: {
    type: 'archiveorg',
    config: {
      itemIds: [
        'alices_adventures_1003',
        'pride_and_prejudice_librivox',
        'adventures_sherlockholmes_1007_librivox',
      ],
    },
  },
  player: {
    tracePerformance: false,
  },
};
```

**Finding item IDs:**
- Browse [archive.org](https://archive.org) for LibriVox audiobooks
- The item ID is in the URL: `archive.org/details/[item-id]`

##### Option C: Sample Data (Testing)

```javascript
export const config = {
  repository: {
    type: 'sample',
  },
  player: {
    tracePerformance: false,
  },
};
```

**Note:** `config.js` is gitignored to prevent accidentally committing your credentials.

#### 3. Development

Run the development server:

```bash
npm run dev
```

Open http://localhost:5173 in your browser.

**Using with tunneling services (ngrok, etc.):**

If you need to access the dev server through a tunnel, set the `VITE_ALLOWED_HOSTS` environment variable:

```bash
# Single host
VITE_ALLOWED_HOSTS="your-domain.ngrok-free.app" npm run dev

# Multiple hosts (comma-separated)
VITE_ALLOWED_HOSTS="domain1.ngrok.app,domain2.example.com" npm run dev
```

Localhost and 127.0.0.1 are always allowed automatically.

#### 4. Build for Production

Build a standalone application:

```bash
npm run build:app
```

**Output:** `dist/` directory contains:
- `index.html` - Entry point
- `assets/main-[hash].js` - Bundled application (no configuration)
- `assets/favicon-[hash].svg` - Favicon

**Deploy:**
1. Copy the `dist/` folder contents to your server
2. Copy `config.js` (with your repository configuration) to the same directory
3. Serve via any static hosting (nginx, Apache, Netlify, Vercel, etc.)

**Configuration at runtime:**
- The app loads `config.js` dynamically at startup
- Update configuration without rebuilding by editing `config.js`
- Switch between repositories (Audiobookshelf, Archive.org, Sample) easily

**For releases:** Include `config.example.js` and instruct users to copy it to `config.js` and customize.

### Web Server Configuration

The app is a single-page application (SPA) that requires no special server configuration. Simply serve the static files.

**Example nginx configuration:**

```nginx
server {
    listen 80;
    server_name your-domain.com;
    root /var/www/xmb-player;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

**Example Apache .htaccess:**

```apache
<IfModule mod_rewrite.c>
    RewriteEngine On
    RewriteBase /
    RewriteRule ^index\.html$ - [L]
    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteCond %{REQUEST_FILENAME} !-d
    RewriteRule . /index.html [L]
</IfModule>
```

## 2. Reusable Web Component (For Developers)

Import the component into your own application and provide credentials at runtime.

**Use Case:**
- Integrate into existing web apps
- Build custom UIs around the player
- Manage credentials in your own backend
- Multiple instances with different configurations

### Building the Component

Build as a library for integration into other projects:

```bash
npm run build:lib
```

**Output:** `dist/absxrossmediabarcard.js` - ES module that can be imported

### Usage in Other Projects

```html
<script type="module">
  import 'xmb-podcast-player/dist/absxrossmediabarcard.js';
  import { AudiobookshelfRepository, ArchiveOrgRepository } from 'xmb-podcast-player';
  
  const player = document.querySelector('podcast-player');
  
  // Use Audiobookshelf
  const repository = new AudiobookshelfRepository({
    url: 'https://your-server.com',
    apiKey: 'your-key',
    libraryId: 'your-library-id'
  });
  
  // Or use Archive.org
  // const repository = new ArchiveOrgRepository({
  //   itemIds: ['alices_adventures_1003', 'pride_and_prejudice_librivox']
  // });
  
  player.repository = repository;
</script>
<podcast-player></podcast-player>
```

**Note:** Lit must be provided by the consuming application (peer dependency).

### Integration Considerations

- The component is framework-agnostic and works with vanilla JS, React, Vue, Angular, etc.
- Manage credentials securely in your backend, not in client-side code
- The component handles all UI and playback logic internally
- Progress sync happens automatically through the repository interface

## Security Considerations

### Self-Hosted App

- **Credentials are visible**: Anyone with access to your hosted app can view `config.js`
- **Use HTTPS**: Always serve over HTTPS to protect credentials in transit
- **Restrict access**: Use authentication at the web server level if needed
- **Private networks**: Best suited for home networks or VPNs
- **Not for public hosting**: Don't deploy with real credentials on public servers

### Component Integration

- **Backend proxy**: Proxy Audiobookshelf API calls through your backend
- **Token management**: Generate short-lived tokens from your backend
- **User authentication**: Implement your own auth layer
- **Rate limiting**: Protect your Audiobookshelf server from abuse

## Troubleshooting

### Config not loading

- Ensure `config.js` is in the same directory as `index.html`
- Check browser console for errors
- Verify the file is being served (check network tab)
- Ensure the file exports a valid `config` object

### CORS errors

- Audiobookshelf must allow CORS from your domain
- Check Audiobookshelf server configuration
- Consider using a reverse proxy if needed

### Playback issues

- Verify your Audiobookshelf server is accessible
- Check API key permissions
- Ensure library ID is correct
- Test API access directly using curl or Postman
