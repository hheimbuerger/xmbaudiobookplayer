// Application initialization
// This file initializes the player with config from config.js

import './app/podcast-player.js';
import './components/fullscreen-button.js';
import { MediaRepository } from './catalog/media-repository.js';
import { AudiobookshelfRepository } from './catalog/audiobookshelf/audiobookshelf.js';
import { SampleRepository } from './catalog/sample/sample-repository.js';
import { ArchiveOrgRepository } from './catalog/archiveorg/archiveorg.js';

// Dynamic import to prevent Vite from bundling config.js
// In dev: config.js is in project root, Vite serves it directly
// In prod: config.js is next to index.html
const configPath = import.meta.env.DEV
  ? '/config.js'
  : new URL('./config.js', document.baseURI).href;
const { config } = await import(/* @vite-ignore */ configPath);

// Create repository based on config
let repository: MediaRepository;
switch (config.repository.type) {
  case 'audiobookshelf':
    repository = new AudiobookshelfRepository(config.repository.config);
    break;
  case 'archiveorg':
    repository = new ArchiveOrgRepository(config.repository.config);
    break;
  case 'sample':
    repository = new SampleRepository();
    break;
  default:
    throw new Error(`Unknown repository type: ${(config.repository as any).type}`);
}

// Create and inject the repository and config
const player = document.getElementById('player') as any;
player.repository = repository;
player.config = config.player ?? {};
