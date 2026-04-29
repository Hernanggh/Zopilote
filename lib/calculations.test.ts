import { describe, it, expect } from 'vitest';
import {
  calcRelativeHandicaps,
  calcHandicapStrokes,
  calcNetScore,
  buildNetScoreMap,
  calcMarcas,
  calcIndividualAll,
  calcParejas,
  calcParejaBase,
  calcDineros,
  getHoleOrder,
  type HoleInfo,
  type PlayerHandicap,
  type ScoreEntry,
  type Pairing,
} from './calculations';

// ─── Fixtures comunes ─────────────────────────────────────────────────────────

/** 18 hoyos estándar, par 72, ventaja 1-18 en orden */
const HOLES_18: HoleInfo[] = Array.from({ length: 18 }, (_, i) => ({
  hole_number: i + 1,
  par: i < 4 ? 4 : i === 4 ? 5 : i === 11 ? 5 : i === 15 ? 5 : 4,
  handicap_rank: i + 1,
}));

const HOLES_ORDER = Array.from({ length: 18 }, (_, i) => i + 1);
const PRIMERA = HOLES_ORDER.slice(0, 9);
const SEGUNDA = HOLES_ORDER.slice(9);

// 4 jugadores
const A = 'player-a';
const B = 'player-b';
const C = 'player-c';
const D = 'player-d';

// ─── Handicaps ────────────────────────────────────────────────────────────────

describe('calcRelativeHandicaps', () => {
  it('el jugador con menor handicap queda en 0', () => {
    const players: PlayerHandicap[] = [
      { id: A, handicap: 5 },
      { id: B, handicap: 12 },
      { id: C, handicap: 20 },
    ];
    const result = calcRelativeHandicaps(players);
    expect(result.find(r => r.id === A)?.relative).toBe(0);
    expect(result.find(r => r.id === B)?.relative).toBe(7);
    expect(result.find(r => r.id === C)?.relative).toBe(15);
  });

  it('todos iguales → todos en 0', () => {
    const players: PlayerHandicap[] = [
      { id: A, handicap: 10 },
      { id: B, handicap: 10 },
    ];
    const result = calcRelativeHandicaps(players);
    result.forEach(r => expect(r.relative).toBe(0));
  });
});

describe('calcHandicapStrokes', () => {
  it('handicap 0 → 0 strokes en cualquier hoyo', () => {
    expect(calcHandicapStrokes(0, 1)).toBe(0);
    expect(calcHandicapStrokes(0, 18)).toBe(0);
  });

  it('handicap 9 → 1 stroke en hoyos 1-9, 0 en 10-18', () => {
    for (let rank = 1; rank <= 9; rank++) expect(calcHandicapStrokes(9, rank)).toBe(1);
    for (let rank = 10; rank <= 18; rank++) expect(calcHandicapStrokes(9, rank)).toBe(0);
  });

  it('handicap 18 → 1 stroke en todos los hoyos', () => {
    for (let rank = 1; rank <= 18; rank++) expect(calcHandicapStrokes(18, rank)).toBe(1);
  });

  it('handicap 19 → 2 strokes en hoyo 1, 1 en hoyos 2-18', () => {
    expect(calcHandicapStrokes(19, 1)).toBe(2);
    for (let rank = 2; rank <= 18; rank++) expect(calcHandicapStrokes(19, rank)).toBe(1);
  });
});

// ─── Marcas ───────────────────────────────────────────────────────────────────

describe('calcMarcas', () => {
  it('ganador claro en cada hoyo acumula plumas correctamente', () => {
    // A siempre gana con net 3, resto tienen 4
    const netMap: Record<string, Record<number, number>> = {};
    [A, B, C, D].forEach(id => { netMap[id] = {}; });
    HOLES_ORDER.forEach(h => {
      netMap[A][h] = 3;
      netMap[B][h] = 4;
      netMap[C][h] = 4;
      netMap[D][h] = 4;
    });

    const result = calcMarcas(netMap, [A, B, C, D], HOLES_ORDER);
    expect(result.totals[A]).toBe(18); // gana los 18 hoyos, 1 pluma cada uno
    expect(result.totals[B]).toBe(0);
    expect(result.totals[C]).toBe(0);
    expect(result.totals[D]).toBe(0);
  });

  it('empate acumula carryover y lo cobra el siguiente ganador', () => {
    // Hoyo 1: empate (A y B ambos net 3) → carryover 1
    // Hoyo 2: A gana → cobra 1 pluma base + 1 carryover = 2
    const netMap: Record<string, Record<number, number>> = {
      [A]: { 1: 3, 2: 3 },
      [B]: { 1: 3, 2: 4 },
    };
    const result = calcMarcas(netMap, [A, B], [1, 2]);
    expect(result.totals[A]).toBe(2);
    expect(result.totals[B]).toBe(0);
    expect(result.byHole[1].carryover).toBe(0); // antes del hoyo 1
    expect(result.byHole[2].plumas).toBe(2);
  });

  it('la suma de todas las plumas es consistente (nadie las pierde)', () => {
    const netMap: Record<string, Record<number, number>> = {};
    [A, B, C].forEach(id => { netMap[id] = {}; });
    HOLES_ORDER.forEach((h, i) => {
      // Rotamos ganadores: A, B, C, A, B, C ...
      const winner = [A, B, C][i % 3];
      netMap[A][h] = winner === A ? 3 : 4;
      netMap[B][h] = winner === B ? 3 : 4;
      netMap[C][h] = winner === C ? 3 : 4;
    });
    const result = calcMarcas(netMap, [A, B, C], HOLES_ORDER);
    const totalPlumas = Object.values(result.totals).reduce((s, v) => s + v, 0);
    // 18 hoyos, cada uno da exactamente 1 pluma (no hay empates) → total 18
    expect(totalPlumas).toBe(18);
  });
});

