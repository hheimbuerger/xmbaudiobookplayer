import { AudiobookshelfConfig } from './src/repositories/audiobookshelf.js';

// AudioBookshelf API configuration
export const ABS_CONFIG: AudiobookshelfConfig = {
  url: 'https://your-audiobookshelf-server.com',
  apiKey: 'your-api-key-here',
  libraryId: 'your-library-id-here',
};

// Vite dev server configuration (optional)
export const ALLOWED_HOSTS = ['your-ngrok-domain.ngrok-free.dev'];
