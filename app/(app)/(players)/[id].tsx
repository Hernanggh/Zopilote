import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Colors, Fonts } from '@/constants/colors';

type RoundEntry = {
  round_id: string;
  date: string | null;
  status: string;
  course_name: string;
  gross_total: number;
};

export default function PlayerHistorial() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const { data: player, isLoading: loadingPlayer } = useQuery({
    queryKey: ['player', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('players')
        .select('id, name, suffix, default_handicap, email, user_id')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Jugador no encontrado');
      return data as { id: string; name: string; suffix: string | null; default_handicap: number; email: string | null; user_id: string | null };
    },
    enabled: !!id,
  });

  const { data: rounds = [], isLoading: loadingRounds } = useQuery<RoundEntry[]>({
    queryKey: ['player_rounds', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('round_players')
        .select('round_id, rounds(id, date, status, courses(name))')
        .eq('player_id', id)
        .order('round_id', { ascending: false })
        .limit(20);
      if (error) throw error;

      const entries = (data as any[]).map(row => {
        const r = row.rounds;
        return {
          round_id: row.round_id,
          date: r?.date ?? null,
          status: r?.status ?? '',
          course_name: r?.courses?.name ?? '—',
          gross_total: 0,
        };
      });

      if (entries.length === 0) return entries;

      const roundIds = entries.map(e => e.round_id);
      const { data: scoresData } = await supabase
        .from('scores')
        .select('round_id, gross_score')
        .eq('player_id', id)
        .in('round_id', roundIds);

      const totals: Record<string, number> = {};
      (scoresData ?? []).forEach((s: { round_id: string; gross_score: number }) => {
        totals[s.round_id] = (totals[s.round_id] ?? 0) + s.gross_score;
      });
      entries.forEach(e => { e.gross_total = totals[e.round_id] ?? 0; });

      entries.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
      return entries;
    },
    enabled: !!id,
  });

  const loading = loadingPlayer || loadingRounds;

  const displayName = player
    ? player.name + (player.suffix ? ` ${player.suffix}` : '')
    : '—';

  function formatDate(d: string | null) {
    if (!d) return '—';
    const [y, m, day] = d.split('-');
    return `${day}/${m}/${y}`;
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView contentInsetAdjustmentBehavior="automatic">
      <View style={{ maxWidth: 600, width: '100%', alignSelf: 'flex-start' }}>
        {/* Header */}
        <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, borderBottomWidth: 1, borderColor: Colors.border, gap: 4 }}>
          <Pressable onPress={() => router.back()} style={{ marginBottom: 8 }}>
            <Text style={{ fontFamily: Fonts.mono, fontSize: 11, letterSpacing: 1, color: Colors.textSecondary }}>‹ REGRESAR</Text>
          </Pressable>

          {loading ? (
            <ActivityIndicator color={Colors.greenDark} />
          ) : (
            <>
              <Text style={{ fontFamily: Fonts.serif, fontSize: 28, color: Colors.text }}>{displayName}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5 }}>
                  <Text style={{ fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1, color: Colors.textSecondary }}>HANDICAP</Text>
                  <Text style={{ fontFamily: Fonts.mono, fontSize: 15, fontWeight: '700', color: Colors.gold }}>{player?.default_handicap ?? '—'}</Text>
                </View>
                {!!player?.email && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: player.user_id ? Colors.success : Colors.border }} />
                    <Text style={{ fontFamily: Fonts.mono, fontSize: 9, color: Colors.textSecondary }}>{player.email}</Text>
                  </View>
                )}
              </View>
            </>
          )}
        </View>

        {/* Stats summary */}
        {!loading && rounds.length > 0 && (
          <View style={{ flexDirection: 'row', padding: 16, gap: 1 }}>
            <View style={{ flex: 1, backgroundColor: Colors.card, borderRadius: 6, borderWidth: 1, borderColor: Colors.border, padding: 14, alignItems: 'center', gap: 4 }}>
              <Text style={{ fontFamily: Fonts.mono, fontSize: 22, fontWeight: '700', color: Colors.gold }}>{rounds.length}</Text>
              <Text style={{ fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1, color: Colors.textSecondary }}>PARTIDAS</Text>
            </View>
          </View>
        )}

        {/* Round list */}
        <View style={{ paddingHorizontal: 16, paddingBottom: 40, gap: 8 }}>
          <Text style={{ fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1.5, color: Colors.textSecondary, paddingTop: 4, paddingHorizontal: 4 }}>
            HISTORIAL
          </Text>

          {loading ? (
            <ActivityIndicator color={Colors.greenDark} style={{ marginTop: 40 }} />
          ) : rounds.length === 0 ? (
            <View style={{ alignItems: 'center', marginTop: 40 }}>
              <Text style={{ fontFamily: Fonts.fraunces, fontStyle: 'italic', color: Colors.textSecondary, fontSize: 14 }}>
                Sin partidas registradas
              </Text>
            </View>
          ) : (
            rounds.map(r => (
              <Pressable
                key={r.round_id}
                onPress={() => router.push({ pathname: '/(app)/(rounds)/[id]', params: { id: r.round_id } } as any)}
                style={{ backgroundColor: Colors.card, borderRadius: 6, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center' }}
              >
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={{ fontFamily: Fonts.serif, fontSize: 16, color: Colors.text }}>{r.course_name}</Text>
                  <Text style={{ fontFamily: Fonts.mono, fontSize: 10, color: Colors.textSecondary, letterSpacing: 0.5 }}>{formatDate(r.date)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 3 }}>
                  {r.gross_total > 0 && (
                    <Text style={{ fontFamily: Fonts.mono, fontSize: 16, fontWeight: '700', color: Colors.gold }}>{r.gross_total}</Text>
                  )}
                  <Text style={{ fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1, color: r.status === 'finished' ? Colors.textSecondary : Colors.success }}>
                    {r.status === 'finished' ? 'CERRADA' : 'ACTIVA'}
                  </Text>
                </View>
                <Text style={{ fontFamily: Fonts.mono, fontSize: 16, color: Colors.textSecondary + '66', marginLeft: 12 }}>›</Text>
              </Pressable>
            ))
          )}
        </View>
      </View>
      </ScrollView>
    </View>
  );
}
