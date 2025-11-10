// Application initialization
// This file initializes the player with config from config.js

import './app/podcast-player.js';
import './components/fullscreen-button.js';
import { AudiobookshelfRepository } from './catalog/audiobookshelf/audiobookshelf.js';

// Dynamic import to prevent Vite from bundling config.js
// In dev: config.js is in project root, Vite serves it directly
// In prod: config.js is next to index.html
const configPath = import.meta.env.DEV
  ? '/config.js'
  : new URL('./config.js', document.baseURI).href;
const { config } = await import(/* @vite-ignore */ configPath);

// Create and inject the repository
const player = document.getElementById('player') as any;
const repository = new AudiobookshelfRepository(config);
player.repository = repository;
