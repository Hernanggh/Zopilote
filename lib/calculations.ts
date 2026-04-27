export type HoleInfo = { hole_number: number; par: number; handicap_rank: number };
export type PlayerHandicap = { id: string; handicap: number };
export type ScoreEntry = { player_id: string; hole_number: number; gross_score: number };
export type Pairing = { pair_number: number; player1_id: string; player2_id: string };

export type RelativeHandicap = { id: string; relative: number };

export type MarcasResult = {
  byHole: Record<number, { winner_ids: string[]; plumas: number; carryover: number }>;
  totals: Record<string, number>;
};

export type PresionesResult = {
  startHole: number;
  byHole: Record<number, { result: number; accum: number }>;
  total: number; // +1 = playerA won presion, -1 = playerB won, 0 = tie
  winnerId: string | null;
  loserId: string | null;
};

export type VueltaMatchResult = {
  matchAccum: number;  // + = playerA ganando
  medalA: number;      // suma netos playerA en esta vuelta
  medalB: number;
  presiones: PresionesResult[];
};

export type IndividualResult = {
  matchup: string;
  playerA: string;
  playerB: string;
  primera: VueltaMatchResult;
  segunda: VueltaMatchResult;
  total: { matchAccum: number; medalA: number; medalB: number };
};

export type VueltaParejasResult = {
  matchAccum: number;  // acumulado de (bestResult + worstResult) por hoyo
  medalA: number;      // suma netos pareja A (ambos jugadores)
  medalB: number;
};

export type ParejasMatchup = {
  pairA: number; pairB: number;
  playerA1: string; playerA2: string;
  playerB1: string; playerB2: string;
  primera: VueltaParejasResult;
  segunda: VueltaParejasResult;
  total: VueltaParejasResult;
};

export type DinerosRow = {
  player_id: string;
  marcas: number;
  marcas_esp: number;
  individuales: number;
  individuales_medal: number;
  parejas: number;
  parejas_medal: number;
  parejas_base: number;
  parejas_base_medal: number;
  presiones: number;
  total: number;
};

// ─── Handicap ────────────────────────────────────────────────────────────────

export function calcRelativeHandicaps(players: PlayerHandicap[]): RelativeHandicap[] {
  if (players.length === 0) return [];
  const min = Math.min(...players.map(p => p.handicap));
  return players.map(p => ({ id: p.id, relative: p.handicap - min }));
}

export function calcHandicapStrokes(relativeHandicap: number, holeHandicapRank: number): number {
  if (relativeHandicap <= 0) return 0;
  let strokes = 0;
  if (holeHandicapRank <= Math.min(relativeHandicap, 18)) strokes++;
  if (relativeHandicap > 18 && holeHandicapRank <= relativeHandicap - 18) strokes++;
  return strokes;
}

export function calcNetScore(gross: number, relativeHandicap: number, holeHandicapRank: number): number {
  return gross - calcHandicapStrokes(relativeHandicap, holeHandicapRank);
}

export function buildNetScoreMap(
  scores: ScoreEntry[],
  relativeHandicaps: RelativeHandicap[],
  holes: HoleInfo[]
): Record<string, Record<number, number>> {
  const hcpMap: Record<string, number> = {};
  relativeHandicaps.forEach(r => { hcpMap[r.id] = r.relative; });

  const holeMap: Record<number, HoleInfo> = {};
  holes.forEach(h => { holeMap[h.hole_number] = h; });

  const result: Record<string, Record<number, number>> = {};
  scores.forEach(s => {
    if (!result[s.player_id]) result[s.player_id] = {};
    const hole = holeMap[s.hole_number];
    if (!hole) return;
    const relHcp = hcpMap[s.player_id] ?? 0;
    result[s.player_id][s.hole_number] = calcNetScore(s.gross_score, relHcp, hole.handicap_rank);
  });
  return result;
}

// ─── Marcas / Plumas ─────────────────────────────────────────────────────────

