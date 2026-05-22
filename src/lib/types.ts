export type TrackSource = "local" | "youtube";

export type MediaType = "audio" | "video";

export type Track = {
  id: string;
  source: TrackSource;
  title: string;
  artist?: string;
  thumbnail?: string;
  streamUrl?: string;
  audioStreamUrl?: string;
  mediaUrl?: string;
  mediaType?: MediaType;
  mimeType?: string;
  path?: string;
  videoId?: string;
  streamStartSeconds?: number;
  url?: string;
  duration?: number;
  addedAt?: string;
};

export type AudioSettings = {
  tone: number;
  vocalCut: boolean;
  volumePercent: number;
  bitrateKbps: number;
};

export type HotQuery = {
  id: string;
  kind: "query";
  title: string;
  subtitle: string;
  query: string;
  category?: string;
};

export type PlaybackStatus = "idle" | "loading" | "playing" | "paused" | "stopped";

export type PlaybackState = {
  status: PlaybackStatus;
  current: Track | null;
  queue: Track[];
  elapsed: number;
  duration: number;
  volume: number;
  audioSettings: AudioSettings;
  updatedAt: string;
};

export type LcdPayload = {
  line1: string;
  line2: string;
  fullTitle: string;
  nextTitle: string;
};

export type SocketEnvelope =
  | {
      type: "welcome";
      role: string;
      state: PlaybackState;
      lcd: LcdPayload;
      serverTime: string;
    }
  | {
      type: "state";
      state: PlaybackState;
      lcd: LcdPayload;
    }
  | {
      type: "command";
      action: string;
      payload?: Record<string, unknown>;
    }
  | {
      type: "error";
      message: string;
    }
  | {
      type: "pong";
      serverTime: string;
    };
