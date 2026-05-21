"use client";

import {
  Clock3,
  Disc3,
  Flame,
  ListMusic,
  LoaderCircle,
  Mic,
  MonitorSpeaker,
  Music2,
  Music4,
  Pause,
  Play,
  Plus,
  Radio,
  Search,
  SlidersHorizontal,
  SkipForward,
  Smartphone,
  Trash2,
  Tv,
  Volume2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AudioSettings, HotQuery, LcdPayload, PlaybackState, SocketEnvelope, Track } from "@/lib/types";

type AppVariant = "home" | "remote";
type SearchSource = "hot" | "local" | "youtube";
type ResultItem = Track | HotQuery;

type BrowserSpeechRecognitionResult = {
  results: ArrayLike<ArrayLike<{ transcript: string; confidence: number }>>;
};

type BrowserSpeechRecognitionError = {
  error: string;
};

type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: BrowserSpeechRecognitionResult) => void) | null;
  onerror: ((event: BrowserSpeechRecognitionError) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

declare global {
  interface Window {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  }
}

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

function isHotQuery(item: ResultItem): item is HotQuery {
  return "kind" in item && item.kind === "query";
}

function formatClock(totalSeconds = 0) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = String(safe % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json() as Promise<T>;
}

function buildWsUrl(role: string) {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.host}/ws?role=${encodeURIComponent(role)}`;
}

export default function KaraokeApp({ variant = "home" }: { variant?: AppVariant }) {
  const socketRef = useRef<WebSocket | null>(null);
  const [socketStatus, setSocketStatus] = useState<"connecting" | "online" | "offline">("connecting");
  const [state, setState] = useState<PlaybackState>(initialState);
  const [lcd, setLcd] = useState<LcdPayload>(initialLcd);
  const [query, setQuery] = useState("");
  const [activeSource, setActiveSource] = useState<SearchSource>("hot");
  const [results, setResults] = useState<ResultItem[]>([]);
  const [localTracks, setLocalTracks] = useState<Track[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [hasYouTubeKey, setHasYouTubeKey] = useState(false);
  const [listening, setListening] = useState(false);

  useEffect(() => {
    let closed = false;
    let reconnectTimer: number | undefined;

    const connect = () => {
      setSocketStatus("connecting");
      const socket = new WebSocket(buildWsUrl(variant));
      socketRef.current = socket;

      socket.onopen = () => setSocketStatus("online");

      socket.onmessage = (event) => {
        let payload: SocketEnvelope;
        try {
          payload = JSON.parse(event.data) as SocketEnvelope;
        } catch {
          setMessage("WebSocket nhận dữ liệu không hợp lệ từ server.");
          return;
        }

        if (payload.type === "welcome" || payload.type === "state") {
          setState(payload.state);
          setLcd(payload.lcd);
        }
      };

      socket.onclose = () => {
        setSocketStatus("offline");
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
  }, [variant]);

  const sendSocket = useCallback((payload: Record<string, unknown>) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(payload));
      return true;
    }

    setMessage("WebSocket chưa kết nối. Hãy thử lại sau vài giây.");
    return false;
  }, []);

  const sendPatch = useCallback(
    (patch: Partial<PlaybackState>) => {
      sendSocket({ type: "state:update", patch });
    },
    [sendSocket],
  );

  const sendCommand = useCallback(
    (action: string, payload: Record<string, unknown> = {}) => {
      sendSocket({ type: "player:command", action, ...payload });
    },
    [sendSocket],
  );

  const refreshHot = useCallback(async () => {
    setBusy(true);
    setMessage("");

    try {
      const payload = await fetchJson<{ queries: HotQuery[]; local: Track[] }>("/api/recommend");
      setLocalTracks((current) => (current.length > 0 ? current : payload.local));
      setResults([...payload.queries, ...payload.local]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không tải được gợi ý.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    fetchJson<{ hasYouTubeKey: boolean }>("/api/settings")
      .then((payload) => setHasYouTubeKey(payload.hasYouTubeKey))
      .catch(() => setHasYouTubeKey(false));

    fetchJson<{ items: Track[] }>("/api/local")
      .then((payload) => setLocalTracks(payload.items))
      .catch(() => setLocalTracks([]));

    const timer = window.setTimeout(() => {
      refreshHot();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [refreshHot]);

  const runSearch = useCallback(
    async (nextQuery = query, source = activeSource) => {
      const trimmed = nextQuery.trim();
      setBusy(true);
      setMessage("");

      try {
        if (source === "hot" && !trimmed) {
          await refreshHot();
          return;
        }

        if (source === "local") {
          const payload = await fetchJson<{ items: Track[] }>(`/api/local?q=${encodeURIComponent(trimmed)}`);
          setResults(payload.items);
          return;
        }

        if (!trimmed) {
          setResults([]);
          setMessage("Nhập tên bài hoặc beat rồi bấm Tìm để tìm trên YouTube.");
          return;
        }

        const payload = await fetchJson<{ items: Track[]; configured: boolean; message?: string }>(
          `/api/youtube/search?q=${encodeURIComponent(trimmed)}`,
        );
        setHasYouTubeKey(payload.configured);
        setResults(payload.items);
        if (payload.message) setMessage(payload.message);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Tìm kiếm thất bại.");
      } finally {
        setBusy(false);
      }
    },
    [activeSource, query, refreshHot],
  );

  const selectSource = useCallback(
    (source: SearchSource) => {
      setActiveSource(source);
      setMessage("");

      if (source === "hot") {
        refreshHot();
        return;
      }

      if (source === "local") {
        runSearch(query, "local");
        return;
      }

      if (query.trim()) {
        runSearch(query, "youtube");
        return;
      }

      setResults([]);
      setMessage("Nhập tên bài hoặc beat rồi bấm Tìm để tìm trên YouTube.");
    },
    [query, refreshHot, runSearch],
  );

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    runSearch();
  };

  const startVoiceSearch = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setMessage("Trình duyệt này chưa hỗ trợ nhập giọng nói. Hãy dùng Chrome hoặc Edge trên điện thoại.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "vi-VN";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();
      if (transcript) {
        setQuery(transcript);
        runSearch(transcript, activeSource === "hot" ? "youtube" : activeSource);
      }
    };
    recognition.onerror = (event) => {
      setMessage(`Không nghe được giọng nói: ${event.error}`);
    };
    recognition.onend = () => setListening(false);
    setListening(true);
    recognition.start();
  };

  const playNow = (track: Track) => {
    sendPatch({
      current: track,
      status: "loading",
      elapsed: 0,
      duration: track.duration || 0,
    });
  };

  const addToQueue = (track: Track) => {
    sendSocket({ type: "queue:add", track });
  };

  const removeFromQueue = (id: string) => {
    sendSocket({ type: "queue:remove", id });
  };

  const openHotQuery = (item: HotQuery) => {
    setQuery(item.query);
    setActiveSource("youtube");
    runSearch(item.query, "youtube");
  };

  const sourceHint = useMemo(() => {
    if (activeSource === "youtube" && !hasYouTubeKey) {
      return "Chưa cấu hình YouTube API key. Hãy kiểm tra file .env rồi restart server.";
    }

    if (activeSource === "local" && localTracks.length === 0) {
      return "Hãy copy file mp3/mp4 vào thư mục media rồi refresh.";
    }

    return "";
  }, [activeSource, hasYouTubeKey, localTracks.length]);

  const hotGroups = useMemo(() => {
    const groups = new Map<string, HotQuery[]>();
    for (const item of results) {
      if (!isHotQuery(item)) continue;
      const category = item.category || "Gợi ý";
      groups.set(category, [...(groups.get(category) || []), item]);
    }

    return Array.from(groups.entries()).map(([category, items]) => ({ category, items }));
  }, [results]);

  const hotLocalTracks = useMemo(() => results.filter((item): item is Track => !isHotQuery(item)), [results]);

  return (
    <main className="app-shell">
      <section className="topbar" aria-label="Điều khiển Karaoke">
        <div>
          <p className="eyebrow">Karaoke Home</p>
          <h1>{variant === "remote" ? "Điều khiển phòng hát" : "Phòng karaoke gia đình"}</h1>
        </div>
        <div className="topbar-actions">
          <span className={`status-pill ${socketStatus}`}>
            <Radio size={16} />
            {socketStatus === "online" ? "Online" : socketStatus === "connecting" ? "Đang nối" : "Mất kết nối"}
          </span>
          <a className="icon-button" href="/tv" title="Mở màn hình TV">
            <Tv size={18} />
          </a>
          <a className="icon-button" href="/remote" title="Mở điều khiển điện thoại">
            <Smartphone size={18} />
          </a>
        </div>
      </section>

      <section className="search-band">
        <div className="segmented" role="tablist" aria-label="Nguồn tìm kiếm">
          {[
            ["hot", "Hot"] as const,
            ["youtube", "YouTube"] as const,
            ["local", "Local"] as const,
          ].map(([source, label]) => (
            <button
              key={source}
              className={activeSource === source ? "active" : ""}
              type="button"
              aria-pressed={activeSource === source}
              onClick={() => selectSource(source)}
            >
              {label}
            </button>
          ))}
        </div>

        <form className="search-row" onSubmit={onSubmit}>
          <div className="search-input-wrap">
            <Search size={20} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Nhập tên bài, ca sĩ, beat..."
              inputMode="search"
            />
          </div>
          <button className="icon-button large" type="button" onClick={startVoiceSearch} title="Tìm bằng giọng nói">
            {listening ? <LoaderCircle className="spin" size={22} /> : <Mic size={22} />}
          </button>
          <button className="primary-button" type="submit">
            Tìm
          </button>
        </form>

        {(sourceHint || message) && <p className="inline-note">{message || sourceHint}</p>}
      </section>

      <section className={variant === "remote" ? "workspace remote-only" : "workspace"}>
        <aside className="quick-pane">
          <div className="section-title">
            <div>
              <h2>{activeSource === "hot" ? "Gợi ý nhanh" : "Danh sách chọn bài"}</h2>
              <span>{activeSource === "hot" ? "Ca sĩ, thể loại, Hot search" : "Local và YouTube"}</span>
            </div>
            {busy ? <LoaderCircle className="spin" size={18} /> : activeSource === "hot" ? <Flame size={18} /> : <Music2 size={18} />}
          </div>
          <div className="result-list">
            {activeSource === "hot" ? (
              <>
                {hotGroups.map((group) => (
                  <section className="suggestion-section" key={group.category}>
                    <h3>{group.category}</h3>
                    <div className="suggestion-grid">
                      {group.items.map((item) => (
                        <button className="query-card" key={item.id} type="button" onClick={() => openHotQuery(item)}>
                          <em>{item.category || "Gợi ý"}</em>
                          <span>{item.title}</span>
                          <small>{item.subtitle}</small>
                        </button>
                      ))}
                    </div>
                  </section>
                ))}

                {hotLocalTracks.length > 0 && (
                  <section className="suggestion-section">
                    <h3>Local mới thêm</h3>
                    <div className="result-list">
                      {hotLocalTracks.map((track) => (
                        <TrackCard key={track.id} track={track} onPlay={playNow} onQueue={addToQueue} />
                      ))}
                    </div>
                  </section>
                )}
              </>
            ) : (
              results.map((item) =>
                isHotQuery(item) ? (
                  <button className="query-card" key={item.id} type="button" onClick={() => openHotQuery(item)}>
                    <em>{item.category || "Gợi ý"}</em>
                    <span>{item.title}</span>
                    <small>{item.subtitle}</small>
                  </button>
                ) : (
                  <TrackCard key={item.id} track={item} onPlay={playNow} onQueue={addToQueue} />
                ),
              )
            )}
            {!busy && results.length === 0 && (
              <div className="empty-state">
                <ListMusic size={28} />
                <p>Chưa có kết quả phù hợp.</p>
              </div>
            )}
          </div>
        </aside>

        <section className="now-pane">
          <NowOverview state={state} socketStatus={socketStatus} variant={variant} />
          {variant === "home" ? (
            <PlayerPanel state={state} onPatch={sendPatch} onCommand={sendCommand} />
          ) : (
            <RemoteNowPlaying state={state} onCommand={sendCommand} />
          )}
          <div className="control-grid">
            <QueuePanel state={state} lcd={lcd} onRemove={removeFromQueue} onCommand={sendCommand} />
            <AudioSettingsPanel settings={state.audioSettings} onCommand={sendCommand} />
          </div>
        </section>
      </section>
    </main>
  );
}

function NowOverview({
  state,
  socketStatus,
  variant,
}: {
  state: PlaybackState;
  socketStatus: "connecting" | "online" | "offline";
  variant: AppVariant;
}) {
  const nextTrack = state.queue[0];

  return (
    <section className="overview-strip" aria-label="Tổng quan buổi hát">
      <article className="overview-card emphasis">
        <div className="overview-icon">
          <Disc3 size={18} />
        </div>
        <div>
          <strong>{state.current?.title || "Chưa chọn bài"}</strong>
          <span>{state.current?.artist || (variant === "remote" ? "Remote đang chờ lệnh" : "Sẵn sàng phát")}</span>
        </div>
      </article>
      <article className="overview-card">
        <div className="overview-icon">
          <Clock3 size={18} />
        </div>
        <div>
          <strong>
            {formatClock(state.elapsed)} / {state.duration ? formatClock(state.duration) : "--:--"}
          </strong>
          <span>{state.status === "playing" ? "Đang phát" : state.status === "paused" ? "Đang tạm dừng" : "Đang chờ"}</span>
        </div>
      </article>
      <article className="overview-card">
        <div className="overview-icon">
          <Music4 size={18} />
        </div>
        <div>
          <strong>{nextTrack?.title || "Chưa có bài tiếp theo"}</strong>
          <span>{nextTrack ? "Sẵn trong hàng đợi" : "Hãy thêm bài tiếp theo"}</span>
        </div>
      </article>
      <article className="overview-card">
        <div className="overview-icon">
          <MonitorSpeaker size={18} />
        </div>
        <div>
          <strong>{socketStatus === "online" ? "ESP32 / WebSocket online" : socketStatus === "connecting" ? "Đang nối thiết bị" : "Thiết bị đang offline"}</strong>
          <span>Tone {state.audioSettings.tone > 0 ? `+${state.audioSettings.tone}` : state.audioSettings.tone}, Volume {state.audioSettings.volumePercent}%</span>
        </div>
      </article>
    </section>
  );
}

function AudioSettingsPanel({
  settings,
  onCommand,
}: {
  settings: AudioSettings;
  onCommand: (action: string, payload?: Record<string, unknown>) => void;
}) {
  const updateSettings = (patch: Partial<AudioSettings>) => {
    onCommand("settings", {
      settings: {
        ...settings,
        ...patch,
      },
    });
  };

  return (
    <section className="settings-panel">
      <div className="section-title">
        <h2>Âm thanh realtime</h2>
        <SlidersHorizontal size={18} />
      </div>

      <label className="range-row">
        <span>Volume</span>
        <input
          type="range"
          min="0"
          max="100"
          step="5"
          value={settings.volumePercent}
          onChange={(event) => updateSettings({ volumePercent: Number(event.target.value) })}
        />
        <strong>{settings.volumePercent}%</strong>
      </label>

      <label className="range-row">
        <span>Tone live</span>
        <input
          type="range"
          min="-6"
          max="6"
          step="1"
          value={settings.tone}
          onChange={(event) => updateSettings({ tone: Number(event.target.value) })}
        />
        <strong>{settings.tone > 0 ? `+${settings.tone}` : settings.tone}</strong>
      </label>

      <div className="settings-row">
        <button
          className={settings.vocalCut ? "toggle-button active" : "toggle-button"}
          type="button"
          onClick={() => updateSettings({ vocalCut: !settings.vocalCut })}
        >
          Tách vocal
        </button>
        <select
          value={settings.bitrateKbps}
          onChange={(event) => updateSettings({ bitrateKbps: Number(event.target.value) })}
          aria-label="Bitrate stream"
        >
          <option value={128}>128k</option>
          <option value={160}>160k</option>
          <option value={192}>192k</option>
        </select>
      </div>
    </section>
  );
}

function TrackCard({
  track,
  onPlay,
  onQueue,
}: {
  track: Track;
  onPlay: (track: Track) => void;
  onQueue: (track: Track) => void;
}) {
  return (
    <article className="track-card">
      <div className="thumb">
        {track.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={track.thumbnail} alt="" />
        ) : (
          <Volume2 size={22} />
        )}
      </div>
      <div className="track-main">
        <h3>{track.title}</h3>
        <p>{track.artist || (track.source === "local" ? "Nhạc Local" : "YouTube")}</p>
      </div>
      <div className="track-actions">
        <button className="icon-button" type="button" onClick={() => onPlay(track)} title="Phát ngay">
          <Play size={18} />
        </button>
        <button className="icon-button" type="button" onClick={() => onQueue(track)} title="Thêm vào hàng đợi">
          <Plus size={18} />
        </button>
      </div>
    </article>
  );
}

function PlayerPanel({
  state,
  onPatch,
  onCommand,
}: {
  state: PlaybackState;
  onPatch: (patch: Partial<PlaybackState>) => void;
  onCommand: (action: string, payload?: Record<string, unknown>) => void;
}) {
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const lastSyncRef = useRef(0);
  const current = state.current;

  useEffect(() => {
    const media = mediaRef.current;
    if (!media || current?.source !== "local") return;

    media.play().catch(() => {
      onPatch({ status: "paused" });
    });
  }, [current?.id, current?.source, onPatch]);

  const syncMediaState = () => {
    const media = mediaRef.current;
    if (!media) return;

    const now = Date.now();
    if (now - lastSyncRef.current < 1200) return;
    lastSyncRef.current = now;

    onPatch({
      status: media.paused ? "paused" : "playing",
      elapsed: media.currentTime || 0,
      duration: Number.isFinite(media.duration) ? media.duration : 0,
    });
  };

  const togglePlay = () => {
    const media = mediaRef.current;
    if (!media) {
      onCommand(state.status === "playing" ? "pause" : "play");
      return;
    }

    if (media.paused) {
      media.play();
    } else {
      media.pause();
    }
  };

  return (
    <section className="player-panel">
      <div className="section-title">
        <h2>Đang hát</h2>
        <span>{state.status}</span>
      </div>

      {!current ? (
        <div className="empty-player">
          <Volume2 size={34} />
          <p>Chọn một bài để bắt đầu.</p>
        </div>
      ) : (
        <>
          <div className="now-title">
            <h3>{current.title}</h3>
            <p>{current.artist || current.source}</p>
          </div>

          <div className="media-frame">
            {current.source === "youtube" && current.videoId ? (
              <iframe
                key={current.id}
                src={`https://www.youtube.com/embed/${current.videoId}?autoplay=1&playsinline=1&rel=0`}
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
                controls
                playsInline
                onPlay={() => onPatch({ status: "playing" })}
                onPause={() => onPatch({ status: "paused" })}
                onEnded={() => onCommand("next")}
                onLoadedMetadata={syncMediaState}
                onTimeUpdate={syncMediaState}
              />
            ) : (
              <audio
                key={current.id}
                ref={(element) => {
                  mediaRef.current = element;
                }}
                src={current.audioStreamUrl || current.streamUrl}
                controls
                onPlay={() => onPatch({ status: "playing" })}
                onPause={() => onPatch({ status: "paused" })}
                onEnded={() => onCommand("next")}
                onLoadedMetadata={syncMediaState}
                onTimeUpdate={syncMediaState}
              />
            )}
          </div>

          <div className="transport">
            <button className="icon-button large" type="button" onClick={togglePlay} title="Play/Pause">
              {state.status === "playing" ? <Pause size={22} /> : <Play size={22} />}
            </button>
            <button className="icon-button large" type="button" onClick={() => onCommand("next")} title="Bài tiếp">
              <SkipForward size={22} />
            </button>
          </div>

          <p className="time-line">
            {formatClock(state.elapsed)} / {state.duration ? formatClock(state.duration) : "--:--"}
          </p>
        </>
      )}
    </section>
  );
}