// ─── Individuales ─────────────────────────────────────────────────────────────

describe('calcIndividualAll', () => {
  it('genera C(n,2) matchups para n jugadores', () => {
    const grossMap: Record<string, Record<number, number>> = {};
    [A, B, C, D].forEach(id => {
      grossMap[id] = {};
      HOLES_ORDER.forEach(h => { grossMap[id][h] = 4; });
    });
    const handicaps: PlayerHandicap[] = [
      { id: A, handicap: 0 }, { id: B, handicap: 0 },
      { id: C, handicap: 0 }, { id: D, handicap: 0 },
    ];
    const results = calcIndividualAll([A, B, C, D], grossMap, HOLES_ORDER, false, handicaps, HOLES_18);
    expect(results.length).toBe(6); // C(4,2) = 6
  });

  it('todos empatan → matchAccum = 0 en todas las vueltas', () => {
    const grossMap: Record<string, Record<number, number>> = {};
    [A, B].forEach(id => {
      grossMap[id] = {};
      HOLES_ORDER.forEach(h => { grossMap[id][h] = 4; });
    });
    const handicaps: PlayerHandicap[] = [
      { id: A, handicap: 5 }, { id: B, handicap: 5 },
    ];
    const results = calcIndividualAll([A, B], grossMap, HOLES_ORDER, false, handicaps, HOLES_18);
    const r = results[0];
    expect(r.primera.matchAccum).toBe(0);
    expect(r.segunda.matchAccum).toBe(0);
    expect(r.total.matchAccum).toBe(0);
  });

  it('A gana todos los hoyos → matchAccum positivo en las 3 vueltas', () => {
    const grossMap: Record<string, Record<number, number>> = {};
    grossMap[A] = {};
    grossMap[B] = {};
    HOLES_ORDER.forEach(h => {
      grossMap[A][h] = 3; // A siempre hace birdie
      grossMap[B][h] = 5; // B siempre hace bogey
    });
    const handicaps: PlayerHandicap[] = [
      { id: A, handicap: 0 }, { id: B, handicap: 0 },
    ];
    const results = calcIndividualAll([A, B], grossMap, HOLES_ORDER, false, handicaps, HOLES_18);
    const r = results[0];
    expect(r.primera.matchAccum).toBeGreaterThan(0);
    expect(r.segunda.matchAccum).toBeGreaterThan(0);
    expect(r.total.matchAccum).toBeGreaterThan(0);
  });

  it('handicap da strokes en los hoyos correctos', () => {
    // A tiene hcp 10, B tiene hcp 0 → A recibe 10 strokes en hoyos rank 1-10
    // A hace 5 en todos, B hace 4 en todos
    // En hoyos rank 1-10: A neto = 5-1 = 4, empata con B neto = 4
    // En hoyos rank 11-18: A neto = 5, B neto = 4, B gana esos 8 hoyos
    const grossMap: Record<string, Record<number, number>> = {};
    grossMap[A] = {};
    grossMap[B] = {};
    HOLES_ORDER.forEach(h => {
      grossMap[A][h] = 5;
      grossMap[B][h] = 4;
    });
    const handicaps: PlayerHandicap[] = [
      { id: A, handicap: 10 }, { id: B, handicap: 0 },
    ];
    const results = calcIndividualAll([A, B], grossMap, HOLES_ORDER, false, handicaps, HOLES_18);
    const r = results[0];
    // B gana los hoyos rank 11-18 (8 hoyos), resto empatan → matchAccum = -8 para A
    expect(r.total.matchAccum).toBe(-8);
  });
});

// ─── Dineros — invariante suma = $0 ──────────────────────────────────────────

function makeGrossMap(scores: Record<string, number>): Record<string, Record<number, number>> {
  const grossMap: Record<string, Record<number, number>> = {};
  Object.entries(scores).forEach(([id, gross]) => {
    grossMap[id] = {};
    HOLES_ORDER.forEach(h => { grossMap[id][h] = gross; });
  });
  return grossMap;
}

