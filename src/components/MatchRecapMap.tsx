import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Film, Footprints, Loader2, Pause, Play, RotateCcw } from 'lucide-react';
import {
  getMapTileSpec,
  loadPreferences,
  subscribePreferences,
} from '../lib/preferences';
import { sanitizeHexColor } from '../lib/storage';
import {
  createMercatorViewport,
  renderStaticBaseMapCanvas,
} from '../lib/recapVideoMap';
import { evaluateStormAtElapsed, formatDurationSec, VALENCIA_CENTER } from '../lib/zones';
import {
  CaughtRecord,
  ExtractionBeacon,
  InfectedRecord,
  MatchPathPoint,
  PlayerRecapRoute,
  PlayerRecord,
  PlayerRole,
  StormZonePhase,
} from '../types/game';
import { PlayerAvatar } from './PlayerAvatar';

interface MatchRecapMapProps {
  players: PlayerRecord[];
  roles: Record<string, PlayerRole>;
  caughtMap: Record<string, CaughtRecord>;
  infectedMap?: Record<string, InfectedRecord>;
  recapRoutes: Record<string, PlayerRecapRoute>;
  activeZones: StormZonePhase[];
  extractionBeacon?: ExtractionBeacon | null;
  matchDurationSec: number;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDistanceMeters(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(2)} km`;
  }
  return `${Math.round(meters)} m`;
}

function getPointsAtTime(
  points: MatchPathPoint[],
  tSec: number
): Array<{ lat: number; lng: number }> {
  if (points.length === 0) return [];
  const result: Array<{ lat: number; lng: number }> = [];

  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    if (pt.tSec <= tSec) {
      result.push({ lat: pt.lat, lng: pt.lng });
    } else {
      const prev = points[i - 1];
      if (prev && pt.tSec > prev.tSec) {
        const ratio = Math.max(
          0,
          Math.min(1, (tSec - prev.tSec) / (pt.tSec - prev.tSec))
        );
        result.push({
          lat: prev.lat + (pt.lat - prev.lat) * ratio,
          lng: prev.lng + (pt.lng - prev.lng) * ratio,
        });
      }
      break;
    }
  }

  return result;
}

export const MatchRecapMap: React.FC<MatchRecapMapProps> = ({
  players,
  roles,
  caughtMap,
  infectedMap = {},
  recapRoutes,
  activeZones,
  extractionBeacon,
  matchDurationSec,
}) => {
  const maxTimelineSec = useMemo(() => {
    let maxT = Math.max(1, Math.ceil(matchDurationSec));
    Object.values(recapRoutes).forEach((route) => {
      const last = route.points[route.points.length - 1];
      if (last && last.tSec > maxT) {
        maxT = Math.ceil(last.tSec);
      }
    });
    return maxT;
  }, [recapRoutes, matchDurationSec]);

  const [hiddenIds, setHiddenIds] = useState<Record<string, boolean>>({});
  const [replaySec, setReplaySec] = useState<number>(maxTimelineSec);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState<1 | 4 | 10>(4);
  const [exportProgress, setExportProgress] = useState<number | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const contextLayerRef = useRef<L.LayerGroup | null>(null);
  const routesLayerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!isPlaying) {
      setReplaySec(maxTimelineSec);
    }
  }, [maxTimelineSec]);

  // Bucle de reproducción del recorrido temporal
  useEffect(() => {
    if (!isPlaying) return;
    let rafId = 0;
    let lastMs = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.08, Math.max(0.001, (now - lastMs) / 1000));
      lastMs = now;
      setReplaySec((prev) => {
        const next = prev + dt * playSpeed;
        if (next >= maxTimelineSec) {
          setIsPlaying(false);
          return maxTimelineSec;
        }
        return next;
      });
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [isPlaying, playSpeed, maxTimelineSec]);

  // Inicializar mapa Leaflet de recapitulación
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const allCoords: [number, number][] = [];
    Object.values(recapRoutes).forEach((route) => {
      route.points.forEach((pt) => allCoords.push([pt.lat, pt.lng]));
    });
    const firstZone = activeZones[0];
    const centerLat = allCoords[0]?.[0] ?? firstZone?.lat ?? VALENCIA_CENTER.lat;
    const centerLng = allCoords[0]?.[1] ?? firstZone?.lng ?? VALENCIA_CENTER.lng;

    const map = L.map(containerRef.current, {
      center: [centerLat, centerLng],
      zoom: 16,
      zoomControl: true,
    });

    const initialTile = getMapTileSpec(loadPreferences().mapStyle);
    const tileLayer = L.tileLayer(initialTile.url, {
      attribution: initialTile.attribution,
      maxZoom: 19,
    }).addTo(map);

    const unsubscribePrefs = subscribePreferences((prefs) => {
      const nextSpec = getMapTileSpec(prefs.mapStyle);
      tileLayer.setUrl(nextSpec.url);
    });

    const contextGroup = L.layerGroup().addTo(map);
    const routesGroup = L.layerGroup().addTo(map);

    mapRef.current = map;
    contextLayerRef.current = contextGroup;
    routesLayerRef.current = routesGroup;

    if (allCoords.length >= 2) {
      map.fitBounds(L.latLngBounds(allCoords), { padding: [32, 32], maxZoom: 17 });
    } else if (firstZone) {
      map.setView([firstZone.lat, firstZone.lng], 15);
    }

    const observer = new ResizeObserver(() => {
      map.invalidateSize();
    });
    observer.observe(containerRef.current);

    return () => {
      unsubscribePrefs();
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      contextLayerRef.current = null;
      routesLayerRef.current = null;
    };
  }, []);

  // Dibujar zona inicial/final y baliza de contexto
  useEffect(() => {
    const contextGroup = contextLayerRef.current;
    if (!contextGroup) return;
    contextGroup.clearLayers();

    const firstZone = activeZones[0];
    if (firstZone) {
      L.circle([firstZone.lat, firstZone.lng], {
        radius: firstZone.radius,
        color: '#8B5CF6',
        weight: 1.5,
        dashArray: '6, 6',
        fill: false,
        interactive: false,
      }).addTo(contextGroup);
    }

    const finalZone = activeZones[activeZones.length - 1];
    if (finalZone && activeZones.length > 1) {
      L.circle([finalZone.lat, finalZone.lng], {
        radius: finalZone.radius,
        color: '#6D28D9',
        weight: 2,
        fillColor: '#7C3AED',
        fillOpacity: 0.06,
        interactive: false,
      }).addTo(contextGroup);
    }

    if (extractionBeacon) {
      L.circle([extractionBeacon.lat, extractionBeacon.lng], {
        radius: extractionBeacon.radiusM,
        color: '#059669',
        weight: 2,
        fillColor: '#059669',
        fillOpacity: 0.14,
        interactive: false,
      }).addTo(contextGroup);
    }
  }, [activeZones, extractionBeacon]);

  // Dibujar trayectorias y posiciones en `replaySec`
  useEffect(() => {
    const routesGroup = routesLayerRef.current;
    if (!routesGroup) return;
    routesGroup.clearLayers();

    players.forEach((p) => {
      if (hiddenIds[p.id]) return;
      const route = recapRoutes[p.id];
      if (!route || route.points.length === 0) return;

      const visiblePts = getPointsAtTime(route.points, replaySec);
      if (visiblePts.length === 0) return;

      const role = roles[p.id] ?? 'hider';
      const lineColor =
        role === 'seeker' ? '#E11D48' : sanitizeHexColor(p.color, '#059669');
      const caught = caughtMap[p.id];

      if (visiblePts.length >= 2) {
        // Contorno blanco para contraste sobre calles
        L.polyline(
          visiblePts.map((pt) => [pt.lat, pt.lng] as [number, number]),
          {
            color: '#ffffff',
            weight: 6.5,
            opacity: 0.85,
            interactive: false,
          }
        ).addTo(routesGroup);

        L.polyline(
          visiblePts.map((pt) => [pt.lat, pt.lng] as [number, number]),
          {
            color: lineColor,
            weight: 4,
            opacity: 0.92,
            interactive: false,
          }
        ).addTo(routesGroup);
      }

      // Punto de salida
      const startPt = visiblePts[0];
      L.circleMarker([startPt.lat, startPt.lng], {
        radius: 4.5,
        color: '#0F172A',
        weight: 1.5,
        fillColor: '#ffffff',
        fillOpacity: 1,
        interactive: false,
      }).addTo(routesGroup);

      // Posición actual en el replay (o final)
      const headPt = visiblePts[visiblePts.length - 1];
      const isAtEnd = replaySec >= maxTimelineSec - 0.1;
      const safeName = escapeHtml(p.name);
      const safeEmoji = escapeHtml(p.emoji);
      const statusBadge =
        isAtEnd && caught ? '💀' : safeEmoji;

      const markerIcon = L.divIcon({
        className: 'baliza-recap-marker',
        html: `<div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-50%);">
          <div style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:10px;background:#ffffff;border:2.5px solid #09090B;box-shadow:2px 2px 0 0 ${lineColor};font-size:15px;">${statusBadge}</div>
          <span style="margin-top:3px;padding:1px 6px;border-radius:6px;background:#09090B;border:1.5px solid ${lineColor};color:#ffffff;font-size:9px;font-weight:800;white-space:nowrap;">${safeName}</span>
        </div>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });

      L.marker([headPt.lat, headPt.lng], {
        icon: markerIcon,
        interactive: false,
      }).addTo(routesGroup);
    });
  }, [players, recapRoutes, hiddenIds, replaySec, roles, caughtMap, maxTimelineSec]);

  const anyRoutesExist = useMemo(
    () =>
      Object.values(recapRoutes).some((route) => route.points.length > 0),
    [recapRoutes]
  );

  const togglePlayer = (id: string) => {
    setHiddenIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleFitAll = () => {
    const map = mapRef.current;
    if (!map) return;
    const coords: [number, number][] = [];
    players.forEach((p) => {
      if (hiddenIds[p.id]) return;
      recapRoutes[p.id]?.points.forEach((pt) => coords.push([pt.lat, pt.lng]));
    });
    if (coords.length >= 2) {
      map.fitBounds(L.latLngBounds(coords), { padding: [32, 32], maxZoom: 17 });
    } else if (coords.length === 1) {
      map.setView(coords[0], 16);
    }
  };

  const handleExportVideo = async () => {
    if (exportProgress !== null) return;
    setExportError(null);

    if (
      typeof MediaRecorder === 'undefined' ||
      typeof HTMLCanvasElement.prototype.captureStream !== 'function'
    ) {
      setExportError('Tu navegador no admite grabación de vídeo WebM.');
      return;
    }

    const canvas = document.createElement('canvas');
    const SIZE = 720;
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setExportProgress(1);

    // Calcular caja delimitadora (rutas + zonas + baliza)
    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLng = Infinity;
    let maxLng = -Infinity;

    const expandPoint = (lat: number, lng: number) => {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    };

    players.forEach((p) => {
      if (hiddenIds[p.id]) return;
      recapRoutes[p.id]?.points.forEach((pt) => expandPoint(pt.lat, pt.lng));
    });

    if (extractionBeacon) {
      expandPoint(extractionBeacon.lat, extractionBeacon.lng);
    }

    const firstZone = activeZones[0];
    if (!Number.isFinite(minLat) && firstZone) {
      expandPoint(firstZone.lat - 0.003, firstZone.lng - 0.003);
      expandPoint(firstZone.lat + 0.003, firstZone.lng + 0.003);
    }
    if (firstZone) {
      const dLat = (firstZone.radius / 111320) * 0.72;
      const dLng =
        dLat / Math.max(0.2, Math.cos((firstZone.lat * Math.PI) / 180));
      expandPoint(firstZone.lat - dLat, firstZone.lng - dLng);
      expandPoint(firstZone.lat + dLat, firstZone.lng + dLng);
    }

    if (!Number.isFinite(minLat)) {
      expandPoint(VALENCIA_CENTER.lat - 0.003, VALENCIA_CENTER.lng - 0.003);
      expandPoint(VALENCIA_CENTER.lat + 0.003, VALENCIA_CENTER.lng + 0.003);
    }

    const spanLat = Math.max(0.0012, maxLat - minLat);
    const spanLng = Math.max(0.0012, maxLng - minLng);
    const padLat = spanLat * 0.14;
    const padLng = spanLng * 0.14;

    const mapRect = {
      left: 16,
      top: 66,
      width: SIZE - 32,
      height: SIZE - 110,
    };

    const viewport = createMercatorViewport(
      {
        minLat: minLat - padLat,
        maxLat: maxLat + padLat,
        minLng: minLng - padLng,
        maxLng: maxLng + padLng,
      },
      mapRect
    );
    const { project, metersToPx } = viewport;

    const tileSpec = getMapTileSpec(loadPreferences().mapStyle);
    const { canvas: baseMapCanvas } = await renderStaticBaseMapCanvas({
      size: SIZE,
      viewport,
      tileUrlTemplate: tileSpec.url,
    });

    const mimeCandidates = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
      'video/mp4',
    ];
    const mimeType =
      mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) || '';

    const stream = canvas.captureStream(30);
    const recorder = mimeType
      ? new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_500_000 })
      : new MediaRecorder(stream);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunks.push(ev.data);
    };

    const finishedPromise = new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        resolve(
          new Blob(chunks, {
            type: mimeType || 'video/webm',
          })
        );
      };
    });

    const totalFrames = 180; // ~6 segundos a 30 fps
    const frameIntervalMs = 33;

    const drawReplayFrame = (tSec: number) => {
      // Fondo base con mapa real pre-renderizado
      ctx.drawImage(baseMapCanvas, 0, 0);

      // Todo el contenido cartográfico recortado dentro del marco del mapa
      ctx.save();
      ctx.beginPath();
      ctx.rect(mapRect.left, mapRect.top, mapRect.width, mapRect.height);
      ctx.clip();

      // Zona inicial y zona actual interpolada
      if (firstZone) {
        const p0 = project(firstZone.lat, firstZone.lng);
        const r0 = metersToPx(firstZone.radius, firstZone.lat);
        ctx.save();
        ctx.setLineDash([7, 6]);
        ctx.strokeStyle = 'rgba(109, 40, 217, 0.55)';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(p0.x, p0.y, r0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      if (activeZones.length > 0) {
        const snap = evaluateStormAtElapsed(activeZones, tSec);
        const pc = project(snap.currentLat, snap.currentLng);
        const rc = metersToPx(snap.currentRadius, snap.currentLat);
        ctx.save();
        ctx.fillStyle = 'rgba(109, 40, 217, 0.1)';
        ctx.strokeStyle = '#7C3AED';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(pc.x, pc.y, rc, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      if (extractionBeacon) {
        const pb = project(extractionBeacon.lat, extractionBeacon.lng);
        const rb = metersToPx(extractionBeacon.radiusM, extractionBeacon.lat);
        ctx.save();
        ctx.fillStyle = 'rgba(16, 185, 129, 0.25)';
        ctx.strokeStyle = '#059669';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(pb.x, pb.y, rb, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.font = '18px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🚩', pb.x, pb.y);
        ctx.restore();
      }

      // Rutas y avatares
      players.forEach((p) => {
        if (hiddenIds[p.id]) return;
        const route = recapRoutes[p.id];
        if (!route || route.points.length === 0) return;
        const visiblePts = getPointsAtTime(route.points, tSec);
        if (visiblePts.length === 0) return;

        const role = roles[p.id] ?? 'hider';
        const lineColor =
          role === 'seeker' ? '#F43F5E' : sanitizeHexColor(p.color, '#10B981');

        if (visiblePts.length >= 2) {
          ctx.save();
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.strokeStyle = 'rgba(15, 23, 42, 0.82)';
          ctx.lineWidth = 7.5;
          ctx.beginPath();
          visiblePts.forEach((pt, idx) => {
            const c = project(pt.lat, pt.lng);
            if (idx === 0) ctx.moveTo(c.x, c.y);
            else ctx.lineTo(c.x, c.y);
          });
          ctx.stroke();

          ctx.strokeStyle = lineColor;
          ctx.lineWidth = 4.2;
          ctx.stroke();
          ctx.restore();
        }

        const head = visiblePts[visiblePts.length - 1];
        const hc = project(head.lat, head.lng);
        const isAtEnd = tSec >= maxTimelineSec - 0.2;
        const caught = caughtMap[p.id];

        ctx.save();
        ctx.fillStyle = '#0F172A';
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(hc.x, hc.y, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(isAtEnd && caught ? '💀' : p.emoji, hc.x, hc.y + 1);

        ctx.font = 'bold 11px sans-serif';
        const labelW = Math.max(36, ctx.measureText(p.name).width + 12);
        const labelX = hc.x - labelW / 2;
        const labelY = hc.y + 19;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
        ctx.fillRect(labelX, labelY, labelW, 16);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(p.name, hc.x, labelY + 8.5);
        ctx.restore();
      });

      ctx.restore();

      // Barra superior del vídeo
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(0, 0, SIZE, 58);
      ctx.fillStyle = '#10B981';
      ctx.fillRect(0, 56, SIZE, 2);

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('BALIZA · RECORRIDO DE PARTIDA', 24, 29);

      ctx.fillStyle = '#34D399';
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(
        `${formatDurationSec(tSec)} / ${formatDurationSec(maxTimelineSec)}`,
        SIZE - 24,
        29
      );

      // Pie de página
      ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
      ctx.fillRect(0, SIZE - 34, SIZE, 34);
      ctx.fillStyle = '#CBD5E1';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(
        `Jugadores: ${players.length} · Verde/Color = Fugitivo · Rojo = Buscador`,
        SIZE / 2,
        SIZE - 17
      );
    };

    try {
      drawReplayFrame(0);
      recorder.start(120);

      for (let f = 0; f <= totalFrames; f++) {
        const progress = f / totalFrames;
        const tSec = progress * maxTimelineSec;
        drawReplayFrame(tSec);
        setExportProgress(Math.max(1, Math.round(progress * 100)));
        await new Promise((r) => window.setTimeout(r, frameIntervalMs));
      }

      // Mantener el fotograma final medio segundo
      drawReplayFrame(maxTimelineSec);
      await new Promise((r) => window.setTimeout(r, 450));
      recorder.stop();

      const blob = await finishedPromise;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
      link.href = url;
      link.download = `baliza-recorrido-${Date.now()}.${ext}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      setExportError('No se pudo generar el vídeo de la partida.');
      try {
        recorder.stop();
      } catch {
        // Ignorar
      }
    } finally {
      setExportProgress(null);
    }
  };

  return (
    <div className="space-y-3">
      {/* Mapa de rutas */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
        <div
          ref={containerRef}
          className="h-[240px] sm:h-[280px] w-full"
          aria-label="Mapa con el recorrido de cada jugador"
        />
        {!anyRoutesExist && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-900/20 p-4 text-center">
            <p className="rounded-xl bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 shadow-sm">
              No se registraron posiciones GPS en esta partida.
            </p>
          </div>
        )}
        <button
          type="button"
          onClick={handleFitAll}
          className="absolute right-2.5 top-2.5 z-[400] rounded-xl border border-slate-200 bg-white/95 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-white"
        >
          Ajustar zoom
        </button>
      </div>

      {/* Barra de reproducción + Guardar vídeo */}
      {anyRoutesExist && (
        <div className="space-y-2">
          <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <button
              type="button"
              onClick={() => {
                if (!isPlaying && replaySec >= maxTimelineSec - 0.1) {
                  setReplaySec(0);
                }
                setIsPlaying((prev) => !prev);
              }}
              aria-label={isPlaying ? 'Pausar repetición' : 'Reproducir movimientos'}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {isPlaying ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4" />
              )}
            </button>

            <input
              type="range"
              min={0}
              max={maxTimelineSec}
              step={0.5}
              value={Math.min(maxTimelineSec, replaySec)}
              onChange={(e) => {
                setIsPlaying(false);
                setReplaySec(Number(e.target.value));
              }}
              aria-label="Línea de tiempo de la partida"
              className="h-1.5 w-full flex-1 accent-emerald-600 cursor-pointer"
            />

            <span className="font-mono text-[11px] font-semibold tabular-nums text-slate-600 shrink-0">
              {formatDurationSec(replaySec)}
            </span>

            <button
              type="button"
              onClick={() =>
                setPlaySpeed((prev) => (prev === 1 ? 4 : prev === 4 ? 10 : 1))
              }
              className="h-7 rounded-lg border border-slate-200 bg-white px-2 font-mono text-[11px] font-semibold text-slate-700 shrink-0 hover:bg-slate-100"
            >
              {playSpeed}x
            </button>

            <button
              type="button"
              onClick={() => {
                setIsPlaying(false);
                setReplaySec(maxTimelineSec);
              }}
              title="Ver ruta completa"
              aria-label="Ver ruta completa"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              disabled={exportProgress !== null}
              onClick={() => void handleExportVideo()}
              className="inline-flex min-h-[38px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
            >
              {exportProgress !== null ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600" aria-hidden="true" />
                  <span>Generando vídeo ({exportProgress}%)...</span>
                </>
              ) : (
                <>
                  <Film className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                  <span>Guardar vídeo del mapa final</span>
                </>
              )}
            </button>
            {exportError && (
              <span className="text-[11px] font-medium text-rose-600">
                {exportError}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Jugadores y distancia */}
      <div className="space-y-2 max-h-[24vh] overflow-y-auto pr-1">
        <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
          <Footprints className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
          <span>Toca un jugador para ocultar o mostrar su ruta</span>
        </p>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {players.map((p) => {
            const route = recapRoutes[p.id];
            const distM = route?.totalMeters ?? 0;
            const role = roles[p.id] ?? 'hider';
            const lineColor =
              role === 'seeker' ? '#E11D48' : sanitizeHexColor(p.color, '#059669');
            const isHidden = Boolean(hiddenIds[p.id]);
            const caught = caughtMap[p.id];

            return (
              <button
                key={p.id}
                type="button"
                onClick={() => togglePlayer(p.id)}
                className={`flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 text-left transition-opacity ${
                  isHidden
                    ? 'bg-slate-50 opacity-45'
                    : 'bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: lineColor }}
                  />
                  <PlayerAvatar
                    emoji={p.emoji}
                    color={p.color}
                    size="sm"
                    name={p.name}
                    eliminated={Boolean(caught)}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-slate-900">
                      {p.name}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {role === 'seeker'
                        ? infectedMap[p.id]
                          ? 'Buscador (infectado)'
                          : 'Buscador'
                        : 'Fugitivo'}
                      {caught ? ' · Eliminado' : ''}
                    </p>
                  </div>
                </div>
                <span className="font-mono text-xs font-semibold tabular-nums text-slate-700 shrink-0">
                  {route && route.points.length > 0
                    ? formatDistanceMeters(distM)
                    : 'Sin GPS'}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
