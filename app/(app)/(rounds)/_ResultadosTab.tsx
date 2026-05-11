import { View, Text, ScrollView } from 'react-native';
import { Colors, Fonts } from '@/constants/colors';
import {
  calcRelativeHandicaps, buildNetScoreMap, calcMarcas, calcIndividualAll,
  calcParejas, calcParejaBase, type HoleInfo, type Pairing,
} from '@/lib/calculations';
import { type RoundData, type ScoreMap, type MarcasEspMap } from './_roundTypes';
import { genRivalPairs } from './_roundConstants';

export function ResultadosTab({ round, holes, grossMap, marcasEspMap, holeOrder }: {
  round: RoundData;
  holes: HoleInfo[];
  grossMap: ScoreMap;
  marcasEspMap: MarcasEspMap;
  holeOrder: number[];
}) {
  const players = [...round.round_players].sort((a, b) => a.position - b.position);
  const gameConfigs: Record<string, { active: boolean; bet_amount: number }> = {};
  round.round_game_config.forEach(g => { gameConfigs[g.game_type] = { active: g.active, bet_amount: g.bet_amount }; });

  const relHcps = calcRelativeHandicaps(players.map(p => ({ id: p.player_id, handicap: p.handicap })));
  const netMap = buildNetScoreMap(
    players.flatMap(p => holeOrder.map(h => ({ player_id: p.player_id, hole_number: h, gross_score: grossMap[p.player_id]?.[h] ?? 0 })).filter(s => s.gross_score > 0)),
    relHcps,
    holes
  );

  const playerIds = players.map(p => p.player_id);
  const nameMap: Record<string, string> = {};
  const labelMap: Record<string, string> = {};
  const displayMap: Record<string, string> = {};
  players.forEach(p => {
    nameMap[p.player_id] = p.players.name;
    const initials = p.players.name.trim().split(/\s+/).map((w: string) => w[0].toUpperCase()).join('');
    labelMap[p.player_id] = p.players.suffix ? `${initials} ${p.players.suffix}` : initials;
    displayMap[p.player_id] = p.players.suffix ? `${p.players.name} ${p.players.suffix}` : p.players.name;
  });

  const marcas = gameConfigs.marcas?.active
    ? calcMarcas(netMap, playerIds, holeOrder)
    : null;

  const playerHandicaps = players.map(p => ({ id: p.player_id, handicap: p.handicap }));
  const individualResults = gameConfigs.individuales?.active || gameConfigs.individuales_medal?.active
    ? calcIndividualAll(playerIds, grossMap, holeOrder, gameConfigs.presiones?.active ?? false, playerHandicaps, holes)
    : [];

  const pairings: Pairing[] = round.round_pairings;
  const parejasResults = gameConfigs.parejas?.active && pairings.length >= 2
    ? calcParejas(pairings, netMap, holeOrder)
    : [];

  const basePairData = round.round_base_pair?.[0] ?? null;
  const rivalPairs: Pairing[] = basePairData ? genRivalPairs(playerIds, basePairData) : [];
  const parejaBaseResults = (gameConfigs.parejas_base?.active || gameConfigs.parejas_base_medal?.active) && basePairData
    ? calcParejaBase(basePairData, rivalPairs, netMap, holeOrder)
    : [];

  const COL_W = 54;
  const ROW_H_W = 72;
  const IND_ROW_H_W = 72;

  const SECTIONS = [
    { key: 'primera' as const, label: '1ª Vuelta', bg: '#FFF5F5' },
    { key: 'segunda' as const, label: '2ª Vuelta', bg: '#F5F5FF' },
    { key: 'total'   as const, label: 'Total',     bg: '#F0FFF4' },
  ];

  function valStr(v: number) { return v > 0 ? `+${v}` : v === 0 ? '0' : String(v); }
  function valColor(v: number) { return v > 0 ? Colors.success : v < 0 ? Colors.error : Colors.textSecondary; }

  // Individual result lookup by "playerA_playerB"
  const indLookup = new Map<string, typeof individualResults[0]>();
  individualResults.forEach(r => { indLookup.set(`${r.playerA}_${r.playerB}`, r); });

  function indCell(rowId: string, colId: string, vuelta: 'primera' | 'segunda' | 'total') {
    const direct = indLookup.get(`${rowId}_${colId}`);
    if (direct) {
      const v = direct[vuelta];
      const pCount = vuelta !== 'total' ? (direct[vuelta] as any).presiones.length : 0;
      return { match: v.matchAccum, medal: v.medalB - v.medalA, presiones: pCount as number };
    }
    const inverse = indLookup.get(`${colId}_${rowId}`);
    if (inverse) {
      const v = inverse[vuelta];
      const pCount = vuelta !== 'total' ? (inverse[vuelta] as any).presiones.length : 0;
      return { match: -v.matchAccum, medal: v.medalA - v.medalB, presiones: pCount as number };
    }
    return null;
  }

  // Parejas result lookup by "pairA_pairB"
  const parLookup = new Map<string, typeof parejasResults[0]>();
  parejasResults.forEach(m => { parLookup.set(`${m.pairA}_${m.pairB}`, m); });

  function parCell(rowPair: number, colPair: number, vuelta: 'primera' | 'segunda' | 'total') {
    const direct = parLookup.get(`${rowPair}_${colPair}`);
    if (direct) {
      const v = direct[vuelta];
      return { match: v.matchAccum, medal: v.medalB - v.medalA };
    }
    const inverse = parLookup.get(`${colPair}_${rowPair}`);
    if (inverse) {
      const v = inverse[vuelta];
      return { match: -v.matchAccum, medal: v.medalA - v.medalB };
    }
    return null;
  }

  const pairIds = [...new Set(parejasResults.flatMap(m => [m.pairA, m.pairB]))].sort((a, b) => a - b);
  const pairName = (num: number, extra?: Pairing[]) => {
    if (num === 0 && basePairData) {
      return `${labelMap[basePairData.player1_id] ?? '?'}\n${labelMap[basePairData.player2_id] ?? '?'}`;
    }
    const pair = [...pairings, ...(extra ?? [])].find(p => p.pair_number === num);
    if (!pair) return `P${num}`;
    return `${labelMap[pair.player1_id] ?? '?'}\n${labelMap[pair.player2_id] ?? '?'}`;
  };

  const CELL_BORDER = { borderLeftWidth: 1, borderColor: Colors.border + '44' } as const;
  const DIAG_BG = Colors.textSecondary + '22';

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }} contentInsetAdjustmentBehavior="automatic">

      {/* Marcas / Plumas */}
      {marcas && (
        <View style={{ gap: 8 }}>
          <Text style={{ fontFamily: Fonts.serif, fontSize: 20, color: Colors.text }}>Marcas / Plumas</Text>
          <View style={{ backgroundColor: Colors.card, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border }}>
            {/* Header */}
            <View style={{ flexDirection: 'row', backgroundColor: Colors.greenDark, paddingHorizontal: 12, paddingVertical: 8 }}>
              <Text style={{ flex: 1, fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1, color: Colors.white + 'BB' }}>JUGADOR</Text>
              <Text style={{ width: 70, textAlign: 'center', fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1, color: Colors.white + 'BB' }}>PLUMAS</Text>
              <Text style={{ width: 70, textAlign: 'center', fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1, color: Colors.gold }}>MARCAS</Text>
            </View>
            {playerIds.map((id, i) => {
              const marcasEspTotal = Object.values(marcasEspMap[id] ?? {}).reduce((s, v) => s + (parseInt(v, 10) || 0), 0);
              return (
                <View key={id} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: Colors.card, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: Colors.border + '55' }}>
                  <Text style={{ flex: 1, fontFamily: Fonts.serif, fontSize: 16, color: Colors.text }}>{displayMap[id]}</Text>
                  <Text style={{ width: 70, textAlign: 'center', fontFamily: Fonts.serif, fontSize: 15, fontWeight: '700', color: Colors.text, fontVariant: ['tabular-nums'] }}>
                    {marcas.totals[id] ?? 0}
                  </Text>
                  <Text style={{ width: 70, textAlign: 'center', fontFamily: Fonts.serif, fontSize: 15, fontWeight: '700', color: marcasEspTotal > 0 ? Colors.gold : Colors.textSecondary, fontVariant: ['tabular-nums'] }}>
                    {marcasEspTotal > 0 ? marcasEspTotal : '—'}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* Individuales — matriz N×N */}
      {individualResults.length > 0 && (
        <View style={{ gap: 8 }}>
          <Text style={{ fontFamily: Fonts.serif, fontSize: 20, color: Colors.text }}>Individuales</Text>
          <View style={{ overflowX: 'auto' } as any}>
            <View style={{ borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border }}>
              {/* Column headers */}
              <View style={{ flexDirection: 'row', backgroundColor: Colors.greenDark }}>
                <View style={{ width: IND_ROW_H_W, padding: 8 }} />
                {playerIds.map(id => (
                  <View key={id} style={{ width: COL_W, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 4, ...CELL_BORDER }}>
                    <Text style={{ fontFamily: Fonts.serif, fontSize: 13, color: Colors.white, textAlign: 'center' }} numberOfLines={2}>
                      {labelMap[id]}
                    </Text>
                  </View>
                ))}
              </View>

              {SECTIONS.map(section => (
                <View key={section.key}>
                  <View style={{ backgroundColor: Colors.greenDark + 'BB', paddingVertical: 4, paddingHorizontal: 10 }}>
                    <Text style={{ fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1.5, color: Colors.white + 'CC' }}>{section.label.toUpperCase()}</Text>
                  </View>
                  {playerIds.map((rowId, ri) => (
                    <View key={rowId} style={{ flexDirection: 'row', backgroundColor: Colors.card, borderTopWidth: 1, borderTopColor: Colors.border + '44' }}>
                      <View style={{ width: IND_ROW_H_W, justifyContent: 'center', paddingHorizontal: 10, paddingVertical: 8, borderRightWidth: 1, borderColor: Colors.border + '44' }}>
                        <Text style={{ fontFamily: Fonts.serif, fontSize: 13, color: Colors.text }} numberOfLines={1}>
                          {labelMap[rowId]}
                        </Text>
                      </View>
                      {playerIds.map(colId => {
                        if (rowId === colId) {
                          return <View key={colId} style={{ width: COL_W, backgroundColor: DIAG_BG, ...CELL_BORDER }} />;
                        }
                        const cell = indCell(rowId, colId, section.key);
                        return (
                          <View key={colId} style={{ width: COL_W, alignItems: 'center', justifyContent: 'center', paddingVertical: 6, ...CELL_BORDER }}>
                            {cell ? (
                              <View style={{ alignItems: 'center', gap: 1 }}>
                                <Text style={{ fontFamily: Fonts.serif, fontSize: 13, color: valColor(cell.match), fontVariant: ['tabular-nums'] }}>
                                  {valStr(cell.match)}
                                </Text>
                                <Text style={{ fontFamily: Fonts.serif, fontSize: 13, color: valColor(cell.medal), fontVariant: ['tabular-nums'] }}>
                                  {valStr(cell.medal)}
                                </Text>
                                {cell.presiones > 0 && (
                                  <Text style={{ fontFamily: Fonts.mono, fontSize: 9, color: Colors.warning, fontWeight: '700' }}>
                                    {'P'.repeat(cell.presiones)}
                                  </Text>
                                )}
                              </View>
                            ) : (
                              <Text style={{ fontFamily: Fonts.mono, color: Colors.textSecondary, fontSize: 12 }}>—</Text>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </View>
        </View>
      )}

      {/* Parejas — matriz M×M */}
      {parejasResults.length > 0 && (
        <View style={{ gap: 8 }}>
          <Text style={{ fontFamily: Fonts.serif, fontSize: 20, color: Colors.text }}>Parejas</Text>
          <View style={{ overflowX: 'auto' } as any}>
            <View style={{ borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border }}>
              <View style={{ flexDirection: 'row', backgroundColor: Colors.greenDark }}>
                <View style={{ width: ROW_H_W, padding: 8 }} />
                {pairIds.map(pid => (
                  <View key={pid} style={{ width: COL_W, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 4, ...CELL_BORDER }}>
                    <Text style={{ fontFamily: Fonts.serif, fontSize: 10, color: Colors.white, textAlign: 'center', lineHeight: 14 }}>
                      {pairName(pid)}
                    </Text>
                  </View>
                ))}
              </View>

              {SECTIONS.map(section => (
                <View key={section.key}>
                  <View style={{ backgroundColor: Colors.greenDark + 'BB', paddingVertical: 4, paddingHorizontal: 10 }}>
                    <Text style={{ fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1.5, color: Colors.white + 'CC' }}>{section.label.toUpperCase()}</Text>
                  </View>
                  {pairIds.map((rowPair, ri) => (
                    <View key={rowPair} style={{ flexDirection: 'row', backgroundColor: Colors.card, borderTopWidth: 1, borderTopColor: Colors.border + '44' }}>
                      <View style={{ width: ROW_H_W, justifyContent: 'center', paddingHorizontal: 6, paddingVertical: 8, borderRightWidth: 1, borderColor: Colors.border + '44' }}>
                        <Text style={{ fontFamily: Fonts.serif, fontSize: 10, color: Colors.text, textAlign: 'center', lineHeight: 14 }}>
                          {pairName(rowPair)}
                        </Text>
                      </View>
                      {pairIds.map(colPair => {
                        if (rowPair === colPair) {
                          return <View key={colPair} style={{ width: COL_W, backgroundColor: DIAG_BG, ...CELL_BORDER }} />;
                        }
                        const cell = parCell(rowPair, colPair, section.key);
                        return (
                          <View key={colPair} style={{ width: COL_W, alignItems: 'center', justifyContent: 'center', paddingVertical: 6, ...CELL_BORDER }}>
                            {cell ? (
                              <View style={{ alignItems: 'center', gap: 1 }}>
                                <Text style={{ fontFamily: Fonts.serif, fontSize: 13, color: valColor(cell.match), fontVariant: ['tabular-nums'] }}>
                                  {valStr(cell.match)}
                                </Text>
                                <Text style={{ fontFamily: Fonts.serif, fontSize: 13, color: valColor(cell.medal), fontVariant: ['tabular-nums'] }}>
                                  {valStr(cell.medal)}
                                </Text>
                              </View>
                            ) : (
                              <Text style={{ fontFamily: Fonts.mono, color: Colors.textSecondary, fontSize: 12 }}>—</Text>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </View>
        </View>
      )}

      {/* Pareja Base — fila única vs cada rival */}
      {parejaBaseResults.length > 0 && basePairData && (
        <View style={{ gap: 8 }}>
          <Text style={{ fontFamily: Fonts.serif, fontSize: 20, color: Colors.text }}>Pareja Base</Text>
          <View style={{ overflowX: 'auto' } as any}>
            <View style={{ borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border }}>
              <View style={{ flexDirection: 'row', backgroundColor: Colors.greenDark }}>
                <View style={{ width: ROW_H_W, padding: 8, justifyContent: 'center' }}>
                  <Text style={{ fontFamily: Fonts.serif, fontSize: 13, color: Colors.gold, textAlign: 'center' }} numberOfLines={2}>
                    {labelMap[basePairData!.player1_id] ?? '?'}{'\n'}{labelMap[basePairData!.player2_id] ?? '?'}
                  </Text>
                </View>
                {parejaBaseResults.map(m => (
                  <View key={m.pairB} style={{ width: COL_W, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 4, ...CELL_BORDER }}>
                    <Text style={{ fontFamily: Fonts.serif, fontSize: 13, color: Colors.white, textAlign: 'center' }} numberOfLines={2}>
                      {pairName(m.pairB, rivalPairs)}
                    </Text>
                  </View>
                ))}
              </View>
              {SECTIONS.map((section, si) => (
                <View key={section.key} style={{ flexDirection: 'row', backgroundColor: Colors.card, borderTopWidth: 1, borderTopColor: Colors.border + '44' }}>
                  <View style={{ width: ROW_H_W, justifyContent: 'center', paddingHorizontal: 10, paddingVertical: 8, borderRightWidth: 1, borderColor: Colors.border + '44' }}>
                    <Text style={{ fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1.5, color: Colors.textSecondary }}>{section.label.toUpperCase()}</Text>
                  </View>
                  {parejaBaseResults.map(m => {
                    const v = m[section.key];
                    const match = v.matchAccum;
                    const medal = v.medalB - v.medalA;
                    return (
                      <View key={m.pairB} style={{ width: COL_W, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, ...CELL_BORDER }}>
                        <View style={{ alignItems: 'center', gap: 1 }}>
                          <Text style={{ fontFamily: Fonts.serif, fontSize: 13, color: valColor(match), fontVariant: ['tabular-nums'] }}>
                            {valStr(match)}
                          </Text>
                          <Text style={{ fontFamily: Fonts.serif, fontSize: 13, color: valColor(medal), fontVariant: ['tabular-nums'] }}>
                            {valStr(medal)}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
          </View>
        </View>
      )}

      {playerIds.every(id => Object.keys(netMap[id] ?? {}).length === 0) && (
        <View style={{ alignItems: 'center', marginTop: 60, gap: 8 }}>
          <Text style={{ fontFamily: Fonts.serif, fontSize: 22, color: Colors.textSecondary }}>Sin scores aún</Text>
          <Text style={{ fontFamily: Fonts.fraunces, fontStyle: 'italic', fontSize: 14, color: Colors.textSecondary, textAlign: 'center' }}>
            Ingresa los scores en el Scorecard para ver los resultados
          </Text>
        </View>
      )}
    </ScrollView>
  );
}
