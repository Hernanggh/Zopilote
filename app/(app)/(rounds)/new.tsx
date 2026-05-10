import { useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Switch, ActivityIndicator, Modal, FlatList } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Colors, Fonts } from '@/constants/colors';

type Course = { id: string; name: string };
type Player = { id: string; name: string; default_handicap: number; suffix?: string | null };
type RoundPlayer = { player_id: string; name: string; suffix?: string | null; handicap: number };
type GameConfig = { active: boolean; bet_amount: number };
type GameKey = 'marcas' | 'marcas_esp' | 'individuales' | 'individuales_medal' | 'parejas' | 'parejas_medal' | 'parejas_base' | 'parejas_base_medal' | 'presiones';

const GAME_LABELS: Record<GameKey, string> = {
  marcas: 'Plumas (hoyo neto)',
  marcas_esp: 'Marcas Especiales',
  individuales: 'Individuales Match',
  individuales_medal: 'Individuales Medal',
  parejas: 'Parejas Match',
  parejas_medal: 'Parejas Medal',
  parejas_base: 'Pareja Base Match',
  parejas_base_medal: 'Pareja Base Medal',
  presiones: 'Presiones',
};

const GAME_INDENT: Partial<Record<GameKey, true>> = {
  individuales_medal: true,
  parejas_medal: true,
  parejas_base_medal: true,
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 24, gap: 10 }}>
      <Text style={{ fontFamily: Fonts.mono, fontSize: 10, fontWeight: '700', letterSpacing: 1.5, color: Colors.textSecondary }}>
        {title.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}

function ErrorBanner({ message }: { message: string }) {
  if (!message) return null;
  return (
    <View style={{ backgroundColor: Colors.error + '15', borderRadius: 4, padding: 12, marginBottom: 16, borderLeftWidth: 3, borderLeftColor: Colors.error }}>
      <Text style={{ fontFamily: Fonts.mono, color: Colors.error, fontSize: 12 }}>{message}</Text>
    </View>
  );
}