function RemoteNowPlaying({
  state,
  onCommand,
}: {
  state: PlaybackState;
  onCommand: (action: string, payload?: Record<string, unknown>) => void;
}) {
  return (
    <section className="player-panel compact">
      <div className="section-title">
        <h2>Màn hình đang phát</h2>
        <span>{state.status}</span>
      </div>
      <div className="now-title">
        <h3>{state.current?.title || "Chưa có bài"}</h3>
        <p>{state.current?.artist || "Chế độ Remote"}</p>
      </div>
      <div className="transport">
        <button className="icon-button large" type="button" onClick={() => onCommand("play")} title="Phát">
          <Play size={22} />
        </button>
        <button className="icon-button large" type="button" onClick={() => onCommand("pause")} title="Tạm dừng">
          <Pause size={22} />
        </button>
        <button className="icon-button large" type="button" onClick={() => onCommand("next")} title="Bài tiếp">
          <SkipForward size={22} />
        </button>
      </div>
    </section>
  );
}

function QueuePanel({
  state,
  lcd,
  onRemove,
  onCommand,
}: {
  state: PlaybackState;
  lcd: LcdPayload;
  onRemove: (id: string) => void;
  onCommand: (action: string, payload?: Record<string, unknown>) => void;
}) {
  return (
    <section className="queue-panel">
      <div className="section-title">
        <h2>Hàng đợi</h2>
        <button className="text-button" type="button" onClick={() => onCommand("clear")}>
          Xóa
        </button>
      </div>

      <div className="lcd-preview" aria-label="LCD ESP32 preview">
        <code>{lcd.line1}</code>
        <code>{lcd.line2}</code>
      </div>

      <div className="queue-list">
        {state.queue.map((track, index) => (
          <article className="queue-item" key={`${track.id}:${index}`}>
            <span>{index + 1}</span>
            <div>
              <h3>{track.title}</h3>
              <p>{track.artist || track.source}</p>
            </div>
            <button className="icon-button" type="button" onClick={() => onRemove(track.id)} title="Xóa khỏi hàng đợi">
              <Trash2 size={16} />
            </button>
          </article>
        ))}
        {state.queue.length === 0 && <p className="muted">Chưa có bài tiếp theo.</p>}
      </div>
    </section>
  );
}
