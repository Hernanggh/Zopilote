import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, ActivityIndicator, Switch } from 'react-native';
import { Stack, useLocalSearchParams, Redirect, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Colors, Fonts } from '@/constants/colors';
import { useRoundData, useCourseHoles, useScores, useSpecialMarcas } from './_roundHooks';
import { ALL_GAME_KEYS, GAME_LABELS_SETUP, TABS } from './_roundConstants';
import { ScorecardTab } from './_ScorecardTab';
import { ResultadosTab } from './_ResultadosTab';
import { DinerosTab } from './_DinerosTab';

// ─── Main Screen ─────────────────────────────────────────────────────────────

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
  const [setupStartHole, setSetupStartHole] = useState<1 | 10>(1);
  const [setupCoOrgs, setSetupCoOrgs] = useState<string[]>([]);
  const [setupSaving, setSetupSaving] = useState(false);
  const [setupErr, setSetupErr] = useState('');

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const { data: round, isLoading: loadingRound } = useRoundData(id);
  const { data: holes = [], isLoading: loadingHoles } = useCourseHoles(round?.course_id ?? '');
  const { grossMap } = useScores(id);
  const { marcasEspMap } = useSpecialMarcas(id);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setCurrentUserId(user?.id ?? null));
  }, []);

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

  const startIdx = round.start_hole === 10 ? 9 : 0;
  const holeOrder = Array.from({ length: 18 }, (_, i) => ((startIdx + i) % 18) + 1);
  const isActive = round.status === 'active' || round.status === 'setup';
  const isOrganizer = !currentUserId || round.round_organizers.some(o => o.user_id === currentUserId);
  const isCreator = currentUserId === round.created_by;

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
    setSetupStartHole((round.start_hole as 1 | 10) ?? 1);
    setSetupCoOrgs(round.round_organizers.filter(o => o.user_id !== round.created_by).map(o => o.user_id));
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

    const { error: shErr } = await supabase.from('rounds').update({ start_hole: setupStartHole }).eq('id', id);
    if (shErr) allErrs.push(shErr.message);

    // Co-organizadores: borrar los que ya no están, insertar los nuevos
    const { error: delOrgErr } = await supabase.from('round_organizers')
      .delete().eq('round_id', id).neq('user_id', round.created_by);
    if (delOrgErr) { allErrs.push(delOrgErr.message); }
    else if (setupCoOrgs.length > 0) {
      const { error: insOrgErr } = await supabase.from('round_organizers').insert(
        setupCoOrgs.map(uid => ({ round_id: id, user_id: uid }))
      );
      if (insOrgErr) allErrs.push(insOrgErr.message);
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
          {isOrganizer ? (
            isActive ? (
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
            )
          ) : (
            <Pressable onPress={() => router.replace('/')} style={{ borderWidth: 1, borderColor: Colors.border, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 5 }}>
              <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.5, color: Colors.textSecondary, fontFamily: Fonts.mono }}>REGRESAR</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Content */}
      {activeTab === 'Scorecard' && <ScorecardTab round={round} holes={holes} grossMap={grossMap} marcasEspMap={marcasEspMap} holeOrder={Array.from({ length: 18 }, (_, i) => i + 1)} readonly={!isActive || !isOrganizer} isOrganizer={isOrganizer} currentUserId={currentUserId} />}
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
              const playerOpts = sortedPlayers.map(p => ({ label: p.players.suffix ? `${p.players.name} ${p.players.suffix}` : p.players.name, value: p.player_id }));
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
                                      <Text style={{ fontFamily: Fonts.serif, fontSize: 14, color: isSelected ? Colors.white : Colors.text }}>{opt.label}</Text>
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

                  {/* Hoyo de salida */}
                  <View style={{ gap: 8 }}>
                    <Text style={{ fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1.5, color: Colors.textSecondary }}>HOYO DE SALIDA</Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {([1, 10] as const).map(h => (
                        <Pressable
                          key={h}
                          onPress={() => setSetupStartHole(h)}
                          style={{ flex: 1, backgroundColor: setupStartHole === h ? Colors.greenDark : Colors.card, borderRadius: 6, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: setupStartHole === h ? Colors.gold : Colors.border }}
                        >
                          <Text style={{ fontFamily: Fonts.mono, fontSize: 11, fontWeight: '700', letterSpacing: 1, color: setupStartHole === h ? Colors.white : Colors.text }}>HOYO {h}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>

                  {/* Co-organizadores — solo visible para el creador */}
                  {isCreator && (() => {
                    const linkedPlayers = sortedPlayers.filter(p => p.players.user_id && p.players.user_id !== round.created_by);
                    if (linkedPlayers.length === 0) return null;
                    return (
                      <View style={{ gap: 8 }}>
                        <Text style={{ fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1.5, color: Colors.textSecondary }}>CO-ORGANIZADORES</Text>
                        {linkedPlayers.map(p => {
                          const uid = p.players.user_id!;
                          const isCoOrg = setupCoOrgs.includes(uid);
                          return (
                            <View key={p.player_id} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.card, borderRadius: 6, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: isCoOrg ? Colors.gold + '66' : Colors.border, gap: 10 }}>
                              <Switch
                                value={isCoOrg}
                                onValueChange={v => setSetupCoOrgs(prev => v ? [...prev, uid] : prev.filter(u => u !== uid))}
                                trackColor={{ false: Colors.border, true: Colors.greenDark }}
                                thumbColor={isCoOrg ? Colors.gold : Colors.white}
                              />
                              <Text style={{ fontFamily: Fonts.serif, flex: 1, fontSize: 15, color: Colors.text }}>
                                {p.players.suffix ? `${p.players.name} ${p.players.suffix}` : p.players.name}
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                    );
                  })()}

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
