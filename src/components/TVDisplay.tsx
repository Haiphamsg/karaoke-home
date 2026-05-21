"use client";

import { Clock3, Disc3, ListMusic, Maximize2, Pause, Play, QrCode, Radio, SkipForward, SlidersHorizontal, Volume2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { LcdPayload, PlaybackState, SocketEnvelope } from "@/lib/types";

const initialState: PlaybackState = {
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

const initialLcd: LcdPayload = {
  line1: "KARAOKE HOME    ",
  line2: "READY           ",
  fullTitle: "KARAOKE HOME",
  nextTitle: "",
};

function buildWsUrl() {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.host}/ws?role=tv`;
}

function formatClock(totalSeconds = 0) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = String(safe % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function statusLabel(status: PlaybackState["status"]) {
  if (status === "playing") return "Đang hát";
  if (status === "paused") return "Tạm dừng";
  if (status === "loading") return "Đang tải";
  if (status === "stopped") return "Đã dừng";
  return "Sẵn sàng";
}

export default function TVDisplay() {
  const socketRef = useRef<WebSocket | null>(null);
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const lastSyncRef = useRef(0);
  const [armed, setArmed] = useState(false);
  const [origin] = useState(() => (typeof window === "undefined" ? "" : window.location.origin));
  const [state, setState] = useState<PlaybackState>(initialState);
  const [lcd, setLcd] = useState<LcdPayload>(initialLcd);
  const current = state.current;
  const progressPercent = state.duration > 0 ? Math.min(100, Math.max(0, (state.elapsed / state.duration) * 100)) : 0;
  const nextTrack = state.queue[0];

  const sendPatch = useCallback((patch: Partial<PlaybackState>) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "state:update", patch }));
    }
  }, []);

  const sendCommand = useCallback((action: string) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "player:command", action }));
    }
  }, []);

  useEffect(() => {
    let closed = false;
    let reconnectTimer: number | undefined;

    const connect = () => {
      const socket = new WebSocket(buildWsUrl());
      socketRef.current = socket;

      socket.onmessage = (event) => {
        let payload: SocketEnvelope;
        try {
          payload = JSON.parse(event.data) as SocketEnvelope;
        } catch {
          return;
        }

        if (payload.type === "welcome" || payload.type === "state") {
          setState(payload.state);
          setLcd(payload.lcd);
        }
      };

      socket.onclose = () => {
        if (!closed) {
          reconnectTimer = window.setTimeout(connect, 1500);
        }
      };
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      socketRef.current?.close();
    };
  }, []);

  useEffect(() => {
    const media = mediaRef.current;
    if (!media || !armed || current?.source !== "local") return;

    media.play().catch(() => {
      sendPatch({ status: "paused" });
    });
  }, [armed, current?.id, current?.source, sendPatch]);

  const syncMediaState = () => {
    const media = mediaRef.current;
    if (!media) return;

    const now = Date.now();
    if (now - lastSyncRef.current < 1200) return;
    lastSyncRef.current = now;

    sendPatch({
      status: media.paused ? "paused" : "playing",
      elapsed: media.currentTime || 0,
      duration: Number.isFinite(media.duration) ? media.duration : 0,
    });
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => undefined);
    } else {
      document.exitFullscreen().catch(() => undefined);
    }
  };

  return (
    <main className="tv-shell">
      {!armed && (
        <button className="tv-start" type="button" onClick={() => setArmed(true)}>
          <Play size={28} />
          Bật màn hình TV
        </button>
      )}

      <header className="tv-topbar">
        <div className="tv-brand">
          <Disc3 size={24} />
          <div>
            <strong>Karaoke Home</strong>
            <span>{statusLabel(state.status)}</span>
          </div>
        </div>
        <div className="tv-status-set">
          <span>
            <Radio size={16} />
            WebSocket
          </span>
          <span>
            <SlidersHorizontal size={16} />
            Tone {state.audioSettings.tone > 0 ? `+${state.audioSettings.tone}` : state.audioSettings.tone}
          </span>
          <span>{state.audioSettings.vocalCut ? "Tách vocal" : "Vocal gốc"}</span>
        </div>
      </header>

      <section className="tv-stage">
        {!current ? (
          <div className="tv-idle">
            <Volume2 size={64} />
            <h1>Karaoke Home</h1>
            <p>Mở điều khiển trên điện thoại để chọn bài.</p>
          </div>
        ) : current.source === "youtube" && current.videoId ? (
          <iframe
            key={current.id}
            src={`https://www.youtube.com/embed/${current.videoId}?autoplay=${armed ? "1" : "0"}&playsinline=1&rel=0&mute=1`}
            title={current.title}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        ) : current.mediaType === "video" ? (
          <video
            key={current.id}
            ref={(element) => {
              mediaRef.current = element;
            }}
            src={current.mediaUrl || current.streamUrl}
            muted
            controls
            playsInline
            onPlay={() => sendPatch({ status: "playing" })}
            onPause={() => sendPatch({ status: "paused" })}
            onEnded={() => sendCommand("next")}
            onLoadedMetadata={syncMediaState}
            onTimeUpdate={syncMediaState}
          />
        ) : (
          <div className="audio-tv">
            <Volume2 size={78} />
            <audio
              key={current.id}
              ref={(element) => {
                mediaRef.current = element;
              }}
              src={current.audioStreamUrl || current.streamUrl}
              muted
              controls
              onPlay={() => sendPatch({ status: "playing" })}
              onPause={() => sendPatch({ status: "paused" })}
              onEnded={() => sendCommand("next")}
              onLoadedMetadata={syncMediaState}
              onTimeUpdate={syncMediaState}
            />
          </div>
        )}
      </section>

      <aside className="tv-overlay">
        <div className="tv-now">
          <p>{current?.source === "youtube" ? "YouTube" : current?.source === "local" ? "Local" : "Karaoke"}</p>
          <h1>{current?.title || "Sẵn sàng"}</h1>
          <span>{current?.artist || "Chọn bài từ điện thoại hoặc tablet"}</span>
          <div className="tv-progress" aria-label="Tiến độ bài hát">
            <div style={{ width: `${progressPercent}%` }} />
          </div>
          <small>
            <Clock3 size={15} />
            {formatClock(state.elapsed)} / {state.duration ? formatClock(state.duration) : "--:--"}
          </small>
        </div>
        <div className="tv-actions">
          <button type="button" onClick={() => sendCommand("play")} title="Phát">
            <Play size={24} />
          </button>
          <button type="button" onClick={() => sendCommand("pause")} title="Tạm dừng">
            <Pause size={24} />
          </button>
          <button type="button" onClick={() => sendCommand("next")} title="Bài tiếp">
            <SkipForward size={24} />
          </button>
          <button type="button" onClick={toggleFullscreen} title="Toàn màn hình">
            <Maximize2 size={24} />
          </button>
        </div>
      </aside>

      <aside className="tv-queue">
        <div className="tv-queue-title">
          <ListMusic size={18} />
          <strong>Hàng đợi</strong>
        </div>
        <div className="tv-lcd">
          <code>{lcd.line1}</code>
          <code>{lcd.line2}</code>
        </div>
        <p>Tiếp theo: {nextTrack?.title || "Trống"}</p>
        <p>Còn lại: {Math.max(0, state.queue.length - 1)} bài</p>
        <div className="remote-link">
          <QrCode size={20} />
          <span>{origin ? `${origin}/remote` : "/remote"}</span>
        </div>
      </aside>
    </main>
  );
}
