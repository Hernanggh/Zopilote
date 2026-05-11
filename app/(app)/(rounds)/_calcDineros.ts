import {
  calcRelativeHandicaps, buildNetScoreMap, calcMarcas, calcIndividualAll,
  calcParejas, calcParejaBase, calcDineros,
  type HoleInfo, type Pairing,
} from '@/lib/calculations';
import { genRivalPairs } from './_roundConstants';
import { type RoundData, type ScoreMap, type MarcasEspMap } from './_roundTypes';

export type DinerosResult = {
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

export function computeDineros(
  round: RoundData,
  holes: HoleInfo[],
  grossMap: ScoreMap,
  marcasEspMap: MarcasEspMap,
  holeOrder: number[]
): DinerosResult[] {
  const players = [...round.round_players].sort((a, b) => a.position - b.position);
  const gameConfigs: Record<string, { active: boolean; bet_amount: number }> = {};
  round.round_game_config.forEach(g => { gameConfigs[g.game_type] = { active: g.active, bet_amount: g.bet_amount }; });

  const relHcps = calcRelativeHandicaps(players.map(p => ({ id: p.player_id, handicap: p.handicap })));
  const scoresToCalc = players.flatMap(p =>
    holeOrder.map(h => ({ player_id: p.player_id, hole_number: h, gross_score: grossMap[p.player_id]?.[h] ?? 0 })).filter(s => s.gross_score > 0)
  );
  const netMap = buildNetScoreMap(scoresToCalc, relHcps, holes);

  const playerIds = players.map(p => p.player_id);
  const playerHandicaps = players.map(p => ({ id: p.player_id, handicap: p.handicap }));

  const marcas = calcMarcas(netMap, playerIds, holeOrder);
  const individualResults = calcIndividualAll(playerIds, grossMap, holeOrder, gameConfigs.presiones?.active ?? false, playerHandicaps, holes);
  const pairings: Pairing[] = round.round_pairings;
  const parejasResults = pairings.length >= 2 ? calcParejas(pairings, netMap, holeOrder) : [];
  const basePairData = round.round_base_pair?.[0] ?? null;
  const rivalPairs: Pairing[] = basePairData ? genRivalPairs(playerIds, basePairData) : [];
  const parejaBaseResults = basePairData ? calcParejaBase(basePairData, rivalPairs, netMap, holeOrder) : [];

  const baseDineros = calcDineros(playerIds, gameConfigs, marcas, individualResults, parejasResults, parejaBaseResults, pairings, basePairData);

  const n = playerIds.length;
  const marcasEspBet = gameConfigs.marcas_esp?.active ? (gameConfigs.marcas_esp.bet_amount ?? 0) : 0;
  const marcasEspCount: Record<string, number> = {};
  playerIds.forEach(pid => {
    marcasEspCount[pid] = Object.values(marcasEspMap[pid] ?? {}).reduce((s, v) => s + (parseInt(v, 10) || 0), 0);
  });
  const totalMarcasEsp = playerIds.reduce((s, pid) => s + marcasEspCount[pid], 0);

  return baseDineros.map(row => {
    const myCount = marcasEspCount[row.player_id] ?? 0;
    const marcasEspAmt = marcasEspBet > 0
      ? myCount * (n - 1) * marcasEspBet - (totalMarcasEsp - myCount) * marcasEspBet
      : 0;
    return {
      player_id: row.player_id,
      marcas: row.marcas,
      marcas_esp: marcasEspAmt,
      individuales: row.individuales,
      individuales_medal: row.individuales_medal,
      parejas: row.parejas,
      parejas_medal: row.parejas_medal,
      parejas_base: row.parejas_base,
      parejas_base_medal: row.parejas_base_medal,
      presiones: row.presiones,
      total: row.total + marcasEspAmt,
    };
  });
}
