import { useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Modal, ActivityIndicator, useWindowDimensions, KeyboardAvoidingView, Platform } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Colors, Fonts } from '@/constants/colors';

type Player = { id: string; name: string; default_handicap: number; suffix?: string | null; email?: string | null; user_id?: string | null };

function useFavorites() {
  const qc = useQueryClient();
  const { data: favIds = [] } = useQuery<string[]>({
    queryKey: ['favorites'],
    queryFn: async () => {
      const { data, error } = await supabase.from('player_favorites').select('player_id');
      if (error) throw error;
      return data.map((r: { player_id: string }) => r.player_id);
    },
  });
  const favSet = new Set(favIds);

  async function toggleFavorite(playerId: string) {
    if (favSet.has(playerId)) {
      await supabase.from('player_favorites').delete().eq('player_id', playerId);
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('player_favorites').insert({ user_id: user!.id, player_id: playerId });
    }
    qc.invalidateQueries({ queryKey: ['favorites'] });
  }

  return { favSet, toggleFavorite };
}

function usePlayersMutations() {
  const qc = useQueryClient();
  const add = useMutation({
    mutationFn: async (p: { name: string; default_handicap: number; suffix?: string | null; email?: string | null }) => {
      const { error } = await supabase.from('players').insert(p);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['players'] }),
  });
  const update = useMutation({
    mutationFn: async (p: Player) => {
      const { error } = await supabase.from('players').update({ name: p.name, default_handicap: p.default_handicap, suffix: p.suffix ?? null, email: p.email?.trim().toLowerCase() || null }).eq('id', p.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['players'] }),
  });
  return { add, update };
}

