import type { Track } from "./types";
import { readJson, writeJson } from "./json-store";
import { buildAudioStreamUrl, defaultAudioSettings } from "./stream-url";

type YouTubeCache = Record<
  string,
  {
    createdAt: number;
    items: Track[];
  }
>;

type YouTubeSearchResponse = {
  items?: Array<{
    id?: {
      videoId?: string;
    };
    snippet?: {
      title?: string;
      channelTitle?: string;
      thumbnails?: {
        medium?: { url?: string };
        high?: { url?: string };
        default?: { url?: string };
      };
    };
  }>;
  error?: {
    message?: string;
  };
};

const cacheFile = "youtube-cache.json";
const cacheTtlMs = 12 * 60 * 60 * 1000;

function decodeEntities(value = "") {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function buildQuery(rawQuery: string) {
  const query = rawQuery.trim();
  if (!query) return "";

  const lower = query.toLowerCase();
  if (lower.includes("karaoke") || lower.includes("beat") || lower.includes("instrumental")) {
    return query;
  }

  return `${query} karaoke beat`;
}

function cacheKey(query: string) {
  return buildQuery(query).toLowerCase();
}

export async function searchYouTube(rawQuery: string) {
  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  const query = buildQuery(rawQuery);

  if (!query) {
    return { items: [], cached: false, configured: Boolean(apiKey) };
  }

  const cache = await readJson<YouTubeCache>(cacheFile, {});
  const key = cacheKey(query);
  const cached = cache[key];

  if (cached && Date.now() - cached.createdAt < cacheTtlMs) {
    return { items: cached.items, cached: true, configured: Boolean(apiKey) };
  }

  if (!apiKey) {
    return {
      items: cached?.items || [],
      cached: Boolean(cached),
      configured: false,
      message: "YOUTUBE_API_KEY is not configured.",
    };
  }

  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("q", query);
  url.searchParams.set("type", "video");
  url.searchParams.set("maxResults", "12");
  url.searchParams.set("regionCode", "VN");
  url.searchParams.set("relevanceLanguage", "vi");
  url.searchParams.set("videoEmbeddable", "true");
  url.searchParams.set("safeSearch", "moderate");
  url.searchParams.set("key", apiKey);

  const response = await fetch(url, { next: { revalidate: 0 } });
  const payload = (await response.json()) as YouTubeSearchResponse;

  if (!response.ok) {
    throw new Error(payload.error?.message || "YouTube search failed");
  }

  const items =
    payload.items
      ?.map((item): Track | null => {
        const videoId = item.id?.videoId;
        if (!videoId || !item.snippet?.title) {
          return null;
        }

        return {
          id: `youtube:${videoId}`,
          source: "youtube",
          title: decodeEntities(item.snippet.title),
          artist: decodeEntities(item.snippet.channelTitle || "YouTube"),
          videoId,
          url: `https://www.youtube.com/watch?v=${videoId}`,
          streamUrl: buildAudioStreamUrl({ source: "youtube", videoId }, defaultAudioSettings),
          audioStreamUrl: buildAudioStreamUrl({ source: "youtube", videoId }, defaultAudioSettings),
          thumbnail:
            item.snippet.thumbnails?.high?.url ||
            item.snippet.thumbnails?.medium?.url ||
            item.snippet.thumbnails?.default?.url,
          mediaType: "video",
        };
      })
      .filter((item): item is Track => Boolean(item)) || [];

  cache[key] = { createdAt: Date.now(), items };
  await writeJson(cacheFile, cache);

  return { items, cached: false, configured: true };
}
