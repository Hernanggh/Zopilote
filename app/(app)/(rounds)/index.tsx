import { useState } from 'react';
import { View, Text, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { Stack, useRouter, Link } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/constants/colors';

type Round = {
  id: string;
  date: string;
  created_at: string;
  status: 'active' | 'setup' | 'finished';
  start_hole: number;
  courses: { name: string };
};

const STATUS_LABEL: Record<string, string> = { active: 'En juego', setup: 'Setup', finished: 'Terminada' };
const STATUS_COLOR: Record<string, string> = { active: Colors.success, setup: Colors.warning, finished: Colors.textSecondary };

export default function RoundsHome() {
  const router = useRouter();
  const [deleteTarget, setDeleteTarget] = useState<Round | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data: rounds = [], isLoading, refetch } = useQuery<Round[]>({
    queryKey: ['rounds'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rounds')
        .select('id, date, created_at, status, start_hole, courses(name)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map(r => ({ ...r, courses: Array.isArray(r.courses) ? r.courses[0] : r.courses })) as Round[];
    },
  });

  // Build per-date index for "#2" suffix (oldest of same day = no suffix, next = #2, etc.)
  const dateGroups: Record<string, string[]> = {};
  [...rounds].reverse().forEach(r => {
    if (!dateGroups[r.date]) dateGroups[r.date] = [];
    dateGroups[r.date].push(r.id);
  });
  function roundName(item: Round): string {
    const dateStr = new Date(item.date + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
    const group = dateGroups[item.date] ?? [];
    if (group.length <= 1) return dateStr;
    const idx = group.indexOf(item.id) + 1;
    return idx <= 1 ? dateStr : `${dateStr} #${idx}`;
  }

  async function doDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    await supabase.from('rounds').delete().eq('id', deleteTarget.id);
    setDeleting(false);
    setDeleteTarget(null);
    refetch();
  }

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
            <Pressable
              onPress={() => router.push(`/${item.id}` as any)}
              style={{ backgroundColor: Colors.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: Colors.border, gap: 6 }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 17, fontWeight: '700', color: Colors.text, flex: 1, marginRight: 8 }} numberOfLines={1}>
                  {roundName(item)}
                </Text>
                <View style={{ backgroundColor: STATUS_COLOR[item.status] + '22', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: STATUS_COLOR[item.status] }}>
                    {STATUS_LABEL[item.status]}
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 13, color: Colors.textSecondary }}>
                  {item.courses?.name ?? 'Campo'}{' · '}Hoyo {item.start_hole}
                </Text>
                <Pressable
                  onPress={e => { e.stopPropagation(); setDeleteTarget(item); }}
                  hitSlop={8}
                  style={{ padding: 4 }}
                >
                  <Text style={{ fontSize: 16, color: Colors.textSecondary }}>🗑</Text>
                </Pressable>
              </View>
            </Pressable>
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

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', zIndex: 100 }}>
          <View style={{ backgroundColor: Colors.card, borderRadius: 20, padding: 24, marginHorizontal: 32, gap: 12, borderWidth: 1, borderColor: Colors.border }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: Colors.text }}>¿Borrar partida?</Text>
            <Text style={{ fontSize: 14, color: Colors.textSecondary, lineHeight: 20 }}>
              Se eliminará "{roundName(deleteTarget)}" y todos sus scores. Esta acción no se puede deshacer.
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
              <Pressable
                onPress={() => setDeleteTarget(null)}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: Colors.background, alignItems: 'center', borderWidth: 1, borderColor: Colors.border }}
              >
                <Text style={{ fontWeight: '600', color: Colors.text }}>Cancelar</Text>
              </Pressable>
              <Pressable
                onPress={doDelete}
                disabled={deleting}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: Colors.error, alignItems: 'center' }}
              >
                {deleting ? (
                  <ActivityIndicator size="small" color={Colors.white} />
                ) : (
                  <Text style={{ fontWeight: '700', color: Colors.white }}>Borrar</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