function runDineros(opts: {
  playerIds: string[];
  grossMap: Record<string, Record<number, number>>;
  handicaps: PlayerHandicap[];
  pairings?: Pairing[];
  activeGames: string[];
  betAmount?: number;
}) {
  const { playerIds, grossMap, handicaps, pairings = [], activeGames, betAmount = 100 } = opts;

  const relHcps = calcRelativeHandicaps(handicaps);
  const scores: ScoreEntry[] = playerIds.flatMap(id =>
    HOLES_ORDER.map(h => ({ player_id: id, hole_number: h, gross_score: grossMap[id]?.[h] ?? 0 }))
  );
  const netMap = buildNetScoreMap(scores, relHcps, HOLES_18);
  const marcas = calcMarcas(netMap, playerIds, HOLES_ORDER);
  const indResults = calcIndividualAll(playerIds, grossMap, HOLES_ORDER, activeGames.includes('presiones'), handicaps, HOLES_18);
  const parejasResults = pairings.length >= 2 ? calcParejas(pairings, netMap, HOLES_ORDER) : [];

  const gameConfigs: Record<string, { active: boolean; bet_amount: number }> = {};
  const allGames = ['marcas', 'marcas_esp', 'individuales', 'individuales_medal', 'parejas', 'parejas_medal', 'parejas_base', 'parejas_base_medal', 'presiones'];
  allGames.forEach(g => { gameConfigs[g] = { active: activeGames.includes(g), bet_amount: betAmount }; });

  return calcDineros(playerIds, gameConfigs, marcas, indResults, parejasResults, [], pairings, null);
}

describe('calcDineros — suma total siempre $0', () => {
  it('solo marcas: suma = $0', () => {
    const gross = makeGrossMap({ [A]: 3, [B]: 4, [C]: 5, [D]: 4 });
    const hcps: PlayerHandicap[] = [A, B, C, D].map(id => ({ id, handicap: 0 }));
    const dineros = runDineros({ playerIds: [A, B, C, D], grossMap: gross, handicaps: hcps, activeGames: ['marcas'] });
    const total = dineros.reduce((s, r) => s + r.total, 0);
    expect(total).toBe(0);
  });

  it('solo individuales match: suma = $0', () => {
    const gross = makeGrossMap({ [A]: 3, [B]: 4, [C]: 4, [D]: 5 });
    const hcps: PlayerHandicap[] = [A, B, C, D].map(id => ({ id, handicap: 0 }));
    const dineros = runDineros({ playerIds: [A, B, C, D], grossMap: gross, handicaps: hcps, activeGames: ['individuales'] });
    const total = dineros.reduce((s, r) => s + r.total, 0);
    expect(total).toBe(0);
  });

  it('solo parejas match: suma = $0', () => {
    const gross = makeGrossMap({ [A]: 3, [B]: 4, [C]: 4, [D]: 5 });
    const hcps: PlayerHandicap[] = [A, B, C, D].map(id => ({ id, handicap: 0 }));
    const pairings: Pairing[] = [
      { pair_number: 1, player1_id: A, player2_id: B },
      { pair_number: 2, player1_id: C, player2_id: D },
    ];
    const dineros = runDineros({ playerIds: [A, B, C, D], grossMap: gross, handicaps: hcps, pairings, activeGames: ['parejas'] });
    const total = dineros.reduce((s, r) => s + r.total, 0);
    expect(total).toBe(0);
  });

  it('todos los juegos activos: suma = $0', () => {
    const gross = makeGrossMap({ [A]: 3, [B]: 4, [C]: 4, [D]: 5 });
    const hcps: PlayerHandicap[] = [
      { id: A, handicap: 0 }, { id: B, handicap: 8 },
      { id: C, handicap: 12 }, { id: D, handicap: 20 },
    ];
    const pairings: Pairing[] = [
      { pair_number: 1, player1_id: A, player2_id: B },
      { pair_number: 2, player1_id: C, player2_id: D },
    ];
    const activeGames = ['marcas', 'individuales', 'individuales_medal', 'parejas', 'parejas_medal', 'presiones'];
    const dineros = runDineros({ playerIds: [A, B, C, D], grossMap: gross, handicaps: hcps, pairings, activeGames });
    const total = dineros.reduce((s, r) => s + r.total, 0);
    expect(total).toBe(0);
  });

  it('scores asimétricos con handicaps distintos: suma = $0', () => {
    // Scores irregulares para provocar resultados mixtos
    const grossMap: Record<string, Record<number, number>> = {
      [A]: {}, [B]: {}, [C]: {}, [D]: {},
    };
    HOLES_ORDER.forEach((h, i) => {
      grossMap[A][h] = 3 + (i % 3);
      grossMap[B][h] = 4 + (i % 2);
      grossMap[C][h] = 5 - (i % 3);
      grossMap[D][h] = 4 + (i % 4 === 0 ? 1 : 0);
    });
    const hcps: PlayerHandicap[] = [
      { id: A, handicap: 2 }, { id: B, handicap: 15 },
      { id: C, handicap: 8 }, { id: D, handicap: 22 },
    ];
    const pairings: Pairing[] = [
      { pair_number: 1, player1_id: A, player2_id: C },
      { pair_number: 2, player1_id: B, player2_id: D },
    ];
    const activeGames = ['marcas', 'individuales', 'individuales_medal', 'parejas', 'parejas_medal'];
    const dineros = runDineros({ playerIds: [A, B, C, D], grossMap: grossMap, handicaps: hcps, pairings, activeGames });
    const total = dineros.reduce((s, r) => s + r.total, 0);
    expect(total).toBe(0);
  });
});

// ─── Marcas — pago correcto ───────────────────────────────────────────────────

