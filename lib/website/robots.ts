import robotsParser from "robots-parser";

// robots.txt rules for our bot. A missing or unreadable robots.txt means
// everything is allowed, as the standard says.

export type RobotsRules = { isAllowed: (url: string) => boolean };

export function parseRobots(robotsUrl: string, body: string, userAgent: string): RobotsRules {
  const robots = robotsParser(robotsUrl, body);
  return { isAllowed: (url) => robots.isAllowed(url, userAgent) !== false };
}

export const ALLOW_ALL: RobotsRules = { isAllowed: () => true };

// Sitemap URLs listed in robots.txt.
export function robotsSitemaps(robotsUrl: string, body: string): string[] {
  return robotsParser(robotsUrl, body).getSitemaps();
}
