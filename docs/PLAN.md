# Karaoke Home Plan

Tai lieu nay mo ta kien truc dang dung trong code hien tai.

## Muc tieu

He thong karaoke gia dinh co 3 man hinh/thiet bi chinh:

- Dien thoai/tablet: tim bai, tim bang giong noi, them hang doi, dieu khien.
- TV/browser: hien thi karaoke player, YouTube embed, thong tin bai dang hat.
- ESP32 + LCD 16x2 + PCM5102: nhan trang thai qua WebSocket, stream audio local/YouTube relay qua HTTP, hien LCD.

Phan cung ESP32 hien tai:

- Board: ESP32-S3 16N8R.
- Build/flash: Arduino IDE, file `.ino`.
- WebSocket: `arduinoWebSockets` cua Markus Sattler.
- JSON: ArduinoJson v6, dung `DynamicJsonDocument`.
- Audio: ESP32-audioI2S.
- LCD: LiquidCrystal_I2C, address `0x27`.
- PCM5102: BCK GPIO38, DIN GPIO37, LCK GPIO36, SCK keo GND, XSMT keo 3V3.
- LCD: SDA GPIO21, SCL GPIO47.

## Luong dieu khien

WebSocket la kenh dieu khien va dong bo trang thai. Repo nay dang dung raw WebSocket tai `/ws`, khong dung Socket.IO protocol.

Endpoint:

```text
ws://SERVER_IP:3000/ws?role=remote
ws://SERVER_IP:3000/ws?role=tv
ws://SERVER_IP:3000/ws?role=esp32
```

Server phat message `state` moi khi co thay doi:

```json
{
  "type": "state",
  "state": {
    "status": "playing",
    "current": {
      "id": "local:demo.mp3",
      "source": "local",
      "title": "Demo",
      "streamUrl": "/api/media/demo.mp3"
    },
    "queue": [],
    "elapsed": 12,
    "duration": 240
  },
  "lcd": {
    "line1": "Demo            ",
    "line2": "0:12/4:00       "
  }
}
```

Client co the gui:

```json
{ "type": "queue:add", "track": {} }
```

```json
{ "type": "player:command", "action": "next" }
```

```json
{ "type": "esp32:progress", "status": "playing", "elapsed": 13, "duration": 240 }
```

## Luong audio HTTP

Audio khong di qua WebSocket. ESP32 stream bang HTTP:

```text
http://SERVER_IP:3000/api/stream?source=local&path=Ten%20bai.mp3
http://SERVER_IP:3000/api/stream?source=youtube&videoId=VIDEO_ID
```

Ly do:

- HTTP stream don gian hon va on dinh hon WebSocket binary.
- Trinh phat ESP32-audioI2S doc HTTP stream phu hop voi PCM5102.
- Server da ho tro `Range` request, giup trinh phat tua/stream tot hon.
- WebSocket giu nhe, chi lo metadata, queue, command va tien do phat.

Server transcode ve MP3 CBR 128/160/192 kbps bang `ffmpeg`. Luu y quan trong: PCM5102 chi nhan PCM qua I2S. Thu vien ESP32-audioI2S van la thanh phan decode MP3/AAC/WAV tren ESP32 roi day PCM sang PCM5102. Neu server gui MP3 chunked stream thi ESP32 van can decode software. Neu server gui PCM/WAV raw thi bang thong cao hon nhieu.

## Luong YouTube

Theo lua chon A + YT2, YouTube co 2 duong:

- TV/browser: van phat bang iframe embed.
- ESP32: server relay audio qua `/api/stream?source=youtube&videoId=...`.

YouTube Data API/IFrame API khong cung cap raw audio stream. Relay hien tai dung `yt-dlp + ffmpeg`, phu thuoc vao kha nang `yt-dlp` truy cap YouTube tai thoi diem chay.

## Nguon thoi gian phat

Co 2 che do:

1. Browser/TV la player chinh:
   - TV hoac web player phat audio/video.
   - Browser gui `elapsed`/`duration` ve server qua WebSocket.
   - ESP32 nhan state de hien LCD.

2. ESP32 la player chinh:
   - ESP32 nhan `state.current.streamUrl`.
   - ESP32 stream HTTP va phat qua PCM5102.
   - ESP32 gui `esp32:progress` moi 1 giay ve server.
   - Dien thoai/TV nhan lai state de hien dung thoi gian thuc te.

Voi phan cung hien tai cua ban, che do 2 nen la huong uu tien cho nhac local.

## Thu muc du lieu

- `media/`: chua file nhac/video local.
- `data/now-playing.json`: trang thai dang phat moi nhat.
- `data/youtube-cache.json`: cache ket qua tim YouTube.
- `data/recommendations.json`: goi y hot tuy bien neu can.

## Viec can lam tiep

- Them tuy chon output: `TV/browser` hoac `ESP32`.
- Cho ESP32 gui progress moi 1 giay de server co thoi gian chuan.
- Them command rieng cho ESP32: `play`, `pause`, `stop`, `next`, `volume`.
- Them ACK/heartbeat de biet ESP32 con online.
- Them man hinh device status trong web: TV online, ESP32 online, remote online.
- Sau khi co domain, bat HTTPS de voice search tren dien thoai hoat dong on dinh.
- Neu can tuong thich Socket.IO v4 cu, them gateway rieng hoac doi server ve Socket.IO va cap nhat ESP32 theo Engine.IO packet format.
- Them log stream YouTube ro rang tren web khi server thieu `ffmpeg`, thieu `yt-dlp`, hoac YouTube bi chan.
