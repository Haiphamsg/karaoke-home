import { readJson } from "@/lib/json-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const payload = await readJson("now-playing.json", {
    status: "idle",
    current: null,
    queue: [],
    elapsed: 0,
    duration: 0,
    lcd: {
      line1: "KARAOKE HOME    ",
      line2: "READY           ",
      fullTitle: "KARAOKE HOME",
      nextTitle: "",
    },
  });

  return Response.json(payload);
}
