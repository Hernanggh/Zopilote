import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { Stack, useLocalSearchParams, Redirect } from 'expo-router';
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

// ─── Scorecard Tab ────────────────────────────────────────────────────────────

function ScorecardTab({ round, holes, grossMap, holeOrder }: {
  round: RoundData;
  holes: HoleInfo[];
  grossMap: ScoreMap;
  holeOrder: number[];
}) {
  const inputRefs = useRef<Record<string, TextInput | null>>({});
  const [localScores, setLocalScores] = useState<ScoreMap>({});
  const [saveErr, setSaveErr] = useState('');

  const players = [...round.round_players].sort((a, b) => a.position - b.position);

  const getValue = (pid: string, hole: number) => {
    return localScores[pid]?.[hole] !== undefined
      ? String(localScores[pid][hole] === 0 ? '' : localScores[pid][hole])
      : grossMap[pid]?.[hole] !== undefined
        ? String(grossMap[pid][hole])
        : '';
  };

  const handleChange = (pid: string, hole: number, val: string) => {
    setLocalScores(prev => ({
      ...prev,
      [pid]: { ...(prev[pid] ?? {}), [hole]: val === '' ? 0 : parseInt(val, 10) || 0 },
    }));
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

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 32 }} contentInsetAdjustmentBehavior="automatic">
      {!!saveErr && (
        <View style={{ backgroundColor: '#FFEBEE', margin: 12, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: Colors.error }}>
          <Text style={{ color: Colors.error, fontWeight: '600' }}>⚠️ Error guardando score: {saveErr}</Text>
        </View>
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View>
          {/* Header */}
          <View style={{ flexDirection: 'row', backgroundColor: Colors.greenDark, paddingVertical: 10 }}>
            <View style={{ width: HOLE_COL_W, alignItems: 'center' }}>
              <Text style={{ color: Colors.white, fontWeight: '700', fontSize: 12 }}>H</Text>
            </View>
            <View style={{ width: 36, alignItems: 'center' }}>
              <Text style={{ color: Colors.white, fontWeight: '700', fontSize: 12 }}>Par</Text>
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
                  <View style={{ width: HOLE_COL_W, alignItems: 'center' }}>
                    <Text style={{ fontWeight: '700', fontSize: 14, color: Colors.text }}>{holeNum}</Text>
                    {hole && <Text style={{ fontSize: 10, color: Colors.textSecondary }}>V{hole.handicap_rank}</Text>}
                  </View>
                  <View style={{ width: 36, alignItems: 'center' }}>
                    <Text style={{ fontSize: 14, color: Colors.textSecondary }}>{hole?.par ?? ''}</Text>
                  </View>
                  {players.map(p => (
                    <View key={p.player_id} style={{ width: COL_W, alignItems: 'center' }}>
                      <TextInput
                        ref={ref => { inputRefs.current[`${p.player_id}-${holeNum}`] = ref; }}
                        value={getValue(p.player_id, holeNum)}
                        onChangeText={v => handleChange(p.player_id, holeNum, v)}
                        onBlur={() => handleBlur(p.player_id, holeNum)}
                        keyboardType="number-pad"
                        inputMode="numeric"
                        maxLength={2}
                        style={{
                          width: 42,
                          height: 38,
                          backgroundColor: grossMap[p.player_id]?.[holeNum] ? Colors.greenLight + '33' : Colors.background,
                          borderRadius: 8,
                          textAlign: 'center',
                          fontSize: 16,
                          fontWeight: '700',
                          color: Colors.text,
                          borderWidth: 1,
                          borderColor: localScores[p.player_id]?.[holeNum] ? Colors.gold : Colors.border,
                        }}
                      />
                    </View>
                  ))}
                </View>
                {(isNinth || is18th) && (
                  <View style={{ flexDirection: 'row', backgroundColor: Colors.greenDark + 'CC', paddingVertical: 6, alignItems: 'center' }}>
                    <View style={{ width: HOLE_COL_W + 36, alignItems: 'center' }}>
                      <Text style={{ color: Colors.white, fontSize: 12, fontWeight: '700' }}>{isNinth ? '1ª Vuelta' : 'Total'}</Text>
                    </View>
                    {players.map(p => {
                      const halfHoles = isNinth
                        ? holeOrder.slice(0, idx + 1)
                        : holeOrder;
                      const sum = halfHoles.reduce((s, h) => s + (grossMap[p.player_id]?.[h] ?? 0), 0);
                      return (
                        <View key={p.player_id} style={{ width: COL_W, alignItems: 'center' }}>
                          <Text style={{ color: Colors.white, fontWeight: '700', fontSize: 14, fontVariant: ['tabular-nums'] }}>{sum || ''}</Text>
                        </View>
                      );
                    })}
                  </View>
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
    ? calcMarcas(netMap, playerIds, holeOrder.filter(h => holeOrder.indexOf(h) !== -1))
    : null;

  const individualResults = gameConfigs.individuales?.active
    ? calcIndividualAll(playerIds, netMap, holeOrder, gameConfigs.individuales.bet_amount, gameConfigs.presiones?.active ?? false)
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

  function signColor(v: number) { return v > 0 ? Colors.success : v < 0 ? Colors.error : Colors.textSecondary; }
  function signStr(v: number) { return v > 0 ? `+${v}` : String(v); }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }} contentInsetAdjustmentBehavior="automatic">

      {/* Marcas */}
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

      {/* Individual */}
      {individualResults.length > 0 && (
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: Colors.greenDark }}>🏌️ Individuales (Match)</Text>
          {individualResults.map(r => (
            <View key={r.matchup} style={{ backgroundColor: Colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.border, gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: Colors.text }}>
                  {nameMap[r.playerA]} vs {nameMap[r.playerB]}
                </Text>
                <Text style={{ fontSize: 16, fontWeight: '800', color: signColor(r.matchTotal), fontVariant: ['tabular-nums'] }}>
                  {signStr(r.matchTotal)}
                </Text>
              </View>
              <Text style={{ fontSize: 12, color: Colors.textSecondary }}>
                Medal: {nameMap[r.playerA]} {r.medalTotalA} · {nameMap[r.playerB]} {r.medalTotalB}
              </Text>
              {r.presiones.length > 0 && (
                <Text style={{ fontSize: 12, color: Colors.warning }}>
                  {r.presiones.length} presión(es) activa(s)
                </Text>
              )}
            </View>
          ))}
        </View>
      )}

      {/* Parejas */}
      {parejasResults.length > 0 && (
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: Colors.greenDark }}>👥 Parejas</Text>
          {parejasResults.map(m => (
            <View key={`${m.pairA}-${m.pairB}`} style={{ backgroundColor: Colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.border, gap: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.textSecondary }}>Pareja {m.pairA} vs Pareja {m.pairB}</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 13, color: Colors.text }}>Best Ball</Text>
                <Text style={{ fontWeight: '700', color: signColor(m.bestTotal), fontVariant: ['tabular-nums'] }}>{signStr(m.bestTotal)}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 13, color: Colors.text }}>Worst Ball</Text>
                <Text style={{ fontWeight: '700', color: signColor(m.worstTotal), fontVariant: ['tabular-nums'] }}>{signStr(m.worstTotal)}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderColor: Colors.border, paddingTop: 6, marginTop: 2 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: Colors.text }}>Total</Text>
                <Text style={{ fontSize: 14, fontWeight: '800', color: signColor(m.totalResult), fontVariant: ['tabular-nums'] }}>{signStr(m.totalResult)}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Pareja Base */}
      {parejaBaseResults.length > 0 && basePairData && (
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: Colors.greenDark }}>🏆 Pareja Base</Text>
          {parejaBaseResults.map((m, i) => (
            <View key={i} style={{ backgroundColor: Colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.border, gap: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.textSecondary }}>
                {nameMap[basePairData.player1_id]}/{nameMap[basePairData.player2_id]} vs Pareja {m.pairB}
              </Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: Colors.text }}>Total</Text>
                <Text style={{ fontSize: 14, fontWeight: '800', color: signColor(m.totalResult), fontVariant: ['tabular-nums'] }}>{signStr(m.totalResult)}</Text>
              </View>
            </View>
          ))}
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

