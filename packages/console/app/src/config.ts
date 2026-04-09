/**
 * Application-wide constants and configuration
 */
export const config = {
  // Base URL
  baseUrl: "https://kodu.ai",

  // GitHub
  github: {
    repoUrl: "https://github.com/anomalyco/kodu",
    starsFormatted: {
      compact: "140K",
      full: "140,000",
    },
  },

  // Social links
  social: {
    twitter: "https://x.com/kodu",
    discord: "https://discord.gg/kodu",
  },

  // Static stats (used on landing page)
  stats: {
    contributors: "850",
    commits: "11,000",
    monthlyUsers: "6.5M",
  },
} as const
