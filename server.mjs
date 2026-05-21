import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import next from "next";
import { WebSocketServer } from "ws";

function loadDotEnv() {
  const envPath = join(process.cwd(), ".env");
  if (!existsSync(envPath)) return;

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;

    const [key, ...valueParts] = trimmed.split("=");
    if (!process.env[key]) {
      process.env[key] = valueParts.join("=").replace(/^["']|["']$/g, "");
    }
  }
}

loadDotEnv();

const port = Number.parseInt(process.env.PORT || "3000", 10);
const hostname = process.env.HOSTNAME || "0.0.0.0";
const dev = process.env.NODE_ENV !== "production";
const dataRoot = process.env.DATA_ROOT || join(process.cwd(), "data");
const nowPlayingPath = join(dataRoot, "now-playing.json");

mkdirSync(dataRoot, { recursive: true });

const defaultState = {
  status: "idle",
  current: null,
  queue: [],
  elapsed: 0,
  duration: 0,
  volume: 1,
  audioSettings: {
    tone: 0,
    vocalCut: false,
    volumePercent: 60,
    bitrateKbps: 192,
  },
  updatedAt: new Date().toISOString(),
};

function readInitialState() {
  if (!existsSync(nowPlayingPath)) {
    return defaultState;
  }

  try {
    return { ...defaultState, ...JSON.parse(readFileSync(nowPlayingPath, "utf8")) };
  } catch {
    return defaultState;
  }
}

let playbackState = readInitialState();

function withoutVietnameseMarks(value = "") {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

function fitLcd(value, width = 16) {
  const clean = withoutVietnameseMarks(value).replace(/\s+/g, " ").trim();
  if (!clean) return "".padEnd(width, " ");
  return clean.length > width ? clean.slice(0, width) : clean.padEnd(width, " ");
}

function formatTime(totalSeconds = 0) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = String(safe % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function makeLcdPayload(state) {
  const title = state.current?.title || "KARAOKE HOME";
  const next = state.queue?.[0]?.title;
  const timeLine =
    state.duration > 0
      ? `${formatTime(state.elapsed)}/${formatTime(state.duration)}`
      : state.status.toUpperCase();

  return {
    line1: fitLcd(title),
    line2: fitLcd(next ? `NEXT ${next}` : timeLine),
    fullTitle: withoutVietnameseMarks(title),
    nextTitle: next ? withoutVietnameseMarks(next) : "",
  };
}

function persistState() {
  playbackState.updatedAt = new Date().toISOString();
  writeFileSync(
    nowPlayingPath,
    JSON.stringify({ ...playbackState, lcd: makeLcdPayload(playbackState) }, null, 2),
  );
}

function stateEnvelope() {
  return {
    type: "state",
    state: playbackState,
    lcd: makeLcdPayload(playbackState),
  };
}

function clampAudioSettings(settings = {}) {
  const tone = Number(settings.tone ?? defaultState.audioSettings.tone);
  const volumePercent = Number(settings.volumePercent ?? defaultState.audioSettings.volumePercent);
  const bitrateKbps = Number(settings.bitrateKbps ?? defaultState.audioSettings.bitrateKbps);

  return {
    tone: Math.max(-6, Math.min(6, Number.isFinite(tone) ? Math.round(tone) : 0)),
    vocalCut: Boolean(settings.vocalCut ?? defaultState.audioSettings.vocalCut),
    volumePercent: Math.max(0, Math.min(100, Number.isFinite(volumePercent) ? Math.round(volumePercent) : 60)),
    bitrateKbps: [128, 160, 192].includes(bitrateKbps) ? bitrateKbps : 192,
  };
}

playbackState.audioSettings = clampAudioSettings(playbackState.audioSettings);

function volumePercentToAudioI2S(percent) {
  return Math.max(0, Math.min(21, Math.round((percent / 100) * 21)));
}

function buildStreamUrl(track, settings = playbackState.audioSettings) {
  const audioSettings = clampAudioSettings(settings);
  const params = new URLSearchParams({
    source: track.source,
    tone: String(audioSettings.tone),
    vocalCut: String(audioSettings.vocalCut),
    bitrate: String(audioSettings.bitrateKbps),
  });

  if (track.source === "local" && track.path) {
    params.set("path", track.path);
  }

  if (track.source === "youtube" && track.videoId) {
    params.set("videoId", track.videoId);
  }

  return `/api/stream?${params.toString()}`;
}

function attachStreamUrl(track) {
  if (!track || typeof track !== "object") return track;
  if ((track.source === "local" && track.path) || (track.source === "youtube" && track.videoId)) {
    const streamUrl = buildStreamUrl(track);
    return {
      ...track,
      streamUrl,
      audioStreamUrl: streamUrl,
    };
  }

  return track;
}

function broadcast(wss, payload, except) {
  const message = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client !== except && client.readyState === client.OPEN) {
      client.send(message);
    }
  }
}

function coerceQueue(queue) {
  return Array.isArray(queue) ? queue.filter(Boolean).slice(0, 50) : [];
}

function playNextTrack() {
  const [nextTrack, ...rest] = playbackState.queue || [];
  const current = attachStreamUrl(nextTrack);
  playbackState = {
    ...playbackState,
    current: current || null,
    queue: rest,
    status: current ? "loading" : "idle",
    elapsed: 0,
    duration: current?.duration || 0,
  };
}

function applyPlayerCommand(command) {
  const action = command.action;

  if (action === "next") {
    playNextTrack();
    return;
  }

  if (action === "stop") {
    playbackState = {
      ...playbackState,
      status: "stopped",
      elapsed: 0,
    };
    return;
  }

  if (action === "clear") {
    playbackState = {
      ...playbackState,
      queue: [],
    };
    return;
  }

  if (action === "settings") {
    playbackState = {
      ...playbackState,
      audioSettings: clampAudioSettings({
        ...playbackState.audioSettings,
        ...(command.settings || command.payload?.settings || {}),
      }),
    };
    return;
  }

  if (action === "volume") {
    const volumePercent = command.volumePercent ?? command.payload?.volumePercent ?? command.payload?.volume;
    playbackState = {
      ...playbackState,
      audioSettings: clampAudioSettings({
        ...playbackState.audioSettings,
        volumePercent,
      }),
    };
    return;
  }

  if (action === "play" || action === "pause" || action === "loading") {
    playbackState = {
      ...playbackState,
      status: action === "play" ? "playing" : action,
    };
  }

  if (typeof command.elapsed === "number") {
    playbackState.elapsed = Math.max(0, command.elapsed);
  }

  if (typeof command.duration === "number") {
    playbackState.duration = Math.max(0, command.duration);
  }
}

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    handle(req, res);
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    if (url.pathname !== "/ws") {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    const role = url.searchParams.get("role") || "client";

    ws.send(
      JSON.stringify({
        ...stateEnvelope(),
        type: "welcome",
        role,
        serverTime: new Date().toISOString(),
      }),
    );

    ws.on("message", (raw) => {
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
        return;
      }

      if (message.type === "state:update") {
        const patch = { ...message.patch };
        if (patch.current) {
          patch.current = attachStreamUrl(patch.current);
        }
        if (patch.audioSettings) {
          patch.audioSettings = clampAudioSettings({
            ...playbackState.audioSettings,
            ...patch.audioSettings,
          });
        }
        playbackState = {
          ...playbackState,
          ...patch,
          queue: coerceQueue(patch?.queue ?? playbackState.queue),
        };
        persistState();
        broadcast(wss, stateEnvelope());
        return;
      }

      if (message.type === "queue:add" && message.track) {
        const track = attachStreamUrl(message.track);
        if (!playbackState.current || playbackState.status === "idle") {
          playbackState = {
            ...playbackState,
            current: track,
            status: "loading",
            elapsed: 0,
            duration: track.duration || 0,
          };
        } else {
          playbackState = {
            ...playbackState,
            queue: [...coerceQueue(playbackState.queue), track].slice(0, 50),
          };
        }
        persistState();
        broadcast(wss, stateEnvelope());
        return;
      }

      if (message.type === "queue:remove") {
        playbackState = {
          ...playbackState,
          queue: coerceQueue(playbackState.queue).filter((item) => item.id !== message.id),
        };
        persistState();
        broadcast(wss, stateEnvelope());
        return;
      }

      if (message.type === "player:command") {
        applyPlayerCommand(message);
        persistState();
        broadcast(wss, {
          type: "command",
          action: message.action,
          payload: {
            ...message,
            audioSettings: playbackState.audioSettings,
            volume: volumePercentToAudioI2S(playbackState.audioSettings.volumePercent),
          },
        });
        broadcast(wss, stateEnvelope());
        return;
      }

      if (message.type === "esp32:progress") {
        playbackState = {
          ...playbackState,
          status: message.status || playbackState.status,
          elapsed: typeof message.elapsed === "number" ? Math.max(0, message.elapsed) : playbackState.elapsed,
          duration: typeof message.duration === "number" ? Math.max(0, message.duration) : playbackState.duration,
        };
        persistState();
        broadcast(wss, stateEnvelope(), ws);
        return;
      }

      if (message.type === "ping") {
        ws.send(JSON.stringify({ type: "pong", serverTime: new Date().toISOString() }));
      }
    });
  });

  persistState();

  server.listen(port, hostname, () => {
    console.log(`Karaoke Home listening on http://${hostname}:${port}`);
  });
});
