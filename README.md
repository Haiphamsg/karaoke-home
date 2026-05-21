# Karaoke Home

Website karaoke gia dinh chay local hoac tren Ubuntu server bang Docker. Ban nay ho tro:

- Tim va phat nhac local trong `media/`.
- Tim video/beat YouTube bang YouTube Data API key.
- Giao dien dien thoai/tablet o `/` va `/remote`.
- Man hinh phat rieng cho TV o `/tv`.
- WebSocket dong bo trang thai cho remote, TV va ESP32 LCD/audio.
- HTTP stream chung `/api/stream` cho local va YouTube relay qua `ffmpeg`/`yt-dlp`.
- Nhap tim kiem bang giong noi tren trinh duyet ho tro.

Plan kien truc chi tiet nam trong `docs/PLAN.md`.

## Chay local

```bash
cd /Users/abc/karaoke-home
npm run dev
```

Mo:

- App chinh: http://localhost:3000
- Dieu khien dien thoai/tablet: http://localhost:3000/remote
- Man hinh TV: http://localhost:3000/tv

Copy file `mp3`, `m4a`, `wav`, `mp4`, `webm` vao thu muc `media/`, sau do refresh web.

## Dung luong repo

Khi dev local, dung luong lon chu yeu nam o:

- `node_modules/`: thu vien de build/dev.
- `.next/`: cache va output cua Next.js.

Hai thu muc nay khong can commit va cung khong can copy len server neu deploy bang Docker/Git. Don nhe cache build:

```bash
npm run clean
```

Don sach ca thu vien local:

```bash
npm run clean:all
npm install
```

Sau `clean:all`, can chay `npm install` lai truoc khi dev/build local.

Neu chay local tren macOS va muon test stream ESP32/YouTube relay, can co:

```bash
brew install ffmpeg yt-dlp
```

Docker image tren Ubuntu da tu cai `ffmpeg` va `yt-dlp`.

## Cau hinh YouTube API key

Sua file `.env`:

```env
YOUTUBE_API_KEY=YOUR_KEY_HERE
```

Khoi dong lai app sau khi sua key. Neu key trong thi app van dung duoc nhac local, nhung tab YouTube se khong tim truc tiep.

## Voice search

Nut microphone dung Web Speech API voi `vi-VN`.

- `localhost` thuong dung duoc khi dev.
- Khi truy cap bang dien thoai qua IP/domain, microphone can HTTPS tren nhieu trinh duyet.
- Neu TV OS khong ho tro mic, dung dien thoai/tablet o `/remote` de tim bang giong noi.

## Deploy Ubuntu bang Docker

Tren Ubuntu server:

```bash
cd karaoke-home
cp .env.example .env
nano .env
docker compose up -d --build
```

Thu muc can giu lai khi backup:

- `data/`: cache YouTube, trang thai dang phat, goi y tuy bien.
- `media/`: nhac local.

Neu muon dung domain/HTTPS, dat Nginx/Caddy reverse proxy ve `http://127.0.0.1:3000`.

## Quy trinh update local -> server

De viec sua UI, sua logic va day len server it loi hon, nen tach ro 3 lop:

- Code: dua len Git repo.
- Cau hinh: giu rieng bang `.env` tren tung may, khong commit.
- Du lieu: giu rieng `media/` va `data/`, khong rebuild lai moi lan.

Luong lam viec de xuat:

1. Tren may local, code va test bang `npm run dev`.
2. Khi on dinh, chay `npm run lint` va `npm run build`.
3. Commit len Git.
4. Tren Ubuntu server, `git pull`.
5. Chay lai:

```bash
docker compose up -d --build --force-recreate
```

6. Neu can kiem tra nhanh:

```bash
docker compose logs -f --tail=100
curl -s http://127.0.0.1:3000/api/settings
```

Khong nen copy ca `node_modules/` hoac `.next/` tu local len server. Docker se build lai tu source va `package-lock.json`.

## TV mode

Mo `/tv` tren TV browser. Bam `Bat man hinh TV` mot lan de trinh duyet cho phep autoplay. Sau do dung dien thoai/tablet o `/remote` de tim bai va them vao hang doi.

Neu TV OS dong va browser yeu, phuong an on dinh hon la Android TV box, Chromecast, hoac HDMI tu mini PC.

## ESP32

WebSocket endpoint:

```text
ws://SERVER_IP:3000/ws?role=esp32
```

Server se gui message:

```json
{
  "type": "state",
  "state": {
    "status": "playing",
    "current": {
      "source": "local",
      "title": "Ten bai",
      "streamUrl": "/api/media/Ten%20bai.mp3"
    },
    "queue": [],
    "elapsed": 12,
    "duration": 240
  },
  "lcd": {
    "line1": "Ten bai         ",
    "line2": "0:12/4:00       "
  }
}
```

Voi ESP32 + PCM5102, nen de ESP32 nhan WebSocket state, sau do neu `current.source === "local"` thi stream audio qua HTTP tu:

```text
http://SERVER_IP:3000 + streamUrl
```

Voi lua chon A + YT2, track YouTube co `streamUrl` dang:

```text
/api/stream?source=youtube&videoId=VIDEO_ID&tone=0&vocalCut=false&bitrate=192
```

Server dung `yt-dlp` de lay audio va `ffmpeg` de transcode thanh MP3 stream cho ESP32. YouTube API chinh thuc khong cung cap raw audio stream, nen phan nay phu thuoc `yt-dlp` va co the can update khi YouTube thay doi.

Neu ESP32 la thiet bi phat audio chinh, ESP32 nen gui tien do phat ve server moi 1 giay:

```json
{ "type": "esp32:progress", "status": "playing", "elapsed": 13, "duration": 240 }
```

Khi do dien thoai, TV va LCD se lay thoi gian tu ESP32 thay vi lay tu browser.
