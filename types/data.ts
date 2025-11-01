/**
 * Represents a single episode within a show
 */
export interface Episode {
  /** Unique identifier for the episode */
  id: string;
  /** Display title for the episode */
  title: string;
  /** URL to the episode content */
  contentUrl: string;
}

/**
 * Represents a show with its episodes
 */
export interface Show {
  /** Unique identifier for the show */
  id: string;
  /** Display title for the show */
  title: string;
  /** Icon URL or emoji character */
  icon: string;
  /** Array of episodes in this show */
  episodes: Episode[];
  /** ID of the currently selected episode */
  currentEpisodeId: string;
}