export function calcMarcas(
  netMap: Record<string, Record<number, number>>,
  playerIds: string[],
  holeNumbers: number[]
): MarcasResult {
  const byHole: MarcasResult['byHole'] = {};
  const totals: Record<string, number> = {};
  playerIds.forEach(id => { totals[id] = 0; });

  let carryover = 0;

  for (const hole of holeNumbers) {
    const nets = playerIds
      .filter(id => netMap[id]?.[hole] !== undefined)
      .map(id => ({ id, net: netMap[id][hole] }));

    if (nets.length === 0) {
      byHole[hole] = { winner_ids: [], plumas: 0, carryover };
      continue;
    }

    const minNet = Math.min(...nets.map(n => n.net));
    const winners = nets.filter(n => n.net === minNet).map(n => n.id);

    if (winners.length === 1) {
      const plumas = 1 + carryover;
      byHole[hole] = { winner_ids: winners, plumas, carryover };
      totals[winners[0]] += plumas;
      carryover = 0;
    } else {
      byHole[hole] = { winner_ids: [], plumas: 0, carryover };
      carryover++;
    }
  }

  return { byHole, totals };
}

// ─── Individual ──────────────────────────────────────────────────────────────

function calcVuelta(
  playerA: string,
  playerB: string,
  netMap: Record<string, Record<number, number>>,
  vueltaHoles: number[],
  withPresiones: boolean
): VueltaMatchResult {
  let matchAccum = 0;
  let medalA = 0;
  let medalB = 0;

  type PresionState = {
    startHole: number;
    byHole: Record<number, { result: number; accum: number }>;
    accum: number;
  };
  let presion1: PresionState | null = null;
  let presion2: PresionState | null = null;

  for (let i = 0; i < vueltaHoles.length; i++) {
    const hole = vueltaHoles[i];
    const netA = netMap[playerA]?.[hole];
    const netB = netMap[playerB]?.[hole];
    if (netA === undefined || netB === undefined) continue;

    const holeResult = netA < netB ? 1 : netA > netB ? -1 : 0;
    matchAccum += holeResult;
    medalA += netA;
    medalB += netB;

    if (!withPresiones) continue;

    // remainingAfter = hoyos que quedan después del hoyo actual en esta vuelta
    const remainingAfter = vueltaHoles.length - 1 - i;

    // P1: se dispara cuando el líder es inalcanzable; el hoyo disparador NO cuenta en P1
    const p1JustCreated = !presion1 && remainingAfter > 0 && Math.abs(matchAccum) > remainingAfter;
    if (p1JustCreated) {
      presion1 = { startHole: hole, byHole: {}, accum: 0 };
    }

    if (presion1 && !p1JustCreated) {
      presion1.accum += holeResult;
      presion1.byHole[hole] = { result: holeResult, accum: presion1.accum };

      // P2: mismo criterio dentro del sub-partido de P1; hoyo disparador tampoco cuenta
      const p2JustCreated = !presion2 && remainingAfter > 0 && Math.abs(presion1.accum) > remainingAfter;
      if (p2JustCreated) {
        presion2 = { startHole: hole, byHole: {}, accum: 0 };
      } else if (presion2) {
        presion2.accum += holeResult;
        presion2.byHole[hole] = { result: holeResult, accum: presion2.accum };
      }
    }
  }

  const presiones: PresionesResult[] = [];
  if (presion1) {
    presiones.push({
      startHole: presion1.startHole,
      byHole: presion1.byHole,
      total: presion1.accum > 0 ? 1 : presion1.accum < 0 ? -1 : 0,
      winnerId: presion1.accum > 0 ? playerA : presion1.accum < 0 ? playerB : null,
      loserId: presion1.accum > 0 ? playerB : presion1.accum < 0 ? playerA : null,
    });
  }
  if (presion2) {
    presiones.push({
      startHole: presion2.startHole,
      byHole: presion2.byHole,
      total: presion2.accum > 0 ? 1 : presion2.accum < 0 ? -1 : 0,
      winnerId: presion2.accum > 0 ? playerA : presion2.accum < 0 ? playerB : null,
      loserId: presion2.accum > 0 ? playerB : presion2.accum < 0 ? playerA : null,
    });
  }

  return { matchAccum, medalA, medalB, presiones };
}

