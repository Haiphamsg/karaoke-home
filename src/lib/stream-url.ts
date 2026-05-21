import type { AudioSettings, Track } from "./types";

export const defaultAudioSettings: AudioSettings = {
  tone: 0,
  vocalCut: false,
  volumePercent: 60,
  bitrateKbps: 192,
};

export function clampAudioSettings(settings?: Partial<AudioSettings>): AudioSettings {
  const tone = Number(settings?.tone ?? defaultAudioSettings.tone);
  const volumePercent = Number(settings?.volumePercent ?? defaultAudioSettings.volumePercent);
  const bitrateKbps = Number(settings?.bitrateKbps ?? defaultAudioSettings.bitrateKbps);

  return {
    tone: Math.max(-6, Math.min(6, Number.isFinite(tone) ? Math.round(tone) : 0)),
    vocalCut: Boolean(settings?.vocalCut ?? defaultAudioSettings.vocalCut),
    volumePercent: Math.max(0, Math.min(100, Number.isFinite(volumePercent) ? Math.round(volumePercent) : 60)),
    bitrateKbps: [128, 160, 192].includes(bitrateKbps) ? bitrateKbps : 192,
  };
}

export function volumePercentToAudioI2S(percent: number) {
  return Math.max(0, Math.min(21, Math.round((percent / 100) * 21)));
}

export function buildAudioStreamUrl(track: Pick<Track, "source" | "path" | "videoId">, settings = defaultAudioSettings) {
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

export function withAudioStreamUrl(track: Track, settings = defaultAudioSettings): Track {
  if ((track.source === "local" && track.path) || (track.source === "youtube" && track.videoId)) {
    return {
      ...track,
      audioStreamUrl: buildAudioStreamUrl(track, settings),
      streamUrl: buildAudioStreamUrl(track, settings),
    };
  }

  return track;
}
