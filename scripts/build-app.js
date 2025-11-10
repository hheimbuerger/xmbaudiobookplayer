// Build script for app mode - cross-platform
import { execSync } from 'child_process';

// Set environment and build
process.env.BUILD_MODE = 'app';

console.log('Building app...');
execSync('vite build', { stdio: 'inherit' });

console.log('✓ App build complete!');
console.log('\nThe dist/ folder contains the built app.');
console.log('To create a release:');
console.log('1. Copy dist/ folder contents');
console.log('2. Add config.example.js to the release');
console.log('3. Instruct users to rename config.example.js to config.js and edit it');
