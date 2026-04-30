import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, ActivityIndicator, Switch, useWindowDimensions } from 'react-native';
import { Stack, useLocalSearchParams, Redirect, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Colors, Fonts } from '@/constants/colors';
import {
  calcRelativeHandicaps, buildNetScoreMap, calcMarcas, calcIndividualAll,
  calcParejas, calcParejaBase, calcDineros,
  type HoleInfo, type ScoreEntry, type Pairing,
} from '@/lib/calculations';

// ─── Types ───────────────────────────────────────────────────────────────────

type RoundData = {
  id: string;
  course_id: string;
  start_hole: number;
  status: string;
  created_at: string;
  courses: { name: string };
  round_players: { player_id: string; handicap: number; position: number; players: { name: string; suffix?: string | null } }[];
  round_game_config: { game_type: string; active: boolean; bet_amount: number }[];
  round_pairings: { pair_number: number; player1_id: string; player2_id: string }[];
  round_base_pair: { player1_id: string; player2_id: string }[];
};

type ScoreMap = Record<string, Record<number, number>>; // player_id → hole → gross

// ─── Hooks ───────────────────────────────────────────────────────────────────

function useRoundData(id: string) {
  return useQuery<RoundData>({
    queryKey: ['round', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rounds')
        .select(`id, course_id, start_hole, status, courses(name),
          round_players(player_id, handicap, position, players(name, suffix)),
          round_game_config(game_type, active, bet_amount),
          round_pairings(pair_number, player1_id, player2_id),
          round_base_pair(player1_id, player2_id)`)
        .eq('id', id)
        .single();
      if (error) throw error;
      const d = data as unknown as RoundData;
      // Supabase returns 1:1 unique FK as object, normalize to array
      if (d.round_base_pair && !Array.isArray(d.round_base_pair)) {
        (d as any).round_base_pair = [d.round_base_pair];
      }
      return d;
    },
    enabled: !!id && id !== 'players',
  });
}

function useCourseHoles(courseId: string) {
  return useQuery<HoleInfo[]>({
    queryKey: ['holes', courseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('course_holes')
        .select('hole_number, par, handicap_rank')
        .eq('course_id', courseId)
        .order('hole_number');
      if (error) throw error;
      return data as HoleInfo[];
    },
    enabled: !!courseId,
  });
}

