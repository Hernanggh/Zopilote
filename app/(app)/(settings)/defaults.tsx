import { useState } from 'react';
import { View, Text, ScrollView, Switch, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { Stack } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/constants/colors';

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
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{
        title: 'Juegos por defecto',
        headerRight: () => (
          <Pressable onPress={save} disabled={saving || !games} style={{ paddingHorizontal: 4 }}>
            {saving
              ? <ActivityIndicator size="small" color={Colors.green} />
              : <Text style={{ fontSize: 16, fontWeight: '700', color: saved ? Colors.success : Colors.green }}>
                  {saved ? '✓ Guardado' : 'Guardar'}
                </Text>
            }
          </Pressable>
        ),
      }} />

      {!!err && (
        <View style={{ backgroundColor: '#FFEBEE', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: Colors.error }}>
          <Text style={{ color: Colors.error, fontWeight: '600' }}>⚠️ {err}</Text>
        </View>
      )}

      <Text style={{ fontSize: 13, color: Colors.textSecondary, lineHeight: 18 }}>
        Estos valores se pre-cargan al crear una nueva partida.
      </Text>

      {!games ? (
        <ActivityIndicator color={Colors.green} style={{ marginTop: 40 }} />
      ) : (
        <View style={{ gap: 8 }}>
          {ALL_GAME_KEYS.map(k => (
            <View key={k} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.card, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: Colors.border, gap: 10 }}>
              <Switch
                value={games[k].active}
                onValueChange={v => setGames(prev => prev ? { ...prev, [k]: { ...prev[k], active: v } } : prev)}
                trackColor={{ false: Colors.border, true: Colors.green }}
              />
              <Text style={{ flex: 1, fontSize: 14, color: Colors.text }}>{GAME_LABELS[k]}</Text>
              {k !== 'presiones' && (
                <>
                  <TextInput
                    value={String(games[k].bet_amount)}
                    onChangeText={v => setGames(prev => prev ? { ...prev, [k]: { ...prev[k], bet_amount: parseInt(v, 10) || 0 } } : prev)}
                    keyboardType="number-pad"
                    style={{ width: 72, textAlign: 'right', fontSize: 15, fontWeight: '700', color: Colors.text, backgroundColor: Colors.background, borderRadius: 8, padding: 6, borderWidth: 1, borderColor: Colors.border }}
                  />
                  <Text style={{ fontSize: 12, color: Colors.textSecondary }}>$</Text>
                </>
              )}
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
