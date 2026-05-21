import { spawn, type ChildProcess } from "node:child_process";
import { Readable } from "node:stream";
import { stat } from "node:fs/promises";
import { getMediaRoot, resolveInside } from "@/lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clampTone(value: string | null) {
  const parsed = Number.parseInt(value || "0", 10);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(-6, Math.min(6, parsed));
}

function clampBitrate(value: string | null) {
  const parsed = Number.parseInt(value || "192", 10);
  return [128, 160, 192].includes(parsed) ? parsed : 192;
}

function buildFilters(tone: number, vocalCut: boolean) {
  const filters: string[] = [];

  if (vocalCut) {
    filters.push("pan=stereo|c0=c0-c1|c1=c1-c0");
  }

  if (tone !== 0) {
    const ratio = Math.pow(2, tone / 12);
    filters.push(`asetrate=44100*${ratio.toFixed(6)},aresample=44100,atempo=${(1 / ratio).toFixed(6)}`);
  }

  return filters.length > 0 ? ["-af", filters.join(",")] : [];
}

function ffmpegOutputArgs(tone: number, vocalCut: boolean, bitrate: number) {
  return [
    ...buildFilters(tone, vocalCut),
    "-vn",
    "-f",
    "mp3",
    "-codec:a",
    "libmp3lame",
    "-b:a",
    `${bitrate}k`,
    "-ar",
    "44100",
    "-ac",
    "2",
    "pipe:1",
  ];
}

function cleanup(processes: Array<ChildProcess | null>) {
  for (const child of processes) {
    if (child && !child.killed) {
      child.kill("SIGTERM");
    }
  }
}

function ignoreExpectedPipeError(error: Error) {
  if ("code" in error && error.code === "EPIPE") {
    return;
  }

  console.warn(`[stream] ${error.message}`);
}

function guardChildProcess(child: ChildProcess | null) {
  if (!child) return;

  child.on("error", ignoreExpectedPipeError);
  child.stdin?.on("error", ignoreExpectedPipeError);
  child.stdout?.on("error", ignoreExpectedPipeError);
  child.stderr?.on("error", ignoreExpectedPipeError);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const source = url.searchParams.get("source");
  const tone = clampTone(url.searchParams.get("tone"));
  const vocalCut = url.searchParams.get("vocalCut") === "true";
  const bitrate = clampBitrate(url.searchParams.get("bitrate"));
  const ffmpegBin = process.env.FFMPEG_BIN || "ffmpeg";
  const ytDlpBin = process.env.YTDLP_BIN || "yt-dlp";
  const headers = new Headers({
    "Content-Type": "audio/mpeg",
    "Cache-Control": "no-store",
    "X-Accel-Buffering": "no",
  });

  let ffmpeg: ChildProcess;
  let ytDlp: ChildProcess | null = null;

  if (source === "local") {
    const relativePath = url.searchParams.get("path");
    if (!relativePath) {
      return new Response("Missing local path", { status: 400 });
    }

    const filePath = resolveInside(getMediaRoot(), [relativePath]);
    const fileStat = await stat(filePath).catch(() => null);
    if (!fileStat?.isFile()) {
      return new Response("Local media not found", { status: 404 });
    }

    ffmpeg = spawn(
      ffmpegBin,
      ["-hide_banner", "-loglevel", "error", "-nostdin", "-i", filePath, ...ffmpegOutputArgs(tone, vocalCut, bitrate)],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
  } else if (source === "youtube") {
    const videoId = url.searchParams.get("videoId");
    if (!videoId || !/^[a-zA-Z0-9_-]{6,20}$/.test(videoId)) {
      return new Response("Invalid YouTube videoId", { status: 400 });
    }

    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
    ytDlp = spawn(
      ytDlpBin,
      ["-f", "bestaudio/best", "--no-playlist", "--no-warnings", "--quiet", "-o", "-", youtubeUrl],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    ffmpeg = spawn(
      ffmpegBin,
      ["-hide_banner", "-loglevel", "error", "-nostdin", "-i", "pipe:0", ...ffmpegOutputArgs(tone, vocalCut, bitrate)],
      { stdio: ["pipe", "pipe", "pipe"] },
    );

    if (!ytDlp.stdout || !ffmpeg.stdin) {
      cleanup([ytDlp, ffmpeg]);
      return new Response("Unable to open YouTube stream pipeline", { status: 502 });
    }

    ytDlp.stdout.pipe(ffmpeg.stdin);
    ytDlp.on("close", () => {
      ffmpeg.stdin?.end();
    });
  } else {
    return new Response("Invalid source", { status: 400 });
  }

  const processes = [ffmpeg, ytDlp];
  request.signal.addEventListener("abort", () => cleanup(processes), { once: true });
  guardChildProcess(ffmpeg);
  guardChildProcess(ytDlp);

  if (!ffmpeg.stdout) {
    cleanup(processes);
    return new Response("Unable to open ffmpeg output", { status: 502 });
  }

  ffmpeg.stderr?.on("data", (chunk) => {
    const message = chunk.toString().trim();
    if (!message || message.includes("Broken pipe")) return;
    console.warn(`[ffmpeg] ${message}`);
  });

  if (ytDlp) {
    ytDlp.stderr?.on("data", (chunk) => {
      const message = chunk.toString().trim();
      if (!message) return;
      console.warn(`[yt-dlp] ${message}`);
    });
  }

  ffmpeg.on("close", () => cleanup(processes));

  return new Response(Readable.toWeb(ffmpeg.stdout) as BodyInit, {
    headers,
  });
}