function PlayerModal({ visible, player, onClose, favSet, onToggleFav, onHistorial }: {
  visible: boolean;
  player: Player | null;
  onClose: () => void;
  favSet: Set<string>;
  onToggleFav: (id: string) => void;
  onHistorial: (id: string) => void;
}) {
  const [name, setName] = useState(player?.name ?? '');
  const [hcp, setHcp] = useState(String(player?.default_handicap ?? ''));
  const [suffix, setSuffix] = useState(player?.suffix ?? '');
  const [email, setEmail] = useState(player?.email ?? '');
  const [err, setErr] = useState('');
  const { add, update } = usePlayersMutations();

  const isEdit = player !== null;
  const loading = add.isPending || update.isPending;
  const isFav = isEdit && favSet.has(player.id);

  async function save() {
    setErr('');
    if (!name.trim()) { setErr('Ingresa el nombre'); return; }
    const h = parseInt(hcp, 10);
    if (isNaN(h) || h < 0) { setErr('Handicap inválido'); return; }
    const suffixVal = suffix.trim() || null;
    const emailVal = email.trim().toLowerCase() || null;
    if (isEdit) {
      await update.mutateAsync({ ...player, name: name.trim(), default_handicap: h, suffix: suffixVal, email: emailVal });
    } else {
      await add.mutateAsync({ name: name.trim(), default_handicap: h, suffix: suffixVal, email: emailVal });
    }
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={{ backgroundColor: Colors.background, padding: 20, gap: 20 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 4, borderBottomWidth: 1, borderColor: Colors.border }}>
          <Text style={{ fontFamily: Fonts.serif, fontSize: 22, color: Colors.text }}>
            {isEdit ? 'Editar jugador' : 'Nuevo jugador'}
          </Text>
          <Pressable onPress={onClose}>
            <Text style={{ fontFamily: Fonts.mono, fontSize: 11, letterSpacing: 1, color: Colors.textSecondary }}>CANCELAR</Text>
          </Pressable>
        </View>

        {!!err && (
          <View style={{ backgroundColor: Colors.error + '18', borderRadius: 4, padding: 10, borderLeftWidth: 3, borderLeftColor: Colors.error }}>
            <Text style={{ color: Colors.error, fontFamily: Fonts.mono, fontSize: 12 }}>{err}</Text>
          </View>
        )}

        <View style={{ gap: 6 }}>
          <Text style={{ fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1.5, color: Colors.textSecondary }}>NOMBRE</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Nombre completo"
            placeholderTextColor={Colors.textSecondary + '88'}
            autoFocus
            style={{ backgroundColor: Colors.card, borderRadius: 4, padding: 14, fontSize: 16, fontFamily: Fonts.serif, color: Colors.text, borderWidth: 1, borderColor: Colors.border }}
          />
        </View>

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ gap: 6, flex: 1 }}>
            <Text style={{ fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1.5, color: Colors.textSecondary }}>HANDICAP</Text>
            <TextInput
              value={hcp}
              onChangeText={setHcp}
              placeholder="0"
              placeholderTextColor={Colors.textSecondary + '88'}
              keyboardType="number-pad"
              style={{ backgroundColor: Colors.card, borderRadius: 4, padding: 14, fontSize: 16, fontFamily: Fonts.mono, color: Colors.text, borderWidth: 1, borderColor: Colors.border }}
            />
          </View>
          <View style={{ gap: 6, flex: 1 }}>
            <Text style={{ fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1.5, color: Colors.textSecondary }}>SUFIJO (OPCIONAL)</Text>
            <TextInput
              value={suffix}
              onChangeText={setSuffix}
              placeholder="Jr., Sr., II…"
              placeholderTextColor={Colors.textSecondary + '88'}
              maxLength={10}
              style={{ backgroundColor: Colors.card, borderRadius: 4, padding: 14, fontSize: 15, fontFamily: Fonts.serif, color: Colors.text, borderWidth: 1, borderColor: Colors.border }}
            />
          </View>
        </View>

        <View style={{ gap: 6 }}>
          <Text style={{ fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1.5, color: Colors.textSecondary }}>EMAIL (OPCIONAL)</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="correo@ejemplo.com"
            placeholderTextColor={Colors.textSecondary + '88'}
            keyboardType="email-address"
            autoCapitalize="none"
            style={{ backgroundColor: Colors.card, borderRadius: 4, padding: 14, fontSize: 15, fontFamily: Fonts.serif, color: Colors.text, borderWidth: 1, borderColor: Colors.border }}
          />
          <Text style={{ fontFamily: Fonts.fraunces, fontStyle: 'italic', fontSize: 12, color: Colors.textSecondary }}>
            Permite al jugador ver la partida en vivo desde su cuenta
          </Text>
        </View>

        {isEdit && (
          <Pressable
            onPress={() => onToggleFav(player.id)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: isFav ? Colors.gold + '22' : Colors.card, borderRadius: 6, borderWidth: 1, borderColor: isFav ? Colors.gold : Colors.border, padding: 14 }}
          >
            <GolfFlag size={18} color={isFav ? Colors.gold : Colors.border} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: Fonts.serif, fontSize: 15, color: isFav ? Colors.goldText : Colors.text }}>
                {isFav ? 'Mi Foursome' : 'Agregar a Mi Foursome'}
              </Text>
              <Text style={{ fontFamily: Fonts.fraunces, fontStyle: 'italic', fontSize: 11, color: Colors.textSecondary }}>
                Aparece primero en el Roster
              </Text>
            </View>
          </Pressable>
        )}

        <Pressable
          onPress={save}
          disabled={loading}
          style={{ backgroundColor: Colors.greenDark, borderWidth: 1, borderColor: Colors.gold, borderRadius: 4, padding: 14, alignItems: 'center', marginTop: 8, opacity: loading ? 0.7 : 1 }}
        >
          {loading
            ? <ActivityIndicator color={Colors.gold} />
            : <Text style={{ fontFamily: Fonts.mono, color: Colors.white, fontSize: 11, fontWeight: '700', letterSpacing: 1.5 }}>GUARDAR</Text>
          }
        </Pressable>

        {isEdit && (
          <Pressable
            onPress={() => { onClose(); onHistorial(player.id); }}
            style={{ alignItems: 'center', paddingVertical: 8 }}
          >
            <Text style={{ fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1, color: Colors.textSecondary }}>VER HISTORIAL ›</Text>
          </Pressable>
        )}
      </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function GolfFlag({ color = Colors.gold, size = 16 }: { color?: string; size?: number }) {
  const poleH = Math.round(size * 1.5);
  const flagH = Math.round(size * 0.55);
  const flagW = Math.round(size * 0.75);
  return (
    <View style={{ width: size, height: poleH }}>
      {/* Pole */}
      <View style={{ position: 'absolute', left: 0, top: 0, width: 2, height: poleH, backgroundColor: color, borderRadius: 1 }} />
      {/* Pennant — right-pointing triangle via border trick */}
      <View style={{
        position: 'absolute', left: 2, top: 0,
        width: 0, height: 0,
        borderTopWidth: flagH / 2,
        borderBottomWidth: flagH / 2,
        borderLeftWidth: flagW,
        borderTopColor: 'transparent',
        borderBottomColor: 'transparent',
        borderLeftColor: color,
      }} />
    </View>
  );
}