export function calcIndividualAll(
  playerIds: string[],
  grossMap: Record<string, Record<number, number>>,
  holeNumbers: number[],
  presionesActive: boolean,
  playerHandicaps: PlayerHandicap[],
  holes: HoleInfo[]
): IndividualResult[] {
  const primera9 = holeNumbers.slice(0, 9);
  const segunda9 = holeNumbers.slice(9);
  const results: IndividualResult[] = [];

  const hcpLookup: Record<string, number> = {};
  playerHandicaps.forEach(p => { hcpLookup[p.id] = p.handicap; });

  for (let i = 0; i < playerIds.length; i++) {
    for (let j = i + 1; j < playerIds.length; j++) {
      const pA = playerIds[i];
      const pB = playerIds[j];

      // Handicap relativo LOCAL entre estos dos jugadores
      const localHcps = calcRelativeHandicaps([
        { id: pA, handicap: hcpLookup[pA] ?? 0 },
        { id: pB, handicap: hcpLookup[pB] ?? 0 },
      ]);
      const pairScores = holeNumbers.flatMap(h => [
        { player_id: pA, hole_number: h, gross_score: grossMap[pA]?.[h] ?? 0 },
        { player_id: pB, hole_number: h, gross_score: grossMap[pB]?.[h] ?? 0 },
      ]).filter(s => s.gross_score > 0);
      const localNetMap = buildNetScoreMap(pairScores, localHcps, holes);

      const primera = calcVuelta(pA, pB, localNetMap, primera9, presionesActive);
      const segunda = calcVuelta(pA, pB, localNetMap, segunda9, presionesActive);

      // Total: sin presiones, calculado sobre los 18 hoyos
      let totalMatchAccum = 0, totalMedalA = 0, totalMedalB = 0;
      for (const hole of holeNumbers) {
        const netA = localNetMap[pA]?.[hole];
        const netB = localNetMap[pB]?.[hole];
        if (netA === undefined || netB === undefined) continue;
        totalMatchAccum += netA < netB ? 1 : netA > netB ? -1 : 0;
        totalMedalA += netA;
        totalMedalB += netB;
      }

      results.push({
        matchup: `${pA}_${pB}`,
        playerA: pA,
        playerB: pB,
        primera,
        segunda,
        total: { matchAccum: totalMatchAccum, medalA: totalMedalA, medalB: totalMedalB },
      });
    }
  }

  return results;
}

// ─── Parejas ─────────────────────────────────────────────────────────────────

function pairNetForHole(
  p1: string, p2: string,
  netMap: Record<string, Record<number, number>>,
  hole: number
): { best: number; worst: number; medal: number } | null {
  const n1 = netMap[p1]?.[hole];
  const n2 = netMap[p2]?.[hole];
  if (n1 === undefined || n2 === undefined) return null;
  return { best: Math.min(n1, n2), worst: Math.max(n1, n2), medal: n1 + n2 };
}

function calcVueltaParejas(
  pA: Pairing,
  pB: Pairing,
  netMap: Record<string, Record<number, number>>,
  vueltaHoles: number[]
): VueltaParejasResult {
  let matchAccum = 0;
  let medalA = 0;
  let medalB = 0;

  for (const hole of vueltaHoles) {
    const a = pairNetForHole(pA.player1_id, pA.player2_id, netMap, hole);
    const b = pairNetForHole(pB.player1_id, pB.player2_id, netMap, hole);
    if (!a || !b) continue;

    // Best ball + worst ball acumulados juntos (2 puntos posibles por hoyo)
    const bestResult = a.best < b.best ? 1 : a.best > b.best ? -1 : 0;
    const worstResult = a.worst < b.worst ? 1 : a.worst > b.worst ? -1 : 0;
    matchAccum += bestResult + worstResult;
    medalA += a.medal;
    medalB += b.medal;
  }

  return { matchAccum, medalA, medalB };
}

