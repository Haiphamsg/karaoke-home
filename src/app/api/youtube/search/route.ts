import { searchYouTube } from "@/lib/youtube";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q") || "";

  try {
    const result = await searchYouTube(query);
    return Response.json(result);
  } catch (error) {
    return Response.json(
      {
        items: [],
        configured: Boolean(process.env.YOUTUBE_API_KEY),
        cached: false,
        message: error instanceof Error ? error.message : "YouTube search failed",
      },
      { status: 502 },
    );
  }
}
