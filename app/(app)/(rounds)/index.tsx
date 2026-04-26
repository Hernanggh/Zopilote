import { View, Text, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { Stack, useRouter, Link } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/constants/colors';

type Round = {
  id: string;
  date: string;
  status: 'active' | 'setup' | 'finished';
  start_hole: number;
  courses: { name: string };
};

const STATUS_LABEL: Record<string, string> = { active: 'En juego', setup: 'Setup', finished: 'Terminada' };
const STATUS_COLOR: Record<string, string> = { active: Colors.success, setup: Colors.warning, finished: Colors.textSecondary };

export default function RoundsHome() {
  const router = useRouter();

  const { data: rounds = [], isLoading, refetch } = useQuery<Round[]>({
    queryKey: ['rounds'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rounds')
        .select('id, date, status, start_hole, courses(name)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map(r => ({ ...r, courses: Array.isArray(r.courses) ? r.courses[0] : r.courses })) as Round[];
    },
  });

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <Stack.Screen
        options={{
          title: 'GolfJuegos ⛳',
          headerRight: () => (
            <Link href="/new" asChild>
              <Pressable style={{ marginRight: 4, backgroundColor: Colors.green, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 }}>
                <Text style={{ color: Colors.white, fontSize: 15, fontWeight: '700' }}>+ Partida</Text>
              </Pressable>
            </Link>
          ),
        }}
      />

      {isLoading ? (
        <ActivityIndicator style={{ flex: 1 }} color={Colors.green} />
      ) : (
        <FlatList
          data={rounds}
          keyExtractor={r => r.id}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 100 }}
          contentInsetAdjustmentBehavior="automatic"
          onRefresh={refetch}
          refreshing={isLoading}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 80, gap: 16 }}>
              <Text style={{ fontSize: 56 }}>⛳</Text>
              <Text style={{ fontSize: 20, fontWeight: '700', color: Colors.text }}>Sin partidas</Text>
              <Text style={{ color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 }}>
                Toca el botón de abajo para{'\n'}configurar tu primera ronda
              </Text>
              <Link href="/new" asChild>
                <Pressable style={{ backgroundColor: Colors.green, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 14, marginTop: 8 }}>
                  <Text style={{ color: Colors.white, fontSize: 16, fontWeight: '700' }}>+ Nueva Partida</Text>
                </Pressable>
              </Link>
            </View>
          }
          renderItem={({ item }) => (
            <Link href={`/${item.id}` as any} asChild>
              <Pressable style={{ backgroundColor: Colors.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: Colors.border, gap: 6 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 17, fontWeight: '700', color: Colors.text }}>{item.courses?.name ?? 'Campo'}</Text>
                  <View style={{ backgroundColor: STATUS_COLOR[item.status] + '22', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: STATUS_COLOR[item.status] }}>
                      {STATUS_LABEL[item.status]}
                    </Text>
                  </View>
                </View>
                <Text style={{ fontSize: 13, color: Colors.textSecondary }}>
                  {new Date(item.date).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
                  {' · '}Hoyo {item.start_hole}
                </Text>
              </Pressable>
            </Link>
          )}
        />
      )}

      {/* Floating action button */}
      <Link href="/new" asChild>
        <Pressable style={{
          position: 'absolute', bottom: 32, right: 24,
          backgroundColor: Colors.green, borderRadius: 28,
          paddingHorizontal: 22, paddingVertical: 16,
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
          flexDirection: 'row', alignItems: 'center', gap: 8,
        }}>
          <Text style={{ color: Colors.white, fontSize: 22, lineHeight: 24 }}>+</Text>
          <Text style={{ color: Colors.white, fontSize: 16, fontWeight: '700' }}>Nueva Partida</Text>
        </Pressable>
      </Link>
    </View>
  );
}