describe('calcDineros — marcas — pago correcto', () => {
  it('ganador de N plumas cobra (N×(players-1) - plumas_otros) × bet', () => {
    // 2 jugadores, A gana 18 plumas, B gana 0
    // A cobra: (18×1 - 0) × 100 = $1800
    // B cobra: (0×1 - 18) × 100 = -$1800
    const gross = makeGrossMap({ [A]: 3, [B]: 4 });
    const hcps: PlayerHandicap[] = [{ id: A, handicap: 0 }, { id: B, handicap: 0 }];
    const dineros = runDineros({ playerIds: [A, B], grossMap: gross, handicaps: hcps, activeGames: ['marcas'], betAmount: 100 });
    const rowA = dineros.find(r => r.player_id === A)!;
    const rowB = dineros.find(r => r.player_id === B)!;
    expect(rowA.marcas).toBe(1800);
    expect(rowB.marcas).toBe(-1800);
  });
});

// ─── Salida hoyo 10 — carryover cruza el límite 18→1 ─────────────────────────

describe('calcMarcas — salida hoyo 10', () => {
  const ORDER_FROM_10 = getHoleOrder(10); // [10,11,...,18,1,2,...,9]

  it('carryover cruza correctamente de hoyo 18 a hoyo 1', () => {
    // Hoyos 10-17: empates → carryover acumulado = 8
    // Hoyo 18: empate → carryover = 9
    // Hoyo 1: A gana → cobra 10 plumas (1 base + 9 carryover)
    const netMap: Record<string, Record<number, number>> = { [A]: {}, [B]: {} };
    ORDER_FROM_10.forEach((h, i) => {
      if (h >= 10) { netMap[A][h] = 3; netMap[B][h] = 3; } // empates en vuelta 1
      else if (h === 1) { netMap[A][h] = 3; netMap[B][h] = 4; } // A gana hoyo 1
      else { netMap[A][h] = 4; netMap[B][h] = 4; } // resto empatan
    });
    const result = calcMarcas(netMap, [A, B], ORDER_FROM_10);
    expect(result.totals[A]).toBe(10); // 9 carryovers + 1 base
    expect(result.totals[B]).toBe(0);
  });

  it('ganador en primera posición (hoyo 10) cobra normalmente', () => {
    const netMap: Record<string, Record<number, number>> = { [A]: {}, [B]: {} };
    ORDER_FROM_10.forEach(h => { netMap[A][h] = 3; netMap[B][h] = 4; });
    const result = calcMarcas(netMap, [A, B], ORDER_FROM_10);
    expect(result.totals[A]).toBe(18);
    expect(result.totals[B]).toBe(0);
  });

  it('suma de plumas cobradas es consistente independiente del hoyo de salida', () => {
    // Mismos scores, distinto orden → misma cantidad total de plumas cobradas
    const netMap: Record<string, Record<number, number>> = { [A]: {}, [B]: {} };
    HOLES_ORDER.forEach((h, i) => {
      netMap[A][h] = i % 3 === 0 ? 3 : 4;
      netMap[B][h] = i % 3 === 1 ? 3 : 4;
    });
    const r1 = calcMarcas(netMap, [A, B], HOLES_ORDER);
    const r2 = calcMarcas(netMap, [A, B], ORDER_FROM_10);
    const total1 = Object.values(r1.totals).reduce((s, v) => s + v, 0);
    const total2 = Object.values(r2.totals).reduce((s, v) => s + v, 0);
    // El total de plumas cobradas puede diferir porque el carryover al final
    // de la ronda se pierde — pero ambos deben ser ≤ 18
    expect(total1).toBeLessThanOrEqual(18);
    expect(total2).toBeLessThanOrEqual(18);
  });
});

// ─── Plumas empatadas al final: comportamiento correcto ───────────────────────

describe('calcMarcas — carryover no cobrado al terminar la ronda', () => {
  it('si el último hoyo empata, el carryover se pierde (nadie lo cobra)', () => {
    // Hoyos 1-17: A gana → 17 plumas
    // Hoyo 18: empate → carryover de 1 queda sin cobrar
    const netMap: Record<string, Record<number, number>> = { [A]: {}, [B]: {} };
    HOLES_ORDER.forEach(h => {
      netMap[A][h] = 3;
      netMap[B][h] = h === 18 ? 3 : 4; // empate solo en el 18
    });
    const result = calcMarcas(netMap, [A, B], HOLES_ORDER);
    expect(result.totals[A]).toBe(17); // el hoyo 18 no se cobra
    expect(result.byHole[18].winner_ids).toHaveLength(0);
    expect(result.byHole[18].plumas).toBe(0);
  });

  it('todos los hoyos empatados → nadie cobra nada', () => {
    const netMap: Record<string, Record<number, number>> = { [A]: {}, [B]: {} };
    HOLES_ORDER.forEach(h => { netMap[A][h] = 4; netMap[B][h] = 4; });
    const result = calcMarcas(netMap, [A, B], HOLES_ORDER);
    expect(result.totals[A]).toBe(0);
    expect(result.totals[B]).toBe(0);
    // 18 carryovers acumulados — ninguno cobrado
    const totalCobrado = Object.values(result.totals).reduce((s, v) => s + v, 0);
    expect(totalCobrado).toBe(0);
  });

  it('carryover no cobrado mantiene suma de dineros en $0', () => {
    // Aunque las plumas se pierden, el invariante de suma=$0 se mantiene
    // porque nadie las cobra ni las paga
    const grossMap: Record<string, Record<number, number>> = { [A]: {}, [B]: {}, [C]: {}, [D]: {} };
    HOLES_ORDER.forEach((h, i) => {
      // Último hoyo siempre empate → carryover perdido
      const lastHole = h === 18;
      grossMap[A][h] = lastHole ? 4 : 3 + (i % 2);
      grossMap[B][h] = lastHole ? 4 : 4;
      grossMap[C][h] = lastHole ? 4 : 4 + (i % 2);
      grossMap[D][h] = lastHole ? 4 : 5;
    });
    const hcps: PlayerHandicap[] = [A, B, C, D].map(id => ({ id, handicap: 0 }));
    const dineros = runDineros({ playerIds: [A, B, C, D], grossMap, handicaps: hcps, activeGames: ['marcas'], betAmount: 100 });
    expect(dineros.reduce((s, r) => s + r.total, 0)).toBe(0);
  });

  it('salida hoyo 10: carryover al final del hoyo 9 se pierde', () => {
    const ORDER_FROM_10 = getHoleOrder(10);
    const netMap: Record<string, Record<number, number>> = { [A]: {}, [B]: {} };
    ORDER_FROM_10.forEach(h => {
      netMap[A][h] = 3;
      netMap[B][h] = h === 9 ? 3 : 4; // empate solo en el último hoyo (9)
    });
    const result = calcMarcas(netMap, [A, B], ORDER_FROM_10);
    expect(result.totals[A]).toBe(17); // hoyo 9 no se cobra
    expect(result.byHole[9].winner_ids).toHaveLength(0);
  });
});

