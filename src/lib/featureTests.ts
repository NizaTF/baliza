import { didPlayerWinMatch } from './matchOutcome';
import {
  ACHIEVEMENT_CATALOG,
  loadStatsAndAchievements,
  recordAbilityUsed,
  recordMatchOutcome,
  resetAchievementsForTests,
} from './achievements';
import {
  ALL_COSMETICS,
  getCosmeticsForAchievement,
  sanitizeEquippedCosmetics,
} from './cosmetics';
import { safeLocalGet, safeLocalRemove, safeLocalSet } from './safeStorage';
import {
  computeBearingDeg,
  getCardinalLabel,
  getPocketPulseSpec,
  normalizeRelativeAngleDeg,
} from './compassHaptics';
import {
  RoomChatMessage,
  sendRoomChatMessage,
  subscribeRoomChatMessages,
} from './firebase';
import { createGpsFilterState, filterGpsSample } from './gpsFilter';
import {
  BUILT_IN_PRESETS,
  deleteCustomPreset,
  loadCustomPresets,
  saveCustomPreset,
} from './presets';
import {
  createBotPlayers,
  findBotAutoCapture,
  pickBotAbilityAction,
  pickBotChatMessage,
  stepBotVectors,
} from './soloSandbox';
import {
  distanceMeters,
  evaluateStormAtElapsed,
  generateExtractionBeacon,
  generateRandomZones,
  getClosestSafePoint,
  VALENCIA_CENTER,
} from './zones';
import { createMercatorViewport } from './recapVideoMap';
import { DEFAULT_RULES, PlayerRecord, PlayerRole } from '../types/game';

export interface FeatureTestCaseResult {
  id: string;
  name: string;
  passed: boolean;
  detail: string;
}

export interface FeatureTestSuiteReport {
  total: number;
  passed: number;
  failed: number;
  durationMs: number;
  results: FeatureTestCaseResult[];
}

