import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Crosshair,
  EyeOff,
  LocateFixed,
  Minus,
  Play,
  Plus,
  Shuffle,
  Square,
  Target,
} from 'lucide-react';
import { StormZonePhase, ZoneMode, ZonesConfig } from '../types/game';
import {
  appendNextZone,
  clampChildInsideParent,
  distanceMeters,
  evaluateStormAtElapsed,
  formatDurationSec,
  formatRadius,
  generateRandomZones,
  getStormMaskRings,
  MAX_ZONE_RADIUS_M,
  MAX_ZONES_COUNT,
  MIN_ZONE_RADIUS_M,
  MIN_ZONES_COUNT,
  removeLastZone,
  VALENCIA_CENTER,
} from '../lib/zones';

interface ZoneMapEditorProps {
  zonesConfig: ZonesConfig;
  isHost: boolean;
  canEdit?: boolean;
  onUpdateZonesConfig?: (next: ZonesConfig) => void;
}

const SIM_SPEEDS = [0.5, 1, 2, 5, 10, 20] as const;
type SimSpeed = (typeof SIM_SPEEDS)[number];

export const ZoneMapEditor: React.FC<ZoneMapEditorProps> = ({
  zonesConfig,
  isHost,
  canEdit = isHost,
  onUpdateZonesConfig,
}) => {
  const [localConfig, setLocalConfig] = useState<ZonesConfig>(zonesConfig);
  const [selectedIdx, setSelectedIdx] = useState<number>(0);
  const [geoStatus, setGeoStatus] = useState<string | null>(null);
  const [simActive, setSimActive] = useState(false);
  const [simSpeed, setSimSpeed] = useState<SimSpeed>(5);
  const [simElapsedSec, setSimElapsedSec] = useState(0);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const stormLayerRef = useRef<L.LayerGroup | null>(null);
  const commitTimerRef = useRef<number | null>(null);
  const selectedIdxRef = useRef<number>(selectedIdx);
  const canEditRef = useRef<boolean>(canEdit);
  const localConfigRef = useRef<ZonesConfig>(localConfig);
  const simActiveRef = useRef<boolean>(simActive);
  const simSpeedRef = useRef<SimSpeed>(simSpeed);

  selectedIdxRef.current = selectedIdx;
  canEditRef.current = canEdit;
  localConfigRef.current = localConfig;
  simActiveRef.current = simActive;
  simSpeedRef.current = simSpeed;

  const isRandomBlind = localConfig.mode === 'random';
  const hideMap = !isHost || isRandomBlind;

  // Sincronizar cambios externos
  useEffect(() => {
    setLocalConfig(zonesConfig);
    setSelectedIdx((prev) =>
      Math.min(prev, Math.max(0, zonesConfig.zones.length - 1))
    );
  }, [zonesConfig]);

  const scheduleCommit = (next: ZonesConfig, immediate = false) => {
    setLocalConfig(next);
    if (commitTimerRef.current) {
      window.clearTimeout(commitTimerRef.current);
      commitTimerRef.current = null;
    }
    if (!onUpdateZonesConfig) return;
    if (immediate) {
      onUpdateZonesConfig(next);
    } else {
      commitTimerRef.current = window.setTimeout(() => {
        onUpdateZonesConfig(next);
        commitTimerRef.current = null;
      }, 320);
    }
  };

  useEffect(() => {
    return () => {
      if (commitTimerRef.current) {
        window.clearTimeout(commitTimerRef.current);
      }
    };
  }, []);

  const totalStormSec = useMemo(() => {
    return localConfig.zones.reduce((acc, z, idx) => {
      if (idx === 0) return acc + z.waitTimeSec;
      return acc + z.shrinkTimeSec + z.waitTimeSec;
    }, 0);
  }, [localConfig.zones]);

  // Inicializar mapa Leaflet (solo en modo manual visible)
  useEffect(() => {
    if (hideMap) return;
    if (!mapContainerRef.current || mapRef.current) return;

    const first = localConfigRef.current.zones[0];
    const map = L.map(mapContainerRef.current, {
      center: [
        first?.lat ?? VALENCIA_CENTER.lat,
        first?.lng ?? VALENCIA_CENTER.lng,
      ],
      zoom: 14,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);

    const stormGroup = L.layerGroup().addTo(map);
    const group = L.layerGroup().addTo(map);

    map.on('click', (e: L.LeafletMouseEvent) => {
      if (!canEditRef.current || simActiveRef.current) return;
      const curr = localConfigRef.current;
      const idx = selectedIdxRef.current;
      if (!curr.zones[idx]) return;
      const updatedZones = curr.zones.map((z, i) =>
        i === idx
          ? {
              ...z,
              lat: Number(e.latlng.lat.toFixed(6)),
              lng: Number(e.latlng.lng.toFixed(6)),
            }
          : z
      );
      scheduleCommit({ ...curr, zones: updatedZones }, true);
    });

    mapRef.current = map;
    stormLayerRef.current = stormGroup;
    layerGroupRef.current = group;

    const observer = new ResizeObserver(() => {
      map.invalidateSize();
    });
    observer.observe(mapContainerRef.current);

    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      stormLayerRef.current = null;
      layerGroupRef.current = null;
    };
  }, [hideMap]);

  const simSnapshot = useMemo(() => {
    if (!simActive) return null;
    return evaluateStormAtElapsed(localConfig.zones, simElapsedSec);
  }, [simActive, localConfig.zones, simElapsedSec]);

  // Animación fluida a 60 FPS con requestAnimationFrame (sin saltos ni clearLayers)
  useEffect(() => {
    const group = layerGroupRef.current;
    const stormGroup = stormLayerRef.current;
    if (!simActive || hideMap || !group || !stormGroup) return;

    group.clearLayers();
    stormGroup.clearLayers();

    let elapsed = 0;
    const initial = evaluateStormAtElapsed(localConfigRef.current.zones, 0);

    const maskPoly = L.polygon(
      getStormMaskRings(
        initial.currentLat,
        initial.currentLng,
        initial.currentRadius,
        96
      ),
      {
        color: 'transparent',
        weight: 0,
        fillColor: '#6D28D9',
        fillOpacity: 0.34,
        interactive: false,
      }
    ).addTo(stormGroup);

    const borderCircle = L.circle([initial.currentLat, initial.currentLng], {
      radius: initial.currentRadius,
      color: '#7C3AED',
      weight: 3.5,
      fill: false,
      interactive: false,
    }).addTo(stormGroup);

    let nextCircle: L.Circle | null = null;
    let lastNextId: string | null = null;

    let rafId = 0;
    let lastTs = performance.now();
    let lastUiSyncTs = lastTs;

    const frame = (now: number) => {
      const dtSec = Math.min(0.1, Math.max(0, (now - lastTs) / 1000));
      lastTs = now;
      elapsed += dtSec * simSpeedRef.current;

      if (elapsed >= totalStormSec + 2) {
        setSimElapsedSec(0);
        setSimActive(false);
        return;
      }

      const snap = evaluateStormAtElapsed(localConfigRef.current.zones, elapsed);
      maskPoly.setLatLngs(
        getStormMaskRings(
          snap.currentLat,
          snap.currentLng,
          snap.currentRadius,
          96
        )
      );
      borderCircle.setLatLng([snap.currentLat, snap.currentLng]);
      borderCircle.setRadius(snap.currentRadius);

      const nextId = snap.nextZone?.id ?? null;
      if (nextId !== lastNextId) {
        if (nextCircle) {
          group.removeLayer(nextCircle);
          nextCircle = null;
        }
        if (snap.nextZone) {
          nextCircle = L.circle([snap.nextZone.lat, snap.nextZone.lng], {
            radius: snap.nextZone.radius,
            color: '#0F172A',
            weight: 2.5,
            dashArray: '7, 6',
            fill: false,
            interactive: false,
          }).addTo(group);
        }
        lastNextId = nextId;
      }

      if (now - lastUiSyncTs >= 180) {
        lastUiSyncTs = now;
        setSimElapsedSec(elapsed);
      }

      rafId = window.requestAnimationFrame(frame);
    };

    rafId = window.requestAnimationFrame(frame);

    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [simActive, hideMap, totalStormSec]);

  // Dibujar círculos tipo Fortnite en modo edición (cuando NO está simulando)
  useEffect(() => {
    const group = layerGroupRef.current;
    const stormGroup = stormLayerRef.current;
    if (!group || !stormGroup || simActive) return;

    group.clearLayers();
    stormGroup.clearLayers();

    if (hideMap) return;

    // 2. Modo edición / inspección: la zona seleccionada define el agujero claro de seguridad
    const activeSafeZone = localConfig.zones[selectedIdx] || localConfig.zones[0];
    if (activeSafeZone) {
      L.polygon(
        getStormMaskRings(
          activeSafeZone.lat,
          activeSafeZone.lng,
          activeSafeZone.radius
        ),
        {
          color: 'transparent',
          weight: 0,
          fillColor: '#6D28D9',
          fillOpacity: 0.24,
          interactive: false,
        }
      ).addTo(stormGroup);
    }

    // Contornos de todas las zonas (sin relleno interior)
    localConfig.zones.forEach((zone, index) => {
      const isSelected = index === selectedIdx;
      const strokeColor = isSelected ? '#059669' : '#1E293B';

      L.circle([zone.lat, zone.lng], {
        radius: zone.radius,
        color: strokeColor,
        weight: isSelected ? 3 : 2,
        dashArray: isSelected ? undefined : '6, 6',
        fill: false,
        interactive: false,
      }).addTo(group);

      const icon = L.divIcon({
        className: 'baliza-zone-pin',
        html: `<div style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:9999px;background:${
          isSelected ? '#059669' : '#334155'
        };color:#fff;font-weight:700;font-size:12px;font-family:JetBrains Mono,monospace;border:2px solid #fff;box-shadow:0 2px 6px rgba(15,23,42,0.35);cursor:${
          canEdit ? 'grab' : 'pointer'
        };">Z${index + 1}</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });

      const marker = L.marker([zone.lat, zone.lng], {
        icon,
        draggable: canEdit,
      });

      marker.on('click', () => {
        setSelectedIdx(index);
      });

      if (canEdit) {
        marker.on('dragend', () => {
          const pos = marker.getLatLng();
          const updatedZones = localConfigRef.current.zones.map((z, i) =>
            i === index
              ? {
                  ...z,
                  lat: Number(pos.lat.toFixed(6)),
                  lng: Number(pos.lng.toFixed(6)),
                }
              : z
          );
          scheduleCommit({ ...localConfigRef.current, zones: updatedZones }, true);
        });
      }

      marker.addTo(group);
    });
  }, [localConfig, selectedIdx, canEdit, simActive, hideMap]);

  const selectedZone: StormZonePhase | undefined = localConfig.zones[selectedIdx];
  const parentZone: StormZonePhase | undefined =
    selectedIdx > 0 ? localConfig.zones[selectedIdx - 1] : undefined;

  const isOutsideParent = useMemo(() => {
    if (!selectedZone || !parentZone) return false;
    const dist = distanceMeters(
      parentZone.lat,
      parentZone.lng,
      selectedZone.lat,
      selectedZone.lng
    );
    return dist + selectedZone.radius > parentZone.radius + 5;
  }, [selectedZone, parentZone]);

  const focusZoneOnMap = (zone: StormZonePhase) => {
    const map = mapRef.current;
    if (!map) return;
    const zoom =
      zone.radius >= 1500
        ? 13
        : zone.radius >= 600
        ? 14
        : zone.radius >= 250
        ? 15
        : 16;
    map.setView([zone.lat, zone.lng], zoom, { animate: true });
  };

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setGeoStatus('Tu navegador no permite geolocalización.');
      return;
    }
    setGeoStatus('Buscando ubicación GPS...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setGeoStatus(
          isRandomBlind
            ? 'Área aleatoria centrada en tu GPS actual (vista oculta).'
            : null
        );
        const map = mapRef.current;
        if (map && !hideMap) {
          map.setView([latitude, longitude], 14, { animate: true });
        }
        if (canEdit && localConfig.zones.length > 0) {
          const baseLat = localConfig.zones[0].lat;
          const baseLng = localConfig.zones[0].lng;
          const dLat = latitude - baseLat;
          const dLng = longitude - baseLng;
          const shifted = localConfig.zones.map((z) => ({
            ...z,
            lat: Number((z.lat + dLat).toFixed(6)),
            lng: Number((z.lng + dLng).toFixed(6)),
          }));
          scheduleCommit({ ...localConfig, zones: shifted }, true);
        }
      },
      () => {
        setGeoStatus('No pudimos acceder al GPS.');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleSetMode = (mode: ZoneMode) => {
    if (!canEdit) return;
    if (mode === 'random') {
      setSimActive(false);
      setSimElapsedSec(0);
      const first = localConfig.zones[0];
      const randomized = generateRandomZones({
        anchorLat: first?.lat ?? VALENCIA_CENTER.lat,
        anchorLng: first?.lng ?? VALENCIA_CENTER.lng,
        count: localConfig.zones.length,
        initialRadius: first?.radius ?? 900,
        defaultWaitSec: first?.waitTimeSec ?? 90,
        defaultShrinkSec: first?.shrinkTimeSec ?? 45,
      });
      scheduleCommit({ mode: 'random', zones: randomized }, true);
    } else {
      scheduleCommit({ ...localConfig, mode: 'manual' }, true);
    }
  };

  const handleRandomizeNow = () => {
    if (!canEdit) return;
    const mapCenter = mapRef.current?.getCenter();
    const first = localConfig.zones[0];
    const randomized = generateRandomZones({
      anchorLat: first?.lat ?? mapCenter?.lat ?? VALENCIA_CENTER.lat,
      anchorLng: first?.lng ?? mapCenter?.lng ?? VALENCIA_CENTER.lng,
      count: localConfig.zones.length,
      initialRadius: first?.radius ?? 900,
      defaultWaitSec: first?.waitTimeSec ?? 90,
      defaultShrinkSec: first?.shrinkTimeSec ?? 45,
    });
    setGeoStatus('Zonas aleatorias regeneradas en secreto.');
    scheduleCommit({ mode: 'random', zones: randomized }, true);
  };

  const handleAddZone = () => {
    if (!canEdit) return;
    const nextZones = appendNextZone(localConfig.zones);
    const next: ZonesConfig = { ...localConfig, zones: nextZones };
    scheduleCommit(next, true);
    setSelectedIdx(nextZones.length - 1);
  };

  const handleRemoveZone = () => {
    if (!canEdit) return;
    const nextZones = removeLastZone(localConfig.zones);
    const next: ZonesConfig = { ...localConfig, zones: nextZones };
    scheduleCommit(next, true);
    setSelectedIdx((prev) => Math.min(prev, nextZones.length - 1));
  };

  const updateSelectedZone = (
    patch: Partial<StormZonePhase>,
    immediate = false
  ) => {
    if (!canEdit || !selectedZone) return;
    const updated = localConfig.zones.map((z, i) =>
      i === selectedIdx ? { ...z, ...patch } : z
    );
    scheduleCommit({ ...localConfig, zones: updated }, immediate);
  };

  const applyTimesToAll = () => {
    if (!canEdit || !selectedZone) return;
    const updated = localConfig.zones.map((z) => ({
      ...z,
      waitTimeSec: selectedZone.waitTimeSec,
      shrinkTimeSec: selectedZone.shrinkTimeSec,
    }));
    scheduleCommit({ ...localConfig, zones: updated }, true);
  };

  const toggleSim = () => {
    if (simActive) {
      setSimActive(false);
      setSimElapsedSec(0);
    } else {
      setSimElapsedSec(0);
      setSimActive(true);
    }
  };

  // Si el usuario no es anfitrión y está en aleatorio (vista oculta completa)
  if (!canEdit && isRandomBlind) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center space-y-3">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
          <EyeOff className="h-6 w-6" aria-hidden="true" />
        </div>
        <h3 className="font-display text-lg font-bold text-slate-900">
          Zonas en modo aleatorio
        </h3>
        <p className="mx-auto max-w-md text-sm text-slate-600 leading-relaxed">
          Las ubicaciones y la vista previa están ocultas para todos, incluido el anfitrión,
          hasta que comience la partida.
        </p>
        <p className="font-mono text-xs font-semibold text-slate-500 tabular-nums">
          {localConfig.zones.length} fases · Duración de tormenta{' '}
          {formatDurationSec(totalStormSec)}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Cabecera de controles de modo */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-lg font-bold text-slate-900">
            Zonas en mapa (estilo tormenta)
          </h2>
          <p className="text-xs text-slate-500">
            {isRandomBlind
              ? 'En modo aleatorio nadie (ni el anfitrión) puede ver la vista previa hasta iniciar.'
              : 'La zona clara dentro del círculo es el área segura; lo morado exterior es tormenta.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canEdit ? (
            <div className="inline-flex rounded-xl bg-slate-100 p-1">
              {(
                [
                  { value: 'manual', label: 'Manual' },
                  { value: 'random', label: 'Aleatoria' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleSetMode(opt.value)}
                  className={`min-h-[40px] rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                    localConfig.mode === opt.value
                      ? 'bg-white text-emerald-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          ) : (
            <span className="text-xs font-semibold text-slate-600">
              Modo: {localConfig.mode === 'random' ? 'Aleatoria' : 'Manual'}
            </span>
          )}
        </div>
      </div>

      {/* Si está en Aleatoria: ocultar mapa, coordenadas y simulación incluso al admin */}
      {isRandomBlind ? (
        <div className="rounded-2xl border border-violet-200 bg-violet-50/70 p-5 sm:p-6 text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
            <EyeOff className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h3 className="font-display text-base font-bold text-violet-950">
              Vista previa oculta en modo aleatorio
            </h3>
            <p className="mx-auto max-w-md text-xs sm:text-sm text-violet-900/80 leading-relaxed">
              Ni los jugadores ni tú como anfitrión podéis ver los círculos o ubicaciones por adelantado.
              Se generarán en secreto al pulsar <strong>Iniciar partida</strong>.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={handleUseMyLocation}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-violet-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-violet-50 whitespace-nowrap"
            >
              <LocateFixed className="h-4 w-4 text-emerald-700" aria-hidden="true" />
              <span>Fijar área en mi GPS</span>
            </button>
            <button
              type="button"
              onClick={handleRandomizeNow}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-violet-300 bg-white px-3.5 py-2 text-xs font-semibold text-violet-900 hover:bg-violet-100 whitespace-nowrap"
            >
              <Shuffle className="h-4 w-4 text-violet-700" aria-hidden="true" />
              <span>Nueva semilla secreta</span>
            </button>
          </div>
          {geoStatus && (
            <p className="text-xs font-medium text-violet-900">{geoStatus}</p>
          )}
        </div>
      ) : (
        /* Mapa Leaflet y controles de simulación (solo en modo Manual) */
        <div className="relative space-y-3">
          <div
            ref={mapContainerRef}
            className="relative z-10 h-[320px] w-full overflow-hidden rounded-2xl border border-slate-200 sm:h-[400px]"
          />

          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleUseMyLocation}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap"
              >
                <LocateFixed className="h-4 w-4 text-emerald-700" aria-hidden="true" />
                <span>{canEdit ? 'Traer a mi GPS' : 'Mi ubicación'}</span>
              </button>

              {canEdit && (
                <button
                  type="button"
                  onClick={handleRandomizeNow}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap"
                >
                  <Shuffle className="h-4 w-4 text-violet-700" aria-hidden="true" />
                  <span>Generar distribución</span>
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div
                className="inline-flex items-center rounded-xl bg-slate-100 p-1"
                role="group"
                aria-label="Velocidad de simulación"
              >
                {SIM_SPEEDS.map((spd) => (
                  <button
                    key={spd}
                    type="button"
                    onClick={() => setSimSpeed(spd)}
                    className={`min-h-[36px] rounded-lg px-2.5 py-1 font-mono text-xs font-bold tabular-nums transition-colors whitespace-nowrap ${
                      simSpeed === spd
                        ? 'bg-white text-violet-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {spd}x
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={toggleSim}
                className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                  simActive
                    ? 'bg-violet-700 text-white hover:bg-violet-800'
                    : 'bg-slate-900 text-white hover:bg-slate-800'
                }`}
              >
                {simActive ? (
                  <>
                    <Square className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Detener</span>
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Simular ({simSpeed}x)</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {geoStatus && (
            <p className="text-xs font-medium text-amber-800">{geoStatus}</p>
          )}

          {simActive && simSnapshot && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3.5 py-2.5 text-xs font-semibold text-violet-900">
              <span>
                {simSnapshot.stage === 'waiting'
                  ? `Zona ${simSnapshot.phaseIndex + 1} estable · Cierra en `
                  : simSnapshot.stage === 'shrinking'
                  ? `Cerrando hacia Zona ${simSnapshot.phaseIndex + 2} · `
                  : 'Zona final alcanzada · '}
                {simSnapshot.stage !== 'final' && (
                  <span className="font-mono tabular-nums">
                    {formatDurationSec(simSnapshot.remainingSec)}
                  </span>
                )}
              </span>
              <span className="font-mono tabular-nums">
                Radio seguro: {formatRadius(simSnapshot.currentRadius)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Selector de número de zonas (+ / -) y pestañas Z1..ZN */}
      <div className="space-y-3 border-t border-slate-200 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <span>Fases de zona:</span>
            <span className="font-mono tabular-nums text-emerald-700">
              {localConfig.zones.length}
            </span>
            <span className="text-xs font-normal text-slate-500">
              · Total {formatDurationSec(totalStormSec)}
            </span>
          </div>

          {canEdit && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRemoveZone}
                disabled={localConfig.zones.length <= MIN_ZONES_COUNT}
                aria-label="Reducir número de zonas"
                className="inline-flex min-h-[44px] items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 whitespace-nowrap"
              >
                <Minus className="h-4 w-4" aria-hidden="true" />
                <span>Reducir</span>
              </button>
              <button
                type="button"
                onClick={handleAddZone}
                disabled={localConfig.zones.length >= MAX_ZONES_COUNT}
                aria-label="Añadir zona"
                className="inline-flex min-h-[44px] items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 whitespace-nowrap"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                <span>Añadir zona</span>
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {localConfig.zones.map((z, idx) => {
            const active = idx === selectedIdx;
            return (
              <button
                key={z.id}
                type="button"
                onClick={() => {
                  setSelectedIdx(idx);
                  focusZoneOnMap(z);
                }}
                className={`min-h-[44px] rounded-xl border px-3.5 py-2 font-mono text-xs font-bold tabular-nums transition-colors whitespace-nowrap ${
                  active
                    ? 'border-emerald-700 bg-emerald-700 text-white'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                }`}
              >
                Z{idx + 1} · {formatRadius(z.radius)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Editor de la zona seleccionada */}
      {selectedZone && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-bold text-slate-900">
                Zona {selectedIdx + 1} de {localConfig.zones.length}
              </p>
              {!isRandomBlind ? (
                <p className="font-mono text-xs text-slate-500 tabular-nums">
                  {selectedZone.lat.toFixed(4)}, {selectedZone.lng.toFixed(4)}
                </p>
              ) : (
                <p className="text-xs text-slate-500">
                  Ubicación oculta (aleatoria)
                </p>
              )}
            </div>

            {canEdit && !isRandomBlind && isOutsideParent && parentZone && (
              <button
                type="button"
                onClick={() => {
                  const clamped = clampChildInsideParent(parentZone, selectedZone);
                  updateSelectedZone(clamped, true);
                }}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 whitespace-nowrap"
              >
                <Target className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Encajar dentro de Z{selectedIdx}</span>
              </button>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="zone-radius-slider"
                className="text-xs font-semibold text-slate-800"
              >
                Radio de la zona segura
              </label>
              <span className="font-mono text-sm font-bold tabular-nums text-emerald-700">
                {formatRadius(selectedZone.radius)}
              </span>
            </div>

            {canEdit ? (
              <>
                <input
                  id="zone-radius-slider"
                  type="range"
                  min={MIN_ZONE_RADIUS_M}
                  max={MAX_ZONE_RADIUS_M}
                  step={10}
                  value={selectedZone.radius}
                  onChange={(e) =>
                    updateSelectedZone({ radius: Number(e.target.value) }, false)
                  }
                  onMouseUp={() => scheduleCommit(localConfigRef.current, true)}
                  onTouchEnd={() => scheduleCommit(localConfigRef.current, true)}
                  className="h-2 w-full cursor-pointer accent-emerald-700"
                />
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {[50, 150, 300, 600, 1000, 2000].map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => updateSelectedZone({ radius: r }, true)}
                      className={`min-h-[36px] rounded-lg border px-2.5 py-1 font-mono text-xs font-semibold tabular-nums transition-colors ${
                        selectedZone.radius === r
                          ? 'border-emerald-700 bg-emerald-50 text-emerald-800'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {formatRadius(r)}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-xs text-slate-600">
                Radio seguro: {formatRadius(selectedZone.radius)}.
              </p>
            )}
          </div>

          {/* Tiempos entre zonas y tiempo de cierre */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-800">
                  Tiempo entre zonas
                </span>
                <span className="font-mono text-sm font-bold tabular-nums text-slate-900">
                  {formatDurationSec(selectedZone.waitTimeSec)}
                </span>
              </div>
              {canEdit && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      updateSelectedZone(
                        {
                          waitTimeSec: Math.max(10, selectedZone.waitTimeSec - 15),
                        },
                        true
                      )
                    }
                    className="flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 font-mono text-xs font-bold text-slate-800 hover:bg-slate-100"
                  >
                    -15s
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      updateSelectedZone(
                        {
                          waitTimeSec: Math.min(600, selectedZone.waitTimeSec + 15),
                        },
                        true
                      )
                    }
                    className="flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 font-mono text-xs font-bold text-slate-800 hover:bg-slate-100"
                  >
                    +15s
                  </button>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-800">
                  {selectedIdx === 0
                    ? 'Cierre inicial'
                    : `Tiempo de cierre (Z${selectedIdx}→Z${selectedIdx + 1})`}
                </span>
                <span className="font-mono text-sm font-bold tabular-nums text-slate-900">
                  {formatDurationSec(selectedZone.shrinkTimeSec)}
                </span>
              </div>
              {canEdit && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      updateSelectedZone(
                        {
                          shrinkTimeSec: Math.max(10, selectedZone.shrinkTimeSec - 10),
                        },
                        true
                      )
                    }
                    className="flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 font-mono text-xs font-bold text-slate-800 hover:bg-slate-100"
                  >
                    -10s
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      updateSelectedZone(
                        {
                          shrinkTimeSec: Math.min(300, selectedZone.shrinkTimeSec + 10),
                        },
                        true
                      )
                    }
                    className="flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 font-mono text-xs font-bold text-slate-800 hover:bg-slate-100"
                  >
                    +10s
                  </button>
                </div>
              )}
            </div>
          </div>

          {canEdit && (localConfig.zones.length > 1 || !isRandomBlind) && (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              {!isRandomBlind ? (
                <span className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Crosshair className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Toca el mapa para mover Z{selectedIdx + 1}</span>
                </span>
              ) : (
                <span />
              )}
              {localConfig.zones.length > 1 && (
                <button
                  type="button"
                  onClick={applyTimesToAll}
                  className="min-h-[36px] rounded-lg px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                >
                  Aplicar estos tiempos a todas las zonas
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