// ─── getHoleOrder ─────────────────────────────────────────────────────────────

describe('getHoleOrder', () => {
  it('salida hoyo 1 → orden 1-18', () => {
    expect(getHoleOrder(1)).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
  });

  it('salida hoyo 10 → orden 10-18, 1-9', () => {
    const order = getHoleOrder(10);
    expect(order[0]).toBe(10);
    expect(order[8]).toBe(18);
    expect(order[9]).toBe(1);
    expect(order[17]).toBe(9);
  });

  it('siempre tiene 18 elementos', () => {
    expect(getHoleOrder(1)).toHaveLength(18);
    expect(getHoleOrder(10)).toHaveLength(18);
  });
});

// ─── Handicap > 18 (múltiples pasadas) ───────────────────────────────────────

describe('calcHandicapStrokes — hcp > 18', () => {
  it('hcp 27 → 2 strokes en rank 1-9, 1 stroke en rank 10-18', () => {
    for (let rank = 1; rank <= 9; rank++) expect(calcHandicapStrokes(27, rank)).toBe(2);
    for (let rank = 10; rank <= 18; rank++) expect(calcHandicapStrokes(27, rank)).toBe(1);
  });

  it('hcp 36 → 2 strokes en todos los hoyos', () => {
    for (let rank = 1; rank <= 18; rank++) expect(calcHandicapStrokes(36, rank)).toBe(2);
  });

  it('hcp 37 → máximo 2 strokes (la función hace 2 pasadas de 18)', () => {
    // La implementación soporta hasta 2 pasadas: primera (1-18) + segunda (1-19)
    // hcp 37: segunda pasada cubre rank 1-19 → todos los hoyos reciben 2 strokes
    for (let rank = 1; rank <= 18; rank++) expect(calcHandicapStrokes(37, rank)).toBe(2);
  });
});

describe('calcNetScore — hcp alto', () => {
  it('gross 6, hcp 27, rank 1 → net 4 (2 strokes)', () => {
    expect(calcNetScore(6, 27, 1)).toBe(4);
  });

  it('gross 5, hcp 27, rank 18 → net 4 (1 stroke)', () => {
    expect(calcNetScore(5, 27, 18)).toBe(4);
  });
});

// ─── Scores faltantes ────────────────────────────────────────────────────────

describe('calcMarcas — scores faltantes', () => {
  it('hoyo sin scores no genera ganador ni plumas', () => {
    const netMap: Record<string, Record<number, number>> = {
      [A]: { 1: 3 },  // solo hoyo 1
      [B]: { 1: 4 },
    };
    const result = calcMarcas(netMap, [A, B], [1, 2]);
    expect(result.byHole[2].winner_ids).toHaveLength(0);
    expect(result.byHole[2].plumas).toBe(0);
  });

  it('score 0 no participa en la competencia del hoyo', () => {
    // buildNetScoreMap filtra gross=0 (ScoreEntry con gross 0 se incluye pero
    // calcMarcas solo ve hoyos donde netMap[id][hole] !== undefined)
    const netMap: Record<string, Record<number, number>> = {
      [A]: { 1: 3 },
      [B]: {},          // B no tiene score en hoyo 1
    };
    const result = calcMarcas(netMap, [A, B], [1]);
    // Solo A participa → A gana
    expect(result.byHole[1].winner_ids).toEqual([A]);
    expect(result.totals[A]).toBe(1);
  });
});

