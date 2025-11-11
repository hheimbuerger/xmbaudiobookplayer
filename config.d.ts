// Type declaration for config.js

export interface PlayerConfig {
  tracePerformance?: boolean;
}

export const config: {
  url: string;
  apiKey: string;
  libraryId: string;
  excludeShowIds?: string[];
  excludeEpisodeIds?: string[];
  player?: PlayerConfig;
};
