import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { Stack, useLocalSearchParams, Redirect, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/constants/colors';
import {
  calcRelativeHandicaps, buildNetScoreMap, calcMarcas, calcIndividualAll,
  calcParejas, calcParejaBase, calcDineros, getHoleOrder,
  type HoleInfo, type ScoreEntry, type Pairing,
} from '@/lib/calculations';

// ─── Types ───────────────────────────────────────────────────────────────────

type RoundData = {
  id: string;
  course_id: string;
  start_hole: number;
  status: string;
  courses: { name: string };
  round_players: { player_id: string; handicap: number; position: number; players: { name: string } }[];
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
          round_players(player_id, handicap, position, players(name)),
          round_game_config(game_type, active, bet_amount),
          round_pairings(pair_number, player1_id, player2_id),
          round_base_pair(player1_id, player2_id)`)
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as unknown as RoundData;
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
  const inputRefs = useRef<Record<string, TextInput | null>>({});
  const [localScores, setLocalScores] = useState<ScoreMap>({});
  const [localMarcas, setLocalMarcas] = useState<MarcasEspMap>({});
  const [saveErr, setSaveErr] = useState('');

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
      await supabase.from('round_marcas').delete()
        .eq('round_id', round.id).eq('player_id', pid).eq('hole_number', hole);
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
  const HOLE_COL_W = 44;
  const V_COL_W = 32;
  const MARCA_COL_W = 48;
  const MARCA_LABEL_W = 20;

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 32 }} contentInsetAdjustmentBehavior="automatic">
      {readonly && (
        <View style={{ backgroundColor: Colors.warning + '22', padding: 12, borderBottomWidth: 1, borderColor: Colors.warning + '44' }}>
          <Text style={{ color: Colors.warning, fontWeight: '600', fontSize: 13, textAlign: 'center' }}>
            Partida terminada · toca Editar para modificar scores
          </Text>
        </View>
      )}
      {!!saveErr && (
        <View style={{ backgroundColor: '#FFEBEE', margin: 12, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: Colors.error }}>
          <Text style={{ color: Colors.error, fontWeight: '600' }}>⚠️ Error guardando: {saveErr}</Text>
        </View>
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View>
          {/* Header */}
          <View style={{ flexDirection: 'row', backgroundColor: Colors.greenDark, paddingVertical: 10, alignItems: 'center' }}>
            {/* Left: scores */}
            <View style={{ width: HOLE_COL_W, alignItems: 'center' }}>
              <Text style={{ color: Colors.white, fontWeight: '700', fontSize: 12 }}>H</Text>
            </View>
            <View style={{ width: 36, alignItems: 'center' }}>
              <Text style={{ color: Colors.white, fontWeight: '700', fontSize: 12 }}>Par</Text>
            </View>
            <View style={{ width: V_COL_W, alignItems: 'center' }}>
              <Text style={{ color: Colors.white, fontWeight: '700', fontSize: 12 }}>V</Text>
            </View>
            {players.map(p => (
              <View key={p.player_id} style={{ width: COL_W, alignItems: 'center', gap: 2 }}>
                <Text style={{ color: Colors.white, fontWeight: '700', fontSize: 12, textAlign: 'center' }} numberOfLines={1}>
                  {p.players.name.split(' ')[0]}
                </Text>
                <Text style={{ color: Colors.greenLight, fontSize: 10 }}>
                  {relHcpMap[p.player_id] ?? 0}
                </Text>
              </View>
            ))}
            {/* Separator + Right: marcas */}
            <View style={{ width: MARCA_LABEL_W, borderLeftWidth: 3, borderLeftColor: Colors.gold }} />
            {players.map(p => (
              <View key={p.player_id} style={{ width: MARCA_COL_W, alignItems: 'center' }}>
                <Text style={{ color: Colors.gold, fontWeight: '700', fontSize: 12, textAlign: 'center' }} numberOfLines={1}>
                  {p.players.name.split(' ')[0]}
                </Text>
              </View>
            ))}
          </View>

          {/* Holes */}
          {holeOrder.map((holeNum, idx) => {
            const hole = holeMap[holeNum];
            const isNinth = (round.start_hole === 1 && holeNum === 9) || (round.start_hole === 10 && holeNum === 18);
            const is18th = (round.start_hole === 1 && holeNum === 18) || (round.start_hole === 10 && holeNum === 9);
            const bg = idx % 2 === 0 ? Colors.card : Colors.background;
            return (
              <View key={holeNum}>
                <View style={{ flexDirection: 'row', backgroundColor: bg, paddingVertical: 2, alignItems: 'center' }}>
                  {/* Left: hole info */}
                  <View style={{ width: HOLE_COL_W, alignItems: 'center' }}>
                    <Text style={{ fontWeight: '700', fontSize: 14, color: Colors.text }}>{holeNum}</Text>
                  </View>
                  <View style={{ width: 36, alignItems: 'center' }}>
                    <Text style={{ fontSize: 14, color: Colors.textSecondary }}>{hole?.par ?? ''}</Text>
                  </View>
                  <View style={{ width: V_COL_W, alignItems: 'center' }}>
                    <Text style={{ fontSize: 13, color: Colors.textSecondary }}>{hole?.handicap_rank ?? ''}</Text>
                  </View>
                  {/* Left: score inputs */}
                  {players.map(p => {
                    const ventaja = hole && hole.handicap_rank <= (relHcpMap[p.player_id] ?? 0);
                    return (
                      <View key={p.player_id} style={{ width: COL_W, alignItems: 'center' }}>
                        <TextInput
                          ref={ref => { inputRefs.current[`${p.player_id}-${holeNum}`] = ref; }}
                          value={getValue(p.player_id, holeNum)}
                          onChangeText={v => !readonly && handleChange(p.player_id, holeNum, v)}
                          onBlur={() => !readonly && handleBlur(p.player_id, holeNum)}
                          editable={!readonly}
                          keyboardType="number-pad"
                          inputMode="numeric"
                          maxLength={2}
                          style={{
                            width: 42,
                            height: 38,
                            backgroundColor: readonly ? Colors.background : ventaja ? '#FFFF0066' : grossMap[p.player_id]?.[holeNum] ? Colors.greenLight + '33' : Colors.background,
                            borderRadius: 8,
                            textAlign: 'center',
                            fontSize: 16,
                            fontWeight: '700',
                            color: readonly ? Colors.textSecondary : Colors.text,
                            borderWidth: 1,
                            borderColor: readonly ? Colors.border : localScores[p.player_id]?.[holeNum] ? Colors.gold : ventaja ? '#CCCC00' : Colors.border,
                          }}
                        />
                      </View>
                    );
                  })}
                  {/* Separator */}
                  <View style={{ width: MARCA_LABEL_W, alignSelf: 'stretch', borderLeftWidth: 3, borderLeftColor: Colors.gold + '88' }} />
                  {/* Right: marca inputs */}
                  {players.map(p => (
                    <View key={p.player_id} style={{ width: MARCA_COL_W, alignItems: 'center' }}>
                      <TextInput
                        value={getMarcaValue(p.player_id, holeNum)}
                        onChangeText={v => !readonly && handleMarcaChange(p.player_id, holeNum, v)}
                        editable={!readonly}
                        keyboardType="number-pad"
                        inputMode="numeric"
                        maxLength={2}
                        style={{
                          width: 40,
                          height: 38,
                          backgroundColor: marcasEspMap[p.player_id]?.[holeNum] ? Colors.gold + '33' : Colors.background,
                          borderRadius: 8,
                          textAlign: 'center',
                          fontSize: 13,
                          fontWeight: '700',
                          color: Colors.text,
                          borderWidth: 1,
                          borderColor: localMarcas[p.player_id]?.[holeNum] ? Colors.gold : Colors.border,
                        }}
                      />
                    </View>
                  ))}
                </View>
                {(isNinth || is18th) && (
                  <>
                    {is18th && (() => {
                      const secondHalf = holeOrder.slice(9);
                      return (
                        <View style={{ flexDirection: 'row', backgroundColor: Colors.greenDark + '99', paddingVertical: 6, alignItems: 'center' }}>
                          <View style={{ width: HOLE_COL_W + 36 + V_COL_W, alignItems: 'center' }}>
                            <Text style={{ color: Colors.white, fontSize: 12, fontWeight: '700' }}>2ª Vuelta</Text>
                          </View>
                          {players.map(p => {
                            const sum = secondHalf.reduce((s, h) => s + (grossMap[p.player_id]?.[h] ?? 0), 0);
                            return (
                              <View key={p.player_id} style={{ width: COL_W, alignItems: 'center' }}>
                                <Text style={{ color: Colors.white, fontWeight: '700', fontSize: 14, fontVariant: ['tabular-nums'] }}>{sum || ''}</Text>
                              </View>
                            );
                          })}
                          <View style={{ width: MARCA_LABEL_W, alignSelf: 'stretch', borderLeftWidth: 3, borderLeftColor: Colors.gold + '88' }} />
                          {players.map(p => {
                            const count = secondHalf.reduce((s, h) => s + (parseInt(marcasEspMap[p.player_id]?.[h] ?? '', 10) || 0), 0);
                            return (
                              <View key={p.player_id} style={{ width: MARCA_COL_W, alignItems: 'center' }}>
                                <Text style={{ color: Colors.gold, fontWeight: '700', fontSize: 13, fontVariant: ['tabular-nums'] }}>{count > 0 ? count : ''}</Text>
                              </View>
                            );
                          })}
                        </View>
                      );
                    })()}
                    <View style={{ flexDirection: 'row', backgroundColor: Colors.greenDark + 'CC', paddingVertical: 6, alignItems: 'center' }}>
                      <View style={{ width: HOLE_COL_W + 36 + V_COL_W, alignItems: 'center' }}>
                        <Text style={{ color: Colors.white, fontSize: 12, fontWeight: '700' }}>{isNinth ? '1ª Vuelta' : 'Total'}</Text>
                      </View>
                      {players.map(p => {
                        const halfHoles = isNinth ? holeOrder.slice(0, idx + 1) : holeOrder;
                        const sum = halfHoles.reduce((s, h) => s + (grossMap[p.player_id]?.[h] ?? 0), 0);
                        return (
                          <View key={p.player_id} style={{ width: COL_W, alignItems: 'center' }}>
                            <Text style={{ color: Colors.white, fontWeight: '700', fontSize: 14, fontVariant: ['tabular-nums'] }}>{sum || ''}</Text>
                          </View>
                        );
                      })}
                      <View style={{ width: MARCA_LABEL_W, alignSelf: 'stretch', borderLeftWidth: 3, borderLeftColor: Colors.gold + '88' }} />
                      {players.map(p => {
                        const halfHoles = isNinth ? holeOrder.slice(0, idx + 1) : holeOrder;
                        const count = halfHoles.reduce((s, h) => s + (parseInt(marcasEspMap[p.player_id]?.[h] ?? '', 10) || 0), 0);
                        return (
                          <View key={p.player_id} style={{ width: MARCA_COL_W, alignItems: 'center' }}>
                            <Text style={{ color: Colors.gold, fontWeight: '700', fontSize: 13, fontVariant: ['tabular-nums'] }}>{count > 0 ? count : ''}</Text>
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
      </ScrollView>
    </ScrollView>
  );
}

// ─── Resultados Tab ──────────────────────────────────────────────────────────

function ResultadosTab({ round, holes, grossMap, holeOrder }: {
  round: RoundData;
  holes: HoleInfo[];
  grossMap: ScoreMap;
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
  players.forEach(p => { nameMap[p.player_id] = p.players.name; });

  const marcas = gameConfigs.marcas?.active
    ? calcMarcas(netMap, playerIds, holeOrder)
    : null;

  const individualResults = gameConfigs.individuales?.active || gameConfigs.individuales_medal?.active
    ? calcIndividualAll(playerIds, netMap, holeOrder, gameConfigs.presiones?.active ?? false)
    : [];

  const pairings: Pairing[] = round.round_pairings;
  const parejasResults = gameConfigs.parejas?.active && pairings.length >= 2
    ? calcParejas(pairings, netMap, holeOrder)
    : [];

  const basePairData = round.round_base_pair?.[0] ?? null;
  const otherPairings = pairings.filter(p =>
    basePairData ? !(p.player1_id === basePairData.player1_id && p.player2_id === basePairData.player2_id) : true
  );
  const parejaBaseResults = gameConfigs.parejas_base?.active && basePairData
    ? calcParejaBase(basePairData, otherPairings, netMap, holeOrder)
    : [];

  const COL_W = 54;
  const ROW_H_W = 74;

  const SECTIONS = [
    { key: 'primera' as const, label: '1ª Vuelta', bg: '#FFF5F5' },
    { key: 'segunda' as const, label: '2ª Vuelta', bg: '#F5F5FF' },
    { key: 'total'   as const, label: 'Total',     bg: '#F0FFF4' },
  ];

  function valStr(v: number) { return v > 0 ? `+${v}` : v === 0 ? 'AS' : String(v); }
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
  const pairName = (num: number) => {
    if (num === 0 && basePairData) {
      return `${nameMap[basePairData.player1_id]?.split(' ')[0]}/${nameMap[basePairData.player2_id]?.split(' ')[0]}`;
    }
    const pair = pairings.find(p => p.pair_number === num);
    if (!pair) return `P${num}`;
    return `${nameMap[pair.player1_id]?.split(' ')[0]}/${nameMap[pair.player2_id]?.split(' ')[0]}`;
  };

  const CELL_BORDER = { borderLeftWidth: 1, borderColor: Colors.border + '44' } as const;
  const DIAG_BG = Colors.textSecondary + '22';

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }} contentInsetAdjustmentBehavior="automatic">

      {/* Marcas / Plumas */}
      {marcas && (
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: Colors.greenDark }}>🦚 Marcas / Plumas</Text>
          <View style={{ backgroundColor: Colors.card, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border }}>
            {playerIds.map((id, i) => (
              <View key={id} style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 12, backgroundColor: i % 2 === 0 ? Colors.card : Colors.background }}>
                <Text style={{ fontSize: 14, color: Colors.text }}>{nameMap[id]}</Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: Colors.text, fontVariant: ['tabular-nums'] }}>
                  {marcas.totals[id] ?? 0} plumas
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Individuales — matriz N×N */}
      {individualResults.length > 0 && (
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: Colors.greenDark }}>🏌️ Individuales</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border }}>
              {/* Column headers */}
              <View style={{ flexDirection: 'row', backgroundColor: Colors.greenDark }}>
                <View style={{ width: ROW_H_W, padding: 8 }} />
                {playerIds.map(id => (
                  <View key={id} style={{ width: COL_W, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 4, ...CELL_BORDER }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: Colors.white, textAlign: 'center' }} numberOfLines={2}>
                      {nameMap[id]?.split(' ')[0]}
                    </Text>
                  </View>
                ))}
              </View>

              {SECTIONS.map(section => (
                <View key={section.key}>
                  <View style={{ backgroundColor: Colors.greenDark + 'BB', paddingVertical: 4, paddingHorizontal: 10 }}>
                    <Text style={{ color: Colors.white, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 }}>{section.label}</Text>
                  </View>
                  {playerIds.map((rowId, ri) => (
                    <View key={rowId} style={{ flexDirection: 'row', backgroundColor: ri % 2 === 0 ? section.bg : Colors.background, borderTopWidth: 1, borderColor: Colors.border + '33' }}>
                      <View style={{ width: ROW_H_W, justifyContent: 'center', paddingHorizontal: 10, paddingVertical: 8, borderRightWidth: 1, borderColor: Colors.border + '44' }}>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: Colors.text }} numberOfLines={1}>
                          {nameMap[rowId]?.split(' ')[0]}
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
                                <Text style={{ fontSize: 13, fontWeight: '800', color: valColor(cell.match), fontVariant: ['tabular-nums'] }}>
                                  {valStr(cell.match)}
                                </Text>
                                <Text style={{ fontSize: 11, color: valColor(cell.medal), fontVariant: ['tabular-nums'] }}>
                                  {valStr(cell.medal)}
                                </Text>
                                {cell.presiones > 0 && (
                                  <Text style={{ fontSize: 9, color: Colors.warning, fontWeight: '800' }}>
                                    {'P'.repeat(cell.presiones)}
                                  </Text>
                                )}
                              </View>
                            ) : (
                              <Text style={{ color: Colors.textSecondary, fontSize: 12 }}>—</Text>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      )}

      {/* Parejas — matriz M×M */}
      {parejasResults.length > 0 && (
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: Colors.greenDark }}>👥 Parejas</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border }}>
              <View style={{ flexDirection: 'row', backgroundColor: Colors.greenDark }}>
                <View style={{ width: ROW_H_W, padding: 8 }} />
                {pairIds.map(pid => (
                  <View key={pid} style={{ width: COL_W, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 4, ...CELL_BORDER }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: Colors.white, textAlign: 'center' }} numberOfLines={2}>
                      {pairName(pid)}
                    </Text>
                  </View>
                ))}
              </View>

              {SECTIONS.map(section => (
                <View key={section.key}>
                  <View style={{ backgroundColor: Colors.greenDark + 'BB', paddingVertical: 4, paddingHorizontal: 10 }}>
                    <Text style={{ color: Colors.white, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 }}>{section.label}</Text>
                  </View>
                  {pairIds.map((rowPair, ri) => (
                    <View key={rowPair} style={{ flexDirection: 'row', backgroundColor: ri % 2 === 0 ? section.bg : Colors.background, borderTopWidth: 1, borderColor: Colors.border + '33' }}>
                      <View style={{ width: ROW_H_W, justifyContent: 'center', paddingHorizontal: 10, paddingVertical: 8, borderRightWidth: 1, borderColor: Colors.border + '44' }}>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: Colors.text }} numberOfLines={1}>
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
                                <Text style={{ fontSize: 13, fontWeight: '800', color: valColor(cell.match), fontVariant: ['tabular-nums'] }}>
                                  {valStr(cell.match)}
                                </Text>
                                <Text style={{ fontSize: 11, color: valColor(cell.medal), fontVariant: ['tabular-nums'] }}>
                                  {valStr(cell.medal)}
                                </Text>
                              </View>
                            ) : (
                              <Text style={{ color: Colors.textSecondary, fontSize: 12 }}>—</Text>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      )}

      {/* Pareja Base — fila única vs cada rival */}
      {parejaBaseResults.length > 0 && basePairData && (
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: Colors.greenDark }}>🏆 Pareja Base</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border }}>
              <View style={{ flexDirection: 'row', backgroundColor: Colors.greenDark }}>
                <View style={{ width: ROW_H_W, padding: 8 }} />
                {parejaBaseResults.map(m => (
                  <View key={m.pairB} style={{ width: COL_W, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 4, ...CELL_BORDER }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: Colors.white, textAlign: 'center' }} numberOfLines={2}>
                      {pairName(m.pairB)}
                    </Text>
                  </View>
                ))}
              </View>
              {SECTIONS.map((section, si) => (
                <View key={section.key} style={{ flexDirection: 'row', backgroundColor: si % 2 === 0 ? section.bg : Colors.background, borderTopWidth: 1, borderColor: Colors.border + '33' }}>
                  <View style={{ width: ROW_H_W, justifyContent: 'center', paddingHorizontal: 10, paddingVertical: 8, borderRightWidth: 1, borderColor: Colors.border + '44' }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: Colors.text }}>{section.label}</Text>
                  </View>
                  {parejaBaseResults.map(m => {
                    const v = m[section.key];
                    const match = v.matchAccum;
                    const medal = v.medalB - v.medalA;
                    return (
                      <View key={m.pairB} style={{ width: COL_W, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, ...CELL_BORDER }}>
                        <View style={{ alignItems: 'center', gap: 1 }}>
                          <Text style={{ fontSize: 13, fontWeight: '800', color: valColor(match), fontVariant: ['tabular-nums'] }}>
                            {valStr(match)}
                          </Text>
                          <Text style={{ fontSize: 11, color: valColor(medal), fontVariant: ['tabular-nums'] }}>
                            {valStr(medal)}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      )}

      {playerIds.every(id => Object.keys(netMap[id] ?? {}).length === 0) && (
        <View style={{ alignItems: 'center', marginTop: 40, gap: 8 }}>
          <Text style={{ fontSize: 40 }}>📋</Text>
          <Text style={{ color: Colors.textSecondary, fontSize: 15, textAlign: 'center' }}>Ingresa scores en la pestaña Scorecard para ver los resultados</Text>
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
  players.forEach(p => { nameMap[p.player_id] = p.players.name; });

  const marcas = calcMarcas(netMap, playerIds, holeOrder);
  const individualResults = calcIndividualAll(playerIds, netMap, holeOrder, gameConfigs.presiones?.active ?? false);
  const pairings: Pairing[] = round.round_pairings;
  const parejasResults = pairings.length >= 2 ? calcParejas(pairings, netMap, holeOrder) : [];
  const basePairData = round.round_base_pair?.[0] ?? null;
  const otherPairings = pairings.filter(p => basePairData ? !(p.player1_id === basePairData.player1_id && p.player2_id === basePairData.player2_id) : true);
  const parejaBaseResults = basePairData ? calcParejaBase(basePairData, otherPairings, netMap, holeOrder) : [];

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

  function fmt(n: number) { return (n >= 0 ? '+' : '') + `$${Math.abs(n).toLocaleString('es-MX')}`; }
  function color(n: number) { return n > 0 ? Colors.success : n < 0 ? Colors.error : Colors.textSecondary; }

  // Columnas consolidadas: agrupa juegos relacionados
  const colGroups = [
    { key: 'marcas_col',  label: 'Marcas',    fields: ['marcas_esp', 'marcas'] },
    { key: 'ind_col',     label: 'Individual', fields: ['individuales', 'individuales_medal', 'presiones'] },
    { key: 'parejas_col', label: 'Parejas',   fields: ['parejas', 'parejas_medal'] },
    { key: 'base_col',    label: 'P.Base',    fields: ['parejas_base'] },
  ].filter(g => g.fields.some(f => gameConfigs[f]?.active));

  function groupVal(row: typeof dineros[0], fields: string[]) {
    return fields.reduce((s, f) => s + ((row as any)[f] ?? 0), 0);
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }} contentInsetAdjustmentBehavior="automatic">
      <View style={{ backgroundColor: Colors.card, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', backgroundColor: Colors.greenDark, padding: 10 }}>
          <Text style={{ flex: 1, color: Colors.white, fontWeight: '700', fontSize: 13 }}>Jugador</Text>
          {colGroups.map(g => (
            <Text key={g.key} style={{ width: 72, textAlign: 'center', color: Colors.greenLight, fontSize: 11, fontWeight: '700' }}>{g.label}</Text>
          ))}
          <Text style={{ width: 70, textAlign: 'right', color: Colors.gold, fontWeight: '800', fontSize: 13 }}>Total</Text>
        </View>

        {/* Rows */}
        {dineros.sort((a, b) => b.total - a.total).map((row, i) => (
          <View key={row.player_id} style={{ flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: i % 2 === 0 ? Colors.card : Colors.background }}>
            <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: Colors.text }} numberOfLines={1}>
              {nameMap[row.player_id]?.split(' ')[0]}
            </Text>
            {colGroups.map(g => {
              const val = groupVal(row, g.fields);
              return (
                <Text key={g.key} style={{ width: 72, textAlign: 'center', fontSize: 12, fontWeight: '700', color: color(val), fontVariant: ['tabular-nums'] }}>
                  {val !== 0 ? fmt(val) : '—'}
                </Text>
              );
            })}
            <Text style={{ width: 70, textAlign: 'right', fontSize: 15, fontWeight: '800', color: color(row.total), fontVariant: ['tabular-nums'] }}>
              {fmt(row.total)}
            </Text>
          </View>
        ))}
      </View>

      {/* Comprobación */}
      <View style={{ marginTop: 12, alignItems: 'center' }}>
        <Text style={{ fontSize: 12, color: Colors.textSecondary }}>
          Suma total: ${dineros.reduce((s, r) => s + r.total, 0).toLocaleString('es-MX')} (debe ser $0)
        </Text>
      </View>
    </ScrollView>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

const TABS = ['Scorecard', 'Resultados', 'Dineros'] as const;

export default function RoundScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>('Scorecard');
  const [confirmModal, setConfirmModal] = useState<'finish' | 'pause' | null>(null);
  const [saving, setSaving] = useState(false);

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

  const holeOrder = getHoleOrder(round.start_hole as 1 | 10);
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
      <Stack.Screen options={{
        title: round.courses?.name ?? 'Partida',
        headerBackTitle: 'Atrás',
        headerRight: isActive ? () => (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable
              onPress={() => setConfirmModal('pause')}
              style={{ backgroundColor: Colors.border, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 }}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: Colors.text }}>Pausar</Text>
            </Pressable>
            <Pressable
              onPress={() => setConfirmModal('finish')}
              style={{ backgroundColor: Colors.error + '22', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 }}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.error }}>Terminar</Text>
            </Pressable>
          </View>
        ) : undefined,
      }} />

      {/* Tab bar */}
      <View style={{ flexDirection: 'row', backgroundColor: Colors.card, borderBottomWidth: 1, borderColor: Colors.border, alignItems: 'center' }}>
        {TABS.map(tab => (
          <Pressable
            key={tab}
            onPress={() => setActiveTab(tab)}
            style={{ flex: 1, paddingVertical: 14, alignItems: 'center', borderBottomWidth: 3, borderBottomColor: activeTab === tab ? Colors.green : 'transparent' }}
          >
            <Text style={{ fontSize: 14, fontWeight: activeTab === tab ? '700' : '500', color: activeTab === tab ? Colors.green : Colors.textSecondary }}>
              {tab}
            </Text>
          </Pressable>
        ))}
        {isActive ? (
          <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 10 }}>
            <Pressable
              onPress={() => setConfirmModal('pause')}
              style={{ backgroundColor: Colors.border, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6 }}
            >
              <Text style={{ fontSize: 12, fontWeight: '600', color: Colors.text }}>Pausar</Text>
            </Pressable>
            <Pressable
              onPress={() => setConfirmModal('finish')}
              style={{ backgroundColor: Colors.error + '22', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6 }}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: Colors.error }}>Terminar</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 10 }}>
            <Pressable
              onPress={() => router.replace('/')}
              style={{ backgroundColor: Colors.border, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6 }}
            >
              <Text style={{ fontSize: 12, fontWeight: '600', color: Colors.text }}>Regresar</Text>
            </Pressable>
            <Pressable
              onPress={doEdit}
              style={{ backgroundColor: Colors.green + '22', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6 }}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: Colors.green }}>Editar</Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* Content */}
      {activeTab === 'Scorecard' && <ScorecardTab round={round} holes={holes} grossMap={grossMap} marcasEspMap={marcasEspMap} holeOrder={holeOrder} readonly={!isActive} />}
      {activeTab === 'Resultados' && <ResultadosTab round={round} holes={holes} grossMap={grossMap} holeOrder={holeOrder} />}
      {activeTab === 'Dineros' && <DinerosTab round={round} holes={holes} grossMap={grossMap} marcasEspMap={marcasEspMap} holeOrder={holeOrder} />}

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
