import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Compass,
  Crown,
  Eye,
  Flag,
  LocateFixed,
  LogOut,
  Map as MapIcon,
  Minus,
  Plus,
  RotateCcw,
  Shield,
  Skull,
  Target,
  UserCheck,
  Users,
} from 'lucide-react';
import { subscribeToMatchLocations } from '../lib/roomService';
import {
  distanceMeters,
  evaluateStormAtElapsed,
  formatDurationSec,
  formatRadius,
  getClosestSafePoint,
  getStormMaskRings,
  VALENCIA_CENTER,
} from '../lib/zones';
import { unlockRetroAudio } from '../lib/retroAudio';
import {
  PlayerLocationPayload,
  PlayerRecord,
  RoomRecord,
} from '../types/game';
import { EliminationOverlay } from './EliminationOverlay';
import { PlayerAvatar } from './PlayerAvatar';

interface MatchScreenProps {
  room: RoomRecord;
  players: PlayerRecord[];
  currentPlayerId: string;
  onMarkCaught: (
    targetPlayerId: string,
    byPlayerId: string | 'storm'
  ) => Promise<void>;
  onUndoCaught: (targetPlayerId: string) => Promise<void>;
  onEndMatch: () => Promise<void>;
  onLeaveRoom: () => Promise<void>;
}

type MatchTab = 'map' | 'players' | 'storm' | 'match';

