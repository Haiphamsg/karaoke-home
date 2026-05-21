/*
  ESP32 client for Karaoke Home.

  Libraries:
  - arduinoWebSockets
  - ArduinoJson
  - LiquidCrystal_I2C
  - ESP32-audioI2S
*/

#include <ArduinoJson.h>
#include <LiquidCrystal_I2C.h>
#include <WebSocketsClient.h>
#include <WiFi.h>
#include <Wire.h>
#include "Audio.h"

const char* WIFI_SSID = "YOUR_WIFI";
const char* WIFI_PASSWORD = "YOUR_PASSWORD";
const char* SERVER_HOST = "192.168.1.10";
const uint16_t SERVER_PORT = 3000;

const int I2S_BCLK = 38;
const int I2S_DOUT = 37;
const int I2S_LRC = 36;
const int LCD_SDA = 21;
const int LCD_SCL = 47;

WebSocketsClient webSocket;
LiquidCrystal_I2C lcd(0x27, 16, 2);
Audio audio;

String currentTrackId = "";
String currentStreamUrl = "";
bool audioPaused = false;
uint8_t currentVolume = 12;
unsigned long lastProgressAt = 0;

void showLcd(const char* line1, const char* line2) {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(line1);
  lcd.setCursor(0, 1);
  lcd.print(line2);
}

void sendJson(JsonDocument& doc) {
  String payload;
  serializeJson(doc, payload);
  webSocket.sendTXT(payload);
}

void sendProgress(const char* status) {
  DynamicJsonDocument doc(256);
  doc["type"] = "esp32:progress";
  doc["status"] = status;
  doc["elapsed"] = audio.getAudioCurrentTime();
  doc["duration"] = audio.getAudioFileDuration();
  sendJson(doc);
}

void playLocalStream(const char* trackId, const char* streamUrl) {
  if (currentTrackId == trackId && currentStreamUrl == streamUrl) {
    return;
  }

  currentTrackId = trackId;
  currentStreamUrl = streamUrl;
  audioPaused = false;
  String url = String("http://") + SERVER_HOST + ":" + SERVER_PORT + streamUrl;
  audio.stopSong();
  audio.connecttohost(url.c_str());
  sendProgress("playing");
}

void stopAudio() {
  audio.stopSong();
  audioPaused = false;
  currentTrackId = "";
  currentStreamUrl = "";
  sendProgress("stopped");
}

void pauseAudio() {
  if (!audioPaused) {
    audio.pauseResume();
    audioPaused = true;
  }
  sendProgress("paused");
}

void resumeAudio() {
  if (audioPaused) {
    audio.pauseResume();
    audioPaused = false;
  }
  sendProgress("playing");
}

void setVolumeFromJson(JsonVariant value) {
  if (value.isNull()) {
    return;
  }

  int nextVolume = value.as<int>();
  if (nextVolume < 0) nextVolume = 0;
  if (nextVolume > 21) nextVolume = 21;
  currentVolume = nextVolume;
  audio.setVolume(currentVolume);
}

void setVolumePercentFromJson(JsonVariant value) {
  if (value.isNull()) {
    return;
  }

  int percent = value.as<int>();
  if (percent < 0) percent = 0;
  if (percent > 100) percent = 100;
  currentVolume = round((percent / 100.0) * 21.0);
  audio.setVolume(currentVolume);
}

void handleCommand(JsonDocument& doc) {
  const char* action = doc["action"] | "";

  if (strcmp(action, "play") == 0) {
    resumeAudio();
    return;
  }

  if (strcmp(action, "pause") == 0) {
    pauseAudio();
    return;
  }

  if (strcmp(action, "stop") == 0) {
    stopAudio();
    return;
  }

  if (strcmp(action, "next") == 0) {
    audio.stopSong();
    audioPaused = false;
    currentTrackId = "";
    currentStreamUrl = "";
    return;
  }

  if (strcmp(action, "volume") == 0) {
    setVolumeFromJson(doc["payload"]["volume"]);
    setVolumeFromJson(doc["volume"]);
    setVolumePercentFromJson(doc["payload"]["volumePercent"]);
    setVolumePercentFromJson(doc["payload"]["audioSettings"]["volumePercent"]);
    sendProgress(audioPaused ? "paused" : "playing");
  }

  if (strcmp(action, "settings") == 0) {
    setVolumeFromJson(doc["payload"]["volume"]);
    setVolumePercentFromJson(doc["payload"]["audioSettings"]["volumePercent"]);
    sendProgress(audioPaused ? "paused" : "playing");
  }
}

void handleStateMessage(uint8_t* payload) {
  DynamicJsonDocument doc(4096);
  DeserializationError error = deserializeJson(doc, payload);
  if (error) {
    return;
  }

  const char* type = doc["type"] | "";
  if (strcmp(type, "command") == 0) {
    handleCommand(doc);
    return;
  }

  if (strcmp(type, "state") != 0 && strcmp(type, "welcome") != 0) {
    return;
  }

  const char* line1 = doc["lcd"]["line1"] | "KARAOKE HOME    ";
  const char* line2 = doc["lcd"]["line2"] | "READY           ";
  showLcd(line1, line2);

  const char* source = doc["state"]["current"]["source"] | "";
  const char* trackId = doc["state"]["current"]["id"] | "";
  const char* streamUrl = doc["state"]["current"]["streamUrl"] | "";
  setVolumePercentFromJson(doc["state"]["audioSettings"]["volumePercent"]);

  if (strlen(streamUrl) > 0) {
    playLocalStream(trackId, streamUrl);
  }
}

void onWebSocketEvent(WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED:
      webSocket.sendTXT("{\"type\":\"ping\"}");
      break;
    case WStype_TEXT:
      handleStateMessage(payload);
      break;
    case WStype_DISCONNECTED:
      showLcd("KARAOKE HOME    ", "WS DISCONNECTED ");
      break;
    default:
      break;
  }
}

void setup() {
  Serial.begin(115200);
  Wire.begin(LCD_SDA, LCD_SCL);
  lcd.init();
  lcd.backlight();
  showLcd("KARAOKE HOME    ", "CONNECTING WIFI ");

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
  }

  showLcd("KARAOKE HOME    ", "CONNECTING WS   ");

  audio.setPinout(I2S_BCLK, I2S_LRC, I2S_DOUT);
  audio.setVolume(currentVolume);

  webSocket.begin(SERVER_HOST, SERVER_PORT, "/ws?role=esp32");
  webSocket.onEvent(onWebSocketEvent);
  webSocket.setReconnectInterval(3000);
}

void loop() {
  webSocket.loop();
  audio.loop();

  if (millis() - lastProgressAt >= 1000) {
    lastProgressAt = millis();
    if (currentTrackId.length() > 0) {
      sendProgress(audioPaused ? "paused" : "playing");
    }
  }
}
