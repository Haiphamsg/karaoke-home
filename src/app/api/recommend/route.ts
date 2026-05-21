import { listLocalTracks } from "@/lib/media";
import { readJson } from "@/lib/json-store";
import type { HotQuery } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const defaultHotQueries: HotQuery[] = [
  {
    id: "hot:nhac-tre",
    kind: "query",
    category: "Thể loại",
    title: "Nhạc trẻ Hot",
    subtitle: "Beat mới, dễ hát trong gia đình",
    query: "karaoke nhac tre hot trend 2026",
  },
  {
    id: "hot:bolero",
    kind: "query",
    category: "Thể loại",
    title: "Bolero dễ hát",
    subtitle: "Tone nam nữ, hợp phòng khách",
    query: "karaoke bolero de hat tone nam nu",
  },
  {
    id: "hot:remix",
    kind: "query",
    category: "Thể loại",
    title: "Remix sôi động",
    subtitle: "Beat nhanh cho tiệc nhỏ",
    query: "karaoke remix viet nam hot",
  },
  {
    id: "hot:thieu-nhi",
    kind: "query",
    category: "Thể loại",
    title: "Thiếu nhi",
    subtitle: "Bài vui cho trẻ em và cả nhà",
    query: "karaoke thieu nhi vui nhon",
  },
  {
    id: "singer:son-tung",
    kind: "query",
    category: "Ca sĩ",
    title: "Sơn Tùng M-TP",
    subtitle: "Các bài karaoke được tìm nhiều",
    query: "karaoke son tung mtp beat",
  },
  {
    id: "singer:hoa-minzy",
    kind: "query",
    category: "Ca sĩ",
    title: "Hòa Minzy",
    subtitle: "Ballad, nhạc trẻ dễ hát",
    query: "karaoke hoa minzy beat",
  },
  {
    id: "singer:dan-truong",
    kind: "query",
    category: "Ca sĩ",
    title: "Đan Trường",
    subtitle: "Nhạc quen thuộc nhiều thế hệ",
    query: "karaoke dan truong beat",
  },
  {
    id: "singer:le-quyen",
    kind: "query",
    category: "Ca sĩ",
    title: "Lệ Quyên",
    subtitle: "Bolero, trữ tình, phòng trà",
    query: "karaoke le quyen tone nu",
  },
  {
    id: "song:noinaycoanh",
    kind: "query",
    category: "Hot search",
    title: "Nơi Này Có Anh",
    subtitle: "Sơn Tùng M-TP",
    query: "noi nay co anh karaoke beat",
  },
  {
    id: "song:catdoiloinhat",
    kind: "query",
    category: "Hot search",
    title: "Cắt Đôi Nỗi Sầu",
    subtitle: "Tăng Duy Tân",
    query: "cat doi noi sau karaoke beat",
  },
  {
    id: "song:henmotmai",
    kind: "query",
    category: "Hot search",
    title: "Hẹn Một Mai",
    subtitle: "Bùi Anh Tuấn",
    query: "hen mot mai karaoke beat",
  },
  {
    id: "song:nguoidungduong",
    kind: "query",
    category: "Hot search",
    title: "Người Đứng Sau Hạnh Phúc",
    subtitle: "Beat karaoke được tìm nhiều",
    query: "nguoi dung sau hanh phuc karaoke beat",
  },
];

export async function GET() {
  const configuredQueries = await readJson<HotQuery[]>("recommendations.json", defaultHotQueries);
  const localItems = (await listLocalTracks()).slice(0, 8);

  return Response.json({
    queries: configuredQueries,
    local: localItems,
  });
}