const GPS_STORM_TOLERANCE_M = 5;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const MatchScreen: React.FC<MatchScreenProps> = ({
  room,
  players,
  currentPlayerId,
  onMarkCaught,
  onUndoCaught,
  onEndMatch,
  onLeaveRoom,
}) => {
  const match = room.rules.matchState;
  const isHost = room.host_id === currentPlayerId;
  const currentPlayer = players.find((p) => p.id === currentPlayerId);
  const myRole = match?.roles?.[currentPlayerId] ?? 'hider';
  const activeZones = match?.activeZones ?? [];
  const caughtMap = match?.caught || {};
  const myCaughtRecord = caughtMap[currentPlayerId];
  const stormGraceMaxSec = room.rules.stormGraceSec ?? 30;
  const hidersCanSeeSeekers = Boolean(room.rules.hidersCanSeeSeekers);
  const seekersCanSeeHiders = Boolean(room.rules.seekersCanSeeHiders);

  const [activeTab, setActiveTab] = useState<MatchTab>('map');
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [myPos, setMyPos] = useState<{
    lat: number;
    lng: number;
    accuracy: number;
  } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [otherLocations, setOtherLocations] = useState<
    Record<string, PlayerLocationPayload>
  >({});
  const [stormEnteredAtMs, setStormEnteredAtMs] = useState<number | null>(null);
  const [confirmAction, setConfirmAction] = useState<'end' | 'leave' | null>(
    null
  );
  const [confirmCatchId, setConfirmCatchId] = useState<string | null>(null);
  const [busyCatchId, setBusyCatchId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState(false);
  const [captureToast, setCaptureToast] = useState<string | null>(null);
  const [showEliminationOverlay, setShowEliminationOverlay] = useState(false);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const stormLayerRef = useRef<L.LayerGroup | null>(null);
  const stormMaskRef = useRef<L.Polygon | null>(null);
  const stormBorderRef = useRef<L.Circle | null>(null);
  const nextZoneCircleRef = useRef<L.Circle | null>(null);
  const lastNextZoneIdRef = useRef<string | null>(null);
  const guideLayerRef = useRef<L.LayerGroup | null>(null);
  const guideLineRef = useRef<L.Polyline | null>(null);
  const guideExitRef = useRef<L.Marker | null>(null);
  const othersLayerRef = useRef<L.LayerGroup | null>(null);
  const selfLayerRef = useRef<L.LayerGroup | null>(null);
  const sendLocationRef = useRef<((p: PlayerLocationPayload) => void) | null>(
    null
  );
  const activeZonesRef = useRef(activeZones);
  const startedAtRef = useRef(match?.startedAt);
  const myPosRef = useRef(myPos);
  const stormEliminationSentRef = useRef(false);
  const seenCaughtIdsRef = useRef<Set<string>>(new Set(Object.keys(caughtMap)));

  activeZonesRef.current = activeZones;
  startedAtRef.current = match?.startedAt;
  myPosRef.current = myPos;

  // Reloj suave para UI (250ms) mientras el mapa se interpola a 60 FPS vía requestAnimationFrame
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 250);
    return () => window.clearInterval(timer);
  }, []);

  // Desbloquear Web Audio con el primer toque del jugador en partida
  useEffect(() => {
    const handleUnlock = () => unlockRetroAudio();
    window.addEventListener('pointerdown', handleUnlock, {
      once: true,
      passive: true,
    });
    return () => window.removeEventListener('pointerdown', handleUnlock);
  }, []);

  // Mostrar animación 8-bit estilo Danganronpa cuando el jugador actual es eliminado
  useEffect(() => {
    if (!myCaughtRecord) {
      setShowEliminationOverlay(false);
      return;
    }
    const seenKey = `baliza_elim_seen_${room.id}_${currentPlayerId}_${myCaughtRecord.at}`;
    let alreadySeen = false;
    try {
      alreadySeen = window.sessionStorage.getItem(seenKey) === '1';
    } catch {
      alreadySeen = false;
    }
    if (!alreadySeen) {
      setShowEliminationOverlay(true);
    }
  }, [myCaughtRecord, room.id, currentPlayerId]);

  // Detectar nuevas capturas o eliminaciones por tormenta y avisar a toda la sala
  useEffect(() => {
    const currentKeys = Object.keys(caughtMap);
    const newlyCaught = currentKeys.filter(
      (id) => !seenCaughtIdsRef.current.has(id)
    );
    seenCaughtIdsRef.current = new Set(currentKeys);

    if (newlyCaught.length > 0) {
      const targetId = newlyCaught[newlyCaught.length - 1];
      const rec = caughtMap[targetId];
      const targetName =
        players.find((p) => p.id === targetId)?.name || 'Un jugador';
      if (rec?.byPlayerId === 'storm') {
        setCaptureToast(`⚡ ${targetName} ha sido eliminado por la tormenta.`);
      } else {
        const hunterName =
          players.find((p) => p.id === rec?.byPlayerId)?.name || 'Un buscador';
        setCaptureToast(`🎯 ${hunterName} ha pillado a ${targetName}.`);
      }
      const timeout = window.setTimeout(() => {
        setCaptureToast(null);
      }, 6500);
      return () => window.clearTimeout(timeout);
    }
  }, [caughtMap, players]);

  // Seguimiento GPS propio
  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsError('Tu navegador no admite GPS en vivo.');
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setGpsError(null);
        setMyPos({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
      },
      () => {
        setGpsError('Activa el GPS para ver tu posición y guía de zona.');
      },
      {
        enableHighAccuracy: true,
        maximumAge: 4000,
        timeout: 10000,
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  // Canal en vivo para compartir ubicaciones según reglas de sala o exposición por tormenta
  useEffect(() => {
    const sub = subscribeToMatchLocations(room.id, (payload) => {
      if (payload.playerId === currentPlayerId) return;
      setOtherLocations((prev) => ({
        ...prev,
        [payload.playerId]: payload,
      }));
    });
    sendLocationRef.current = sub.sendLocation;

    return () => {
      sendLocationRef.current = null;
      sub.unsubscribe();
    };
  }, [room.id, currentPlayerId]);

  const elapsedSec = useMemo(() => {
    if (!match?.startedAt) return 0;
    const startMs = new Date(match.startedAt).getTime();
    if (Number.isNaN(startMs)) return 0;
    return Math.max(0, (nowMs - startMs) / 1000);
  }, [match?.startedAt, nowMs]);

  const roundRemainingSec = useMemo(() => {
    const totalRoundSec = (room.rules.roundDuration || 30) * 60;
    return Math.max(0, totalRoundSec - elapsedSec);
  }, [room.rules.roundDuration, elapsedSec]);

  const snapshot = useMemo(() => {
    return evaluateStormAtElapsed(activeZones, elapsedSec);
  }, [activeZones, elapsedSec]);

  const stormOverflowMeters = useMemo(() => {
    if (!myPos) return null;
    const d = distanceMeters(
      myPos.lat,
      myPos.lng,
      snapshot.currentLat,
      snapshot.currentLng
    );
    return d - snapshot.currentRadius;
  }, [myPos, snapshot.currentLat, snapshot.currentLng, snapshot.currentRadius]);

  const isInStorm =
    stormOverflowMeters !== null && stormOverflowMeters > GPS_STORM_TOLERANCE_M;

  // Castigo severo por permanecer en la tormenta
  useEffect(() => {
    if (isInStorm) {
      setStormEnteredAtMs((prev) => prev ?? Date.now());
    } else {
      setStormEnteredAtMs(null);
      stormEliminationSentRef.current = false;
    }
  }, [isInStorm]);

  const stormTimeSpentSec =
    isInStorm && stormEnteredAtMs !== null
      ? Math.max(0, (nowMs - stormEnteredAtMs) / 1000)
      : 0;
  const stormGraceRemainingSec = Math.max(
    0,
    stormGraceMaxSec - stormTimeSpentSec
  );
  // A mitad del tiempo máximo ya se delata tu ubicación en el mapa
  const isStormExposed =
    isInStorm && stormTimeSpentSec >= stormGraceMaxSec / 2;

  // Al agotarse el tiempo máximo en tormenta, eliminar automáticamente al jugador
  useEffect(() => {
    if (
      isInStorm &&
      stormGraceRemainingSec <= 0 &&
      !myCaughtRecord &&
      !stormEliminationSentRef.current
    ) {
      stormEliminationSentRef.current = true;
      void onMarkCaught(currentPlayerId, 'storm');
    }
  }, [
    isInStorm,
    stormGraceRemainingSec,
    myCaughtRecord,
    currentPlayerId,
    onMarkCaught,
  ]);

  // Emitir ubicación propia periódicamente (cada 2.5s y al cambiar estado de tormenta)
  useEffect(() => {
    if (!myPos || myCaughtRecord) return;
    const emit = () => {
      sendLocationRef.current?.({
        playerId: currentPlayerId,
        lat: myPos.lat,
        lng: myPos.lng,
        accuracy: myPos.accuracy,
        inStorm: isInStorm,
        stormExposed: isStormExposed,
        updatedAt: Date.now(),
      });
    };
    emit();
    const timer = window.setInterval(emit, 2500);
    return () => window.clearInterval(timer);
  }, [myPos, currentPlayerId, isInStorm, isStormExposed, myCaughtRecord]);

  const hiderStats = useMemo(() => {
    const hiders = players.filter(
      (p) => (match?.roles?.[p.id] ?? 'hider') === 'hider'
    );
    const activeHiders = hiders.filter((p) => !caughtMap[p.id]);
    return {
      totalHiders: hiders.length,
      activeHiders: activeHiders.length,
      seekersCount: Math.max(0, players.length - hiders.length),
    };
  }, [players, match?.roles, caughtMap]);

  // Inicializar mapa Leaflet a pantalla completa + capas reutilizables
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const first = activeZones[0];
    const map = L.map(mapContainerRef.current, {
      center: [
        first?.lat ?? VALENCIA_CENTER.lat,
        first?.lng ?? VALENCIA_CENTER.lng,
      ],
      zoom: 15,
      zoomControl: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);

    const stormGroup = L.layerGroup().addTo(map);
    const guideGroup = L.layerGroup().addTo(map);
    const othersGroup = L.layerGroup().addTo(map);
    const selfGroup = L.layerGroup().addTo(map);

    const initialSnap = evaluateStormAtElapsed(activeZonesRef.current, 0);

    const maskPoly = L.polygon(
      getStormMaskRings(
        initialSnap.currentLat,
        initialSnap.currentLng,
        initialSnap.currentRadius,
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

    const borderCircle = L.circle(
      [initialSnap.currentLat, initialSnap.currentLng],
      {
        radius: initialSnap.currentRadius,
        color: '#7C3AED',
        weight: 3.5,
        fill: false,
        interactive: false,
      }
    ).addTo(stormGroup);

    mapRef.current = map;
    stormMaskRef.current = maskPoly;
    stormBorderRef.current = borderCircle;
    stormLayerRef.current = stormGroup;
    guideLayerRef.current = guideGroup;
    othersLayerRef.current = othersGroup;
    selfLayerRef.current = selfGroup;

    const observer = new ResizeObserver(() => {
      map.invalidateSize();
    });
    observer.observe(mapContainerRef.current);

    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      stormMaskRef.current = null;
      stormBorderRef.current = null;
      nextZoneCircleRef.current = null;
      lastNextZoneIdRef.current = null;
      stormLayerRef.current = null;
      guideLayerRef.current = null;
      guideLineRef.current = null;
      guideExitRef.current = null;
      othersLayerRef.current = null;
      selfLayerRef.current = null;
    };
  }, []);

  // Interpolación continua de la tormenta y línea guía a 60 FPS (sin saltos)
  useEffect(() => {
    let rafId = 0;

    const frame = () => {
      const mask = stormMaskRef.current;
      const border = stormBorderRef.current;
      const stormGroup = stormLayerRef.current;
      const guideGroup = guideLayerRef.current;

      if (mask && border && stormGroup) {
        const startedAt = startedAtRef.current;
        const startMs = startedAt ? new Date(startedAt).getTime() : Date.now();
        const exactElapsed = Number.isNaN(startMs)
          ? 0
          : Math.max(0, (Date.now() - startMs) / 1000);

        const snap = evaluateStormAtElapsed(activeZonesRef.current, exactElapsed);

        mask.setLatLngs(
          getStormMaskRings(
            snap.currentLat,
            snap.currentLng,
            snap.currentRadius,
            96
          )
        );
        border.setLatLng([snap.currentLat, snap.currentLng]);
        border.setRadius(snap.currentRadius);

        const nextId = snap.nextZone?.id ?? null;
        if (nextId !== lastNextZoneIdRef.current) {
          if (nextZoneCircleRef.current) {
            stormGroup.removeLayer(nextZoneCircleRef.current);
            nextZoneCircleRef.current = null;
          }
          if (snap.nextZone) {
            nextZoneCircleRef.current = L.circle(
              [snap.nextZone.lat, snap.nextZone.lng],
              {
                radius: snap.nextZone.radius,
                color: '#0F172A',
                weight: 2.5,
                dashArray: '7, 6',
                fill: false,
                interactive: false,
              }
            ).addTo(stormGroup);
          }
          lastNextZoneIdRef.current = nextId;
        }

        // Actualizar suavemente la línea recta de salida si el jugador está en tormenta
        const pos = myPosRef.current;
        if (guideGroup && pos) {
          const dist = distanceMeters(
            pos.lat,
            pos.lng,
            snap.currentLat,
            snap.currentLng
          );
          if (dist > snap.currentRadius + GPS_STORM_TOLERANCE_M) {
            const safeExit = getClosestSafePoint(
              snap.currentLat,
              snap.currentLng,
              snap.currentRadius,
              pos.lat,
              pos.lng
            );
            if (!guideLineRef.current) {
              guideLineRef.current = L.polyline(
                [
                  [pos.lat, pos.lng],
                  [safeExit.lat, safeExit.lng],
                ],
                {
                  color: '#10B981',
                  weight: 4.5,
                  dashArray: '10, 8',
                  opacity: 0.95,
                  interactive: false,
                }
              ).addTo(guideGroup);
            } else {
              guideLineRef.current.setLatLngs([
                [pos.lat, pos.lng],
                [safeExit.lat, safeExit.lng],
              ]);
            }

            if (!guideExitRef.current) {
              const exitIcon = L.divIcon({
                className: 'baliza-safe-exit-marker',
                html: `<div style="width:16px;height:16px;border-radius:9999px;background:#10B981;border:3px solid #ffffff;box-shadow:0 2px 8px rgba(15,23,42,0.45);"></div>`,
                iconSize: [16, 16],
                iconAnchor: [8, 8],
              });
              guideExitRef.current = L.marker([safeExit.lat, safeExit.lng], {
                icon: exitIcon,
                interactive: false,
              }).addTo(guideGroup);
            } else {
              guideExitRef.current.setLatLng([safeExit.lat, safeExit.lng]);
            }
          } else {
            if (guideLineRef.current) {
              guideGroup.removeLayer(guideLineRef.current);
              guideLineRef.current = null;
            }
            if (guideExitRef.current) {
              guideGroup.removeLayer(guideExitRef.current);
              guideExitRef.current = null;
            }
          }
        }
      }

      rafId = window.requestAnimationFrame(frame);
    };

    rafId = window.requestAnimationFrame(frame);
    return () => window.cancelAnimationFrame(rafId);
  }, []);

  // Dibujar otros jugadores visibles según reglas de sala o exposición en tormenta
  useEffect(() => {
    const othersGroup = othersLayerRef.current;
    if (!othersGroup) return;
    othersGroup.clearLayers();

    const now = Date.now();
    players.forEach((p) => {
      if (p.id === currentPlayerId) return;
      if (caughtMap[p.id]) return; // Si ya fue pillado/eliminado no sigue emitiendo
      const loc = otherLocations[p.id];
      if (!loc || now - loc.updatedAt > 35000) return;

      const otherRole = match?.roles?.[p.id] ?? 'hider';
      const allowedByRule =
        (myRole === 'hider' && otherRole === 'seeker' && hidersCanSeeSeekers) ||
        (myRole === 'seeker' && otherRole === 'hider' && seekersCanSeeHiders);

      if (!allowedByRule && !loc.stormExposed) return;

      const borderColor = loc.stormExposed
        ? '#7C3AED'
        : otherRole === 'seeker'
        ? '#E11D48'
        : '#059669';
      const badgeLabel = escapeHtml(
        loc.stormExposed
          ? '¡En tormenta!'
          : otherRole === 'seeker'
          ? 'Buscador'
          : p.name
      );
      const safeEmoji = escapeHtml(p.emoji);

      const icon = L.divIcon({
        className: 'baliza-other-player-marker',
        html: `<div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-50%);">
          <div style="display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:9999px;background:#ffffff;border:3px solid ${borderColor};box-shadow:0 3px 10px rgba(15,23,42,0.35);font-size:18px;">${safeEmoji}</div>
          <span style="margin-top:2px;padding:1px 6px;border-radius:6px;background:${borderColor};color:#ffffff;font-size:10px;font-weight:700;white-space:nowrap;box-shadow:0 1px 4px rgba(15,23,42,0.3);">${badgeLabel}</span>
        </div>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });

      L.marker([loc.lat, loc.lng], {
        icon,
        interactive: false,
      }).addTo(othersGroup);
    });
  }, [
    players,
    otherLocations,
    currentPlayerId,
    myRole,
    match?.roles,
    caughtMap,
    hidersCanSeeSeekers,
    seekersCanSeeHiders,
    nowMs,
  ]);

  // Dibujar posición GPS propia
  useEffect(() => {
    const selfGroup = selfLayerRef.current;
    if (!selfGroup) return;
    selfGroup.clearLayers();
    if (!myPos) return;

    if (myPos.accuracy > 5 && myPos.accuracy < 250) {
      L.circle([myPos.lat, myPos.lng], {
        radius: myPos.accuracy,
        color: '#2563EB',
        weight: 1,
        fillColor: '#3B82F6',
        fillOpacity: 0.14,
        interactive: false,
      }).addTo(selfGroup);
    }

    const dotColor = myCaughtRecord
      ? '#64748B'
      : myRole === 'seeker'
      ? '#E11D48'
      : '#059669';
    const selfIcon = L.divIcon({
      className: 'baliza-self-marker',
      html: `<div style="width:18px;height:18px;border-radius:9999px;background:${dotColor};border:3px solid #ffffff;box-shadow:0 2px 8px rgba(15,23,42,0.45);"></div>`,
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });

    L.marker([myPos.lat, myPos.lng], {
      icon: selfIcon,
      interactive: false,
    }).addTo(selfGroup);
  }, [myPos, myRole, myCaughtRecord]);

  const handleCenterMyGps = () => {
    if (myPos && mapRef.current) {
      mapRef.current.setView([myPos.lat, myPos.lng], 16, { animate: true });
      return;
    }
    if (!navigator.geolocation || !mapRef.current) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsError(null);
        setMyPos({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        mapRef.current?.setView(
          [pos.coords.latitude, pos.coords.longitude],
          16,
          { animate: true }
        );
      },
      () => {
        setGpsError('No pudimos obtener tu ubicación GPS.');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleCenterZone = () => {
    const map = mapRef.current;
    if (!map) return;
    const zoom =
      snapshot.currentRadius >= 1500
        ? 13
        : snapshot.currentRadius >= 600
        ? 14
        : snapshot.currentRadius >= 250
        ? 15
        : 16;
    map.setView([snapshot.currentLat, snapshot.currentLng], zoom, {
      animate: true,
    });
  };

  const handleZoom = (delta: number) => {
    const map = mapRef.current;
    if (!map) return;
    map.setZoom(map.getZoom() + delta);
  };

  const handleCatchPlayer = async (
    targetId: string,
    byId: string | 'storm'
  ) => {
    unlockRetroAudio();
    setBusyCatchId(targetId);
    try {
      await onMarkCaught(targetId, byId);
      setConfirmCatchId(null);
    } finally {
      setBusyCatchId(null);
    }
  };

  const handleUndo = async (targetId: string) => {
    setBusyCatchId(targetId);
    try {
      await onUndoCaught(targetId);
    } finally {
      setBusyCatchId(null);
    }
  };

  const handleConfirmEnd = async () => {
    setBusyAction(true);
    try {
      await onEndMatch();
    } finally {
      setBusyAction(false);
    }
  };

  const handleConfirmLeave = async () => {
    setBusyAction(true);
    try {
      await onLeaveRoom();
    } finally {
      setBusyAction(false);
    }
  };

  const phaseTimeline = useMemo(() => {
    let cursor = 0;
    return activeZones.map((zone, idx) => {
      const waitStart = cursor;
      const waitEnd = waitStart + zone.waitTimeSec;
      const next = activeZones[idx + 1] || null;
      const shrinkEnd = next ? waitEnd + next.shrinkTimeSec : waitEnd;
      cursor = shrinkEnd;
      return {
        zone,
        idx,
        waitStart,
        waitEnd,
        shrinkEnd,
        hasNext: Boolean(next),
      };
    });
  }, [activeZones]);

  const allHidersCaught =
    hiderStats.totalHiders > 0 && hiderStats.activeHiders === 0;

  const eliminationCauseLabel = useMemo(() => {
    if (!myCaughtRecord) return '';
    if (myCaughtRecord.byPlayerId === 'storm') {
      return 'ELIMINADO POR LA TORMENTA';
    }
    const hunterName =
      players.find((p) => p.id === myCaughtRecord.byPlayerId)?.name ||
      'BUSCADOR';
    return `PILLADO POR ${hunterName.toUpperCase()}`;
  }, [myCaughtRecord, players]);

  const handleCloseEliminationOverlay = () => {
    if (myCaughtRecord) {
      const seenKey = `baliza_elim_seen_${room.id}_${currentPlayerId}_${myCaughtRecord.at}`;
      try {
        window.sessionStorage.setItem(seenKey, '1');
      } catch {
        // Ignorar si sessionStorage no está disponible
      }
    }
    setShowEliminationOverlay(false);
  };

  return (
    <div className="fixed inset-0 z-30 flex h-[100dvh] w-full flex-col overflow-hidden bg-slate-900">
      {/* Mapa a pantalla completa */}
      <div
        ref={mapContainerRef}
        className="absolute inset-0 z-0 h-full w-full"
        aria-label="Mapa en vivo de la partida"
      />

      {/* Cabecera superior flotante: qué eres + escondidos restantes + tormenta */}
      <header className="pointer-events-none relative z-20 px-3 pt-3 sm:px-5 sm:pt-4">
        <div className="pointer-events-auto mx-auto max-w-3xl space-y-2">
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200/90 bg-white/95 px-3.5 py-2.5 shadow-lg backdrop-blur-md">
            {/* Rol del jugador */}
            <div className="flex min-w-0 items-center gap-2.5">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                  myCaughtRecord
                    ? 'bg-slate-600 text-white'
                    : myRole === 'seeker'
                    ? 'bg-rose-600 text-white'
                    : 'bg-emerald-700 text-white'
                }`}
              >
                {myCaughtRecord ? (
                  <Skull className="h-5 w-5" aria-hidden="true" />
                ) : myRole === 'seeker' ? (
                  <Eye className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <Shield className="h-5 w-5" aria-hidden="true" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  {myCaughtRecord
                    ? myCaughtRecord.byPlayerId === 'storm'
                      ? 'Eliminado'
                      : 'Pillado'
                    : 'Eres'}
                </p>
                <h1
                  className={`font-display truncate text-base sm:text-lg font-extrabold leading-tight ${
                    myCaughtRecord
                      ? 'text-slate-700'
                      : myRole === 'seeker'
                      ? 'text-rose-700'
                      : 'text-emerald-800'
                  }`}
                >
                  {myRole === 'seeker' ? 'Buscador' : 'Escondido'}
                </h1>
              </div>
            </div>

            {/* Contador de escondidos + temporizador de tormenta */}
            <div className="flex items-center gap-3.5 shrink-0 text-right">
              <div className="hidden xs:block sm:block">
                <p className="text-[11px] font-semibold text-slate-500">
                  Escondidos
                </p>
                <p className="font-mono text-sm font-bold tabular-nums text-slate-900">
                  {hiderStats.activeHiders}/{hiderStats.totalHiders}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-violet-700">
                  {snapshot.stage === 'waiting'
                    ? `Zona ${snapshot.phaseIndex + 1} · Cierra en`
                    : snapshot.stage === 'shrinking'
                    ? `Cerrando Z${snapshot.phaseIndex + 2}`
                    : 'Zona final'}
                </p>
                <p className="font-mono text-sm sm:text-base font-bold tabular-nums text-slate-900">
                  {snapshot.stage === 'final'
                    ? formatRadius(snapshot.currentRadius)
                    : `${formatDurationSec(snapshot.remainingSec)} · ${formatRadius(
                        snapshot.currentRadius
                      )}`}
                </p>
              </div>
            </div>
          </div>

          {/* Aviso de captura o victoria en tiempo real */}
          {allHidersCaught && (
            <div
              role="status"
              className="flex items-center justify-between gap-2 rounded-xl border border-emerald-300 bg-emerald-800/95 px-3.5 py-2 text-xs font-semibold text-white shadow-md backdrop-blur-md"
            >
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-300 shrink-0" />
                <span>
                  ¡Todos los escondidos han sido pillados! Fin de la cacería.
                </span>
              </span>
            </div>
          )}

          {captureToast && (
            <div
              role="status"
              className="flex items-center justify-between gap-2 rounded-xl border border-slate-700 bg-slate-900/95 px-3.5 py-2 text-xs font-semibold text-white shadow-md backdrop-blur-md"
            >
              <span>{captureToast}</span>
            </div>
          )}

          {/* Castigo severo por tormenta */}
          {!myCaughtRecord && isInStorm && stormOverflowMeters !== null && (
            <div
              role="alert"
              className={`flex items-center justify-between gap-2 rounded-xl border px-3.5 py-2 text-xs font-semibold text-white shadow-md backdrop-blur-md ${
                isStormExposed
                  ? 'border-rose-300 bg-rose-900/95'
                  : 'border-violet-300 bg-violet-900/95'
              }`}
            >
              <span className="flex items-center gap-2">
                <AlertTriangle
                  className="h-4 w-4 text-amber-300 shrink-0"
                  aria-hidden="true"
                />
                <span>
                  {isStormExposed
                    ? `¡UBICACIÓN REVELADA! Eliminación en ${Math.ceil(
                        stormGraceRemainingSec
                      )} s`
                    : `En tormenta · Sigue la línea verde · Eliminación en ${Math.ceil(
                        stormGraceRemainingSec
                      )} s`}
                </span>
              </span>
              <span className="font-mono tabular-nums shrink-0">
                +{Math.round(stormOverflowMeters)} m
              </span>
            </div>
          )}

          {gpsError && activeTab === 'map' && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/95 px-3 py-1.5 text-xs font-medium text-amber-900 shadow-xs">
              {gpsError}
            </div>
          )}
        </div>
      </header>

      {/* Espacio central transparente sobre el mapa + controles flotantes */}
      <div className="pointer-events-none relative z-10 flex-1">
        {activeTab === 'map' && (
          <>
            {/* Botón rápido para que el buscador marque capturas o escondidos restantes */}
            {myRole === 'seeker' && !allHidersCaught && (
              <div className="pointer-events-auto absolute left-3 bottom-4 sm:left-5 sm:bottom-5">
                <button
                  type="button"
                  onClick={() => setActiveTab('players')}
                  className="inline-flex min-h-[46px] items-center gap-2 rounded-2xl bg-rose-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg hover:bg-rose-700"
                >
                  <UserCheck className="h-4 w-4" aria-hidden="true" />
                  <span>
                    Marcar captura ({hiderStats.activeHiders})
                  </span>
                </button>
              </div>
            )}

            <div className="pointer-events-auto absolute right-3 bottom-4 sm:right-5 sm:bottom-5 flex flex-col gap-2">
              <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white/95 shadow-lg backdrop-blur-md">
                <button
                  type="button"
                  onClick={() => handleZoom(1)}
                  aria-label="Acercar mapa"
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center border-b border-slate-200 text-slate-800 hover:bg-slate-50"
                >
                  <Plus className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleZoom(-1)}
                  aria-label="Alejar mapa"
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center text-slate-800 hover:bg-slate-50"
                >
                  <Minus className="h-5 w-5" />
                </button>
              </div>

              <button
                type="button"
                onClick={handleCenterZone}
                aria-label="Centrar en la zona segura"
                title="Ver zona segura"
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-2xl border border-slate-200 bg-white/95 text-violet-700 shadow-lg backdrop-blur-md hover:bg-slate-50"
              >
                <Target className="h-5 w-5" />
              </button>

              <button
                type="button"
                onClick={handleCenterMyGps}
                aria-label="Centrar en mi ubicación GPS"
                title="Mi ubicación"
                className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-2xl bg-slate-900 text-white shadow-lg hover:bg-slate-800"
              >
                <LocateFixed className="h-5 w-5" />
              </button>
            </div>
          </>
        )}

        {/* Paneles de las pestañas inferiores */}
        {activeTab !== 'map' && (
          <div className="pointer-events-auto absolute inset-x-0 bottom-0 top-2 flex items-end justify-center px-2 sm:px-4 pb-2">
            <section
              aria-label={
                activeTab === 'players'
                  ? 'Jugadores en partida'
                  : activeTab === 'storm'
                  ? 'Fases de tormenta'
                  : 'Opciones de partida'
              }
              className="max-h-full w-full max-w-2xl overflow-y-auto rounded-3xl border border-slate-200 bg-white/98 p-5 shadow-2xl backdrop-blur-md"
            >
              {/* PESTAÑA JUGADORES + CAPTURAS */}
              {activeTab === 'players' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                    <div>
                      <h2 className="font-display text-lg font-bold text-slate-900">
                        Jugadores ({players.length})
                      </h2>
                      <p className="text-xs text-slate-500">
                        {hiderStats.activeHiders} de {hiderStats.totalHiders}{' '}
                        escondidos activos · {hiderStats.seekersCount}{' '}
                        {hiderStats.seekersCount === 1
                          ? 'buscador'
                          : 'buscadores'}
                      </p>
                    </div>
                    <span className="font-mono text-xs font-bold text-slate-500">
                      Sala {room.code}
                    </span>
                  </div>

                  <ul className="divide-y divide-slate-100">
                    {players.map((p) => {
                      const isSelf = p.id === currentPlayerId;
                      const pRole = match?.roles?.[p.id] ?? 'hider';
                      const caughtInfo = caughtMap[p.id];
                      const catcherName =
                        caughtInfo && caughtInfo.byPlayerId !== 'storm'
                          ? players.find((x) => x.id === caughtInfo.byPlayerId)
                              ?.name || 'Buscador'
                          : null;
                      const loc = otherLocations[p.id];
                      const otherExposed = Boolean(
                        !caughtInfo &&
                          loc &&
                          Date.now() - loc.updatedAt <= 35000 &&
                          loc.stormExposed
                      );
                      const seekerCanCatchThis =
                        myRole === 'seeker' &&
                        !isSelf &&
                        pRole === 'hider' &&
                        !caughtInfo;
                      const hiderCanReportSelf =
                        isSelf && myRole === 'hider' && !caughtInfo;

                      return (
                        <li key={p.id} className="py-2.5 space-y-2">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-3">
                              <PlayerAvatar
                                emoji={p.emoji}
                                color={p.color}
                                size="sm"
                                name={p.name}
                              />
                              <div className="min-w-0">
                                <p
                                  className={`truncate text-sm font-semibold ${
                                    caughtInfo
                                      ? 'line-through text-slate-400'
                                      : 'text-slate-900'
                                  }`}
                                >
                                  {p.name}
                                </p>
                                <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                                  {p.is_host && (
                                    <span className="inline-flex items-center gap-1 font-semibold text-amber-700">
                                      <Crown
                                        className="h-3 w-3"
                                        aria-hidden="true"
                                      />
                                      Anfitrión
                                    </span>
                                  )}
                                  {isSelf && (
                                    <span className="font-semibold text-emerald-700">
                                      Tú ({myRole === 'seeker' ? 'Buscador' : 'Escondido'})
                                    </span>
                                  )}
                                  {caughtInfo && (
                                    <span className="font-semibold text-rose-700">
                                      {caughtInfo.byPlayerId === 'storm'
                                        ? 'Eliminado por tormenta'
                                        : `Pillado por ${catcherName}`}
                                    </span>
                                  )}
                                  {!caughtInfo && otherExposed && (
                                    <span className="font-semibold text-violet-700">
                                      En tormenta (revelado)
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {seekerCanCatchThis && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setConfirmCatchId(
                                      confirmCatchId === p.id ? null : p.id
                                    )
                                  }
                                  disabled={busyCatchId === p.id}
                                  className="min-h-[38px] rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-700 whitespace-nowrap"
                                >
                                  Pillado
                                </button>
                              )}

                              {hiderCanReportSelf && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setConfirmCatchId(
                                      confirmCatchId === p.id ? null : p.id
                                    )
                                  }
                                  disabled={busyCatchId === p.id}
                                  className="min-h-[38px] rounded-xl border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 whitespace-nowrap"
                                >
                                  Me han pillado
                                </button>
                              )}

                              {caughtInfo && isHost && (
                                <button
                                  type="button"
                                  onClick={() => handleUndo(p.id)}
                                  disabled={busyCatchId === p.id}
                                  title="Deshacer captura"
                                  className="inline-flex min-h-[38px] items-center gap-1 rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                                >
                                  <RotateCcw className="h-3.5 w-3.5" />
                                  <span>Deshacer</span>
                                </button>
                              )}
                            </div>
                          </div>

                          {confirmCatchId === p.id && (
                            <div className="flex items-center justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs">
                              <span className="font-semibold text-rose-900">
                                {isSelf
                                  ? '¿Confirmar que te han pillado?'
                                  : `¿Confirmas que has pillado a ${p.name}?`}
                              </span>
                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => setConfirmCatchId(null)}
                                  className="min-h-[34px] px-2 font-semibold text-slate-600"
                                >
                                  No
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleCatchPlayer(
                                      p.id,
                                      isSelf
                                        ? players.find(
                                            (x) =>
                                              (match?.roles?.[x.id] ??
                                                'hider') === 'seeker'
                                          )?.id || currentPlayerId
                                        : currentPlayerId
                                    )
                                  }
                                  disabled={busyCatchId === p.id}
                                  className="min-h-[34px] rounded-lg bg-rose-700 px-3 font-semibold text-white hover:bg-rose-800"
                                >
                                  Confirmar
                                </button>
                              </div>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {/* PESTAÑA TORMENTA / FASES */}
              {activeTab === 'storm' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                    <div>
                      <h2 className="font-display text-lg font-bold text-slate-900">
                        Fases de tormenta
                      </h2>
                      <p className="text-xs text-slate-500">
                        Tiempo restante de ronda:{' '}
                        <span className="font-mono font-bold text-slate-800">
                          {formatDurationSec(roundRemainingSec)}
                        </span>
                      </p>
                    </div>
                    <span className="font-mono text-xs font-semibold text-violet-700">
                      Límite tormenta {stormGraceMaxSec}s
                    </span>
                  </div>

                  <ol className="space-y-2.5">
                    {phaseTimeline.map((item) => {
                      const isCurrent = item.idx === snapshot.phaseIndex;
                      const isDone = item.idx < snapshot.phaseIndex;
                      return (
                        <li
                          key={item.zone.id}
                          className={`flex items-center justify-between gap-3 rounded-2xl border px-3.5 py-2.5 ${
                            isCurrent
                              ? 'border-violet-300 bg-violet-50'
                              : isDone
                              ? 'border-slate-100 bg-slate-50/70 opacity-60'
                              : 'border-slate-200 bg-white'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span
                              className={`flex h-8 w-8 items-center justify-center rounded-xl font-mono text-xs font-bold ${
                                isCurrent
                                  ? 'bg-violet-700 text-white'
                                  : 'bg-slate-200 text-slate-700'
                              }`}
                            >
                              Z{item.idx + 1}
                            </span>
                            <div>
                              <p className="text-sm font-bold text-slate-900">
                                Radio {formatRadius(item.zone.radius)}
                              </p>
                              <p className="text-xs text-slate-500">
                                Espera {formatDurationSec(item.zone.waitTimeSec)}
                                {item.hasNext
                                  ? ` · Cierre ${formatDurationSec(
                                      activeZones[item.idx + 1].shrinkTimeSec
                                    )}`
                                  : ' · Zona final'}
                              </p>
                            </div>
                          </div>

                          <span className="text-xs font-semibold text-slate-600 shrink-0">
                            {isCurrent
                              ? 'Activa'
                              : isDone
                              ? 'Completada'
                              : 'Pendiente'}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              )}

              {/* PESTAÑA PARTIDA / SALIR */}
              {activeTab === 'match' && (
                <div className="space-y-4">
                  <div className="border-b border-slate-200 pb-3">
                    <h2 className="font-display text-lg font-bold text-slate-900">
                      Control de partida
                    </h2>
                    <p className="text-xs text-slate-500">
                      Sala <span className="font-mono font-bold">{room.code}</span> ·{' '}
                      Duración total {room.rules.roundDuration} min
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-2 text-sm">
                    <p className="font-semibold text-slate-900">
                      Tu rol: {myRole === 'seeker' ? 'Buscador' : 'Escondido'}
                      {myCaughtRecord
                        ? myCaughtRecord.byPlayerId === 'storm'
                          ? ' (Eliminado por tormenta)'
                          : ' (Pillado)'
                        : ''}
                    </p>
                    <p className="text-xs text-slate-600">
                      {myPos
                        ? `GPS activo (precisión ±${Math.round(myPos.accuracy)} m).`
                        : gpsError || 'Obteniendo señal GPS...'}
                    </p>
                    <div className="border-t border-slate-200/80 pt-2 text-xs text-slate-600 space-y-1">
                      <p>
                        · Jugadores ven al buscador:{' '}
                        <strong>{hidersCanSeeSeekers ? 'Sí' : 'No'}</strong>
                      </p>
                      <p>
                        · Buscador ve a los jugadores:{' '}
                        <strong>{seekersCanSeeHiders ? 'Sí' : 'No'}</strong>
                      </p>
                      <p>
                        · Tiempo máximo en tormenta:{' '}
                        <strong>{stormGraceMaxSec} s</strong> (revela a mitad de tiempo y elimina al agotarse).
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2.5 pt-1">
                    {myCaughtRecord && (
                      <button
                        type="button"
                        onClick={() => {
                          unlockRetroAudio();
                          setShowEliminationOverlay(true);
                        }}
                        className="flex w-full min-h-[46px] items-center justify-center gap-2 rounded-2xl border border-slate-900 bg-black px-5 py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-white hover:bg-zinc-900"
                      >
                        <Skull className="h-4 w-4 text-[#FF1E6E]" aria-hidden="true" />
                        <span>Ver escena de eliminación 8-bit</span>
                      </button>
                    )}

                    {isHost &&
                      (confirmAction === 'end' ? (
                        <div className="rounded-2xl border border-slate-300 bg-slate-50 p-3.5 space-y-2.5">
                          <p className="text-xs font-semibold text-slate-800">
                            ¿Finalizar la partida y volver con todos a la sala?
                          </p>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setConfirmAction(null)}
                              disabled={busyAction}
                              className="min-h-[44px] flex-1 rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              onClick={handleConfirmEnd}
                              disabled={busyAction}
                              className="min-h-[44px] flex-1 rounded-xl bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-800"
                            >
                              {busyAction ? 'Finalizando...' : 'Sí, finalizar'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmAction('end')}
                          className="flex w-full min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
                        >
                          <Flag className="h-4 w-4" aria-hidden="true" />
                          <span>Finalizar partida y volver a la sala</span>
                        </button>
                      ))}

                    {confirmAction === 'leave' ? (
                      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3.5 space-y-2.5">
                        <p className="text-xs font-semibold text-rose-900">
                          {isHost
                            ? '¿Cerrar y borrar la sala para todos?'
                            : '¿Seguro que quieres abandonar la partida?'}
                        </p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setConfirmAction(null)}
                            disabled={busyAction}
                            className="min-h-[44px] flex-1 rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            onClick={handleConfirmLeave}
                            disabled={busyAction}
                            className="min-h-[44px] flex-1 rounded-xl bg-rose-700 px-3 text-xs font-semibold text-white hover:bg-rose-800"
                          >
                            {busyAction ? 'Saliendo...' : 'Sí, salir'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmAction('leave')}
                        className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-50"
                      >
                        <LogOut className="h-4 w-4" aria-hidden="true" />
                        <span>
                          {isHost ? 'Cerrar y borrar sala' : 'Abandonar partida'}
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      {/* Barra de navegación inferior fija */}
      <nav
        aria-label="Pestañas de partida"
        className="relative z-30 border-t border-slate-200 bg-white/95 backdrop-blur-md"
      >
        <div className="mx-auto grid max-w-2xl grid-cols-4 gap-1 px-2 py-1.5">
          {(
            [
              { id: 'map', label: 'Mapa', Icon: MapIcon },
              {
                id: 'players',
                label: `Jugadores (${players.length})`,
                Icon: Users,
              },
              { id: 'storm', label: 'Tormenta', Icon: Compass },
              { id: 'match', label: 'Partida', Icon: Clock },
            ] as const
          ).map(({ id, label, Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setConfirmAction(null);
                  setConfirmCatchId(null);
                  setActiveTab(id);
                }}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-[50px] flex-col items-center justify-center gap-0.5 rounded-2xl px-1 py-1.5 text-[11px] font-semibold transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {showEliminationOverlay && myCaughtRecord && (
        <EliminationOverlay
          playerName={currentPlayer?.name || 'Jugador'}
          playerEmoji={currentPlayer?.emoji || '🏃'}
          playerColor={currentPlayer?.color || '#059669'}
          causeLabel={eliminationCauseLabel}
          onClose={handleCloseEliminationOverlay}
        />
      )}
    </div>
  );
};
