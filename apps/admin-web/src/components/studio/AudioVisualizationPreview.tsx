'use client';

import { useEffect, useRef, useState } from 'react';
import type { AudioVisualizationPreview } from './audio-question-bank';

type AudioVisualizationPreviewProps = {
  visualization: AudioVisualizationPreview;
  progress: number;
  playing: boolean;
  height?: number;
};

const blobUrlCache = new Map<string, Promise<string>>();

/** Drop a cached Studio audio blob (call after replace/upload). */
export function invalidateStudioAudioObjectUrl(assetId: string): void {
  const id = assetId.trim();
  if (!id) return;
  const pending = blobUrlCache.get(id);
  blobUrlCache.delete(id);
  if (!pending) return;
  void pending
    .then((url) => {
      URL.revokeObjectURL(url);
    })
    .catch(() => {
      /* ignore */
    });
}

function studioAudioObjectUrl(assetId: string): Promise<string> {
  const cached = blobUrlCache.get(assetId);
  if (cached) return cached;
  const pending = fetch(
    `/api/admin/v1/content/pack/assets/${encodeURIComponent(assetId)}`,
    // Never force-cache: a prior 404 (missing pack file) must not stick after
    // replace/re-upload of the same content-hash asset id.
    { credentials: 'same-origin', cache: 'no-store' },
  ).then(async (res) => {
    if (!res.ok) {
      throw new Error(`audio asset ${res.status}`);
    }
    const contentType = res.headers.get('content-type') ?? 'application/octet-stream';
    const buffer = await res.arrayBuffer();
    const blob = new Blob([buffer], { type: contentType.split(';')[0]!.trim() });
    return URL.createObjectURL(blob);
  });
  blobUrlCache.set(assetId, pending);
  pending.catch(() => {
    blobUrlCache.delete(assetId);
  });
  return pending;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function bandsAt(
  visualization: AudioVisualizationPreview,
  progress: number,
): number[] {
  const frames = visualization.spectrumFrames;
  if (frames.length === 0) return [];
  const duration = Math.max(visualization.durationMs, 1);
  const positionMs = Math.max(0, Math.min(1, progress)) * duration;
  const framePosition = positionMs / Math.max(visualization.frameIntervalMs, 1);
  const lower = Math.min(
    frames.length - 1,
    Math.max(0, Math.floor(framePosition)),
  );
  const upper = Math.min(frames.length - 1, lower + 1);
  const t = framePosition - lower;
  const a = frames[lower] ?? [];
  const b = frames[upper] ?? a;
  const count = Math.max(a.length, b.length);
  const out: number[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push(lerp(a[i] ?? 0, b[i] ?? 0, t));
  }
  return out;
}

function paintWaveform(
  canvas: HTMLCanvasElement | null,
  visualization: AudioVisualizationPreview,
  progress: number,
  playing: boolean,
  height: number,
): void {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const width = canvas.clientWidth || 320;
  const h = height;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, h);
  ctx.fillStyle = '#06111d';
  ctx.fillRect(0, 0, width, h);

  const samples = visualization.waveform;
  const mid = h / 2;
  const step = width / Math.max(samples.length, 1);
  const playX = Math.max(0, Math.min(1, progress)) * width;

  ctx.beginPath();
  samples.forEach((sample, i) => {
    const x = i * step;
    const amp = Math.max(1, sample * (h * 0.42));
    ctx.moveTo(x, mid - amp);
    ctx.lineTo(x, mid + amp);
  });
  ctx.strokeStyle = 'rgba(80, 160, 190, 0.35)';
  ctx.lineWidth = 1.4;
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, playX, h);
  ctx.clip();
  ctx.beginPath();
  samples.forEach((sample, i) => {
    const x = i * step;
    const amp = Math.max(1, sample * (h * 0.42));
    ctx.moveTo(x, mid - amp);
    ctx.lineTo(x, mid + amp);
  });
  ctx.strokeStyle = playing ? '#4df0ff' : '#2aa8c4';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.restore();

  ctx.strokeStyle = '#22e7f2';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(playX, 4);
  ctx.lineTo(playX, h - 4);
  ctx.stroke();
}