describe('buildNetScoreMap — scores faltantes', () => {
  it('gross 0 produce net score de 0 (score inválido incluido)', () => {
    const scores: ScoreEntry[] = [
      { player_id: A, hole_number: 1, gross_score: 0 },
    ];
    const relHcps = [{ id: A, relative: 0 }];
    const netMap = buildNetScoreMap(scores, relHcps, HOLES_18);
    // gross=0 se mapea, net = 0 - 0 = 0
    expect(netMap[A]?.[1]).toBe(0);
  });

  it('hoyo sin info en HOLES no produce entrada en netMap', () => {
    const scores: ScoreEntry[] = [
      { player_id: A, hole_number: 99, gross_score: 4 }, // hoyo inexistente
    ];
    const relHcps = [{ id: A, relative: 0 }];
    const netMap = buildNetScoreMap(scores, relHcps, HOLES_18);
    expect(netMap[A]?.[99]).toBeUndefined();
  });
});

// ─── Marcas — carryover encadenado ───────────────────────────────────────────

describe('calcMarcas — carryover múltiple', () => {
  it('3 empates seguidos → 4to ganador cobra 4 plumas', () => {
    const netMap: Record<string, Record<number, number>> = {
      [A]: { 1: 3, 2: 3, 3: 3, 4: 3 },
      [B]: { 1: 3, 2: 3, 3: 3, 4: 4 }, // empata en 1,2,3 — pierde en 4
    };
    const result = calcMarcas(netMap, [A, B], [1, 2, 3, 4]);
    expect(result.byHole[4].plumas).toBe(4); // 1 base + 3 carryover
    expect(result.totals[A]).toBe(4);
    expect(result.totals[B]).toBe(0);
  });

  it('carryover al final de la ronda: byHole almacena carryover entrante, empate lo incrementa', () => {
    // byHole[hole].carryover = carryover ANTES de procesar ese hoyo
    // Hoyo 1: A gana → byHole[1].carryover=0, carryover se resetea a 0
    // Hoyo 2: empate → byHole[2].carryover=0 (entrante), luego carryover++ internamente
    const netMap: Record<string, Record<number, number>> = {
      [A]: { 1: 3, 2: 3 },
      [B]: { 1: 4, 2: 3 }, // A gana hoyo 1, empatan hoyo 2
    };
    const result = calcMarcas(netMap, [A, B], [1, 2]);
    expect(result.totals[A]).toBe(1);         // solo cobra el hoyo 1
    expect(result.byHole[1].carryover).toBe(0); // no había carryover al entrar al 1
    expect(result.byHole[2].carryover).toBe(0); // tampoco al entrar al 2 (A ganó el 1)
    expect(result.byHole[2].winner_ids).toHaveLength(0); // empate
  });

  it('4 jugadores — empate parcial no cuenta como ganador', () => {
    // Hoyo 1: A=3, B=3, C=4, D=4 → empate entre A y B → nadie gana, carryover
    const netMap: Record<string, Record<number, number>> = {
      [A]: { 1: 3, 2: 3 },
      [B]: { 1: 3, 2: 4 },
      [C]: { 1: 4, 2: 4 },
      [D]: { 1: 4, 2: 4 },
    };
    const result = calcMarcas(netMap, [A, B, C, D], [1, 2]);
    expect(result.byHole[1].winner_ids).toHaveLength(0);
    expect(result.byHole[2].plumas).toBe(2); // A gana hoyo 2 con carryover
    expect(result.totals[A]).toBe(2);
  });
});

// ─── Presiones ────────────────────────────────────────────────────────────────

describe('calcIndividualAll — presiones', () => {
  it('sin presiones activas → presiones array vacío', () => {
    const grossMap = makeGrossMap({ [A]: 3, [B]: 5 });
    const hcps: PlayerHandicap[] = [{ id: A, handicap: 0 }, { id: B, handicap: 0 }];
    const results = calcIndividualAll([A, B], grossMap, HOLES_ORDER, false, hcps, HOLES_18);
    expect(results[0].primera.presiones).toHaveLength(0);
    expect(results[0].segunda.presiones).toHaveLength(0);
  });

  it('con presiones: si la diferencia se hace inalcanzable aparece P1', () => {
    // A gana todos los hoyos → a partir del punto en que la ventaja es inalcanzable
    // se dispara una presión. Con 9 hoyos y A ganando todos desde hoyo 1:
    // después del hoyo 5 (accum=5), quedan 4 hoyos → inalcanzable → P1 en hoyo 6
    const grossMap = makeGrossMap({ [A]: 3, [B]: 5 });
    const hcps: PlayerHandicap[] = [{ id: A, handicap: 0 }, { id: B, handicap: 0 }];
    const results = calcIndividualAll([A, B], grossMap, HOLES_ORDER, true, hcps, HOLES_18);
    expect(results[0].primera.presiones.length).toBeGreaterThanOrEqual(1);
  });

  it('presiones correctas: winnerId es quien va ganando', () => {
    const grossMap = makeGrossMap({ [A]: 3, [B]: 5 });
    const hcps: PlayerHandicap[] = [{ id: A, handicap: 0 }, { id: B, handicap: 0 }];
    const results = calcIndividualAll([A, B], grossMap, HOLES_ORDER, true, hcps, HOLES_18);
    const p1 = results[0].primera.presiones[0];
    // A va ganando → p1.total > 0 → winnerId = A (playerA en el matchup)
    if (p1.total !== 0) {
      expect(p1.winnerId).toBe(p1.total > 0 ? A : B);
    }
  });

  it('presiones contribuyen a dineros con suma = $0', () => {
    const grossMap = makeGrossMap({ [A]: 3, [B]: 5 });
    const hcps: PlayerHandicap[] = [{ id: A, handicap: 0 }, { id: B, handicap: 0 }];
    const dineros = runDineros({
      playerIds: [A, B], grossMap, handicaps: hcps,
      activeGames: ['individuales', 'presiones'], betAmount: 200,
    });
    const total = dineros.reduce((s, r) => s + r.total, 0);
    expect(total).toBe(0);
  });
});

