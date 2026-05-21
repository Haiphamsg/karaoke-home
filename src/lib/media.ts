import { execFile } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { MediaType, Track } from "./types";
import { getMediaRoot } from "./paths";
import { buildAudioStreamUrl, defaultAudioSettings } from "./stream-url";

const execFileAsync = promisify(execFile);

const supportedTypes = new Map<string, { mimeType: string; mediaType: MediaType }>([
  [".mp3", { mimeType: "audio/mpeg", mediaType: "audio" }],
  [".m4a", { mimeType: "audio/mp4", mediaType: "audio" }],
  [".aac", { mimeType: "audio/aac", mediaType: "audio" }],
  [".wav", { mimeType: "audio/wav", mediaType: "audio" }],
  [".ogg", { mimeType: "audio/ogg", mediaType: "audio" }],
  [".mp4", { mimeType: "video/mp4", mediaType: "video" }],
  [".webm", { mimeType: "video/webm", mediaType: "video" }],
  [".mov", { mimeType: "video/quicktime", mediaType: "video" }],
]);

function toTitle(relativePath: string) {
  const parsed = path.parse(relativePath);
  return parsed.name
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toMediaUrl(relativePath: string) {
  return `/api/media/${relativePath.split(path.sep).map(encodeURIComponent).join("/")}`;
}

function getFfprobeBin() {
  if (process.env.FFPROBE_BIN) return process.env.FFPROBE_BIN;
  const ffmpegBin = process.env.FFMPEG_BIN;
  if (ffmpegBin?.endsWith("ffmpeg")) return `${ffmpegBin.slice(0, -"ffmpeg".length)}ffprobe`;
  return "ffprobe";
}

async function probeDuration(filePath: string) {
  try {
    const { stdout } = await execFileAsync(
      getFfprobeBin(),
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", filePath],
      { timeout: 4000, maxBuffer: 1024 * 64 },
    );
    const duration = Number.parseFloat(stdout.trim());
    return Number.isFinite(duration) && duration > 0 ? Math.round(duration) : 0;
  } catch {
    return 0;
  }
}

async function walkMediaFiles(root: string, current = root): Promise<Track[]> {
  const entries = await readdir(current, { withFileTypes: true });
  const tracks = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(current, entry.name);

      if (entry.isDirectory()) {
        return walkMediaFiles(root, fullPath);
      }

      if (!entry.isFile()) {
        return [];
      }

      const extension = path.extname(entry.name).toLowerCase();
      const type = supportedTypes.get(extension);
      if (!type) {
        return [];
      }

      const relativePath = path.relative(root, fullPath);
      const fileStat = await stat(fullPath);
      const duration = await probeDuration(fullPath);
      const mediaUrl = toMediaUrl(relativePath);
      const audioStreamUrl = buildAudioStreamUrl({ source: "local", path: relativePath }, defaultAudioSettings);

      return [
        {
          id: `local:${relativePath}`,
          source: "local" as const,
          title: toTitle(relativePath),
          artist: path.dirname(relativePath) === "." ? "Local" : path.dirname(relativePath),
          streamUrl: audioStreamUrl,
          audioStreamUrl,
          mediaUrl,
          path: relativePath,
          mimeType: type.mimeType,
          mediaType: type.mediaType,
          duration,
          url: mediaUrl,
          thumbnail: type.mediaType === "video" ? undefined : "/audio.svg",
          addedAt: fileStat.mtime.toISOString(),
        },
      ];
    }),
  );

  return tracks.flat();
}

export async function listLocalTracks(query = "") {
  const root = getMediaRoot();
  const tracks = await walkMediaFiles(root);
  const normalizedQuery = query.trim().toLowerCase();

  const filtered = normalizedQuery
    ? tracks.filter((track) =>
        `${track.title} ${track.artist || ""} ${track.path || ""}`.toLowerCase().includes(normalizedQuery),
      )
    : tracks;

  return filtered.sort((a, b) => a.title.localeCompare(b.title, "vi"));
}

export function getMimeType(filePath: string) {
  return supportedTypes.get(path.extname(filePath).toLowerCase())?.mimeType || "application/octet-stream";
}
