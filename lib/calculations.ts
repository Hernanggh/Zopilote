export type HoleInfo = { hole_number: number; par: number; handicap_rank: number };
export type PlayerHandicap = { id: string; handicap: number };
export type ScoreEntry = { player_id: string; hole_number: number; gross_score: number };
export type Pairing = { pair_number: number; player1_id: string; player2_id: string };

export type RelativeHandicap = { id: string; relative: number };
export type NetScore = { player_id: string; hole_number: number; net: number; par: number };

export type MarcasResult = {
  byHole: Record<number, { winner_ids: string[]; plumas: number; carryover: number }>;
  totals: Record<string, number>;
};

export type MatchEntry = { hole_number: number; player_a: string; player_b: string; result: number };
export type MatchState = { accumulated: number; presion1Active: boolean; presion1Start: number; presion2Active: boolean; presion2Start: number };

export type IndividualResult = {
  matchup: string;
  playerA: string;
  playerB: string;
  byHole: Record<number, { netA: number; netB: number; matchResult: number; matchAccum: number }>;
  matchTotal: number;
  medalTotalA: number;
  medalTotalB: number;
  presiones: PresionesResult[];
};

export type PresionesResult = {
  startHole: number;
  byHole: Record<number, { result: number; accum: number }>;
  total: number;
  winnerId: string | null;
  loserId: string | null;
};

export type ParejasHoleResult = {
  bestA: number; worstA: number;
  bestB: number; worstB: number;
  bestResult: number; worstResult: number;
  bestAccum: number; worstAccum: number;
  medalA: number; medalB: number; medalAccum: number;
};

export type ParejasMatchup = {
  pairA: number; pairB: number;
  playerA1: string; playerA2: string;
  playerB1: string; playerB2: string;
  byHole: Record<number, ParejasHoleResult>;
  bestTotal: number; worstTotal: number; medalTotal: number;
  totalResult: number;
};

export type DinerosRow = {
  player_id: string;
  marcas: number;
  individuales: number;
  parejas: number;
  parejas_base: number;
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

// Build a map: player_id → net score per hole
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
    const nets: { id: string; net: number }[] = playerIds
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
      // Tie → accumulate
      byHole[hole] = { winner_ids: [], plumas: 0, carryover };
      carryover++;
    }
  }

  return { byHole, totals };
}

// ─── Individual ──────────────────────────────────────────────────────────────

function calcOneVsOne(
  playerA: string,
  playerB: string,
  netMap: Record<string, Record<number, number>>,
  holeNumbers: number[],
  betAmount: number
): IndividualResult {
  const byHole: IndividualResult['byHole'] = {};
  let matchAccum = 0;
  let medalA = 0;
  let medalB = 0;
  const presiones: PresionesResult[] = [];
  type PresionState = { startHole: number; byHole: Record<number, { result: number; accum: number }>; accum: number };
  let presion1: PresionState | null = null;
  let presion2: PresionState | null = null;

  for (const hole of holeNumbers) {
    const netA = netMap[playerA]?.[hole];
    const netB = netMap[playerB]?.[hole];
    if (netA === undefined || netB === undefined) continue;

    const holeResult = netA < netB ? 1 : netA > netB ? -1 : 0; // +1 = A wins
    matchAccum += holeResult;
    medalA += netA;
    medalB += netB;

    byHole[hole] = { netA, netB, matchResult: holeResult, matchAccum };

    // Presion 1: activates when A is down 2 in match (matchAccum <= -2) and not active yet
    if (!presion1 && matchAccum <= -2) {
      presion1 = { startHole: hole, byHole: {}, accum: 0 };
    }
    if (presion1 && hole >= presion1.startHole) {
      presion1.accum += holeResult;
      presion1.byHole[hole] = { result: holeResult, accum: presion1.accum };
    }

    // Presion 2: activates when A is down 2 in presion1 match
    if (presion1 && !presion2 && presion1.accum <= -2) {
      presion2 = { startHole: hole, byHole: {}, accum: 0 };
    }
    if (presion2 && hole >= presion2.startHole) {
      presion2.accum += holeResult;
      presion2.byHole[hole] = { result: holeResult, accum: presion2.accum };
    }
  }

  if (presion1) {
    presiones.push({
      startHole: presion1.startHole,
      byHole: presion1.byHole,
      total: presion1.accum > 0 ? betAmount : presion1.accum < 0 ? -betAmount : 0,
      winnerId: presion1.accum > 0 ? playerA : presion1.accum < 0 ? playerB : null,
      loserId: presion1.accum > 0 ? playerB : presion1.accum < 0 ? playerA : null,
    });
  }
  if (presion2) {
    presiones.push({
      startHole: presion2.startHole,
      byHole: presion2.byHole,
      total: presion2.accum > 0 ? betAmount : presion2.accum < 0 ? -betAmount : 0,
      winnerId: presion2.accum > 0 ? playerA : presion2.accum < 0 ? playerB : null,
      loserId: presion2.accum > 0 ? playerB : presion2.accum < 0 ? playerA : null,
    });
  }

  return {
    matchup: `${playerA}_${playerB}`,
    playerA,
    playerB,
    byHole,
    matchTotal: matchAccum,
    medalTotalA: medalA,
    medalTotalB: medalB,
    presiones,
  };
}