function assertCondition(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

export async function runAllBalizaFeatureTests(): Promise<FeatureTestSuiteReport> {
  const startedAt = Date.now();
  const results: FeatureTestCaseResult[] = [];

  const runCase = async (
    id: string,
    name: string,
    fn: () => Promise<string> | string
  ) => {
    try {
      const detail = await fn();
      results.push({ id, name, passed: true, detail });
    } catch (err) {
      results.push({
        id,
        name,
        passed: false,
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  };

  await runCase(
    'infection_patient_zero_only',
    'Infección: solo gana el infectado inicial',
    () => {
      const roles: Record<string, PlayerRole> = {
        p0: 'seeker',
        p1: 'seeker',
        p2: 'seeker',
        p3: 'hider',
      };
      const infectedMap = {
        p1: { at: '2026-01-01T00:01:00.000Z', byPlayerId: 'p0' },
        p2: { at: '2026-01-01T00:02:00.000Z', byPlayerId: 'p1' },
      };
      const initialSeekers = ['p0'];

      const p0Wins = didPlayerWinMatch({
        winner: 'seekers',
        myRole: 'seeker',
        currentPlayerId: 'p0',
        infectionModeEnabled: true,
        infectedMap,
        initialSeekers,
        roles,
      });
      const p1Wins = didPlayerWinMatch({
        winner: 'seekers',
        myRole: 'seeker',
        currentPlayerId: 'p1',
        infectionModeEnabled: true,
        infectedMap,
        initialSeekers,
        roles,
      });
      const p3Wins = didPlayerWinMatch({
        winner: 'seekers',
        myRole: 'hider',
        currentPlayerId: 'p3',
        infectionModeEnabled: true,
        infectedMap,
        initialSeekers,
        roles,
      });
      const hiderTimeWin = didPlayerWinMatch({
        winner: 'hiders',
        myRole: 'hider',
        currentPlayerId: 'p3',
        infectionModeEnabled: true,
        infectedMap,
        initialSeekers,
        roles,
      });
      const p0TimeLoss = didPlayerWinMatch({
        winner: 'hiders',
        myRole: 'seeker',
        currentPlayerId: 'p0',
        infectionModeEnabled: true,
        infectedMap,
        initialSeekers,
        roles,
      });

      assertCondition(p0Wins === true, 'Paciente Cero debería ganar.');
      assertCondition(p1Wins === false, 'Jugador infectado debería perder.');
      assertCondition(p3Wins === false, 'Fugitivo debería perder si ganan infectados.');
      assertCondition(hiderTimeWin === true, 'Fugitivo vivo gana por tiempo.');
      assertCondition(p0TimeLoss === false, 'Paciente Cero pierde por tiempo.');
      return 'Paciente Cero=Victoria, infectados y caídos=Derrota.';
    }
  );

  await runCase(
    'bots_smart_ai_and_capture',
    'Bots: persecución, señuelos y captura automática',
    () => {
      const host: PlayerRecord = {
        id: 'human_1',
        room_id: 'test_room',
        name: 'Tester',
        emoji: '🦊',
        color: '#059669',
        is_host: true,
        joined_at: new Date().toISOString(),
      };
      const bots = createBotPlayers(3, [host], 'test_room');
      assertCondition(bots.length === 3, 'Debe crear 3 bots.');

      const seekerBot = bots[0];
      const hiderBot = bots[1];
      const roles: Record<string, PlayerRole> = {
        [host.id]: 'hider',
        [seekerBot.id]: 'seeker',
        [hiderBot.id]: 'hider',
        [bots[2].id]: 'hider',
      };

      const init = stepBotVectors(
        bots.map((b) => b.id),
        {},
        VALENCIA_CENTER,
        VALENCIA_CENTER,
        600,
        1,
        true
      );
      assertCondition(init.payloads.length === 3, 'Debe emitir 3 ubicaciones de bots.');

      // Colocar un señuelo cerca del buscador y verificar que el buscador se acerca
      const sVec = init.nextVectors[seekerBot.id];
      const decoyLat = sVec.lat + 0.0007;
      const decoyLng = sVec.lng;
      const beforeDist = distanceMeters(sVec.lat, sVec.lng, decoyLat, decoyLng);

      const stepped = stepBotVectors(
        [seekerBot.id],
        { [seekerBot.id]: sVec },
        VALENCIA_CENTER,
        VALENCIA_CENTER,
        600,
        2,
        false,
        {
          roles,
          isHuntPhase: true,
          activeDecoys: [
            {
              id: 'decoy_test',
              ownerPlayerId: host.id,
              label: 'Señuelo',
              lat: decoyLat,
              lng: decoyLng,
              expiresAt: new Date(Date.now() + 20000).toISOString(),
            },
          ],
          humanPos: {
            id: host.id,
            lat: VALENCIA_CENTER.lat - 0.004,
            lng: VALENCIA_CENTER.lng,
          },
        }
      );
      const afterVec = stepped.nextVectors[seekerBot.id];
      const afterDist = distanceMeters(afterVec.lat, afterVec.lng, decoyLat, decoyLng);
      assertCondition(
        afterDist < beforeDist,
        'El bot buscador debe dirigirse hacia el señuelo activo.'
      );

      // Verificar captura automática a <= 16m
      const capture = findBotAutoCapture({
        players: [host, ...bots],
        roles,
        caughtMap: {},
        locations: {
          [seekerBot.id]: { lat: VALENCIA_CENTER.lat, lng: VALENCIA_CENTER.lng },
          [hiderBot.id]: {
            lat: VALENCIA_CENTER.lat + 0.00008,
            lng: VALENCIA_CENTER.lng,
          },
        },
        captureRadiusM: 16,
      });
      assertCondition(
        capture?.seekerBotId === seekerBot.id && capture?.targetId === hiderBot.id,
        'Debe detectar captura automática cuando el bot buscador entra en rango.'
      );
      return 'Bots creados, persiguen señuelos y detectan captura a <=16m.';
    }
  );

  await runCase(
    'abilities_and_bot_usage',
    'Habilidades y uso por parte de bots',
    () => {
      const bots = createBotPlayers(2, [], 'test_ab');
      const roles: Record<string, PlayerRole> = {
        [bots[0].id]: 'seeker',
        [bots[1].id]: 'hider',
      };
      const seekerPick = pickBotAbilityAction({
        players: bots,
        roles,
        caughtMap: {},
        abilityUses: { [bots[1].id]: 2 },
        abilitiesMax: 2,
      });
      assertCondition(
        seekerPick !== null &&
          seekerPick.botId === bots[0].id &&
          (seekerPick.kind === 'sonar' || seekerPick.kind === 'scan'),
        'El bot buscador debe elegir sonar o rastreo.'
      );
      const exhausted = pickBotAbilityAction({
        players: bots,
        roles,
        caughtMap: {},
        abilityUses: { [bots[0].id]: 2, [bots[1].id]: 2 },
        abilitiesMax: 2,
      });
      assertCondition(exhausted === null, 'Sin cargas no debe usar habilidad.');
      return 'Selección por rol y límite de cargas validados.';
    }
  );

  await runCase(
    'contract_hunt_targets',
    'Caza por Objetivos (Contratos)',
    () => {
      const hiders = ['h1', 'h2'];
      const contractTargets: Record<string, string> = { s1: 'h1' };
      const contractsCompletedBy: Record<string, number> = {};
      if (contractTargets.s1 === 'h1') {
        contractsCompletedBy.s1 = (contractsCompletedBy.s1 ?? 0) + 1;
      }
      const remaining = hiders.filter((id) => id !== 'h1');
      contractTargets.s1 = remaining[0];
      assertCondition(contractsCompletedBy.s1 === 1, 'Debe sumar 1 contrato.');
      assertCondition(contractTargets.s1 === 'h2', 'Debe reasignar al siguiente fugitivo.');
      return 'Contrato completado y reasignación automática verificados.';
    }
  );

  await runCase(
    'chat_sandbox_and_bot_chatter',
    'Chat en partida + mensajes automáticos de bots',
    async () => {
      const testRoomId = `test_chat_${Date.now()}`;
      const bots = createBotPlayers(2, [], testRoomId);
      const roles: Record<string, PlayerRole> = {
        [bots[0].id]: 'seeker',
        [bots[1].id]: 'hider',
      };
      let capturedMessages: RoomChatMessage[] = [];
      const unsub = subscribeRoomChatMessages(
        testRoomId,
        (msgs) => {
          capturedMessages = msgs;
        },
        undefined,
        { forceLocal: true }
      );

      const botLine = pickBotChatMessage({
        players: bots,
        roles,
        caughtMap: {},
        forceAllChannel: true,
      });
      assertCondition(botLine !== null, 'Debe generar frase táctica de bot.');

      await sendRoomChatMessage({
        roomId: testRoomId,
        roomCode: 'TEST',
        senderPlayerId: botLine!.bot.id,
        senderName: botLine!.bot.name,
        senderEmoji: botLine!.bot.emoji,
        senderRole: botLine!.role,
        channel: 'all',
        text: botLine!.text,
        forceLocal: true,
      });
      await sendRoomChatMessage({
        roomId: testRoomId,
        roomCode: 'TEST',
        senderPlayerId: bots[1].id,
        senderName: bots[1].name,
        senderEmoji: bots[1].emoji,
        senderRole: 'hider',
        channel: 'team',
        text: 'Mensaje privado de equipo',
        forceLocal: true,
      });
      unsub();

      assertCondition(
        capturedMessages.length >= 2,
        'Los mensajes locales deben guardarse y leerse correctamente.'
      );
      return `${capturedMessages.length} mensajes (público + bando) sincronizados.`;
    }
  );

  await runCase(
    'pocket_compass_and_haptics',
    'Brújula y vibración por cercanía',
    () => {
      const eastBearing = computeBearingDeg(
        VALENCIA_CENTER.lat,
        VALENCIA_CENTER.lng,
        VALENCIA_CENTER.lat,
        VALENCIA_CENTER.lng + 0.002
      );
      assertCondition(
        Math.abs(eastBearing - 90) < 3 && getCardinalLabel(eastBearing) === 'E',
        'El rumbo hacia el este debe ser ~90° (E).'
      );
      const rel = normalizeRelativeAngleDeg(10, 350);
      assertCondition(Math.abs(rel - 20) < 0.01, 'Ángulo relativo circular correcto.');
      const farPulse = getPocketPulseSpec(300, false);
      const nearAligned = getPocketPulseSpec(18, true);
      assertCondition(
        nearAligned.intervalMs < farPulse.intervalMs &&
          nearAligned.pattern.length > farPulse.pattern.length,
        'Al acercarse y alinearse la cadencia debe acelerarse.'
      );
      return `Rumbo ${Math.round(eastBearing)}° (${getCardinalLabel(eastBearing)}), cadencia ${nearAligned.intervalMs}ms.`;
    }
  );

  await runCase(
    'gps_antijump_and_ema',
    'Filtro anti-saltos y suavizado EMA de GPS',
    () => {
      let state = createGpsFilterState();
      const baseMs = 1700000000000;
      const badAcc = filterGpsSample(state, {
        lat: VALENCIA_CENTER.lat,
        lng: VALENCIA_CENTER.lng,
        accuracy: 200,
        timestampMs: baseMs,
      });
      assertCondition(badAcc.accepted === false, 'Debe descartar precisión >140m en frío.');

      const first = filterGpsSample(state, {
        lat: VALENCIA_CENTER.lat,
        lng: VALENCIA_CENTER.lng,
        accuracy: 8,
        timestampMs: baseMs + 1000,
      });
      assertCondition(first.accepted && first.position !== null, 'Primer punto válido.');
      state = first.state;

      const spike = filterGpsSample(state, {
        lat: VALENCIA_CENTER.lat + 0.02,
        lng: VALENCIA_CENTER.lng + 0.02,
        accuracy: 10,
        timestampMs: baseMs + 3000,
      });
      assertCondition(
        spike.accepted === false && spike.reason === 'jump_filtered',
        'Debe filtrar salto imposible (>19 m/s).'
      );
      state = spike.state;

      const smooth = filterGpsSample(state, {
        lat: VALENCIA_CENTER.lat + 0.00005,
        lng: VALENCIA_CENTER.lng,
        accuracy: 7,
        timestampMs: baseMs + 5000,
      });
      assertCondition(
        smooth.accepted && smooth.reason === 'accepted',
        'Movimiento real debe aceptarse y suavizarse con EMA.'
      );
      return `Precisión mala y salto imposible filtrados (${smooth.state.rejectedJumps} salto).`;
    }
  );

  await runCase(
    'storm_beacon_and_zones',
    'Tormenta, Baliza y Zonas aleatorias',
    () => {
      const zones = generateRandomZones({
        anchorLat: VALENCIA_CENTER.lat,
        anchorLng: VALENCIA_CENTER.lng,
        count: 4,
        initialRadius: 800,
        defaultWaitSec: 60,
        defaultShrinkSec: 30,
      });
      assertCondition(zones.length === 4, 'Debe generar 4 fases de zona.');
      const beacon = generateExtractionBeacon(zones, 10, 25);
      assertCondition(beacon.radiusM === 25, 'Baliza creada con radio correcto.');
      const snap = evaluateStormAtElapsed(zones, 75);
      assertCondition(snap.currentRadius <= 800, 'La tormenta debe encoger tras esperar.');
      const safePt = getClosestSafePoint(
        snap.currentLat,
        snap.currentLng,
        snap.currentRadius,
        snap.currentLat + 0.02,
        snap.currentLng
      );
      const distSafe = distanceMeters(
        safePt.lat,
        safePt.lng,
        snap.currentLat,
        snap.currentLng
      );
      assertCondition(
        distSafe <= snap.currentRadius + 1,
        'Punto de salida seguro dentro del radio.'
      );
      return `4 zonas, baliza a ${beacon.unlockAtSec}s y radio actual ${Math.round(snap.currentRadius)}m.`;
    }
  );

  await runCase(
    'presets_and_achievements',
    'Presets extremos y 20 Logros tryhard',
    () => {
      assertCondition(BUILT_IN_PRESETS.length >= 7, 'Debe incluir los 4 presets extremos.');
      const noStop = BUILT_IN_PRESETS.find((p) => p.id === 'builtin_no_stop');
      const blackout = BUILT_IN_PRESETS.find((p) => p.id === 'builtin_blackout');
      const paparazzi = BUILT_IN_PRESETS.find((p) => p.id === 'builtin_paparazzi');
      const pandemic = BUILT_IN_PRESETS.find((p) => p.id === 'builtin_pandemic_zero');
      assertCondition(
        Boolean(noStop?.rules.modifiers.antiCampEliminate) &&
          Boolean(blackout?.rules.modifiers.fogEnabled) &&
          Boolean(paparazzi?.rules.modifiers.hunterPhotoEnabled) &&
          Boolean(pandemic?.rules.modifiers.infectionModeEnabled),
        'Todos los presets extremos deben tener sus reglas activas.'
      );

      const listAfterSave = saveCustomPreset('Preset Test Auto', DEFAULT_RULES);
      const created = listAfterSave.find((p) => p.name === 'Preset Test Auto');
      assertCondition(Boolean(created), 'Debe guardar el preset custom.');
      const reloaded = loadCustomPresets();
      assertCondition(
        reloaded.some((p) => p.id === created!.id),
        'Debe cargar el preset custom.'
      );
      deleteCustomPreset(created!.id);
      const listAfterDelete = loadCustomPresets();
      assertCondition(
        !listAfterDelete.some((p) => p.id === created!.id),
        'Debe borrar el preset custom.'
      );

      assertCondition(
        ACHIEVEMENT_CATALOG.length === 20 &&
          !ACHIEVEMENT_CATALOG.some((a) => a.id === 'first_match' || a.id === 'survivor'),
        'El catálogo debe tener exactamente 20 logros tryhard sin logros antiguos.'
      );

      const prevAchievementsBackup = safeLocalGet('baliza_achievements_v2');
      try {
        resetAchievementsForTests();
        recordAbilityUsed();
        const res1 = recordMatchOutcome({
          matchKey: `test_nostop_${Date.now()}`,
          didWin: true,
          myRole: 'hider',
          winReason: 'time_expired',
          metersWalked: 1350,
          catchesByMe: 0,
          infectionsByMe: 0,
          activatedBeaconByMe: false,
          contractsCompletedByMe: 0,
          antiCampEliminate: true,
          hadAntiCampWarning: false,
          pocketCompassRatio: 0.8,
        });
        assertCondition(
          res1.newlyUnlocked.some((a) => a.id === 'no_stop_win') &&
            res1.newlyUnlocked.some((a) => a.id === 'pocket_pure_win') &&
            res1.newlyUnlocked.some((a) => a.id === 'untouchable_time'),
          'Debe desbloquear Corazón a 200, Modo Bolsillo Puro e Intocable.'
        );

        const res2 = recordMatchOutcome({
          matchKey: `test_p0_${Date.now()}`,
          didWin: true,
          myRole: 'seeker',
          winReason: 'all_caught',
          metersWalked: 900,
          catchesByMe: 0,
          infectionsByMe: 3,
          activatedBeaconByMe: false,
          contractsCompletedByMe: 3,
          infectionModeEnabled: true,
          isInitialSeeker: true,
          initialSeekersCount: 1,
          hadFastDoubleInfection: true,
          hadTechHunterCatch: true,
          trailEnabled: true,
        });
        assertCondition(
          res2.newlyUnlocked.some((a) => a.id === 'patient_zero_solo') &&
            res2.newlyUnlocked.some((a) => a.id === 'contract_triple') &&
            res2.newlyUnlocked.some((a) => a.id === 'double_infection_fast') &&
            res2.newlyUnlocked.some((a) => a.id === 'tech_hunter'),
          'Debe desbloquear Paciente Cero Absoluto, Sicario Implacable, Brotes en Cadena y Cazador Tecnológico.'
        );

        const loaded = loadStatsAndAchievements();
        const plat = loaded.achievements.find((a) => a.id === 'platinum_master');
        assertCondition(
          Boolean(plat && !plat.unlocked && plat.current < 19),
          'El Platino solo se desbloquea al completar los otros 19 logros.'
        );

        const missingRewards = ACHIEVEMENT_CATALOG.filter(
          (a) => getCosmeticsForAchievement(a.id).length === 0
        );
        const hasTitle = ALL_COSMETICS.some((c) => c.kind !== 'nameEffect' && c.kind !== 'avatarEffect');
        assertCondition(
          missingRewards.length === 0 &&
            !hasTitle &&
            ALL_COSMETICS.length === 21 &&
            getCosmeticsForAchievement('platinum_master').length === 2,
          'Todos los 20 logros deben otorgar color de texto o efecto de icono (Platino ambos).'
        );

        const unlockedIds = new Set(
          loaded.achievements.filter((a) => a.unlocked).map((a) => a.id)
        );
        const sanitizedNormal = sanitizeEquippedCosmetics(
          {
            nameEffectId: 'name_velocidad',
            avatarEffectId: 'avatar_platino',
          },
          unlockedIds,
          false
        );
        const sanitizedDebug = sanitizeEquippedCosmetics(
          {
            nameEffectId: 'name_velocidad',
            avatarEffectId: 'avatar_platino',
          },
          unlockedIds,
          true
        );
        assertCondition(
          sanitizedNormal.nameEffectId === 'name_velocidad' &&
            sanitizedNormal.avatarEffectId === undefined &&
            sanitizedDebug.nameEffectId === 'name_velocidad' &&
            sanitizedDebug.avatarEffectId === 'avatar_platino',
          'En modo normal exige desbloqueo y en modo debug permite equipar cualquier cosmético.'
        );

        return `${BUILT_IN_PRESETS.length} presets, ${loaded.achievements.filter((a) => a.unlocked).length}/20 logros y ${ALL_COSMETICS.length} cosméticos validados.`;
      } finally {
        if (prevAchievementsBackup !== null) {
          safeLocalSet('baliza_achievements_v2', prevAchievementsBackup);
        } else {
          safeLocalRemove('baliza_achievements_v2');
        }
      }
    }
  );

  await runCase(
    'video_recap_capability',
    'Mapa final y exportación de vídeo',
    () => {
      const hasMediaRecorder = typeof MediaRecorder !== 'undefined';
      const dist = distanceMeters(
        VALENCIA_CENTER.lat,
        VALENCIA_CENTER.lng,
        VALENCIA_CENTER.lat + 0.001,
        VALENCIA_CENTER.lng
      );
      assertCondition(dist > 100 && dist < 120, 'Cálculo métrico de recorrido correcto.');

      const viewport = createMercatorViewport(
        {
          minLat: VALENCIA_CENTER.lat - 0.004,
          maxLat: VALENCIA_CENTER.lat + 0.004,
          minLng: VALENCIA_CENTER.lng - 0.004,
          maxLng: VALENCIA_CENTER.lng + 0.004,
        },
        { left: 16, top: 66, width: 688, height: 610 }
      );
      const centerPt = viewport.project(VALENCIA_CENTER.lat, VALENCIA_CENTER.lng);
      assertCondition(
        viewport.tiles.length >= 4 &&
          viewport.tiles.length <= 25 &&
          Math.abs(centerPt.x - 360) < 12 &&
          Math.abs(centerPt.y - 371) < 12,
        'Proyección Web Mercator y rejilla de tiles centradas correctamente.'
      );

      return hasMediaRecorder
        ? `Proyección Mercator (${viewport.tiles.length} tiles z${viewport.tileZoom}) y MediaRecorder listos.`
        : `Métrica y proyección Mercator OK (${viewport.tiles.length} tiles z${viewport.tileZoom}).`;
    }
  );

  const passed = results.filter((r) => r.passed).length;
  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    durationMs: Date.now() - startedAt,
    results,
  };
}
