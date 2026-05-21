import { getDataRoot, getMediaRoot } from "@/lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    appName: "Karaoke Home",
    hasYouTubeKey: Boolean(process.env.YOUTUBE_API_KEY?.trim()),
    dataRoot: getDataRoot(),
    mediaRoot: getMediaRoot(),
    websocketPath: "/ws",
    streamPath: "/api/stream",
    hasFfmpegConfig: Boolean(process.env.FFMPEG_BIN),
    hasYtDlpConfig: Boolean(process.env.YTDLP_BIN),
  });
}
