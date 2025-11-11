// Type declaration for config.js

export interface PlayerConfig {
  tracePerformance?: boolean;
}

export interface AudiobookshelfRepositoryConfig {
  url: string;
  apiKey: string;
  libraryId: string;
  excludeShowIds?: string[];
  excludeEpisodeIds?: string[];
}

export interface SampleRepositoryConfig {
  // Sample repository has no configuration
}

export type RepositoryConfig = 
  | { type: 'audiobookshelf'; config: AudiobookshelfRepositoryConfig }
  | { type: 'sample'; config?: SampleRepositoryConfig };

export const config: {
  repository: RepositoryConfig;
  player?: PlayerConfig;
};