export default function NewRound() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [courseId, setCourseId] = useState('');
  const [startHole, setStartHole] = useState<1 | 10>(1);
  const [players, setPlayers] = useState<RoundPlayer[]>([]);
  const [games, setGames] = useState<Record<GameKey, GameConfig>>({
    marcas:             { active: true,  bet_amount: 10  },
    marcas_esp:         { active: true,  bet_amount: 50  },
    individuales:       { active: true,  bet_amount: 25  },
    individuales_medal: { active: true,  bet_amount: 25  },
    parejas:            { active: false, bet_amount: 50  },
    parejas_medal:      { active: false, bet_amount: 50  },
    parejas_base:       { active: false, bet_amount: 50  },
    parejas_base_medal: { active: false, bet_amount: 50  },
    presiones:          { active: false, bet_amount: 0   },
  });
  const [pairings, setPairings] = useState<{ pair_number: number; p1: string; p2: string }[]>([]);
  const [basePair, setBasePair] = useState<{ p1: string; p2: string } | null>(null);
  const [showPlayerPicker, setShowPlayerPicker] = useState(false);
  const [showCoursePicker, setShowCoursePicker] = useState(false);

  const { data: courses = [] } = useQuery<Course[]>({
    queryKey: ['courses'],
    queryFn: async () => {
      const { data, error } = await supabase.from('courses').select('id, name').order('name');
      if (error) throw error;
      return data;
    },
  });

  const { data: allPlayers = [] } = useQuery<Player[]>({
    queryKey: ['players'],
    queryFn: async () => {
      const { data, error } = await supabase.from('players').select('*').order('name');
      if (error) throw error;
      return data;
    },
  });

  useQuery({
    queryKey: ['user_preferences'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase.from('user_preferences').select('default_course_id').eq('user_id', user.id).maybeSingle();
      if (data?.default_course_id) setCourseId(data.default_course_id);
      return data;
    },
  });

  useQuery({
    queryKey: ['user_game_defaults'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from('user_game_defaults')
        .select('game_type, active, bet_amount')
        .eq('user_id', user.id);
      if (data?.length) {
        setGames(prev => {
          const next = { ...prev };
          data.forEach(c => {
            if (next[c.game_type as GameKey]) {
              next[c.game_type as GameKey] = { active: c.active, bet_amount: c.bet_amount };
            }
          });
          return next;
        });
        return data;
      }
      const { data: lastRound } = await supabase
        .from('rounds')
        .select('round_game_config(game_type, active, bet_amount)')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      const configs = (lastRound as any)?.round_game_config as { game_type: string; active: boolean; bet_amount: number }[] | undefined;
      if (configs?.length) {
        setGames(prev => {
          const next = { ...prev };
          configs.forEach(c => {
            if (next[c.game_type as GameKey]) {
              next[c.game_type as GameKey] = { active: c.active, bet_amount: c.bet_amount };
            }
          });
          return next;
        });
      }
      return null;
    },
  });

  const courseName = courses.find(c => c.id === courseId)?.name ?? 'Seleccionar campo';
  const availablePlayers = allPlayers.filter(p => !players.find(rp => rp.player_id === p.id));

  function addPlayer(p: Player) {
    if (players.length >= 6) { setErrorMsg('Máximo 6 jugadores'); return; }
    setErrorMsg('');
    setPlayers(prev => [...prev, { player_id: p.id, name: p.name, suffix: p.suffix, handicap: p.default_handicap }]);
    setShowPlayerPicker(false);
  }

  function removePlayer(id: string) {
    setPlayers(prev => prev.filter(p => p.player_id !== id));
    setPairings(prev => prev.filter(p => p.p1 !== id && p.p2 !== id));
    if (basePair?.p1 === id || basePair?.p2 === id) setBasePair(null);
  }

  function updateHandicap(id: string, val: string) {
    const h = parseInt(val, 10);
    setPlayers(prev => prev.map(p => p.player_id === id ? { ...p, handicap: isNaN(h) ? 0 : h } : p));
  }

  function toggleGame(key: GameKey) {
    setGames(prev => ({ ...prev, [key]: { ...prev[key], active: !prev[key].active } }));
  }

  function updateBet(key: GameKey, val: string) {
    const n = parseInt(val, 10);
    setGames(prev => ({ ...prev, [key]: { ...prev[key], bet_amount: isNaN(n) ? 0 : n } }));
  }

  function addPairing() {
    const used = pairings.flatMap(p => [p.p1, p.p2]);
    const avail = players.filter(p => !used.includes(p.player_id));
    if (avail.length < 2) { setErrorMsg('No hay jugadores sin pareja disponibles'); return; }
    const num = pairings.length + 1;
    if (num > 3) { setErrorMsg('Máximo 3 parejas'); return; }
    setErrorMsg('');
    setPairings(prev => [...prev, { pair_number: num, p1: avail[0].player_id, p2: avail[1].player_id }]);
  }

  function updatePairing(idx: number, field: 'p1' | 'p2', value: string) {
    setPairings(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p));
  }

  async function save() {
    setErrorMsg('');
    if (!courseId) { setErrorMsg('Selecciona un campo'); return; }
    if (players.length < 2) { setErrorMsg('Agrega al menos 2 jugadores'); return; }
    if (games.parejas.active && pairings.length < 2) { setErrorMsg('Necesitas al menos 2 parejas para Juego Parejas'); return; }
    if (games.parejas.active) {
      const allIds = pairings.flatMap(p => [p.p1, p.p2]);
      const hasDups = allIds.length !== new Set(allIds).size;
      if (hasDups) { setErrorMsg('Hay jugadores repetidos en las parejas'); return; }
    }
    if ((games.parejas_base.active || games.parejas_base_medal.active) && !basePair) { setErrorMsg('Selecciona la Pareja Base'); return; }

    setSaving(true);
    try {
      const { data: { user }, error: authErr } = await supabase.auth.getUser();
      if (authErr || !user) throw new Error('No autenticado. Cierra sesión y vuelve a entrar.');

      const { data: round, error: roundErr } = await supabase
        .from('rounds')
        .insert({ course_id: courseId, start_hole: startHole, created_by: user.id, status: 'active', date: new Date().toLocaleDateString('en-CA') })
        .select('id')
        .single();
      if (roundErr) throw roundErr;

      const roundId = round.id;

      const { error: orgErr } = await supabase.from('round_organizers').insert({ round_id: roundId, user_id: user.id });
      if (orgErr) throw orgErr;

      const { error: rpErr } = await supabase.from('round_players').insert(
        players.map((p, i) => ({ round_id: roundId, player_id: p.player_id, handicap: p.handicap, position: i + 1 }))
      );
      if (rpErr) throw rpErr;

      const { error: gcErr } = await supabase.from('round_game_config').insert(
        (Object.keys(games) as GameKey[]).map(k => ({ round_id: roundId, game_type: k, active: games[k].active, bet_amount: games[k].bet_amount }))
      );
      if (gcErr) throw gcErr;

      if (pairings.length > 0) {
        const { error: pairErr } = await supabase.from('round_pairings').insert(
          pairings.map(p => ({ round_id: roundId, pair_number: p.pair_number, player1_id: p.p1, player2_id: p.p2 }))
        );
        if (pairErr) throw pairErr;
      }

      if (basePair) {
        const { error: bpErr } = await supabase.from('round_base_pair').insert(
          { round_id: roundId, player1_id: basePair.p1, player2_id: basePair.p2 }
        );
        if (bpErr) throw bpErr;
      }

      supabase.functions.invoke('send-round-invitation', { body: { roundId } }).catch(() => {});
      router.replace(`/${roundId}`);
    } catch (e: any) {
      setErrorMsg(e.message ?? 'Error al crear la partida');
    } finally {
      setSaving(false);
    }
  }

  const playerOptions = players.map(p => ({ label: p.suffix ? `${p.name} ${p.suffix}` : p.name, value: p.player_id }));

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 20, paddingBottom: 48 }} contentInsetAdjustmentBehavior="automatic">

        {/* Page header */}
        <View style={{ paddingBottom: 20, marginBottom: 8 }}>
          <Text style={{ fontFamily: Fonts.serif, fontSize: 28, color: Colors.text }}>Nueva Partida</Text>
          <Text style={{ fontFamily: Fonts.fraunces, fontStyle: 'italic', fontSize: 13, color: Colors.textSecondary, marginTop: 4 }}>
            Configura campo, jugadores y apuestas
          </Text>
        </View>

        <ErrorBanner message={errorMsg} />

        {/* Campo */}
        <Section title="Campo">
          <Pressable
            onPress={() => setShowCoursePicker(true)}
            style={{ backgroundColor: Colors.card, borderRadius: 6, paddingHorizontal: 16, paddingVertical: 14, borderWidth: 1, borderColor: courseId ? Colors.gold : Colors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <Text style={{ fontFamily: Fonts.serif, fontSize: 17, color: courseId ? Colors.text : Colors.textSecondary }}>{courseName}</Text>
            <Text style={{ fontFamily: Fonts.mono, color: Colors.textSecondary, fontSize: 16 }}>›</Text>
          </Pressable>

          <View style={{ flexDirection: 'row', gap: 8 }}>
            {([1, 10] as const).map(h => (
              <Pressable
                key={h}
                onPress={() => setStartHole(h)}
                style={{ flex: 1, backgroundColor: startHole === h ? Colors.greenDark : Colors.card, borderRadius: 6, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: startHole === h ? Colors.gold : Colors.border }}
              >
                <Text style={{ fontFamily: Fonts.mono, fontSize: 11, fontWeight: '700', letterSpacing: 1, color: startHole === h ? Colors.white : Colors.text }}>
                  HOYO {h}
                </Text>
              </Pressable>
            ))}
          </View>
        </Section>

        {/* Jugadores */}
        <Section title={`Jugadores (${players.length}/6)`}>
          {players.map((p, i) => (
            <View key={p.player_id} style={{ backgroundColor: Colors.card, borderRadius: 6, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Text style={{ fontFamily: Fonts.serif, fontSize: 16, color: Colors.text, flex: 1 }}>{p.name}{p.suffix ? ` ${p.suffix}` : ''}</Text>
              <Text style={{ fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1, color: Colors.textSecondary }}>HCP</Text>
              <TextInput
                value={String(p.handicap)}
                onChangeText={v => updateHandicap(p.player_id, v)}
                keyboardType="number-pad"
                inputMode="numeric"
                style={{ fontFamily: Fonts.mono, fontSize: 16, fontWeight: '700', color: Colors.text, borderBottomWidth: 1, borderColor: Colors.border, paddingVertical: 4, width: 40, textAlign: 'center' }}
              />
              <Pressable onPress={() => removePlayer(p.player_id)} style={{ padding: 4 }}>
                <Text style={{ fontFamily: Fonts.mono, fontSize: 16, color: Colors.textSecondary + '88' }}>×</Text>
              </Pressable>
            </View>
          ))}
          {players.length < 6 && (
            <Pressable
              onPress={() => setShowPlayerPicker(true)}
              style={{ borderStyle: 'dashed', borderWidth: 1.5, borderColor: Colors.border, borderRadius: 6, paddingVertical: 14, alignItems: 'center' }}
            >
              <Text style={{ fontFamily: Fonts.mono, fontSize: 11, fontWeight: '700', letterSpacing: 1, color: Colors.textSecondary }}>+ AGREGAR JUGADOR</Text>
            </Pressable>
          )}
        </Section>

        {/* Juegos */}
        <Section title="Juegos y Apuestas">
          {(Object.keys(games) as GameKey[]).map(key => {
            const indented = !!GAME_INDENT[key];
            return (
              <View key={key} style={{ backgroundColor: Colors.card, borderRadius: 6, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 16, paddingVertical: 12, marginLeft: indented ? 16 : 0, borderLeftWidth: indented ? 3 : 1, borderLeftColor: indented ? Colors.gold + '55' : Colors.border, gap: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{
                    fontFamily: indented ? Fonts.fraunces : Fonts.serif,
                    fontStyle: indented ? 'italic' : 'normal',
                    fontSize: indented ? 14 : 16,
                    color: indented ? Colors.textSecondary : Colors.text,
                    flex: 1,
                  }}>{GAME_LABELS[key]}</Text>
                  <Switch
                    value={games[key].active}
                    onValueChange={() => toggleGame(key)}
                    trackColor={{ false: Colors.border, true: Colors.greenDark }}
                    thumbColor={games[key].active ? Colors.gold : Colors.white}
                  />
                </View>
                {games[key].active && key !== 'presiones' && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1, color: Colors.textSecondary }}>APUESTA $</Text>
                    <TextInput
                      value={String(games[key].bet_amount)}
                      onChangeText={v => updateBet(key, v)}
                      keyboardType="number-pad"
                      inputMode="numeric"
                      style={{ fontFamily: Fonts.mono, fontSize: 16, fontWeight: '700', color: Colors.text, borderBottomWidth: 1, borderColor: Colors.border, paddingVertical: 4, width: 64, textAlign: 'right' }}
                    />
                  </View>
                )}
              </View>
            );
          })}
        </Section>

        {/* Parejas */}
        {games.parejas.active && players.length >= 4 && (
          <Section title="Asignación de Parejas">
            {pairings.map((pair, idx) => (
              <View key={idx} style={{ backgroundColor: Colors.card, borderRadius: 6, borderWidth: 1, borderColor: Colors.border, padding: 14, gap: 10 }}>
                <Text style={{ fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1.5, color: Colors.textSecondary }}>PAREJA {pair.pair_number}</Text>
                {(['p1', 'p2'] as const).map((field, fi) => (
                  <View key={field} style={{ gap: 6 }}>
                    <Text style={{ fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1, color: Colors.textSecondary + '88' }}>JUGADOR {fi + 1}</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      {playerOptions.map(opt => {
                        const isSelected = pair[field] === opt.value;
                        const sameSlot = (field === 'p1' ? pair.p2 : pair.p1) === opt.value;
                        return (
                          <Pressable
                            key={opt.value}
                            disabled={sameSlot}
                            onPress={() => updatePairing(idx, field, opt.value)}
                            style={{ borderRadius: 4, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: isSelected ? Colors.greenDark : Colors.background, borderWidth: 1, borderColor: isSelected ? Colors.gold : Colors.border, opacity: sameSlot ? 0.3 : 1 }}
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
            {pairings.length < 3 && (
              <Pressable onPress={addPairing} style={{ borderStyle: 'dashed', borderWidth: 1.5, borderColor: Colors.border, borderRadius: 6, paddingVertical: 14, alignItems: 'center' }}>
                <Text style={{ fontFamily: Fonts.mono, fontSize: 11, fontWeight: '700', letterSpacing: 1, color: Colors.textSecondary }}>+ PAREJA {pairings.length + 1}</Text>
              </Pressable>
            )}
          </Section>
        )}

        {/* Pareja Base */}
        {games.parejas_base.active && players.length >= 2 && (
          <Section title="Pareja Base">
            <View style={{ backgroundColor: Colors.card, borderRadius: 6, borderWidth: 1, borderColor: Colors.border, padding: 14, gap: 10 }}>
              {(['p1', 'p2'] as const).map((field, fi) => (
                <View key={field} style={{ gap: 6 }}>
                  <Text style={{ fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1, color: Colors.textSecondary + '88' }}>JUGADOR {fi + 1}</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {playerOptions.map(opt => {
                      const isSelected = basePair?.[field] === opt.value;
                      const other = field === 'p1' ? basePair?.p2 : basePair?.p1;
                      return (
                        <Pressable
                          key={opt.value}
                          disabled={other === opt.value}
                          onPress={() => setBasePair(prev => ({ ...(prev ?? { p1: '', p2: '' }), [field]: opt.value }))}
                          style={{ borderRadius: 4, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: isSelected ? Colors.greenDark : Colors.background, borderWidth: 1, borderColor: isSelected ? Colors.gold : Colors.border, opacity: other === opt.value ? 0.3 : 1 }}
                        >
                          <Text style={{ fontFamily: Fonts.serif, fontSize: 14, color: isSelected ? Colors.white : Colors.text }}>{opt.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ))}
            </View>
          </Section>
        )}

        <ErrorBanner message={errorMsg} />

        <Pressable
          onPress={save}
          disabled={saving}
          style={{ backgroundColor: saving ? Colors.textSecondary : Colors.greenDark, borderRadius: 6, borderWidth: 1, borderColor: Colors.gold, padding: 16, alignItems: 'center', marginTop: 8 }}
        >
          {saving
            ? <ActivityIndicator color={Colors.gold} />
            : <Text style={{ fontFamily: Fonts.mono, color: Colors.white, fontSize: 12, fontWeight: '700', letterSpacing: 1.5 }}>INICIAR PARTIDA</Text>
          }
        </Pressable>

        <Pressable onPress={() => router.back()} style={{ padding: 16, alignItems: 'center' }}>
          <Text style={{ fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1, color: Colors.textSecondary }}>CANCELAR</Text>
        </Pressable>
      </ScrollView>

      {/* Course picker */}
      <Modal visible={showCoursePicker} animationType="slide" presentationStyle="formSheet" onRequestClose={() => setShowCoursePicker(false)}>
        <View style={{ flex: 1, backgroundColor: Colors.background }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderColor: Colors.border }}>
            <Text style={{ fontFamily: Fonts.serif, fontSize: 20, color: Colors.text }}>Seleccionar Campo</Text>
            <Pressable onPress={() => setShowCoursePicker(false)}>
              <Text style={{ fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1, color: Colors.textSecondary }}>CERRAR</Text>
            </Pressable>
          </View>
          <FlatList
            data={courses}
            keyExtractor={c => c.id}
            contentContainerStyle={{ padding: 12, gap: 8 }}
            ListEmptyComponent={<Text style={{ fontFamily: Fonts.fraunces, fontStyle: 'italic', textAlign: 'center', color: Colors.textSecondary, marginTop: 32 }}>No hay campos registrados</Text>}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => { setCourseId(item.id); setShowCoursePicker(false); setErrorMsg(''); }}
                style={{ backgroundColor: Colors.card, borderRadius: 6, paddingHorizontal: 16, paddingVertical: 14, borderWidth: 1, borderColor: courseId === item.id ? Colors.gold : Colors.border }}
              >
                <Text style={{ fontFamily: Fonts.serif, fontSize: 17, color: Colors.text }}>{item.name}</Text>
              </Pressable>
            )}
          />
        </View>
      </Modal>

      {/* Player picker */}
      <Modal visible={showPlayerPicker} animationType="slide" presentationStyle="formSheet" onRequestClose={() => setShowPlayerPicker(false)}>
        <View style={{ flex: 1, backgroundColor: Colors.background }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderColor: Colors.border }}>
            <Text style={{ fontFamily: Fonts.serif, fontSize: 20, color: Colors.text }}>Agregar Jugador</Text>
            <Pressable onPress={() => setShowPlayerPicker(false)}>
              <Text style={{ fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1, color: Colors.textSecondary }}>CERRAR</Text>
            </Pressable>
          </View>
          <FlatList
            data={availablePlayers}
            keyExtractor={p => p.id}
            contentContainerStyle={{ padding: 12, gap: 8 }}
            ListEmptyComponent={<Text style={{ fontFamily: Fonts.fraunces, fontStyle: 'italic', textAlign: 'center', color: Colors.textSecondary, marginTop: 32 }}>Todos los jugadores ya están en la partida</Text>}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => addPlayer(item)}
                style={{ backgroundColor: Colors.card, borderRadius: 6, paddingHorizontal: 16, paddingVertical: 14, borderWidth: 1, borderColor: Colors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <Text style={{ fontFamily: Fonts.serif, fontSize: 17, color: Colors.text }}>{item.name}{item.suffix ? ` ${item.suffix}` : ''}</Text>
                <Text style={{ fontFamily: Fonts.mono, fontSize: 11, color: Colors.textSecondary }}>
                  HCP <Text style={{ fontWeight: '700', color: Colors.gold }}>{item.default_handicap}</Text>
                </Text>
              </Pressable>
            )}
          />
        </View>
      </Modal>
    </View>
  );
}
