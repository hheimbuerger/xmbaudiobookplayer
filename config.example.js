// XMB Audiobook Player Configuration
// Copy this file to config.js and customize with your Audiobookshelf credentials

export const config = {
  // Repository configuration - determines which media source to use
  repository: {
    // Either bring your own 'audiobookshelf' server: https://www.audiobookshelf.org/
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

  // Alternative: fetch librivox public domain audiobooks from archive.org
  // repository: {
  //   type: 'archiveorg',
  //   config: {
  //     itemIds: [
  //       'alices_adventures_1003',
  //       'pride_and_prejudice_librivox',
  //       'adventures_sherlockholmes_1007_librivox',
  //       'moby_dick_librivox',
  //       'invisible_man_librivox',
  //     ]
  //   },
  // },

  // Alternative: Use sample repository for testing
  // repository: {
  //   type: 'sample',
  // },

  // Player configuration
  player: {
    tracePerformance: false,
  },
};
