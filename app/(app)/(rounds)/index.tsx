import { useState } from 'react';
import { View, Text, FlatList, Pressable, ActivityIndicator, useWindowDimensions, Image, Platform } from 'react-native';
import { Stack, useRouter, Link } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Colors, Fonts } from '@/constants/colors';

type Round = {
  id: string;
  date: string;
  created_at: string;
  status: 'active' | 'setup' | 'finished';
  start_hole: number;
  created_by: string;
  courses: { name: string };
  round_players: { players: { name: string; user_id: string | null } }[];
};

const STATUS_LABEL: Record<string, string> = { active: 'Activa', setup: 'Setup', finished: 'Cerrada' };
const STATUS_COLOR: Record<string, string> = { active: Colors.success, setup: Colors.warning, finished: Colors.textSecondary };

export default function RoundsHome() {
  const router = useRouter();
  const [deleteTarget, setDeleteTarget] = useState<Round | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const { data: rounds = [], isLoading, refetch } = useQuery<Round[]>({
    queryKey: ['rounds'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUserId(user?.id ?? null);
      const { data, error } = await supabase
        .from('rounds')
        .select('id, date, created_at, status, start_hole, created_by, courses(name), round_players(players(name, user_id))')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map(r => ({ ...r, courses: Array.isArray(r.courses) ? r.courses[0] : r.courses })) as unknown as Round[];
    },
  });

  // Build per-date index for "#2" suffix (oldest of same day = no suffix, next = #2, etc.)
  const dateGroups: Record<string, string[]> = {};
  [...rounds].reverse().forEach(r => {
    if (!dateGroups[r.date]) dateGroups[r.date] = [];
    dateGroups[r.date].push(r.id);
  });
  function roundName(item: Round): string {
    const dateStr = new Date(item.date + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
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

  const { width } = useWindowDimensions();
  const showMobileHeader = width < 640;

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />

      {showMobileHeader && (
        <View style={{
          backgroundColor: Colors.greenDark,
          paddingTop: 12, paddingBottom: 14,
          paddingHorizontal: 24,
          alignItems: 'center',
          borderBottomWidth: 2, borderBottomColor: Colors.gold,
          gap: 2,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ backgroundColor: Colors.background, borderRadius: 4, padding: 2 }}>
              <Image source={require('@/assets/images/logo-transparent.png')} style={{ width: 40, height: 40 }} />
            </View>
            <Text style={{ color: Colors.white, fontSize: 22, letterSpacing: 4, fontFamily: Fonts.serif }}>
              ZOPILOTE
            </Text>
          </View>
          <Text style={{ color: Colors.gold + 'AA', fontSize: 11, fontFamily: Fonts.fraunces, fontStyle: 'italic', letterSpacing: 0.5 }}>
            — established 2026 —
          </Text>
        </View>
      )}

      {isLoading ? (
        <ActivityIndicator style={{ flex: 1 }} color={Colors.green} />
      ) : (
        <FlatList
          data={rounds}
          keyExtractor={r => r.id}
          contentContainerStyle={{ padding: 14, gap: 8, paddingBottom: 120 }}
          contentInsetAdjustmentBehavior="automatic"
          onRefresh={refetch}
          refreshing={isLoading}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 80, gap: 16 }}>
              <Image source={require('@/assets/images/logo-transparent.png')} style={{ width: 100, height: 100, opacity: 0.15 }} />
              <Text style={{ fontFamily: Fonts.serif, fontSize: 22, color: Colors.text }}>Sin partidas</Text>
              <Text style={{ fontFamily: Fonts.fraunces, fontStyle: 'italic', color: Colors.textSecondary, textAlign: 'center', lineHeight: 22, fontSize: 15 }}>
                Registra tu primera ronda de golf
              </Text>
              <Link href="/new" asChild>
                <Pressable style={{ borderWidth: 1, borderColor: Colors.gold, borderRadius: 4, paddingHorizontal: 24, paddingVertical: 12, marginTop: 8 }}>
                  <Text style={{ fontFamily: Fonts.mono, color: Colors.goldText, fontSize: 12, fontWeight: '700', letterSpacing: 1.5 }}>+ NUEVA PARTIDA</Text>
                </Pressable>
              </Link>
            </View>
          }
          renderItem={({ item }) => {
            const isOrganizer = item.created_by === currentUserId;
            const creatorPlayer = !isOrganizer
              ? item.round_players?.find(rp => rp.players?.user_id === item.created_by)?.players
              : null;
            return (
              <Pressable
                onPress={() => router.push(`/partida/${item.id}` as any)}
                style={{ backgroundColor: Colors.card, borderRadius: 6, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' }}
              >
                {/* Color stripe by status */}
                <View style={{ height: 3, backgroundColor: item.status === 'active' ? Colors.gold : item.status === 'finished' ? Colors.greenDark : Colors.border }} />
                <View style={{ padding: 14, gap: 6 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Text style={{ fontFamily: Fonts.serif, fontSize: 18, color: Colors.text, flex: 1, marginRight: 8 }} numberOfLines={1}>
                      {roundName(item)}
                    </Text>
                    <Text style={{ fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1, color: STATUS_COLOR[item.status], fontWeight: '700', paddingTop: 3 }}>
                      {STATUS_LABEL[item.status].toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontFamily: Fonts.fraunces, fontStyle: 'italic', fontSize: 13, color: Colors.textSecondary }}>
                      {item.courses?.name ?? 'Campo'} · Hoyo {item.start_hole}
                    </Text>
                    {isOrganizer && (
                      <Pressable
                        onPress={e => { e.stopPropagation(); setDeleteTarget(item); }}
                        hitSlop={8}
                        style={{ padding: 4 }}
                      >
                        <Text style={{ fontSize: 11, fontFamily: Fonts.mono, color: Colors.textSecondary + '88', letterSpacing: 0.5 }}>×</Text>
                      </Pressable>
                    )}
                  </View>
                  {!isOrganizer && creatorPlayer && (
                    <Text style={{ fontFamily: Fonts.fraunces, fontStyle: 'italic', fontSize: 12, color: Colors.gold }}>
                      Invitado por {creatorPlayer.name}
                    </Text>
                  )}
                </View>
              </Pressable>
            );
          }}
        />
      )}

      {/* Floating action button */}
      <Link href="/new" asChild>
        <Pressable style={{
          position: 'absolute', bottom: 32, right: 24,
          backgroundColor: Colors.greenDark,
          borderWidth: 1, borderColor: Colors.gold,
          borderRadius: 4,
          paddingHorizontal: 20, paddingVertical: 14,
          boxShadow: '0 4px 20px rgba(27,58,40,0.35)',
          flexDirection: 'row', alignItems: 'center', gap: 8,
        }}>
          <Text style={{ color: Colors.gold, fontSize: 18, lineHeight: 20, fontWeight: '300' }}>+</Text>
          <Text style={{ fontFamily: Fonts.mono, color: Colors.white, fontSize: 11, fontWeight: '700', letterSpacing: 1.5 }}>NUEVA PARTIDA</Text>
        </Pressable>
      </Link>

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(27,58,40,0.6)', justifyContent: 'center', alignItems: 'center', zIndex: 100 }}>
          <View style={{ backgroundColor: Colors.card, borderRadius: 6, padding: 24, marginHorizontal: 32, gap: 14, borderWidth: 1, borderColor: Colors.border, borderTopWidth: 3, borderTopColor: Colors.error }}>
            <Text style={{ fontFamily: Fonts.serif, fontSize: 20, color: Colors.text }}>¿Borrar partida?</Text>
            <Text style={{ fontFamily: Fonts.fraunces, fontStyle: 'italic', fontSize: 14, color: Colors.textSecondary, lineHeight: 20 }}>
              Se eliminará "{roundName(deleteTarget)}" y todos sus scores.
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable
                onPress={() => setDeleteTarget(null)}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 4, alignItems: 'center', borderWidth: 1, borderColor: Colors.border }}
              >
                <Text style={{ fontFamily: Fonts.mono, fontWeight: '700', fontSize: 11, letterSpacing: 1, color: Colors.textSecondary }}>CANCELAR</Text>
              </Pressable>
              <Pressable
                onPress={doDelete}
                disabled={deleting}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 4, backgroundColor: Colors.error, alignItems: 'center' }}
              >
                {deleting ? (
                  <ActivityIndicator size="small" color={Colors.white} />
                ) : (
                  <Text style={{ fontFamily: Fonts.mono, fontWeight: '700', fontSize: 11, letterSpacing: 1, color: Colors.white }}>BORRAR</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