export function calcParejas(
  pairings: Pairing[],
  netMap: Record<string, Record<number, number>>,
  holeNumbers: number[]
): ParejasMatchup[] {
  const primera9 = holeNumbers.slice(0, 9);
  const segunda9 = holeNumbers.slice(9);
  const results: ParejasMatchup[] = [];

  for (let i = 0; i < pairings.length; i++) {
    for (let j = i + 1; j < pairings.length; j++) {
      const pA = pairings[i];
      const pB = pairings[j];

      results.push({
        pairA: pA.pair_number,
        pairB: pB.pair_number,
        playerA1: pA.player1_id,
        playerA2: pA.player2_id,
        playerB1: pB.player1_id,
        playerB2: pB.player2_id,
        primera: calcVueltaParejas(pA, pB, netMap, primera9),
        segunda: calcVueltaParejas(pA, pB, netMap, segunda9),
        total: calcVueltaParejas(pA, pB, netMap, holeNumbers),
      });
    }
  }

  return results;
}

export function calcParejaBase(
  basePair: { player1_id: string; player2_id: string },
  otherPairings: Pairing[],
  netMap: Record<string, Record<number, number>>,
  holeNumbers: number[]
): ParejasMatchup[] {
  const basePairing: Pairing = { pair_number: 0, player1_id: basePair.player1_id, player2_id: basePair.player2_id };
  return otherPairings.map(opp => calcParejas([basePairing, opp], netMap, holeNumbers)[0]);
}

// ─── Dineros ─────────────────────────────────────────────────────────────────

