# ESP32 LCD + PCM5102

Ket noi hien tai:

- ESP32 ket noi Wi-Fi cung mang voi server.
- WebSocket dung de nhan ten bai, trang thai, thoi gian phat va hang doi.
- HTTP dung de stream audio local/YouTube relay tu server.
- LCD 16x2 hien `lcd.line1` va `lcd.line2` tu WebSocket.
- PCM5102 phat stream MP3 tu `/api/stream`.
- YouTube co the phat tren ESP32 neu server co `yt-dlp` va `ffmpeg`.

Phan cung:

- Board: ESP32-S3 16N8R.
- PCM5102: BCK GPIO38, DIN GPIO37, LCK GPIO36, SCK keo GND, XSMT keo 3V3.
- LCD I2C: address `0x27`, SDA GPIO21, SCL GPIO47.

Thu vien Arduino goi y:

- `arduinoWebSockets`
- `ArduinoJson`
- `LiquidCrystal_I2C`
- `ESP32-audioI2S`

Endpoint raw WebSocket cua repo nay:

```text
ws://SERVER_IP:3000/ws?role=esp32
http://SERVER_IP:3000/api/esp32/now-playing
```

Luu y: Socket.IO v4 khong phai plain/raw WebSocket. Neu ESP32 dang noi thang vao Socket.IO server cu bang `arduinoWebSockets`, code do thuong phai xu ly Engine.IO/Socket.IO packet nhu `40`, `42[...]`. Repo nay co endpoint raw `/ws` rieng de ESP32 don gian hon.

Khi nhan track:

```json
{
  "source": "youtube",
  "streamUrl": "/api/stream?source=youtube&videoId=VIDEO_ID&tone=0&vocalCut=false&bitrate=192"
}
```

ESP32 ghep thanh URL audio:

```text
http://SERVER_IP:3000 + streamUrl
```

Neu ESP32 la player chinh, ESP32 nen gui tien do phat ve server moi 1 giay:

```json
{
  "type": "esp32:progress",
  "status": "playing",
  "elapsed": 13,
  "duration": 240
}
```

Server se broadcast lai state cho remote, TV va LCD.

LCD 16x2:

- Dong 1: bai dang phat, server da bo dau va can 16 ky tu.
- Dong 2: `NEXT ...` neu co hang doi, neu khong hien trang thai/thoi gian.

Neu muon hien thoi gian lien tuc tren dong 2, co the sua `makeLcdPayload()` trong `server.mjs`.

Khuyen nghi:

- Khong stream audio qua WebSocket.
- Dung WebSocket cho metadata, command, progress va heartbeat.
- Dung HTTP cho audio vi de reconnect, de debug va phu hop voi thu vien audio tren ESP32.
- Neu Wi-Fi yeu, nen cache buffer o ESP32 cao hon va dat server/ESP32 trong cung mang LAN.
- Chuan hoa audio local ve MP3 CBR 128k/192k, stereo, 44.1 kHz hoac 48 kHz de giam loi decode/bitrate.
- PCM5102 khong giai ma MP3; ESP32-audioI2S decode thanh PCM roi day ra I2S cho PCM5102.
- Neu stream YouTube khong phat, kiem tra `yt-dlp`, `ffmpeg`, internet server va log container truoc.