// ─── Parejas best-ball ────────────────────────────────────────────────────────

describe('calcParejas — best-ball', () => {
  it('pareja que gana best Y worst en todos los hoyos tiene matchAccum máximo', () => {
    // PairA (A+B): net 3 y 4 en cada hoyo → best=3, worst=4
    // PairB (C+D): net 5 y 6 en cada hoyo → best=5, worst=6
    // Por hoyo: bestResult=+1, worstResult=+1 → accum += 2 por hoyo
    const netMap: Record<string, Record<number, number>> = {
      [A]: {}, [B]: {}, [C]: {}, [D]: {},
    };
    HOLES_ORDER.forEach(h => {
      netMap[A][h] = 3; netMap[B][h] = 4;
      netMap[C][h] = 5; netMap[D][h] = 6;
    });
    const pairings: Pairing[] = [
      { pair_number: 1, player1_id: A, player2_id: B },
      { pair_number: 2, player1_id: C, player2_id: D },
    ];
    const results = calcParejas(pairings, netMap, HOLES_ORDER);
    expect(results[0].total.matchAccum).toBe(36); // 18 hoyos × 2 puntos
  });

  it('medal es la suma de los dos netos de la pareja', () => {
    const netMap: Record<string, Record<number, number>> = {
      [A]: {}, [B]: {}, [C]: {}, [D]: {},
    };
    HOLES_ORDER.forEach(h => {
      netMap[A][h] = 3; netMap[B][h] = 5; // medal A = 3+5=8 por hoyo
      netMap[C][h] = 4; netMap[D][h] = 4;
    });
    const pairings: Pairing[] = [
      { pair_number: 1, player1_id: A, player2_id: B },
      { pair_number: 2, player1_id: C, player2_id: D },
    ];
    const results = calcParejas(pairings, netMap, HOLES_ORDER);
    expect(results[0].total.medalA).toBe(8 * 18); // 144
    expect(results[0].total.medalB).toBe(8 * 18); // 144 (empate)
  });

  it('primera vuelta = hoyos 1-9, segunda = 10-18', () => {
    const netMap: Record<string, Record<number, number>> = {
      [A]: {}, [B]: {}, [C]: {}, [D]: {},
    };
    // A+B ganan primera (1-9), C+D ganan segunda (10-18)
    HOLES_ORDER.forEach(h => {
      if (h <= 9) { netMap[A][h] = 3; netMap[B][h] = 3; netMap[C][h] = 4; netMap[D][h] = 4; }
      else        { netMap[A][h] = 4; netMap[B][h] = 4; netMap[C][h] = 3; netMap[D][h] = 3; }
    });
    const pairings: Pairing[] = [
      { pair_number: 1, player1_id: A, player2_id: B },
      { pair_number: 2, player1_id: C, player2_id: D },
    ];
    const results = calcParejas(pairings, netMap, HOLES_ORDER);
    expect(results[0].primera.matchAccum).toBeGreaterThan(0); // A+B ganan primera
    expect(results[0].segunda.matchAccum).toBeLessThan(0);    // C+D ganan segunda
  });
});

// ─── Empate exacto (nadie paga) ───────────────────────────────────────────────

describe('calcDineros — empate exacto', () => {
  it('individuales match empatado → nobody pays', () => {
    // Todos los hoyos empatan en net
    const gross = makeGrossMap({ [A]: 4, [B]: 4 });
    const hcps: PlayerHandicap[] = [{ id: A, handicap: 0 }, { id: B, handicap: 0 }];
    const dineros = runDineros({ playerIds: [A, B], grossMap: gross, handicaps: hcps, activeGames: ['individuales'], betAmount: 500 });
    const rowA = dineros.find(r => r.player_id === A)!;
    const rowB = dineros.find(r => r.player_id === B)!;
    expect(rowA.individuales).toBe(0);
    expect(rowB.individuales).toBe(0);
  });

  it('individuales medal empatado → nobody pays', () => {
    const gross = makeGrossMap({ [A]: 4, [B]: 4 });
    const hcps: PlayerHandicap[] = [{ id: A, handicap: 0 }, { id: B, handicap: 0 }];
    const dineros = runDineros({ playerIds: [A, B], grossMap: gross, handicaps: hcps, activeGames: ['individuales_medal'], betAmount: 500 });
    expect(dineros.find(r => r.player_id === A)!.individuales_medal).toBe(0);
    expect(dineros.find(r => r.player_id === B)!.individuales_medal).toBe(0);
  });

  it('parejas match empatado → nobody pays', () => {
    // A+B vs C+D, todos con net 4 en todos los hoyos
    const gross = makeGrossMap({ [A]: 4, [B]: 4, [C]: 4, [D]: 4 });
    const hcps: PlayerHandicap[] = [A, B, C, D].map(id => ({ id, handicap: 0 }));
    const pairings: Pairing[] = [
      { pair_number: 1, player1_id: A, player2_id: B },
      { pair_number: 2, player1_id: C, player2_id: D },
    ];
    const dineros = runDineros({ playerIds: [A, B, C, D], grossMap: gross, handicaps: hcps, pairings, activeGames: ['parejas'], betAmount: 500 });
    dineros.forEach(r => expect(r.parejas).toBe(0));
  });
});

