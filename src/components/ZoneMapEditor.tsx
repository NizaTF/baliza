import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  EyeOff,
  LocateFixed,
  Minus,
  Play,
  Plus,
  Shuffle,
  Square,
  Target,
} from 'lucide-react';
import {
  getMapTileSpec,
  loadPreferences,
  subscribePreferences,
} from '../lib/preferences';
import {
  buildRecommendedZones,
  getRecommendedSettings,
} from '../lib/recommendations';
import {
  appendNextZone,
  clampChildInsideParent,
  distanceMeters,
  evaluateStormAtElapsed,
  formatDurationSec,
  formatRadius,
  generateRandomZones,
  getStormMaskRings,
  MIN_ZONE_RADIUS_M,
  MIN_ZONES_COUNT,
  removeLastZone,
  VALENCIA_CENTER,
} from '../lib/zones';
import { StormZonePhase, ZoneMode, ZonesConfig } from '../types/game';
import { UnboundedNumberField } from './UnboundedNumberField';

interface ZoneMapEditorProps {
  zonesConfig: ZonesConfig;
  isHost: boolean;
  playerCount?: number;
  canEdit?: boolean;
  onUpdateZonesConfig?: (next: ZonesConfig) => void;
}

const SIM_SPEEDS = [0.5, 1, 2, 5, 10, 20] as const;
type SimSpeed = (typeof SIM_SPEEDS)[number];

