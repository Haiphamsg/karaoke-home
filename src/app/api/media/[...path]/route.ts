import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { getMediaRoot, resolveInside } from "@/lib/paths";
import { getMimeType } from "@/lib/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    path: string[];
  }>;
};

function parseRange(rangeHeader: string | null, size: number) {
  if (!rangeHeader?.startsWith("bytes=")) {
    return null;
  }

  const [startValue, endValue] = rangeHeader.replace("bytes=", "").split("-");
  const start = startValue ? Number.parseInt(startValue, 10) : 0;
  const end = endValue ? Number.parseInt(endValue, 10) : size - 1;

  if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) {
    return null;
  }

  return {
    start,
    end: Math.min(end, size - 1),
  };
}

export async function GET(request: Request, context: RouteContext) {
  const params = await context.params;
  const filePath = resolveInside(getMediaRoot(), params.path);
  const fileStat = await stat(filePath).catch(() => null);

  if (!fileStat?.isFile()) {
    return new Response("Not found", { status: 404 });
  }

  const range = parseRange(request.headers.get("range"), fileStat.size);
  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Content-Type": getMimeType(filePath),
    "Cache-Control": "public, max-age=3600",
  });

  if (range) {
    const chunkSize = range.end - range.start + 1;
    headers.set("Content-Range", `bytes ${range.start}-${range.end}/${fileStat.size}`);
    headers.set("Content-Length", String(chunkSize));

    const stream = createReadStream(filePath, { start: range.start, end: range.end });
    return new Response(Readable.toWeb(stream) as BodyInit, {
      status: 206,
      headers,
    });
  }

  headers.set("Content-Length", String(fileStat.size));
  const stream = createReadStream(filePath);

  return new Response(Readable.toWeb(stream) as BodyInit, {
    headers,
  });
}