function PlayerAvatar({ name, isFav }: { name: string; isFav?: boolean }) {
  const initial = name.trim().charAt(0).toUpperCase();
  return (
    <View style={{ position: 'relative' }}>
      <View style={{
        width: 52, height: 52, borderRadius: 26,
        backgroundColor: Colors.greenDark,
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1.5, borderColor: isFav ? Colors.gold : Colors.gold + '55',
      }}>
        <Text style={{ fontFamily: Fonts.serif, fontSize: 20, color: Colors.gold, lineHeight: 24 }}>{initial}</Text>
      </View>
      {isFav && (
        <View style={{ position: 'absolute', top: -4, right: -5 }}>
          <GolfFlag size={12} />
        </View>
      )}
    </View>
  );
}

function SectionLabel({ title }: { title: string }) {
  return (
    <Text style={{ fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1.5, color: Colors.textSecondary, paddingHorizontal: 4, paddingTop: 4, paddingBottom: 2 }}>
      {title}
    </Text>
  );
}

type BalanceEntry = { balance: number; marcas: number; individuales: number; parejas: number; parejas_base: number; presiones: number; rounds: number };

function RankingView({ players, balances }: { players: Player[]; balances: Record<string, BalanceEntry> }) {
  const { width } = useWindowDimensions();
  const ranked = players
    .filter(p => balances[p.id] !== undefined)
    .sort((a, b) => (balances[b.id]?.balance ?? 0) - (balances[a.id]?.balance ?? 0));

  function fmt(n: number) { return (n >= 0 ? '+' : '') + `$${Math.abs(n).toLocaleString('es-MX')}`; }
  function col(n: number) { return n > 0 ? Colors.success : n < 0 ? Colors.error : Colors.textSecondary; }

  const NAME_W = 130;
  const NUM_W = 32;
  const RND_W = 56;
  const COL_W = 72;

  if (ranked.length === 0) {
    return (
      <View style={{ alignItems: 'center', marginTop: 60, gap: 10 }}>
        <Text style={{ fontFamily: Fonts.serif, fontSize: 18, color: Colors.text }}>Sin datos aún</Text>
        <Text style={{ fontFamily: Fonts.fraunces, fontStyle: 'italic', color: Colors.textSecondary, fontSize: 13, textAlign: 'center', paddingHorizontal: 32 }}>
          El ranking se llena al terminar partidas oficiales
        </Text>
      </View>
    );
  }

  return (
    <View style={{ margin: 12, borderRadius: 6, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border }}>
      <View style={{ overflowX: 'auto' } as any}>
        <View style={{ minWidth: 'max-content' } as any}>
          {/* Header */}
          <View style={{ flexDirection: 'row', backgroundColor: Colors.greenDark, paddingHorizontal: 10, paddingVertical: 10, alignItems: 'center' }}>
            <View style={{ width: NUM_W }} />
            <Text style={{ width: NAME_W, fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1, color: Colors.white + 'BB' }}>JUGADOR</Text>
            <Text style={{ width: RND_W, textAlign: 'center', fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1, color: Colors.white + 'BB' }}>PART.</Text>
            <Text style={{ width: COL_W, textAlign: 'center', fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1, color: Colors.gold }}>TOTAL</Text>
            <Text style={{ width: COL_W, textAlign: 'center', fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1, color: Colors.white + 'BB' }}>MARCAS</Text>
            <Text style={{ width: COL_W, textAlign: 'center', fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1, color: Colors.white + 'BB' }}>INDIV.</Text>
            <Text style={{ width: COL_W, textAlign: 'center', fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1, color: Colors.white + 'BB' }}>PAREJAS</Text>
            <Text style={{ width: COL_W, textAlign: 'center', fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1, color: Colors.white + 'BB' }}>P.BASE</Text>
            <Text style={{ width: COL_W, textAlign: 'center', fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1, color: Colors.white + 'BB' }}>PRES.</Text>
          </View>
          {/* Rows */}
          {ranked.map((p, i) => {
            const b = balances[p.id];
            const name = p.suffix ? `${p.name} ${p.suffix}` : p.name;
            return (
              <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 12, backgroundColor: Colors.card, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: Colors.border + '55' }}>
                <Text style={{ width: NUM_W, fontFamily: Fonts.mono, fontSize: 12, color: Colors.textSecondary, textAlign: 'center' }}>#{i + 1}</Text>
                <Text style={{ width: NAME_W, fontFamily: Fonts.serif, fontSize: 14, color: Colors.text }} numberOfLines={1}>{name}</Text>
                <Text style={{ width: RND_W, textAlign: 'center', fontFamily: Fonts.mono, fontSize: 13, color: Colors.textSecondary }}>{b.rounds}</Text>
                <Text style={{ width: COL_W, textAlign: 'center', fontFamily: Fonts.serif, fontSize: 15, fontWeight: '700', color: col(b.balance), fontVariant: ['tabular-nums'] as any }}>{fmt(b.balance)}</Text>
                <Text style={{ width: COL_W, textAlign: 'center', fontFamily: Fonts.serif, fontSize: 13, color: col(b.marcas), fontVariant: ['tabular-nums'] as any }}>{b.marcas !== 0 ? fmt(b.marcas) : '—'}</Text>
                <Text style={{ width: COL_W, textAlign: 'center', fontFamily: Fonts.serif, fontSize: 13, color: col(b.individuales), fontVariant: ['tabular-nums'] as any }}>{b.individuales !== 0 ? fmt(b.individuales) : '—'}</Text>
                <Text style={{ width: COL_W, textAlign: 'center', fontFamily: Fonts.serif, fontSize: 13, color: col(b.parejas), fontVariant: ['tabular-nums'] as any }}>{b.parejas !== 0 ? fmt(b.parejas) : '—'}</Text>
                <Text style={{ width: COL_W, textAlign: 'center', fontFamily: Fonts.serif, fontSize: 13, color: col(b.parejas_base), fontVariant: ['tabular-nums'] as any }}>{b.parejas_base !== 0 ? fmt(b.parejas_base) : '—'}</Text>
                <Text style={{ width: COL_W, textAlign: 'center', fontFamily: Fonts.serif, fontSize: 13, color: col(b.presiones), fontVariant: ['tabular-nums'] as any }}>{b.presiones !== 0 ? fmt(b.presiones) : '—'}</Text>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

function usePlayerBalances() {
  const year = new Date().getFullYear();
  return useQuery<Record<string, BalanceEntry>>({
    queryKey: ['player_balances', year],
    queryFn: async () => {
      const { data: roundIds } = await supabase
        .from('rounds')
        .select('id')
        .eq('official', true)
        .gte('date', `${year}-01-01`)
        .lte('date', `${year}-12-31`);
      if (!roundIds?.length) return {};
      const ids = roundIds.map((r: { id: string }) => r.id);
      const { data } = await supabase
        .from('round_player_results')
        .select('player_id, balance, marcas, marcas_esp, individuales, ind_medal, parejas, parejas_medal, parejas_base, pb_medal, presiones')
        .in('round_id', ids);
      const map: Record<string, BalanceEntry> = {};
      (data ?? []).forEach((r: any) => {
        if (!map[r.player_id]) map[r.player_id] = { balance: 0, marcas: 0, individuales: 0, parejas: 0, parejas_base: 0, presiones: 0, rounds: 0 };
        map[r.player_id].balance     += Number(r.balance);
        map[r.player_id].marcas      += Number(r.marcas) + Number(r.marcas_esp);
        map[r.player_id].individuales += Number(r.individuales) + Number(r.ind_medal);
        map[r.player_id].parejas     += Number(r.parejas) + Number(r.parejas_medal);
        map[r.player_id].parejas_base += Number(r.parejas_base) + Number(r.pb_medal);
        map[r.player_id].presiones   += Number(r.presiones);
        map[r.player_id].rounds      += 1;
      });
      return map;
    },
  });
}

export default function PlayersScreen() {
  const router = useRouter();
  const [modalVisible, setModalVisible] = useState(false);
  const [editPlayer, setEditPlayer] = useState<Player | null>(null);
  const [modalKey, setModalKey] = useState(0);
  const [view, setView] = useState<'roster' | 'ranking'>('roster');
  const { width } = useWindowDimensions();
  const { favSet, toggleFavorite } = useFavorites();
  const { data: balances = {} } = usePlayerBalances();

  const { data: players = [], isLoading } = useQuery<Player[]>({
    queryKey: ['players'],
    queryFn: async () => {
      const { data, error } = await supabase.from('players').select('*').order('name');
      if (error) throw error;
      return data;
    },
  });

  function openNew() { setEditPlayer(null); setModalKey(k => k + 1); setModalVisible(true); }
  function openEdit(p: Player) { setEditPlayer(p); setModalKey(k => k + 1); setModalVisible(true); }
  function closeModal() { setModalVisible(false); setEditPlayer(null); }

  const numCols = width >= 900 ? 3 : width >= 560 ? 2 : 1;
  const gap = 12;
  const pad = 16;
  const itemWidth = (width - pad * 2 - gap * (numCols - 1)) / numCols;

  const favorites = players.filter(p => favSet.has(p.id));
  const others = players.filter(p => !favSet.has(p.id));
  const hasSections = favorites.length > 0;

  function renderCard(p: Player) {
    const isFav = favSet.has(p.id);
    return (
      <Pressable
        key={p.id}
        onPress={() => openEdit(p)}
        style={{
          width: itemWidth,
          backgroundColor: Colors.card,
          borderRadius: 6,
          borderWidth: 1,
          borderColor: isFav ? Colors.gold + '55' : Colors.border,
          padding: 14,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
        }}
      >
        <PlayerAvatar name={p.name} isFav={isFav} />
        <View style={{ flex: 1, gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <Text style={{ fontFamily: Fonts.serif, fontSize: 17, color: Colors.text }} numberOfLines={1}>{p.name}</Text>
            {!!p.suffix && (
              <Text style={{ fontFamily: Fonts.serif, fontSize: 13, color: Colors.textSecondary, fontStyle: 'italic' }}>{p.suffix}</Text>
            )}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5 }}>
            <Text style={{ fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1, color: Colors.textSecondary }}>HANDICAP</Text>
            <Text style={{ fontFamily: Fonts.mono, fontSize: 13, fontWeight: '700', color: Colors.gold }}>{p.default_handicap}</Text>
          </View>
          {!!p.email && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: p.user_id ? Colors.success : Colors.border }} />
              <Text style={{ fontFamily: Fonts.mono, fontSize: 9, color: Colors.textSecondary }} numberOfLines={1}>{p.email}</Text>
            </View>
          )}
        </View>
        <Text style={{ fontFamily: Fonts.mono, fontSize: 16, color: Colors.textSecondary + '66' }}>›</Text>
      </Pressable>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView contentInsetAdjustmentBehavior="automatic">
        <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, gap: 12, borderBottomWidth: 1, borderColor: Colors.border }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Text style={{ fontFamily: Fonts.serif, fontSize: 28, color: Colors.text }}>Roster del Foursome</Text>
            <Pressable
              onPress={openNew}
              style={{ backgroundColor: Colors.gold, borderRadius: 4, paddingHorizontal: 16, paddingVertical: 10, marginTop: 4 }}
            >
              <Text style={{ fontFamily: Fonts.mono, fontSize: 11, fontWeight: '700', letterSpacing: 1.2, color: Colors.greenDark }}>+ NUEVO JUGADOR</Text>
            </Pressable>
          </View>
          {/* Toggle ROSTER | RANKING */}
          <View style={{ flexDirection: 'row', backgroundColor: Colors.card, borderRadius: 6, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', alignSelf: 'flex-start' }}>
            {(['roster', 'ranking'] as const).map(v => (
              <Pressable
                key={v}
                onPress={() => setView(v)}
                style={{ paddingHorizontal: 20, paddingVertical: 8, backgroundColor: view === v ? Colors.greenDark : 'transparent' }}
              >
                <Text style={{ fontFamily: Fonts.mono, fontSize: 10, fontWeight: '700', letterSpacing: 1.2, color: view === v ? Colors.white : Colors.textSecondary }}>
                  {v === 'roster' ? 'ROSTER' : `RANKING ${new Date().getFullYear()}`}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {isLoading ? (
          <ActivityIndicator style={{ marginTop: 60 }} color={Colors.greenDark} />
        ) : view === 'ranking' ? (
          <RankingView players={players} balances={balances} />
        ) : players.length === 0 ? (
          <View style={{ alignItems: 'center', marginTop: 80, gap: 10 }}>
            <Text style={{ fontFamily: Fonts.serif, fontSize: 22, color: Colors.text }}>Sin jugadores</Text>
            <Text style={{ fontFamily: Fonts.fraunces, fontStyle: 'italic', color: Colors.textSecondary, fontSize: 14 }}>
              Agrega los jugadores de tu grupo
            </Text>
          </View>
        ) : (
          <View style={{ padding: pad, gap: 8 }}>
            {hasSections && <SectionLabel title="MI FOURSOME" />}
            {hasSections && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>
                {favorites.map(p => renderCard(p))}
              </View>
            )}
            {hasSections && others.length > 0 && <SectionLabel title="OTROS JUGADORES" />}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>
              {others.map(p => renderCard(p))}
            </View>
          </View>
        )}
      </ScrollView>

      <PlayerModal
        key={modalKey}
        visible={modalVisible}
        player={editPlayer}
        onClose={closeModal}
        favSet={favSet}
        onToggleFav={toggleFavorite}
        onHistorial={(id) => router.push(`/(app)/(players)/${id}`)}
      />
    </View>
  );
}
