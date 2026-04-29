import { useState } from 'react';
import { View, Text, ScrollView, Switch, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { Stack } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Colors, Fonts } from '@/constants/colors';

const ALL_GAME_KEYS = [
  'marcas', 'marcas_esp', 'individuales', 'individuales_medal',
  'parejas', 'parejas_medal', 'parejas_base', 'parejas_base_medal', 'presiones',
] as const;
type GameKey = typeof ALL_GAME_KEYS[number];

const GAME_LABELS: Record<GameKey, string> = {
  marcas: 'Plumas', marcas_esp: 'Marcas Especiales',
  individuales: 'Individuales Match', individuales_medal: 'Individuales Medal',
  parejas: 'Parejas Match', parejas_medal: 'Parejas Medal',
  parejas_base: 'Pareja Base Match', parejas_base_medal: 'Pareja Base Medal',
  presiones: 'Presiones',
};

type GameState = Record<GameKey, { active: boolean; bet_amount: number }>;

export default function Defaults() {
  const qc = useQueryClient();
  const [games, setGames] = useState<GameState | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');

  useQuery({
    queryKey: ['user_game_defaults'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from('user_game_defaults')
        .select('game_type, active, bet_amount')
        .eq('user_id', user.id);
      const init: GameState = {} as GameState;
      ALL_GAME_KEYS.forEach(k => { init[k] = { active: false, bet_amount: 0 }; });
      data?.forEach(r => {
        if (r.game_type in init) init[r.game_type as GameKey] = { active: r.active, bet_amount: r.bet_amount };
      });
      setGames(init);
      return data;
    },
  });

  async function save() {
    if (!games) return;
    setSaving(true);
    setErr('');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }
    const { error } = await supabase.from('user_game_defaults').upsert(
      ALL_GAME_KEYS.map(k => ({ user_id: user.id, game_type: k, active: games[k].active, bet_amount: games[k].bet_amount })),
      { onConflict: 'user_id,game_type' }
    );
    setSaving(false);
    if (error) {
      setErr(error.message);
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      qc.invalidateQueries({ queryKey: ['user_game_defaults'] });
    }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: Colors.background }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Page header */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingVertical: 8, paddingHorizontal: 4, marginBottom: 4 }}>
        <View style={{ gap: 4 }}>
          <Text style={{ fontFamily: Fonts.serif, fontSize: 28, color: Colors.text }}>Juegos por defecto</Text>
          <Text style={{ fontFamily: Fonts.fraunces, fontStyle: 'italic', fontSize: 13, color: Colors.textSecondary }}>
            Se pre-cargan al crear una nueva partida
          </Text>
        </View>
        <Pressable
          onPress={save}
          disabled={saving || !games}
          style={{ borderWidth: 1, borderColor: saved ? Colors.success : Colors.gold, borderRadius: 4, paddingHorizontal: 14, paddingVertical: 8, marginTop: 6 }}
        >
          {saving
            ? <ActivityIndicator size="small" color={Colors.gold} />
            : <Text style={{ fontFamily: Fonts.mono, fontSize: 11, fontWeight: '700', letterSpacing: 1, color: saved ? Colors.success : Colors.goldText }}>
                {saved ? 'GUARDADO' : 'GUARDAR'}
              </Text>
          }
        </Pressable>
      </View>

      {!!err && (
        <View style={{ backgroundColor: Colors.error + '15', borderRadius: 4, padding: 12, borderLeftWidth: 3, borderLeftColor: Colors.error }}>
          <Text style={{ fontFamily: Fonts.mono, fontSize: 12, color: Colors.error }}>{err}</Text>
        </View>
      )}

      {!games ? (
        <ActivityIndicator color={Colors.greenDark} style={{ marginTop: 40 }} />
      ) : (
        <View style={{ backgroundColor: Colors.card, borderRadius: 6, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border }}>
          {ALL_GAME_KEYS.map((k, i) => (
            <View key={k}>
              {i > 0 && <View style={{ height: 1, backgroundColor: Colors.border, marginLeft: 18 }} />}
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 12, gap: 12 }}>
                <Switch
                  value={games[k].active}
                  onValueChange={v => setGames(prev => prev ? { ...prev, [k]: { ...prev[k], active: v } } : prev)}
                  trackColor={{ false: Colors.border, true: Colors.greenDark }}
                  thumbColor={games[k].active ? Colors.gold : Colors.white}
                />
                <Text style={{ flex: 1, fontFamily: Fonts.serif, fontSize: 16, color: games[k].active ? Colors.text : Colors.textSecondary }}>
                  {GAME_LABELS[k]}
                </Text>
                {k !== 'presiones' && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <TextInput
                      value={String(games[k].bet_amount)}
                      onChangeText={v => setGames(prev => prev ? { ...prev, [k]: { ...prev[k], bet_amount: parseInt(v, 10) || 0 } } : prev)}
                      keyboardType="number-pad"
                      style={{
                        width: 64, textAlign: 'right',
                        fontFamily: Fonts.mono, fontSize: 15, fontWeight: '700',
                        color: games[k].active ? Colors.text : Colors.textSecondary,
                        borderBottomWidth: 1, borderColor: Colors.border,
                        paddingVertical: 4,
                      }}
                    />
                    <Text style={{ fontFamily: Fonts.mono, fontSize: 11, color: Colors.textSecondary }}>$</Text>
                  </View>
                )}
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