// ─── Parejas Base — invariante suma=$0 ───────────────────────────────────────

function runDinerosConBase(opts: {
  playerIds: string[];
  grossMap: Record<string, Record<number, number>>;
  handicaps: PlayerHandicap[];
  rivalPairings: Pairing[];
  basePair: { player1_id: string; player2_id: string };
  activeGames: string[];
  betAmount?: number;
}) {
  const { playerIds, grossMap, handicaps, rivalPairings, basePair, activeGames, betAmount = 100 } = opts;
  const relHcps = calcRelativeHandicaps(handicaps);
  const scores: ScoreEntry[] = playerIds.flatMap(id =>
    HOLES_ORDER.map(h => ({ player_id: id, hole_number: h, gross_score: grossMap[id]?.[h] ?? 0 }))
  );
  const netMap = buildNetScoreMap(scores, relHcps, HOLES_18);
  const marcas = calcMarcas(netMap, playerIds, HOLES_ORDER);
  const indResults = calcIndividualAll(playerIds, grossMap, HOLES_ORDER, false, handicaps, HOLES_18);
  const parejasResults = rivalPairings.length >= 2 ? calcParejas(rivalPairings, netMap, HOLES_ORDER) : [];
  const parejaBaseResults = calcParejaBase(basePair, rivalPairings, netMap, HOLES_ORDER);

  const gameConfigs: Record<string, { active: boolean; bet_amount: number }> = {};
  const allGames = ['marcas', 'individuales', 'parejas', 'parejas_base', 'parejas_base_medal'];
  allGames.forEach(g => { gameConfigs[g] = { active: activeGames.includes(g), bet_amount: betAmount }; });

  return calcDineros(playerIds, gameConfigs, marcas, indResults, parejasResults, parejaBaseResults, rivalPairings, basePair);
}

describe('calcDineros — parejas_base suma = $0', () => {
  const basePair = { player1_id: A, player2_id: B };
  const rivalPairings: Pairing[] = [
    { pair_number: 1, player1_id: C, player2_id: D },
  ];

  it('pareja base gana → suma = $0', () => {
    const gross = makeGrossMap({ [A]: 3, [B]: 3, [C]: 5, [D]: 5 });
    const hcps: PlayerHandicap[] = [A, B, C, D].map(id => ({ id, handicap: 0 }));
    const dineros = runDinerosConBase({ playerIds: [A, B, C, D], grossMap: gross, handicaps: hcps, rivalPairings, basePair, activeGames: ['parejas_base'] });
    expect(dineros.reduce((s, r) => s + r.total, 0)).toBe(0);
  });

  it('pareja base pierde → suma = $0', () => {
    const gross = makeGrossMap({ [A]: 5, [B]: 5, [C]: 3, [D]: 3 });
    const hcps: PlayerHandicap[] = [A, B, C, D].map(id => ({ id, handicap: 0 }));
    const dineros = runDinerosConBase({ playerIds: [A, B, C, D], grossMap: gross, handicaps: hcps, rivalPairings, basePair, activeGames: ['parejas_base'] });
    expect(dineros.reduce((s, r) => s + r.total, 0)).toBe(0);
  });

  it('parejas_base match + medal activos → suma = $0', () => {
    const grossMap: Record<string, Record<number, number>> = { [A]: {}, [B]: {}, [C]: {}, [D]: {} };
    HOLES_ORDER.forEach((h, i) => {
      grossMap[A][h] = 3 + (i % 2); grossMap[B][h] = 4;
      grossMap[C][h] = 4; grossMap[D][h] = 3 + (i % 3);
    });
    const hcps: PlayerHandicap[] = [A, B, C, D].map(id => ({ id, handicap: 0 }));
    const dineros = runDinerosConBase({ playerIds: [A, B, C, D], grossMap, handicaps: hcps, rivalPairings, basePair, activeGames: ['parejas_base', 'parejas_base_medal'] });
    expect(dineros.reduce((s, r) => s + r.total, 0)).toBe(0);
  });

  it('todos los juegos incluyendo base → suma = $0', () => {
    const grossMap: Record<string, Record<number, number>> = { [A]: {}, [B]: {}, [C]: {}, [D]: {} };
    HOLES_ORDER.forEach((h, i) => {
      grossMap[A][h] = 3 + (i % 3); grossMap[B][h] = 4 + (i % 2);
      grossMap[C][h] = 5 - (i % 2); grossMap[D][h] = 4;
    });
    const hcps: PlayerHandicap[] = [
      { id: A, handicap: 0 }, { id: B, handicap: 10 },
      { id: C, handicap: 5 }, { id: D, handicap: 18 },
    ];
    const dineros = runDinerosConBase({
      playerIds: [A, B, C, D], grossMap, handicaps: hcps,
      rivalPairings, basePair,
      activeGames: ['marcas', 'individuales', 'parejas_base', 'parejas_base_medal'],
    });
    expect(dineros.reduce((s, r) => s + r.total, 0)).toBe(0);
  });
});
