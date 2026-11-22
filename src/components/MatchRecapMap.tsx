import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Footprints, Pause, Play, RotateCcw } from 'lucide-react';
import {
  getMapTileSpec,
  loadPreferences,
  subscribePreferences,
} from '../lib/preferences';
import { formatDurationSec, VALENCIA_CENTER } from '../lib/zones';
import {
  CaughtRecord,
  ExtractionBeacon,
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
      const lineColor = role === 'seeker' ? '#E11D48' : p.color || '#059669';
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

      {/* Barra de reproducción */}
      {anyRoutesExist && (
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
            const lineColor = role === 'seeker' ? '#E11D48' : p.color || '#059669';
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
                      {role === 'seeker' ? 'Buscador' : 'Fugitivo'}
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