function useScores(roundId: string) {
  const qc = useQueryClient();
  const isValid = !!roundId && roundId !== 'players';

  const { data: scores = [] } = useQuery<ScoreEntry[]>({
    queryKey: ['scores', roundId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('scores')
        .select('player_id, hole_number, gross_score')
        .eq('round_id', roundId);
      if (error) throw error;
      return data;
    },
    enabled: isValid,
  });

  // Realtime subscription — unique name per mount avoids StrictMode double-subscribe error
  useEffect(() => {
    if (!isValid) return;
    const uid = Math.random().toString(36).slice(2, 7);
    const channel = supabase
      .channel(`scores-${roundId}-${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores', filter: `round_id=eq.${roundId}` },
        () => qc.invalidateQueries({ queryKey: ['scores', roundId] })
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [roundId, qc, isValid]);

  // Build gross map
  const grossMap: ScoreMap = {};
  scores.forEach(s => {
    if (!grossMap[s.player_id]) grossMap[s.player_id] = {};
    grossMap[s.player_id][s.hole_number] = s.gross_score;
  });

  return { scores, grossMap };
}

type MarcasEspMap = Record<string, Record<number, string>>;

// ─── Special Marcas Hook ──────────────────────────────────────────────────────

function useSpecialMarcas(roundId: string) {
  const qc = useQueryClient();
  const isValid = !!roundId && roundId !== 'players';

  const { data: rows = [] } = useQuery<{ player_id: string; hole_number: number; nota: string }[]>({
    queryKey: ['marcas_esp', roundId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('round_marcas')
        .select('player_id, hole_number, nota')
        .eq('round_id', roundId);
      if (error) throw error;
      return data;
    },
    enabled: isValid,
  });

  useEffect(() => {
    if (!isValid) return;
    const uid = Math.random().toString(36).slice(2, 7);
    const channel = supabase
      .channel(`marcas-esp-${roundId}-${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'round_marcas', filter: `round_id=eq.${roundId}` },
        () => qc.invalidateQueries({ queryKey: ['marcas_esp', roundId] })
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [roundId, qc, isValid]);

  const marcasEspMap: MarcasEspMap = {};
  rows.forEach(r => {
    if (!marcasEspMap[r.player_id]) marcasEspMap[r.player_id] = {};
    marcasEspMap[r.player_id][r.hole_number] = r.nota;
  });

  return { marcasEspMap };
}

// ─── Scorecard Tab ────────────────────────────────────────────────────────────

function ScorecardTab({ round, holes, grossMap, marcasEspMap, holeOrder, readonly }: {
  round: RoundData;
  holes: HoleInfo[];
  grossMap: ScoreMap;
  marcasEspMap: MarcasEspMap;
  holeOrder: number[];
  readonly: boolean;
}) {
  const qc = useQueryClient();
  const inputRefs = useRef<Record<string, TextInput | null>>({});
  const [localScores, setLocalScores] = useState<ScoreMap>({});
  const [localMarcas, setLocalMarcas] = useState<MarcasEspMap>({});
  const [saveErr, setSaveErr] = useState('');

  const { width: screenWidth } = useWindowDimensions();
  const players = [...round.round_players].sort((a, b) => a.position - b.position);

  const getValue = (pid: string, hole: number) => {
    return localScores[pid]?.[hole] !== undefined
      ? String(localScores[pid][hole] === 0 ? '' : localScores[pid][hole])
      : grossMap[pid]?.[hole] !== undefined
        ? String(grossMap[pid][hole])
        : '';
  };

  const getMarcaValue = (pid: string, hole: number) => {
    return localMarcas[pid]?.[hole] !== undefined
      ? localMarcas[pid][hole]
      : marcasEspMap[pid]?.[hole] ?? '';
  };

  const handleChange = (pid: string, hole: number, val: string) => {
    setLocalScores(prev => ({
      ...prev,
      [pid]: { ...(prev[pid] ?? {}), [hole]: val === '' ? 0 : parseInt(val, 10) || 0 },
    }));
  };

  const handleMarcaChange = async (pid: string, hole: number, val: string) => {
    setLocalMarcas(prev => ({
      ...prev,
      [pid]: { ...(prev[pid] ?? {}), [hole]: val },
    }));
    const n = parseInt(val, 10);
    if (!val.trim() || n <= 0 || isNaN(n)) {
      const { error } = await supabase.from('round_marcas').delete()
        .eq('round_id', round.id).eq('player_id', pid).eq('hole_number', hole);
      if (error) setSaveErr(error.message);
      else await qc.invalidateQueries({ queryKey: ['marcas_esp', round.id] });
    } else {
      const { error } = await supabase.from('round_marcas').upsert(
        { round_id: round.id, player_id: pid, hole_number: hole, nota: String(n) },
        { onConflict: 'round_id,player_id,hole_number' }
      );
      if (error) setSaveErr(error.message);
    }
  };

  const handleBlur = useCallback(async (pid: string, hole: number) => {
    const val = localScores[pid]?.[hole];
    if (val === undefined || val === 0) return;
    const { error } = await supabase.from('scores').upsert(
      { round_id: round.id, player_id: pid, hole_number: hole, gross_score: val },
      { onConflict: 'round_id,player_id,hole_number' }
    );
    if (error) setSaveErr(error.message);
  }, [localScores, round.id]);


  const holeMap: Record<number, HoleInfo> = {};
  holes.forEach(h => { holeMap[h.hole_number] = h; });

  const relHcps = calcRelativeHandicaps(players.map(p => ({ id: p.player_id, handicap: p.handicap })));
  const relHcpMap: Record<string, number> = {};
  relHcps.forEach(r => { relHcpMap[r.id] = r.relative; });

  const COL_W = 52;
  const HOLE_COL_W = 56;
  const V_COL_W = 56;
  const MARCA_COL_W = 48;
  const MARCA_LABEL_W = 20;

  function playerInitials(name: string) {
    return name.trim().split(/\s+/).map(w => w[0].toUpperCase()).join('');
  }

  function playerLabel(p: { players: { name: string; suffix?: string | null } }) {
    const initials = playerInitials(p.players.name);
    return p.players.suffix ? `${initials} ${p.players.suffix}` : initials;
  }

  // Scorecard symbols: only birdie and eagle
  function scoreSymbol(gross: number, par: number): { double: boolean } | null {
    const diff = gross - par;
    if (diff <= -2) return { double: true };  // eagle or better
    if (diff === -1) return { double: false }; // birdie
    return null;
  }

  const FIXED_BG = Colors.creamDeep;

  return (
    <ScrollView style={{ flex: 1, overscrollBehaviorX: 'contain' } as any} contentContainerStyle={{ paddingBottom: 32, flexGrow: 1 }} contentInsetAdjustmentBehavior="automatic">
      {readonly && (
        <View style={{ backgroundColor: Colors.gold + '22', padding: 10, borderBottomWidth: 1, borderColor: Colors.gold + '55' }}>
          <Text style={{ color: Colors.goldText, fontWeight: '600', fontSize: 12, textAlign: 'center', fontFamily: Fonts.mono, letterSpacing: 0.5 }}>
            PARTIDA CERRADA · TOCA EDITAR PARA MODIFICAR
          </Text>
        </View>
      )}
      {!!saveErr && (
        <View style={{ backgroundColor: '#FFEBEE', margin: 12, borderRadius: 6, padding: 12, borderWidth: 1, borderColor: Colors.error }}>
          <Text style={{ color: Colors.error, fontWeight: '600' }}>Error guardando: {saveErr}</Text>
        </View>
      )}

      {/* Card wrapper */}
      <View style={{ margin: 12, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, maxWidth: screenWidth - 24 }}>
        {/* Card header */}
        <View style={{ backgroundColor: Colors.greenDark, paddingHorizontal: 14, paddingVertical: 10, borderTopLeftRadius: 8, borderTopRightRadius: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ color: Colors.white, fontSize: 11, fontFamily: Fonts.mono, letterSpacing: 2 }}>SCORECARD</Text>
          <Text style={{ color: Colors.gold, fontSize: 10, fontFamily: Fonts.mono, letterSpacing: 1.5 }}>MARCAS</Text>
        </View>

      <View style={{ overflowX: 'auto' } as any}>
        <View style={{ minWidth: 'max-content' } as any}>
          {/* Header row */}
          <View style={{ flexDirection: 'row', backgroundColor: Colors.greenMid, paddingVertical: 8, alignItems: 'center' }}>
            {/* Fixed cols */}
            <View style={{ width: V_COL_W, alignItems: 'center', backgroundColor: Colors.greenDark, paddingVertical: 4 }}>
              <Text style={{ color: Colors.white, fontWeight: '600', fontSize: 10, fontFamily: Fonts.mono, letterSpacing: 0.5 }}>Ventaja</Text>
            </View>
            <View style={{ width: 36, alignItems: 'center', backgroundColor: Colors.greenDark, paddingVertical: 4 }}>
              <Text style={{ color: Colors.white, fontWeight: '600', fontSize: 10, fontFamily: Fonts.mono, letterSpacing: 0.5 }}>Par</Text>
            </View>
            <View style={{ width: HOLE_COL_W, alignItems: 'center', backgroundColor: Colors.greenDark, paddingVertical: 4 }}>
              <Text style={{ color: Colors.white, fontWeight: '600', fontSize: 10, fontFamily: Fonts.mono, letterSpacing: 0.5 }}>Hoyo</Text>
            </View>
            {players.map(p => (
              <View key={p.player_id} style={{ width: COL_W, alignItems: 'center', gap: 1 }}>
                <Text style={{ color: Colors.white, fontWeight: '600', fontSize: 12, fontFamily: Fonts.serif, textAlign: 'center' }} numberOfLines={1}>
                  {playerLabel(p)}
                </Text>
                <Text style={{ color: Colors.gold + 'BB', fontSize: 9, fontFamily: Fonts.mono }}>
                  HCP {relHcpMap[p.player_id] ?? 0}
                </Text>
              </View>
            ))}
            {/* Gold divider */}
            <View style={{ width: MARCA_LABEL_W, borderLeftWidth: 2, borderLeftColor: Colors.gold, alignSelf: 'stretch', backgroundColor: Colors.greenMid }} />
            {players.map(p => (
              <View key={p.player_id} style={{ width: MARCA_COL_W, alignItems: 'center', backgroundColor: Colors.greenMid }}>
                <Text style={{ color: Colors.gold, fontWeight: '600', fontSize: 12, fontFamily: Fonts.serif, textAlign: 'center' }} numberOfLines={1}>
                  {playerLabel(p)}
                </Text>
              </View>
            ))}
          </View>

          {/* Holes */}
          {holeOrder.map((holeNum, idx) => {
            const hole = holeMap[holeNum];
            const isNinth = holeNum === 9;
            const is18th = holeNum === 18;
            return (
              <View key={holeNum}>
                <View style={{ flexDirection: 'row', alignItems: 'stretch' }}>
                  {/* Fixed cols */}
                  <View style={{ width: V_COL_W, alignItems: 'center', justifyContent: 'center', backgroundColor: FIXED_BG, paddingVertical: 7, borderTopWidth: 1, borderTopColor: Colors.borderDeep + '44' }}>
                    <Text style={{ fontFamily: Fonts.serif, fontSize: 14, color: Colors.textSecondary }}>{hole?.handicap_rank ?? ''}</Text>
                  </View>
                  <View style={{ width: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: FIXED_BG, paddingVertical: 7, borderTopWidth: 1, borderTopColor: Colors.borderDeep + '44' }}>
                    <Text style={{ fontFamily: Fonts.serif, fontSize: 14, color: Colors.textSecondary }}>{hole?.par ?? ''}</Text>
                  </View>
                  <View style={{ width: HOLE_COL_W, alignItems: 'center', justifyContent: 'center', backgroundColor: FIXED_BG, paddingVertical: 7, borderTopWidth: 1, borderTopColor: Colors.borderDeep + '44' }}>
                    <Text style={{ fontFamily: Fonts.serif, fontWeight: '700', fontSize: 14, color: Colors.text }}>{holeNum}</Text>
                  </View>
                  {/* Score inputs */}
                  {players.map(p => {
                    const ventaja = hole && hole.handicap_rank <= (relHcpMap[p.player_id] ?? 0);
                    const rawVal = getValue(p.player_id, holeNum);
                    const gross = parseInt(rawVal, 10);
                    const sym = !isNaN(gross) && gross > 0 && hole ? scoreSymbol(gross, hole.par) : null;
                    const isUnsaved = !!localScores[p.player_id]?.[holeNum];
                    const scoreColor = readonly ? Colors.textSecondary : Colors.text;
                    return (
                      <View key={p.player_id} style={{ width: COL_W, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.card, borderTopWidth: 1, borderTopColor: Colors.border + '55', paddingVertical: 4 }}>
                        <View style={{ alignItems: 'center', justifyContent: 'center', backgroundColor: ventaja ? 'rgba(255, 235, 0, 0.45)' : 'transparent', borderRadius: 3, paddingHorizontal: 2, paddingVertical: 1 }}>
                          <TextInput
                            ref={ref => { inputRefs.current[`${p.player_id}-${holeNum}`] = ref; }}
                            value={rawVal}
                            onChangeText={v => !readonly && handleChange(p.player_id, holeNum, v)}
                            onBlur={() => !readonly && handleBlur(p.player_id, holeNum)}
                            editable={!readonly}
                            keyboardType="number-pad"
                            inputMode="numeric"
                            maxLength={2}
                            style={{
                              width: 36, height: 36,
                              backgroundColor: 'transparent',
                              borderRadius: 4,
                              textAlign: 'center',
                              fontSize: 17,
                              fontFamily: Fonts.serif,
                              fontWeight: '700',
                              color: scoreColor,
                              borderWidth: isUnsaved ? 1 : 0,
                              borderColor: Colors.gold,
                              outlineWidth: 0,
                            } as any}
                          />
                          {sym && (
                            <View pointerEvents="none" style={{
                              position: 'absolute', width: 42, height: 42, borderRadius: 21,
                              borderWidth: 1.5, borderColor: Colors.greenDark + 'BB',
                              transform: [{ rotate: '5deg' }],
                            }} />
                          )}
                          {sym?.double && (
                            <View pointerEvents="none" style={{
                              position: 'absolute', width: 50, height: 50, borderRadius: 25,
                              borderWidth: 1.5, borderColor: Colors.greenDark + 'BB',
                              transform: [{ rotate: '-4deg' }],
                            }} />
                          )}
                        </View>
                      </View>
                    );
                  })}
                  {/* Gold divider */}
                  <View style={{ width: MARCA_LABEL_W, alignSelf: 'stretch', backgroundColor: Colors.card, borderTopWidth: 1, borderTopColor: Colors.border + '55', borderLeftWidth: 2, borderLeftColor: Colors.gold }} />
                  {/* Marca inputs */}
                  {players.map(p => {
                    const marcaVal = getMarcaValue(p.player_id, holeNum);
                    const hasMarca = !!marcaVal;
                    return (
                      <View key={p.player_id} style={{ width: MARCA_COL_W, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.card, borderTopWidth: 1, borderTopColor: Colors.border + '55', paddingVertical: 4 }}>
                        <TextInput
                          value={marcaVal}
                          onChangeText={v => !readonly && handleMarcaChange(p.player_id, holeNum, v)}
                          editable={!readonly}
                          keyboardType="number-pad"
                          inputMode="numeric"
                          maxLength={2}
                          style={{
                            width: 36, height: 36,
                            backgroundColor: hasMarca ? Colors.gold + '33' : 'transparent',
                            borderRadius: 4,
                            textAlign: 'center',
                            fontSize: 16,
                            fontFamily: Fonts.serif,
                            fontWeight: '700',
                            color: Colors.goldText,
                            borderWidth: localMarcas[p.player_id]?.[holeNum] ? 1 : 0,
                            borderColor: Colors.gold,
                            outlineWidth: 0,
                          } as any}
                        />
                      </View>
                    );
                  })}
                </View>
                {(isNinth || is18th) && (
                  <>
                    {is18th && (() => {
                      const secondHalf = holeOrder.slice(9);
                      return (
                        <View style={{ flexDirection: 'row', backgroundColor: Colors.greenMid, paddingVertical: 8, alignItems: 'center' }}>
                          <View style={{ width: HOLE_COL_W + 36 + V_COL_W, alignItems: 'center' }}>
                            <Text style={{ color: Colors.white, fontSize: 10, fontFamily: Fonts.mono, letterSpacing: 1.5, fontWeight: '700' }}>2ª VUELTA</Text>
                          </View>
                          {players.map(p => {
                            const sum = secondHalf.reduce((s, h) => s + (grossMap[p.player_id]?.[h] ?? 0), 0);
                            return (
                              <View key={p.player_id} style={{ width: COL_W, alignItems: 'center' }}>
                                <Text style={{ color: Colors.white, fontWeight: '700', fontSize: 16, fontFamily: Fonts.serif }}>{sum || '—'}</Text>
                              </View>
                            );
                          })}
                          <View style={{ width: MARCA_LABEL_W, alignSelf: 'stretch', borderLeftWidth: 2, borderLeftColor: Colors.gold, backgroundColor: Colors.greenMid }} />
                          {players.map(p => {
                            const count = secondHalf.reduce((s, h) => s + (parseInt(marcasEspMap[p.player_id]?.[h] ?? '', 10) || 0), 0);
                            return (
                              <View key={p.player_id} style={{ width: MARCA_COL_W, alignItems: 'center', backgroundColor: Colors.greenMid }}>
                                <Text style={{ color: Colors.gold, fontWeight: '700', fontSize: 15, fontFamily: Fonts.serif }}>{count > 0 ? String(count) : '—'}</Text>
                              </View>
                            );
                          })}
                        </View>
                      );
                    })()}
                    <View style={{ flexDirection: 'row', backgroundColor: isNinth ? Colors.greenMid : Colors.greenDark, paddingVertical: 8, alignItems: 'center' }}>
                      <View style={{ width: HOLE_COL_W + 36 + V_COL_W, alignItems: 'center' }}>
                        <Text style={{ color: isNinth ? Colors.white : Colors.gold, fontSize: 10, fontFamily: Fonts.mono, letterSpacing: 1.5, fontWeight: '700' }}>
                          {isNinth ? '1ª VUELTA' : 'TOTAL'}
                        </Text>
                      </View>
                      {players.map(p => {
                        const halfHoles = isNinth ? holeOrder.slice(0, idx + 1) : holeOrder;
                        const sum = halfHoles.reduce((s, h) => s + (grossMap[p.player_id]?.[h] ?? 0), 0);
                        return (
                          <View key={p.player_id} style={{ width: COL_W, alignItems: 'center' }}>
                            <Text style={{ color: isNinth ? Colors.white : Colors.gold, fontWeight: '700', fontSize: 16, fontFamily: Fonts.serif }}>{sum || '—'}</Text>
                          </View>
                        );
                      })}
                      <View style={{ width: MARCA_LABEL_W, alignSelf: 'stretch', borderLeftWidth: 2, borderLeftColor: Colors.gold, backgroundColor: isNinth ? Colors.greenMid : Colors.greenDark }} />
                      {players.map(p => {
                        const halfHoles = isNinth ? holeOrder.slice(0, idx + 1) : holeOrder;
                        const count = halfHoles.reduce((s, h) => s + (parseInt(marcasEspMap[p.player_id]?.[h] ?? '', 10) || 0), 0);
                        return (
                          <View key={p.player_id} style={{ width: MARCA_COL_W, alignItems: 'center', backgroundColor: isNinth ? Colors.greenMid : Colors.greenDark }}>
                            <Text style={{ color: Colors.gold, fontWeight: '700', fontSize: 15, fontFamily: Fonts.serif }}>{count > 0 ? String(count) : '—'}</Text>
                          </View>
                        );
                      })}
                    </View>
                  </>
                )}
              </View>
            );
          })}
        </View>
      </View>
      </View>
    </ScrollView>
  );
}

// ─── Resultados Tab ──────────────────────────────────────────────────────────

function ResultadosTab({ round, holes, grossMap, marcasEspMap, holeOrder }: {
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
  const ROW_H_W = 56;
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

// ─── Dineros Tab ─────────────────────────────────────────────────────────────

function DinerosTab({ round, holes, grossMap, marcasEspMap, holeOrder }: {
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
  const scoresToCalc = players.flatMap(p =>
    holeOrder.map(h => ({ player_id: p.player_id, hole_number: h, gross_score: grossMap[p.player_id]?.[h] ?? 0 })).filter(s => s.gross_score > 0)
  );
  const netMap = buildNetScoreMap(scoresToCalc, relHcps, holes);

  const playerIds = players.map(p => p.player_id);
  const nameMap: Record<string, string> = {};
  const displayMap: Record<string, string> = {};
  players.forEach(p => {
    nameMap[p.player_id] = p.players.name;
    displayMap[p.player_id] = p.players.suffix ? `${p.players.name} ${p.players.suffix}` : p.players.name;
  });

  const marcas = calcMarcas(netMap, playerIds, holeOrder);
  const playerHandicaps = players.map(p => ({ id: p.player_id, handicap: p.handicap }));
  const individualResults = calcIndividualAll(playerIds, grossMap, holeOrder, gameConfigs.presiones?.active ?? false, playerHandicaps, holes);
  const pairings: Pairing[] = round.round_pairings;
  const parejasResults = pairings.length >= 2 ? calcParejas(pairings, netMap, holeOrder) : [];
  const basePairData = round.round_base_pair?.[0] ?? null;
  const rivalPairsDineros: Pairing[] = basePairData ? genRivalPairs(playerIds, basePairData) : [];
  const parejaBaseResults = basePairData ? calcParejaBase(basePairData, rivalPairsDineros, netMap, holeOrder) : [];

  const baseDineros = calcDineros(playerIds, gameConfigs, marcas, individualResults, parejasResults, parejaBaseResults, pairings, basePairData);

  // Marcas especiales: each entry earns (n-1)×bet from others; each other player pays bet per entry
  const n = playerIds.length;
  const marcasEspBet = gameConfigs.marcas_esp?.active ? (gameConfigs.marcas_esp.bet_amount ?? 0) : 0;
  const marcasEspCount: Record<string, number> = {};
  playerIds.forEach(id => {
    marcasEspCount[id] = Object.values(marcasEspMap[id] ?? {}).reduce((s, v) => s + (parseInt(v, 10) || 0), 0);
  });
  const totalMarcasEsp = playerIds.reduce((s, id) => s + marcasEspCount[id], 0);
  const dineros = baseDineros.map(row => {
    const myCount = marcasEspCount[row.player_id] ?? 0;
    const marcasEspAmt = marcasEspBet > 0
      ? myCount * (n - 1) * marcasEspBet - (totalMarcasEsp - myCount) * marcasEspBet
      : 0;
    return { ...row, marcas_esp: marcasEspAmt, total: row.total + marcasEspAmt };
  });

  function fmt(n: number) { return (n >= 0 ? '+' : '-') + `$${Math.abs(n).toLocaleString('es-MX')}`; }
  function color(n: number) { return n > 0 ? Colors.success : n < 0 ? Colors.error : Colors.textSecondary; }

  // Columnas consolidadas: agrupa juegos relacionados
  const colGroups = [
    { key: 'marcas_col',    label: 'Marcas',     fields: ['marcas_esp', 'marcas'] },
    { key: 'ind_col',       label: 'Individual',  fields: ['individuales', 'individuales_medal'] },
    { key: 'presiones_col', label: 'Presiones',  fields: ['presiones'] },
    { key: 'parejas_col',   label: 'Parejas',    fields: ['parejas', 'parejas_medal'] },
    { key: 'base_col',      label: 'P.Base',     fields: ['parejas_base', 'parejas_base_medal'] },
  ].filter(g => g.fields.some(f => gameConfigs[f]?.active));

  function groupVal(row: typeof dineros[0], fields: string[]) {
    return fields.reduce((s, f) => s + ((row as any)[f] ?? 0), 0);
  }

  const NAME_W = 130;
  const COL_W = 72;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }} contentInsetAdjustmentBehavior="automatic">
      <View style={{ borderRadius: 6, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border }}>
        <View style={{ overflowX: 'auto' } as any}>
          <View style={{ minWidth: 'max-content' } as any}>
            {/* Header */}
            <View style={{ flexDirection: 'row', backgroundColor: Colors.greenDark, paddingHorizontal: 14, paddingVertical: 10 }}>
              <Text style={{ width: NAME_W, fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1, color: Colors.white + 'BB' }}>JUGADOR</Text>
              <Text style={{ width: 70, textAlign: 'center', fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1, color: Colors.gold }}>TOTAL</Text>
              {colGroups.map(g => (
                <Text key={g.key} style={{ width: COL_W, textAlign: 'center', fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1, color: Colors.white + 'BB' }}>{g.label.toUpperCase()}</Text>
              ))}
            </View>

            {/* Rows */}
            {dineros.sort((a, b) => b.total - a.total).map((row, i) => (
              <View key={row.player_id} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, backgroundColor: Colors.card, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: Colors.border + '55' }}>
                <Text style={{ width: NAME_W, fontFamily: Fonts.serif, fontSize: 14, color: Colors.text }}>
                  {displayMap[row.player_id]}
                </Text>
                <Text style={{ width: 70, textAlign: 'center', fontFamily: Fonts.serif, fontSize: 15, fontWeight: '700', color: color(row.total), fontVariant: ['tabular-nums'] }}>
                  {fmt(row.total)}
                </Text>
                {colGroups.map(g => {
                  const val = groupVal(row, g.fields);
                  return (
                    <Text key={g.key} style={{ width: COL_W, textAlign: 'center', fontFamily: Fonts.serif, fontSize: 13, fontWeight: '700', color: color(val), fontVariant: ['tabular-nums'] }}>
                      {val !== 0 ? fmt(val) : '—'}
                    </Text>
                  );
                })}
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* Comprobación */}
      <View style={{ marginTop: 10, alignItems: 'center' }}>
        <Text style={{ fontFamily: Fonts.mono, fontSize: 10, color: Colors.textSecondary + 'AA', letterSpacing: 0.5 }}>
          SUMA TOTAL: ${dineros.reduce((s, r) => s + r.total, 0).toLocaleString('es-MX')} (debe ser $0)
        </Text>
      </View>
    </ScrollView>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function genRivalPairs(playerIds: string[], basePair: { player1_id: string; player2_id: string }): Pairing[] {
  const others = playerIds.filter(id => id !== basePair.player1_id && id !== basePair.player2_id);
  const pairs: Pairing[] = [];
  let n = 1;
  for (let i = 0; i < others.length; i++)
    for (let j = i + 1; j < others.length; j++)
      pairs.push({ pair_number: n++, player1_id: others[i], player2_id: others[j] });
  return pairs;
}

const ALL_GAME_KEYS = ['marcas', 'marcas_esp', 'individuales', 'individuales_medal', 'parejas', 'parejas_medal', 'parejas_base', 'parejas_base_medal', 'presiones'];
const GAME_LABELS_SETUP: Record<string, string> = {
  marcas: 'Plumas', marcas_esp: 'Marcas Especiales', individuales: 'Individuales Match',
  individuales_medal: 'Individuales Medal', parejas: 'Parejas Match', parejas_medal: 'Parejas Medal',
  parejas_base: 'Pareja Base Match', parejas_base_medal: 'Pareja Base Medal', presiones: 'Presiones',
};

// ─── Main Screen ─────────────────────────────────────────────────────────────

const TABS = ['Scorecard', 'Resultados', 'Dineros'] as const;

export default function RoundScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>('Scorecard');
  const [confirmModal, setConfirmModal] = useState<'finish' | 'pause' | null>(null);
  const [saving, setSaving] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [setupGames, setSetupGames] = useState<Record<string, { active: boolean; bet_amount: number }>>({});
  const [setupHandicaps, setSetupHandicaps] = useState<Record<string, number>>({});
  const [setupPairings, setSetupPairings] = useState<{ pair_number: number; p1: string; p2: string }[]>([]);
  const [setupBasePair, setSetupBasePair] = useState<{ p1: string; p2: string } | null>(null);
  const [setupSaving, setSetupSaving] = useState(false);
  const [setupErr, setSetupErr] = useState('');

  const { data: round, isLoading: loadingRound } = useRoundData(id);
  const { data: holes = [], isLoading: loadingHoles } = useCourseHoles(round?.course_id ?? '');
  const { grossMap } = useScores(id);
  const { marcasEspMap } = useSpecialMarcas(id);

  // Guard after all hooks — redirect if routing leaked a non-UUID segment here
  if (id === 'players') return <Redirect href="/(app)/(players)" />;

  if (loadingRound || loadingHoles) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background }}>
        <ActivityIndicator size="large" color={Colors.green} />
      </View>
    );
  }

  if (!round) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: Colors.error }}>Partida no encontrada</Text>
      </View>
    );
  }

  const holeOrder = Array.from({ length: 18 }, (_, i) => i + 1);
  const isActive = round.status === 'active' || round.status === 'setup';

  async function doFinish() {
    setSaving(true);
    await supabase.from('rounds').update({ status: 'finished' }).eq('id', id);
    setSaving(false);
    setConfirmModal(null);
    router.replace('/');
  }

  function doPause() {
    setConfirmModal(null);
    router.replace('/');
  }

  async function doEdit() {
    await supabase.from('rounds').update({ status: 'active' }).eq('id', id);
    qc.invalidateQueries({ queryKey: ['round', id] });
  }

  function openSetup() {
    if (!round) return;
    const configs: Record<string, { active: boolean; bet_amount: number }> = {};
    ALL_GAME_KEYS.forEach(k => { configs[k] = { active: false, bet_amount: 0 }; });
    round.round_game_config.forEach(g => { configs[g.game_type] = { active: g.active, bet_amount: g.bet_amount }; });
    setSetupGames(configs);
    const hcps: Record<string, number> = {};
    round.round_players.forEach(p => { hcps[p.player_id] = p.handicap; });
    setSetupHandicaps(hcps);
    setSetupPairings(round.round_pairings.map(p => ({ pair_number: p.pair_number, p1: p.player1_id, p2: p.player2_id })));
    const bp = round.round_base_pair?.[0];
    setSetupBasePair(bp ? { p1: bp.player1_id, p2: bp.player2_id } : null);
    setSetupErr('');
    setShowSetup(true);
  }

  async function saveSetup() {
    setSetupSaving(true);
    setSetupErr('');
    const allErrs: string[] = [];

    const gameResults = await Promise.all(
      ALL_GAME_KEYS.map(k =>
        supabase.from('round_game_config').upsert(
          { round_id: id, game_type: k, active: setupGames[k]?.active ?? false, bet_amount: setupGames[k]?.bet_amount ?? 0 },
          { onConflict: 'round_id,game_type' }
        )
      )
    );
    gameResults.forEach(r => { if (r.error) allErrs.push(r.error.message); });

    const hcpResults = await Promise.all(
      Object.entries(setupHandicaps).map(([pid, hcp]) =>
        supabase.from('round_players').update({ handicap: hcp }).eq('round_id', id).eq('player_id', pid)
      )
    );
    hcpResults.forEach(r => { if (r.error) allErrs.push(r.error.message); });

    const { error: delPairErr } = await supabase.from('round_pairings').delete().eq('round_id', id);
    if (delPairErr) { allErrs.push(delPairErr.message); }
    else if (setupPairings.length > 0) {
      const { error: insPairErr } = await supabase.from('round_pairings').insert(
        setupPairings.map(p => ({ round_id: id, pair_number: p.pair_number, player1_id: p.p1, player2_id: p.p2 }))
      );
      if (insPairErr) allErrs.push(insPairErr.message);
    }

    const { error: delBpErr } = await supabase.from('round_base_pair').delete().eq('round_id', id);
    if (delBpErr) { allErrs.push(delBpErr.message); }
    else if (setupBasePair?.p1 && setupBasePair?.p2) {
      const { error: insBpErr } = await supabase.from('round_base_pair').insert(
        { round_id: id, player1_id: setupBasePair.p1, player2_id: setupBasePair.p2 }
      );
      if (insBpErr) allErrs.push(insBpErr.message);
    }

    // Always refresh cache so UI reflects whatever was saved
    await qc.invalidateQueries({ queryKey: ['round', id] });
    setSetupSaving(false);
    if (allErrs.length > 0) {
      setSetupErr(allErrs[0]);
    } else {
      setShowSetup(false);
    }
  }

  const MODAL_CONFIG = {
    finish: {
      title: '¿Terminar partida?',
      body: '¿Confirmas que quieres terminar la partida?',
      confirmLabel: 'Terminar',
      confirmColor: Colors.error,
    },
    pause: {
      title: '¿Pausar partida?',
      body: 'La partida quedará activa. Puedes retomar desde la lista de partidas.',
      confirmLabel: 'Pausar',
      confirmColor: Colors.green,
    },
  };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Tab bar */}
      <View style={{ backgroundColor: Colors.background, borderBottomWidth: 1, borderColor: Colors.border }}>
        {/* Tabs row */}
        <View style={{ flexDirection: 'row' }}>
          {TABS.map(tab => (
            <Pressable
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={{ flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: activeTab === tab ? Colors.gold : 'transparent' }}
            >
              <Text style={{
                fontSize: 10, letterSpacing: 1,
                fontFamily: Fonts.mono,
                fontWeight: activeTab === tab ? '700' : '400',
                color: activeTab === tab ? Colors.text : Colors.textSecondary,
              }}>
                {tab.toUpperCase()}
              </Text>
            </Pressable>
          ))}
        </View>
        {/* Actions row */}
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderTopWidth: 1, borderTopColor: Colors.border + '55' }}>
          {isActive ? (
            <>
              <Pressable onPress={openSetup} style={{ borderWidth: 1, borderColor: Colors.border, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 5 }}>
                <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.5, color: Colors.textSecondary, fontFamily: Fonts.mono }}>CONFIG</Text>
              </Pressable>
              <Pressable onPress={() => setConfirmModal('pause')} style={{ borderWidth: 1, borderColor: Colors.border, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 5 }}>
                <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.5, color: Colors.textSecondary, fontFamily: Fonts.mono }}>PAUSAR</Text>
              </Pressable>
              <Pressable onPress={() => setConfirmModal('finish')} style={{ borderWidth: 1, borderColor: Colors.error + '88', borderRadius: 4, paddingHorizontal: 8, paddingVertical: 5 }}>
                <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.5, color: Colors.error, fontFamily: Fonts.mono }}>TERMINAR</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Pressable onPress={openSetup} style={{ borderWidth: 1, borderColor: Colors.border, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 5 }}>
                <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.5, color: Colors.textSecondary, fontFamily: Fonts.mono }}>CONFIG</Text>
              </Pressable>
              <Pressable onPress={() => router.replace('/')} style={{ borderWidth: 1, borderColor: Colors.border, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 5 }}>
                <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.5, color: Colors.textSecondary, fontFamily: Fonts.mono }}>REGRESAR</Text>
              </Pressable>
              <Pressable onPress={doEdit} style={{ borderWidth: 1, borderColor: Colors.gold, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 5 }}>
                <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.5, color: Colors.goldText, fontFamily: Fonts.mono }}>EDITAR</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>

      {/* Content */}
      {activeTab === 'Scorecard' && <ScorecardTab round={round} holes={holes} grossMap={grossMap} marcasEspMap={marcasEspMap} holeOrder={Array.from({ length: 18 }, (_, i) => i + 1)} readonly={!isActive} />}
      {activeTab === 'Resultados' && <ResultadosTab round={round} holes={holes} grossMap={grossMap} marcasEspMap={marcasEspMap} holeOrder={holeOrder} />}
      {activeTab === 'Dineros' && <DinerosTab round={round} holes={holes} grossMap={grossMap} marcasEspMap={marcasEspMap} holeOrder={holeOrder} />}

      {/* Setup modal */}
      {showSetup && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 200 }}>
          <View style={{ flex: 1, backgroundColor: Colors.background, marginTop: 60, borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: Colors.card, borderBottomWidth: 1, borderColor: Colors.border }}>
              <Pressable onPress={() => setShowSetup(false)}>
                <Text style={{ fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1, color: Colors.textSecondary }}>CANCELAR</Text>
              </Pressable>
              <Text style={{ fontFamily: Fonts.serif, fontSize: 20, color: Colors.text }}>Configuración</Text>
              <Pressable onPress={saveSetup} disabled={setupSaving}>
                {setupSaving
                  ? <ActivityIndicator size="small" color={Colors.greenDark} />
                  : <Text style={{ fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1, fontWeight: '700', color: Colors.goldText }}>GUARDAR</Text>}
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16, gap: 24, paddingBottom: 40 }}>{(() => {
              const sortedPlayers = [...round.round_players].sort((a, b) => a.position - b.position);
              const playerOpts = sortedPlayers.map(p => ({ label: p.players.name, value: p.player_id }));
              const needsPairings = setupGames.parejas?.active;
              const needsBasePair = setupGames.parejas_base?.active || setupGames.parejas_base_medal?.active;
              return (
                <>
                  {!!setupErr && (
                    <View style={{ backgroundColor: Colors.error + '15', borderRadius: 4, padding: 12, borderLeftWidth: 3, borderLeftColor: Colors.error }}>
                      <Text style={{ fontFamily: Fonts.mono, color: Colors.error, fontSize: 12 }}>{setupErr}</Text>
                    </View>
                  )}

                  {/* Juegos */}
                  <View style={{ gap: 8 }}>
                    <Text style={{ fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1.5, color: Colors.textSecondary }}>JUEGOS Y APUESTAS</Text>
                    {ALL_GAME_KEYS.map(k => (
                      <View key={k} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.card, borderRadius: 6, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: Colors.border, gap: 10 }}>
                        <Switch
                          value={setupGames[k]?.active ?? false}
                          onValueChange={v => setSetupGames(prev => ({ ...prev, [k]: { ...prev[k], active: v } }))}
                          trackColor={{ false: Colors.border, true: Colors.greenDark }}
                          thumbColor={setupGames[k]?.active ? Colors.gold : Colors.white}
                        />
                        <Text style={{ fontFamily: Fonts.serif, flex: 1, fontSize: 15, color: Colors.text }}>{GAME_LABELS_SETUP[k]}</Text>
                        {k !== 'presiones' && (
                          <>
                            <TextInput
                              value={String(setupGames[k]?.bet_amount ?? 0)}
                              onChangeText={v => setSetupGames(prev => ({ ...prev, [k]: { ...prev[k], bet_amount: parseInt(v, 10) || 0 } }))}
                              keyboardType="number-pad"
                              style={{ fontFamily: Fonts.mono, width: 60, textAlign: 'right', fontSize: 15, fontWeight: '700', color: Colors.text, borderBottomWidth: 1, borderColor: Colors.border, paddingVertical: 2 }}
                            />
                            <Text style={{ fontFamily: Fonts.mono, fontSize: 11, color: Colors.textSecondary }}>$</Text>
                          </>
                        )}
                      </View>
                    ))}
                  </View>

                  {/* Parejas */}
                  {needsPairings && (
                    <View style={{ gap: 8 }}>
                      <Text style={{ fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1.5, color: Colors.textSecondary }}>ASIGNACIÓN DE PAREJAS</Text>
                      {setupPairings.map((pair, idx) => (
                        <View key={idx} style={{ backgroundColor: Colors.card, borderRadius: 6, padding: 14, borderWidth: 1, borderColor: Colors.border, gap: 10 }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text style={{ fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1.5, color: Colors.textSecondary }}>PAREJA {pair.pair_number}</Text>
                            <Pressable onPress={() => setSetupPairings(prev => prev.filter((_, i) => i !== idx).map((p, i) => ({ ...p, pair_number: i + 1 })))}>
                              <Text style={{ fontFamily: Fonts.mono, fontSize: 14, color: Colors.textSecondary + '88' }}>×</Text>
                            </Pressable>
                          </View>
                          {(['p1', 'p2'] as const).map((field, fi) => (
                            <View key={field} style={{ gap: 6 }}>
                              <Text style={{ fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1, color: Colors.textSecondary + '88' }}>JUGADOR {fi + 1}</Text>
                              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                                {playerOpts.map(opt => {
                                  const isSelected = pair[field] === opt.value;
                                  const other = field === 'p1' ? pair.p2 : pair.p1;
                                  const usedElsewhere = setupPairings.filter((_, i) => i !== idx).some(p => p.p1 === opt.value || p.p2 === opt.value);
                                  const disabled = other === opt.value || usedElsewhere;
                                  return (
                                    <Pressable
                                      key={opt.value}
                                      disabled={disabled && !isSelected}
                                      onPress={() => setSetupPairings(prev => prev.map((p, i) => i === idx ? { ...p, [field]: opt.value } : p))}
                                      style={{ borderRadius: 4, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: isSelected ? Colors.greenDark : Colors.background, borderWidth: 1, borderColor: isSelected ? Colors.gold : Colors.border, opacity: disabled && !isSelected ? 0.3 : 1 }}
                                    >
                                      <Text style={{ fontFamily: Fonts.serif, fontSize: 14, color: isSelected ? Colors.white : Colors.text }}>{opt.label.split(' ')[0]}</Text>
                                    </Pressable>
                                  );
                                })}
                              </View>
                            </View>
                          ))}
                        </View>
                      ))}
                      {setupPairings.length < 3 && (
                        <Pressable
                          onPress={() => {
                            const used = setupPairings.flatMap(p => [p.p1, p.p2]);
                            const avail = sortedPlayers.filter(p => !used.includes(p.player_id));
                            setSetupPairings(prev => [...prev, { pair_number: prev.length + 1, p1: avail[0]?.player_id ?? '', p2: avail[1]?.player_id ?? '' }]);
                          }}
                          style={{ borderStyle: 'dashed', borderWidth: 1.5, borderColor: Colors.border, borderRadius: 6, paddingVertical: 14, alignItems: 'center' }}
                        >
                          <Text style={{ fontFamily: Fonts.mono, fontSize: 11, fontWeight: '700', letterSpacing: 1, color: Colors.textSecondary }}>+ PAREJA {setupPairings.length + 1}</Text>
                        </Pressable>
                      )}
                    </View>
                  )}

                  {/* Pareja Base */}
                  {needsBasePair && (
                    <View style={{ gap: 8 }}>
                      <Text style={{ fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1.5, color: Colors.textSecondary }}>PAREJA BASE</Text>
                      <View style={{ backgroundColor: Colors.card, borderRadius: 6, padding: 14, borderWidth: 1, borderColor: Colors.gold + '44', gap: 10 }}>
                        {(['p1', 'p2'] as const).map((field, fi) => (
                          <View key={field} style={{ gap: 6 }}>
                            <Text style={{ fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1, color: Colors.textSecondary + '88' }}>JUGADOR {fi + 1}</Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                              {playerOpts.map(opt => {
                                const isSelected = setupBasePair?.[field] === opt.value;
                                const other = field === 'p1' ? setupBasePair?.p2 : setupBasePair?.p1;
                                return (
                                  <Pressable
                                    key={opt.value}
                                    disabled={other === opt.value}
                                    onPress={() => setSetupBasePair(prev => ({ ...(prev ?? { p1: '', p2: '' }), [field]: opt.value }))}
                                    style={{ borderRadius: 4, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: isSelected ? Colors.greenDark : Colors.background, borderWidth: 1, borderColor: isSelected ? Colors.gold : Colors.border, opacity: other === opt.value ? 0.3 : 1 }}
                                  >
                                    <Text style={{ fontFamily: Fonts.serif, fontSize: 14, color: isSelected ? Colors.white : Colors.text }}>{opt.label.split(' ')[0]}</Text>
                                  </Pressable>
                                );
                              })}
                            </View>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}

                  {/* Handicaps */}
                  <View style={{ gap: 8 }}>
                    <Text style={{ fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1.5, color: Colors.textSecondary }}>HANDICAPS</Text>
                    {sortedPlayers.map((p, i) => (
                      <View key={p.player_id} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.card, borderRadius: 6, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderColor: Colors.border }}>
                        <Text style={{ fontFamily: Fonts.serif, flex: 1, fontSize: 16, color: Colors.text }}>{p.players.name}</Text>
                        <Text style={{ fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1, color: Colors.textSecondary, marginRight: 8 }}>HCP</Text>
                        <TextInput
                          value={String(setupHandicaps[p.player_id] ?? p.handicap)}
                          onChangeText={v => setSetupHandicaps(prev => ({ ...prev, [p.player_id]: parseInt(v, 10) || 0 }))}
                          keyboardType="number-pad"
                          style={{ fontFamily: Fonts.mono, width: 48, textAlign: 'center', fontSize: 16, fontWeight: '700', color: Colors.text, borderBottomWidth: 1, borderColor: Colors.border, paddingVertical: 2 }}
                        />
                      </View>
                    ))}
                  </View>
                </>
              );
            })()}
            </ScrollView>
          </View>
        </View>
      )}

      {/* Confirmation modal */}
      {confirmModal && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', zIndex: 100 }}>
          <View style={{ backgroundColor: Colors.card, borderRadius: 20, padding: 24, marginHorizontal: 32, gap: 12, borderWidth: 1, borderColor: Colors.border }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: Colors.text }}>{MODAL_CONFIG[confirmModal].title}</Text>
            <Text style={{ fontSize: 14, color: Colors.textSecondary, lineHeight: 20 }}>{MODAL_CONFIG[confirmModal].body}</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
              <Pressable
                onPress={() => setConfirmModal(null)}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: Colors.background, alignItems: 'center', borderWidth: 1, borderColor: Colors.border }}
              >
                <Text style={{ fontWeight: '600', color: Colors.text }}>Cancelar</Text>
              </Pressable>
              <Pressable
                onPress={confirmModal === 'finish' ? doFinish : doPause}
                disabled={saving}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: MODAL_CONFIG[confirmModal].confirmColor, alignItems: 'center' }}
              >
                {saving ? (
                  <ActivityIndicator size="small" color={Colors.white} />
                ) : (
                  <Text style={{ fontWeight: '700', color: Colors.white }}>{MODAL_CONFIG[confirmModal].confirmLabel}</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
