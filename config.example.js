// XMB Audiobook Player Configuration
// Copy this file to config.js and customize with your Audiobookshelf credentials

export const config = {
  // Repository configuration - determines which media source to use
  repository: {
    // Use 'audiobookshelf' for Audiobookshelf server or 'sample' for demo data
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

  // Alternative: Use sample repository for testing
  // repository: {
  //   type: 'sample',
  // },

  // Player configuration
  player: {
    tracePerformance: false,
  },
};