export const ZoneMapEditor: React.FC<ZoneMapEditorProps> = ({
  zonesConfig,
  isHost,
  playerCount = 4,
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
  const rec = useMemo(() => getRecommendedSettings(playerCount), [playerCount]);

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
      }, 280);
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

    const initialTile = getMapTileSpec(loadPreferences().mapStyle);
    const tileLayer = L.tileLayer(initialTile.url, {
      attribution: initialTile.attribution,
      maxZoom: 19,
    }).addTo(map);

    const unsubscribePrefs = subscribePreferences((prefs) => {
      const nextSpec = getMapTileSpec(prefs.mapStyle);
      tileLayer.setUrl(nextSpec.url);
    });

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
      unsubscribePrefs();
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
        fillOpacity: 0.28,
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
            color: '#0B0B10',
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

  useEffect(() => {
    const group = layerGroupRef.current;
    const stormGroup = stormLayerRef.current;
    if (!group || !stormGroup || simActive) return;

    group.clearLayers();
    stormGroup.clearLayers();

    if (hideMap) return;

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
          fillOpacity: 0.22,
          interactive: false,
        }
      ).addTo(stormGroup);
    }

    localConfig.zones.forEach((zone, index) => {
      const isSelected = index === selectedIdx;
      const strokeColor = isSelected ? '#059669' : '#0B0B10';

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
        html: `<div style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:10px;background:${
          isSelected ? '#059669' : '#0B0B10'
        };color:#fff;font-weight:800;font-size:12px;border:2px solid #fff;box-shadow:0 2px 0 0 #0B0B10;cursor:${
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
      zone.radius >= 3000
        ? 11
        : zone.radius >= 1500
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
      setGeoStatus('Tu navegador no permite usar el GPS.');
      return;
    }
    setGeoStatus('Buscando tu ubicación...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setGeoStatus(
          isRandomBlind ? 'Zona secreta centrada en tu móvil.' : null
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
        setGeoStatus('No pudimos leer tu GPS.');
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
    setGeoStatus('Zonas mezcladas de nuevo.');
    scheduleCommit({ mode: localConfig.mode, zones: randomized }, true);
  };

  const handleApplyRecommendedZones = () => {
    if (!canEdit) return;
    const nextZones = buildRecommendedZones(localConfig.zones, playerCount);
    scheduleCommit({ ...localConfig, zones: nextZones }, true);
    setSelectedIdx(0);
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

  if (!canEdit && isRandomBlind) {
    return (
      <div className="py-10 text-center space-y-2">
        <EyeOff className="mx-auto h-8 w-8 text-violet-600" aria-hidden="true" />
        <h3 className="font-display text-lg font-bold text-slate-900">
          Zona sorpresa secreta
        </h3>
        <p className="mx-auto max-w-md text-sm text-slate-500">
          La zona aparecerá por sorpresa cuando empiece la partida.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Cabecera simple del mapa */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-600">
          {isRandomBlind
            ? 'Nadie verá los círculos hasta que empiece la partida.'
            : 'Toca el mapa o arrastra un punto para mover el círculo seguro.'}
        </p>

        {canEdit && (
          <div className="inline-flex rounded-xl bg-slate-100 p-1 self-start shrink-0">
            {(
              [
                { value: 'manual', label: 'Elegir en mapa' },
                { value: 'random', label: 'Sorpresa' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleSetMode(opt.value)}
                className={`min-h-[36px] rounded-lg px-3 text-xs font-semibold transition-colors whitespace-nowrap ${
                  localConfig.mode === opt.value
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Mapa + ajustes de zona */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        <div className="space-y-3 lg:col-span-7">
          {isRandomBlind ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center space-y-3">
              <EyeOff className="mx-auto h-8 w-8 text-violet-600" aria-hidden="true" />
              <p className="text-sm font-semibold text-slate-900">
                Mapa oculto hasta empezar
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={handleUseMyLocation}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <LocateFixed className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                  <span>Usar mi GPS</span>
                </button>
                <button
                  type="button"
                  onClick={handleRandomizeNow}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 text-xs font-semibold text-white hover:bg-violet-700"
                >
                  <Shuffle className="h-4 w-4" aria-hidden="true" />
                  <span>Mezclar</span>
                </button>
              </div>
              {geoStatus && (
                <p className="text-xs font-medium text-violet-700">{geoStatus}</p>
              )}
            </div>
          ) : (
            <>
              <div
                ref={mapContainerRef}
                className="relative z-10 h-[300px] w-full overflow-hidden rounded-2xl border border-slate-200 sm:h-[400px]"
              />

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleUseMyLocation}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                  >
                    <LocateFixed className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                    <span>{canEdit ? 'Traer a mi GPS' : 'Mi GPS'}</span>
                  </button>

                  {canEdit && (
                    <button
                      type="button"
                      onClick={handleRandomizeNow}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                    >
                      <Shuffle className="h-4 w-4 text-slate-500" aria-hidden="true" />
                      <span>Mezclar</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  {simActive && (
                    <button
                      type="button"
                      onClick={() => {
                        const idx = SIM_SPEEDS.indexOf(simSpeed);
                        setSimSpeed(SIM_SPEEDS[(idx + 1) % SIM_SPEEDS.length]);
                      }}
                      className="min-h-[38px] rounded-xl border border-slate-200 bg-white px-2.5 font-mono text-xs font-semibold text-slate-700"
                      title="Cambiar velocidad"
                    >
                      {simSpeed}x
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={toggleSim}
                    className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-3.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                      simActive
                        ? 'bg-violet-600 text-white hover:bg-violet-700'
                        : 'bg-slate-900 text-white hover:bg-slate-800'
                    }`}
                  >
                    {simActive ? (
                      <>
                        <Square className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Parar</span>
                      </>
                    ) : (
                      <>
                        <Play className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Probar cierre</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {geoStatus && (
                <p className="text-xs font-medium text-amber-700">{geoStatus}</p>
              )}

              {simActive && simSnapshot && (
                <div className="flex items-center justify-between rounded-xl bg-violet-50 px-3.5 py-2 text-xs font-semibold text-violet-900">
                  <span>
                    {simSnapshot.stage === 'waiting'
                      ? `Zona ${simSnapshot.phaseIndex + 1} · Cierra en ${formatDurationSec(simSnapshot.remainingSec)}`
                      : simSnapshot.stage === 'shrinking'
                      ? `Cerrando · ${formatDurationSec(simSnapshot.remainingSec)}`
                      : 'Zona final'}
                  </span>
                  <span className="font-mono tabular-nums text-emerald-700">
                    {formatRadius(simSnapshot.currentRadius)}
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Lista de zonas y ajustes numéricos */}
        <div className="space-y-4 lg:col-span-5">
          {canEdit && (
            <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
              <span>
                Recomendado ({rec.playersTag}):{' '}
                <strong className="text-slate-700">
                  {rec.zoneCount} zonas · {formatRadius(rec.initialRadiusM)}
                </strong>
              </span>
              <button
                type="button"
                onClick={handleApplyRecommendedZones}
                className="font-semibold text-emerald-700 hover:text-emerald-800 underline underline-offset-2 shrink-0"
              >
                Aplicar
              </button>
            </div>
          )}

          <div className="space-y-2.5 border-t border-slate-100 pt-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-slate-900">
                Fases ({localConfig.zones.length}) · {formatDurationSec(totalStormSec)}
              </span>

              {canEdit && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleRemoveZone}
                    disabled={localConfig.zones.length <= MIN_ZONES_COUNT}
                    aria-label="Quitar última zona"
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-35"
                  >
                    <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={handleAddZone}
                    aria-label="Añadir nueva zona"
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
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
                    className={`min-h-[36px] rounded-xl border px-3 py-1 font-mono text-xs font-semibold tabular-nums transition-colors ${
                      active
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Z{idx + 1} · {formatRadius(z.radius)}
                  </button>
                );
              })}
            </div>
          </div>

          {selectedZone && (
            <div className="space-y-4 border-t border-slate-100 pt-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold text-slate-900">
                  Zona {selectedIdx + 1} de {localConfig.zones.length}
                </p>

                {canEdit && !isRandomBlind && isOutsideParent && parentZone && (
                  <button
                    type="button"
                    onClick={() => {
                      const clamped = clampChildInsideParent(parentZone, selectedZone);
                      updateSelectedZone(clamped, true);
                    }}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 underline underline-offset-2"
                  >
                    <Target className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Meter dentro de Z{selectedIdx}</span>
                  </button>
                )}
              </div>

              {canEdit ? (
                <div className="space-y-4">
                  <UnboundedNumberField
                    id="zone-radius-input"
                    label="Radio seguro"
                    value={selectedZone.radius}
                    unit="m"
                    step={25}
                    min={MIN_ZONE_RADIUS_M}
                    recommendedValue={
                      selectedIdx === 0
                        ? rec.initialRadiusM
                        : Math.max(
                            25,
                            Math.round(
                              (rec.initialRadiusM * Math.pow(0.55, selectedIdx)) / 5
                            ) * 5
                          )
                    }
                    onChange={(nextR) => updateSelectedZone({ radius: nextR }, true)}
                  />
                  <UnboundedNumberField
                    id="zone-wait-input"
                    label="Espera"
                    value={selectedZone.waitTimeSec}
                    unit="s"
                    step={15}
                    min={1}
                    recommendedValue={Math.max(
                      15,
                      Math.round(
                        (rec.zoneWaitSec * Math.pow(0.85, selectedIdx)) / 5
                      ) * 5
                    )}
                    onChange={(nextWait) =>
                      updateSelectedZone({ waitTimeSec: nextWait }, true)
                    }
                  />
                  <UnboundedNumberField
                    id="zone-shrink-input"
                    label={selectedIdx === 0 ? 'Cierre inicial' : 'Tiempo de cierre'}
                    value={selectedZone.shrinkTimeSec}
                    unit="s"
                    step={10}
                    min={1}
                    recommendedValue={Math.max(
                      10,
                      Math.round(
                        (rec.zoneShrinkSec * Math.pow(0.9, selectedIdx)) / 5
                      ) * 5
                    )}
                    onChange={(nextShrink) =>
                      updateSelectedZone({ shrinkTimeSec: nextShrink }, true)
                    }
                  />
                </div>
              ) : (
                <p className="text-xs text-slate-600">
                  Radio: {formatRadius(selectedZone.radius)} · Espera:{' '}
                  {formatDurationSec(selectedZone.waitTimeSec)} · Cierre:{' '}
                  {formatDurationSec(selectedZone.shrinkTimeSec)}
                </p>
              )}

              {canEdit && localConfig.zones.length > 1 && (
                <button
                  type="button"
                  onClick={applyTimesToAll}
                  className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 underline underline-offset-2"
                >
                  Aplicar estos tiempos a todas las zonas
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
