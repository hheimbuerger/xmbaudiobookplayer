// XMB Audiobook Player Demo Configuration
// Used for GitHub Pages demo deployment

export const config = {
  // Use archive.org for public domain audiobooks (no credentials needed)
  repository: {
    type: 'archiveorg',
    config: {
      itemIds: [
        'alices_adventures_1003',
        'pride_and_prejudice_librivox',
        'adventures_sherlockholmes_1007_librivox',
        'moby_dick_librivox',
        'invisible_man_librivox',
      ],
    },
  },

  // Player configuration
  player: {
    tracePerformance: true,
  },
};