export function calcIndividualAll(
  playerIds: string[],
  netMap: Record<string, Record<number, number>>,
  holeNumbers: number[],
  betAmount: number,
  presionesActive: boolean
): IndividualResult[] {
  const results: IndividualResult[] = [];
  for (let i = 0; i < playerIds.length; i++) {
    for (let j = i + 1; j < playerIds.length; j++) {
      const r = calcOneVsOne(playerIds[i], playerIds[j], netMap, holeNumbers, betAmount);
      if (!presionesActive) r.presiones = [];
      results.push(r);
    }
  }
  return results;
}

// ─── Parejas ─────────────────────────────────────────────────────────────────

function pairNet(p1: string, p2: string, netMap: Record<string, Record<number, number>>, hole: number): { best: number; worst: number; medal: number } | null {
  const n1 = netMap[p1]?.[hole];
  const n2 = netMap[p2]?.[hole];
  if (n1 === undefined || n2 === undefined) return null;
  return {
    best: Math.min(n1, n2),
    worst: Math.max(n1, n2),
    medal: n1 + n2,
  };
}

export function calcParejas(
  pairings: Pairing[],
  netMap: Record<string, Record<number, number>>,
  holeNumbers: number[]
): ParejasMatchup[] {
  const results: ParejasMatchup[] = [];
  for (let i = 0; i < pairings.length; i++) {
    for (let j = i + 1; j < pairings.length; j++) {
      const pA = pairings[i];
      const pB = pairings[j];
      const byHole: ParejasMatchup['byHole'] = {};
      let bestAccum = 0, worstAccum = 0, medalAccum = 0;
      let bestTotal = 0, worstTotal = 0, medalTotal = 0;

      for (const hole of holeNumbers) {
        const a = pairNet(pA.player1_id, pA.player2_id, netMap, hole);
        const b = pairNet(pB.player1_id, pB.player2_id, netMap, hole);
        if (!a || !b) continue;

        const bestResult = a.best < b.best ? 1 : a.best > b.best ? -1 : 0;
        const worstResult = a.worst < b.worst ? 1 : a.worst > b.worst ? -1 : 0;
        const medalResult = a.medal < b.medal ? 1 : a.medal > b.medal ? -1 : 0;

        bestAccum += bestResult;
        worstAccum += worstResult;
        medalAccum += medalResult;

        byHole[hole] = {
          bestA: a.best, worstA: a.worst,
          bestB: b.best, worstB: b.worst,
          bestResult, worstResult,
          bestAccum, worstAccum,
          medalA: a.medal, medalB: b.medal, medalAccum,
        };
      }

      bestTotal = bestAccum;
      worstTotal = worstAccum;
      medalTotal = medalAccum;

      results.push({
        pairA: pA.pair_number,
        pairB: pB.pair_number,
        playerA1: pA.player1_id,
        playerA2: pA.player2_id,
        playerB1: pB.player1_id,
        playerB2: pB.player2_id,
        byHole,
        bestTotal,
        worstTotal,
        medalTotal,
        totalResult: bestTotal + worstTotal,
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
  return otherPairings.map(opp => {
    const results = calcParejas([basePairing, opp], netMap, holeNumbers);
    return results[0];
  });
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
    rows[id] = { player_id: id, marcas: 0, individuales: 0, parejas: 0, parejas_base: 0, presiones: 0, total: 0 };
  });

  // Marcas
  if (gameConfigs.marcas?.active) {
    const bet = gameConfigs.marcas.bet_amount;
    Object.entries(marcas.totals).forEach(([id, plumas]) => {
      if (rows[id]) rows[id].marcas += plumas * bet;
    });
    // Subtract: each pluma costs bet to everyone who didn't win it
    // Actually marcas is zero-sum: winner gets bet * plumas from each loser...
    // Re-interpreting: each pluma worth bet, loser pays total plumas won by others
    // Simplest: net = (my plumas - avg plumas) * bet — but correct is:
    // Each hoyo: winner gets bet from each of the other N-1 players
    const totalPlayers = playerIds.length;
    Object.entries(marcas.totals).forEach(([id, plumas]) => {
      if (!rows[id]) return;
      const totalOthers = Object.values(marcas.totals).reduce((s, v) => s + v, 0) - plumas;
      rows[id].marcas = (plumas * (totalPlayers - 1) - totalOthers) * bet;
    });
  }

  // Individuales (match result: winner gets bet, loser pays bet)
  if (gameConfigs.individuales?.active) {
    const bet = gameConfigs.individuales.bet_amount;
    individualResults.forEach(r => {
      if (!rows[r.playerA] || !rows[r.playerB]) return;
      const earned = r.matchTotal > 0 ? bet : r.matchTotal < 0 ? -bet : 0;
      rows[r.playerA].individuales += earned;
      rows[r.playerB].individuales -= earned;
    });
  }

  // Presiones
  if (gameConfigs.presiones?.active) {
    const bet = gameConfigs.individuales?.bet_amount ?? 0;
    individualResults.forEach(r => {
      r.presiones.forEach(p => {
        if (!p.winnerId || !p.loserId) return;
        if (rows[p.winnerId]) rows[p.winnerId].presiones += Math.abs(p.total);
        if (rows[p.loserId]) rows[p.loserId].presiones -= Math.abs(p.total ?? bet);
      });
    });
  }

  // Parejas (bet paid per sub-match: best ball + worst ball)
  if (gameConfigs.parejas?.active) {
    const bet = gameConfigs.parejas.bet_amount;
    parejasResults.forEach(m => {
      const getPlayers = (pair: number) => pairings.find(p => p.pair_number === pair);
      const pA = getPlayers(m.pairA);
      const pB = getPlayers(m.pairB);
      if (!pA || !pB) return;

      // best ball sub-match
      const bestEarned = m.bestTotal > 0 ? bet : m.bestTotal < 0 ? -bet : 0;
      // worst ball sub-match
      const worstEarned = m.worstTotal > 0 ? bet : m.worstTotal < 0 ? -bet : 0;
      const total = bestEarned + worstEarned;

      [pA.player1_id, pA.player2_id].forEach(id => {
        if (rows[id]) rows[id].parejas += total;
      });
      [pB.player1_id, pB.player2_id].forEach(id => {
        if (rows[id]) rows[id].parejas -= total;
      });
    });
  }

  // Pareja Base
  if (gameConfigs.parejas_base?.active && basePair) {
    const bet = gameConfigs.parejas_base.bet_amount;
    parejaBaseResults.forEach(m => {
      const baseIsA = m.playerA1 === basePair.player1_id || m.playerA1 === basePair.player2_id;
      const bestEarned = m.bestTotal > 0 ? bet : m.bestTotal < 0 ? -bet : 0;
      const worstEarned = m.worstTotal > 0 ? bet : m.worstTotal < 0 ? -bet : 0;
      const total = bestEarned + worstEarned;

      const baseSign = baseIsA ? 1 : -1;
      [basePair.player1_id, basePair.player2_id].forEach(id => {
        if (rows[id]) rows[id].parejas_base += baseSign * total;
      });
      const oppA1 = baseIsA ? m.playerB1 : m.playerA1;
      const oppA2 = baseIsA ? m.playerB2 : m.playerA2;
      [oppA1, oppA2].forEach(id => {
        if (rows[id]) rows[id].parejas_base -= baseSign * total;
      });
    });
  }

  // Totals
  Object.values(rows).forEach(r => {
    r.total = r.marcas + r.individuales + r.parejas + r.parejas_base + r.presiones;
  });

  return Object.values(rows);
}

// ─── Utility ─────────────────────────────────────────────────────────────────

export function getHoleOrder(startHole: 1 | 10, totalHoles = 18): number[] {
  const holes = Array.from({ length: totalHoles }, (_, i) => i + 1);
  if (startHole === 1) return holes;
  // Start from hole 10: 10,11,...,18,1,2,...,9
  return [...holes.slice(9), ...holes.slice(0, 9)];
}