function paintEqualizer(
  canvas: HTMLCanvasElement | null,
  visualization: AudioVisualizationPreview,
  progress: number,
  playing: boolean,
  height: number,
): void {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const width = canvas.clientWidth || 240;
  const h = height;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, h);

  const bands = bandsAt(visualization, progress);
  const n = Math.max(bands.length, 1);
  const gap = 2;
  const barW = Math.max(2, (width - gap * (n + 1)) / n);
  bands.forEach((value, i) => {
    const mag = Math.max(0.04, playing ? value : value * 0.35);
    const barH = mag * (h - 8);
    const x = gap + i * (barW + gap);
    const y = h - 4 - barH;
    const gradient = ctx.createLinearGradient(0, y, 0, h);
    gradient.addColorStop(0, '#7b5cff');
    gradient.addColorStop(0.45, '#22e7f2');
    gradient.addColorStop(1, '#0b6a78');
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, barW, barH);
  });
}

export function AudioWaveformCanvas({
  visualization,
  progress,
  playing,
  height = 72,
}: AudioVisualizationPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    paintWaveform(canvasRef.current, visualization, progress, playing, height);
  }, [visualization, progress, playing, height]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height, display: 'block', borderRadius: 10 }}
      aria-hidden="true"
    />
  );
}

export function AudioEqualizerCanvas({
  visualization,
  progress,
  playing,
  height = 88,
}: AudioVisualizationPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    paintEqualizer(canvasRef.current, visualization, progress, playing, height);
  }, [visualization, progress, playing, height]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height, display: 'block', borderRadius: 10 }}
      aria-hidden="true"
    />
  );
}

type StudioAudioClipPreviewProps = {
  assetId: string;
  durationMs: number;
  visualization: AudioVisualizationPreview | null;
  waveformHeight?: number;
  equalizerHeight?: number;
};

/**
 * Loads a short challenge clip as a blob (avoids Range-request stalls through
 * the admin BFF) and drives waveform/equalizer canvases from the audio clock
 * without re-rendering the parent Studio form on every timeupdate.
 */
export function StudioAudioClipPreview({
  assetId,
  durationMs,
  visualization,
  waveformHeight = 72,
  equalizerHeight = 88,
}: StudioAudioClipPreviewProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveRef = useRef<HTMLCanvasElement | null>(null);
  const eqRef = useRef<HTMLCanvasElement | null>(null);
  const playingRef = useRef(false);
  const visualizationRef = useRef(visualization);
  const durationMsRef = useRef(durationMs);
  const [playing, setPlaying] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    visualizationRef.current = visualization;
    durationMsRef.current = durationMs;
  }, [visualization, durationMs]);

  useEffect(() => {
    let cancelled = false;
    const audio = audioRef.current;
    if (!audio || !assetId) return;
    setLoadError(false);
    void studioAudioObjectUrl(assetId)
      .then((url) => {
        if (cancelled || !audioRef.current) return;
        audioRef.current.src = url;
        audioRef.current.load();
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
      audio.pause();
    };
  }, [assetId]);

  useEffect(() => {
    const draw = () => {
      const vis = visualizationRef.current;
      if (!vis) return;
      const el = audioRef.current;
      const durationSec =
        durationMsRef.current > 0
          ? durationMsRef.current / 1000
          : el?.duration && Number.isFinite(el.duration)
            ? el.duration
            : 1;
      const progress = el
        ? Math.max(0, Math.min(1, el.currentTime / durationSec))
        : 0;
      paintWaveform(
        waveRef.current,
        vis,
        progress,
        playingRef.current,
        waveformHeight,
      );
      paintEqualizer(
        eqRef.current,
        vis,
        progress,
        playingRef.current,
        equalizerHeight,
      );
    };

    draw();
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      draw();
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [playing, visualization, waveformHeight, equalizerHeight]);

  return (
    <div className="studio-audio-clip-preview">
      <audio
        ref={audioRef}
        controls
        preload="auto"
        onPlay={() => {
          playingRef.current = true;
          setPlaying(true);
        }}
        onPause={() => {
          playingRef.current = false;
          setPlaying(false);
        }}
        onEnded={() => {
          playingRef.current = false;
          setPlaying(false);
        }}
        onError={() => {
          setLoadError(true);
        }}
      />
      {loadError ? (
        <p className="studio-audio-hint">Audio preview failed to load.</p>
      ) : null}
      {visualization ? (
        <>
          <canvas
            ref={waveRef}
            style={{
              width: '100%',
              height: waveformHeight,
              display: 'block',
              borderRadius: 10,
            }}
            aria-hidden="true"
          />
          <canvas
            ref={eqRef}
            style={{
              width: '100%',
              height: equalizerHeight,
              display: 'block',
              borderRadius: 10,
            }}
            aria-hidden="true"
          />
        </>
      ) : null}
    </div>
  );
}