export function calcDineros(
  playerIds: string[],
  gameConfigs: Record<string, { active: boolean; bet_amount: number }>,
  marcas: MarcasResult,
  individualResults: IndividualResult[],
  parejasResults: ParejasMatchup[],
  parejaBaseResults: ParejasMatchup[],
  pairings: Pairing[],
  basePair: { player1_id: string; player2_id: string } | null
): DinerosRow[] {
  const rows: Record<string, DinerosRow> = {};
  playerIds.forEach(id => {
    rows[id] = { player_id: id, marcas: 0, marcas_esp: 0, individuales: 0, individuales_medal: 0, parejas: 0, parejas_medal: 0, parejas_base: 0, parejas_base_medal: 0, presiones: 0, total: 0 };
  });

  // Marcas (plumas por hoyo neto)
  if (gameConfigs.marcas?.active) {
    const bet = gameConfigs.marcas.bet_amount;
    const totalPlayers = playerIds.length;
    Object.entries(marcas.totals).forEach(([id, plumas]) => {
      if (!rows[id]) return;
      const totalOthers = Object.values(marcas.totals).reduce((s, v) => s + v, 0) - plumas;
      rows[id].marcas = (plumas * (totalPlayers - 1) - totalOthers) * bet;
    });
  }

  // Individuales match — 3 vueltas (primera, segunda, total)
  if (gameConfigs.individuales?.active) {
    const bet = gameConfigs.individuales.bet_amount;
    individualResults.forEach(r => {
      if (!rows[r.playerA] || !rows[r.playerB]) return;
      for (const v of [r.primera, r.segunda, r.total]) {
        const earned = v.matchAccum > 0 ? bet : v.matchAccum < 0 ? -bet : 0;
        rows[r.playerA].individuales += earned;
        rows[r.playerB].individuales -= earned;
      }
    });
  }

  // Individuales medal — 3 vueltas
  if (gameConfigs.individuales_medal?.active) {
    const bet = gameConfigs.individuales_medal.bet_amount;
    individualResults.forEach(r => {
      if (!rows[r.playerA] || !rows[r.playerB]) return;
      for (const v of [r.primera, r.segunda, r.total]) {
        const earned = v.medalA < v.medalB ? bet : v.medalA > v.medalB ? -bet : 0;
        rows[r.playerA].individuales_medal += earned;
        rows[r.playerB].individuales_medal -= earned;
      }
    });
  }

  // Presiones — solo de primera y segunda vuelta de individuales
  if (gameConfigs.presiones?.active) {
    const bet = gameConfigs.individuales?.bet_amount ?? 0;
    individualResults.forEach(r => {
      [...r.primera.presiones, ...r.segunda.presiones].forEach(p => {
        if (!p.winnerId || !p.loserId) return;
        if (rows[p.winnerId]) rows[p.winnerId].presiones += bet;
        if (rows[p.loserId]) rows[p.loserId].presiones -= bet;
      });
    });
  }

  // Parejas match — 3 vueltas
  if (gameConfigs.parejas?.active) {
    const bet = gameConfigs.parejas.bet_amount;
    parejasResults.forEach(m => {
      for (const v of [m.primera, m.segunda, m.total]) {
        const earned = v.matchAccum > 0 ? bet : v.matchAccum < 0 ? -bet : 0;
        [m.playerA1, m.playerA2].forEach(id => { if (rows[id]) rows[id].parejas += earned; });
        [m.playerB1, m.playerB2].forEach(id => { if (rows[id]) rows[id].parejas -= earned; });
      }
    });
  }

  // Parejas medal — 3 vueltas
  if (gameConfigs.parejas_medal?.active) {
    const bet = gameConfigs.parejas_medal.bet_amount;
    parejasResults.forEach(m => {
      for (const v of [m.primera, m.segunda, m.total]) {
        const earned = v.medalA < v.medalB ? bet : v.medalA > v.medalB ? -bet : 0;
        [m.playerA1, m.playerA2].forEach(id => { if (rows[id]) rows[id].parejas_medal += earned; });
        [m.playerB1, m.playerB2].forEach(id => { if (rows[id]) rows[id].parejas_medal -= earned; });
      }
    });
  }

  // Pareja Base match — 3 vueltas
  if (gameConfigs.parejas_base?.active && basePair) {
    const bet = gameConfigs.parejas_base.bet_amount;
    parejaBaseResults.forEach(m => {
      for (const v of [m.primera, m.segunda, m.total]) {
        const earned = v.matchAccum > 0 ? bet : v.matchAccum < 0 ? -bet : 0;
        [m.playerA1, m.playerA2].forEach(id => { if (rows[id]) rows[id].parejas_base += earned; });
        [m.playerB1, m.playerB2].forEach(id => { if (rows[id]) rows[id].parejas_base -= earned; });
      }
    });
  }

  // Pareja Base medal — 3 vueltas
  if (gameConfigs.parejas_base_medal?.active && basePair) {
    const bet = gameConfigs.parejas_base_medal.bet_amount;
    parejaBaseResults.forEach(m => {
      for (const v of [m.primera, m.segunda, m.total]) {
        const earned = v.medalA < v.medalB ? bet : v.medalA > v.medalB ? -bet : 0;
        [m.playerA1, m.playerA2].forEach(id => { if (rows[id]) rows[id].parejas_base_medal += earned; });
        [m.playerB1, m.playerB2].forEach(id => { if (rows[id]) rows[id].parejas_base_medal -= earned; });
      }
    });
  }

  Object.values(rows).forEach(r => {
    r.total = r.marcas + r.marcas_esp + r.individuales + r.individuales_medal + r.parejas + r.parejas_medal + r.parejas_base + r.parejas_base_medal + r.presiones;
  });

  return Object.values(rows);
}

// ─── Utility ─────────────────────────────────────────────────────────────────

export function getHoleOrder(startHole: 1 | 10, totalHoles = 18): number[] {
  const holes = Array.from({ length: totalHoles }, (_, i) => i + 1);
  if (startHole === 1) return holes;
  return [...holes.slice(9), ...holes.slice(0, 9)];
}
