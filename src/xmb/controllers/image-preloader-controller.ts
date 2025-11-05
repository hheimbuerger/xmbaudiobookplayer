/**
 * Image preloader controller for preloading and decoding show icons
 * Runs in background without blocking UI
 */
export class ImagePreloaderController {
  /**
   * Preload and decode images from show icons
   * @param icons - Array of icon URLs or emoji strings
   */
  preload(icons: string[]): void {
    const uniqueUrls = new Set<string>();
    
    // Collect unique HTTP/HTTPS image URLs (skip emoji)
    icons.forEach(icon => {
      if (icon.startsWith('http')) {
        uniqueUrls.add(icon);
      }
    });
    
    if (uniqueUrls.size === 0) return;
    
    console.log(`[XMB] Preloading ${uniqueUrls.size} unique images...`);
    
    // Preload each image
    uniqueUrls.forEach(url => {
      const img = new Image();
      img.decoding = 'async'; // Use async decoding
      img.src = url;
      
      // Decode the image to ensure it's ready for GPU
      img.decode().catch(err => {
        console.warn(`[XMB] Failed to decode image: ${url}`, err);
      });
    });
  }
}