function DinerosTab({ round, holes, grossMap, holeOrder }: {
  round: RoundData;
  holes: HoleInfo[];
  grossMap: ScoreMap;
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
  const individualResults = calcIndividualAll(playerIds, netMap, holeOrder, gameConfigs.individuales?.bet_amount ?? 25, gameConfigs.presiones?.active ?? false);
  const pairings: Pairing[] = round.round_pairings;
  const parejasResults = pairings.length >= 2 ? calcParejas(pairings, netMap, holeOrder) : [];
  const basePairData = round.round_base_pair?.[0] ?? null;
  const otherPairings = pairings.filter(p => basePairData ? !(p.player1_id === basePairData.player1_id && p.player2_id === basePairData.player2_id) : true);
  const parejaBaseResults = basePairData ? calcParejaBase(basePairData, otherPairings, netMap, holeOrder) : [];

  const dineros = calcDineros(playerIds, gameConfigs, marcas, individualResults, parejasResults, parejaBaseResults, pairings, basePairData);

  function fmt(n: number) { return (n >= 0 ? '+' : '') + `$${Math.abs(n).toLocaleString('es-MX')}`; }
  function color(n: number) { return n > 0 ? Colors.success : n < 0 ? Colors.error : Colors.textSecondary; }

  const activeGames = ['marcas', 'individuales', 'parejas', 'parejas_base', 'presiones'].filter(g => gameConfigs[g]?.active);
  const gameLabels: Record<string, string> = { marcas: 'Marcas', individuales: 'Individual', parejas: 'Parejas', parejas_base: 'P. Base', presiones: 'Presiones' };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }} contentInsetAdjustmentBehavior="automatic">
      <View style={{ backgroundColor: Colors.card, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', backgroundColor: Colors.greenDark, padding: 10 }}>
          <Text style={{ flex: 1, color: Colors.white, fontWeight: '700', fontSize: 13 }}>Jugador</Text>
          {activeGames.map(g => (
            <Text key={g} style={{ width: 64, textAlign: 'center', color: Colors.greenLight, fontSize: 11, fontWeight: '700' }}>{gameLabels[g]}</Text>
          ))}
          <Text style={{ width: 70, textAlign: 'right', color: Colors.gold, fontWeight: '800', fontSize: 13 }}>Total</Text>
        </View>

        {/* Rows */}
        {dineros.sort((a, b) => b.total - a.total).map((row, i) => (
          <View key={row.player_id} style={{ flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: i % 2 === 0 ? Colors.card : Colors.background }}>
            <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: Colors.text }} numberOfLines={1}>
              {nameMap[row.player_id]?.split(' ')[0]}
            </Text>
            {activeGames.map(g => {
              const val = row[g as keyof typeof row] as number;
              return (
                <Text key={g} style={{ width: 64, textAlign: 'center', fontSize: 12, fontWeight: '700', color: color(val), fontVariant: ['tabular-nums'] }}>
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
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>('Scorecard');

  const { data: round, isLoading: loadingRound } = useRoundData(id);
  const { data: holes = [], isLoading: loadingHoles } = useCourseHoles(round?.course_id ?? '');
  const { grossMap } = useScores(id);

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

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <Stack.Screen options={{ title: round.courses?.name ?? 'Partida', headerBackTitle: 'Atrás' }} />

      {/* Tab bar */}
      <View style={{ flexDirection: 'row', backgroundColor: Colors.card, borderBottomWidth: 1, borderColor: Colors.border }}>
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
      </View>

      {/* Content */}
      {activeTab === 'Scorecard' && <ScorecardTab round={round} holes={holes} grossMap={grossMap} holeOrder={holeOrder} />}
      {activeTab === 'Resultados' && <ResultadosTab round={round} holes={holes} grossMap={grossMap} holeOrder={holeOrder} />}
      {activeTab === 'Dineros' && <DinerosTab round={round} holes={holes} grossMap={grossMap} holeOrder={holeOrder} />}
    </View>
  );
}
