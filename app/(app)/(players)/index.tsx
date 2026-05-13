import { useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Modal, ActivityIndicator, useWindowDimensions, KeyboardAvoidingView, Platform } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Colors, Fonts } from '@/constants/colors';

type Contact = { id: string; player_id: string; display_name: string; handicap: number; suffix?: string | null; email?: string | null; user_id?: string | null };

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

function useContactsMutations() {
  const qc = useQueryClient();

  const add = useMutation({
    mutationFn: async (p: { display_name: string; handicap: number; suffix?: string | null; email?: string | null }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const emailVal = p.email?.trim().toLowerCase() || null;

      // Find or create player anchor
      let playerId: string;
      if (emailVal) {
        const { data: existing } = await supabase
          .from('players')
          .select('id')
          .eq('email', emailVal)
          .maybeSingle();
        if (existing) {
          playerId = existing.id;
        } else {
          const { data: newPlayer, error: pe } = await supabase
            .from('players')
            .insert({ name: p.display_name.trim(), suffix: p.suffix ?? null, default_handicap: p.handicap, email: emailVal, created_by: user?.id ?? null })
            .select('id')
            .single();
          if (pe) throw pe;
          playerId = newPlayer.id;
        }
      } else {
        const { data: newPlayer, error: pe } = await supabase
          .from('players')
          .insert({ name: p.display_name.trim(), suffix: p.suffix ?? null, default_handicap: p.handicap, email: null, created_by: user?.id ?? null })
          .select('id')
          .single();
        if (pe) throw pe;
        playerId = newPlayer.id;
      }

      const { data: existingContact } = await supabase
        .from('contacts')
        .select('id')
        .eq('owner_user_id', user!.id)
        .eq('player_id', playerId)
        .maybeSingle();
      if (existingContact) throw new Error('Este jugador ya está en tu Roster');

      const { error: ce } = await supabase.from('contacts').insert({
        owner_user_id: user!.id,
        player_id: playerId,
        display_name: p.display_name.trim(),
        suffix: p.suffix ?? null,
        handicap: p.handicap,
        email: emailVal,
      });
      if (ce) throw ce;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contacts'] }),
  });

  const update = useMutation({
    mutationFn: async (c: Contact) => {
      const emailVal = c.email?.trim().toLowerCase() || null;
      const updatePayload: Record<string, unknown> = {
        display_name: c.display_name,
        suffix: c.suffix ?? null,
        handicap: c.handicap,
        email: emailVal,
      };

      if (emailVal) {
        const { data: existing } = await supabase
          .from('players')
          .select('id')
          .eq('email', emailVal)
          .maybeSingle();
        if (existing && existing.id !== c.player_id) {
          // Existe un player con ese email — re-ligar el contacto
          updatePayload.player_id = existing.id;
        } else if (!existing && c.player_id) {
          // No existe player con ese email — actualizar el email del player actual
          // para que link_player_for_current_user lo encuentre cuando el usuario refresque
          await supabase.from('players').update({ email: emailVal }).eq('id', c.player_id);
        }
      }

      const { error } = await supabase.from('contacts').update(updatePayload).eq('id', c.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contacts'] }),
  });

  const deleteContact = useMutation({
    mutationFn: async (contact: Contact) => {
      await supabase.from('player_favorites').delete().eq('player_id', contact.player_id);
      const { error } = await supabase.from('contacts').delete().eq('id', contact.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contacts'] }),
  });

  return { add, update, deleteContact };
}

function PlayerModal({ visible, contact, onClose, onDelete, favSet, onToggleFav, onHistorial }: {
  visible: boolean;
  contact: Contact | null;
  onClose: () => void;
  onDelete: (contact: Contact) => void;
  favSet: Set<string>;
  onToggleFav: (playerId: string) => void;
  onHistorial: (playerId: string) => void;
}) {
  const [name, setName] = useState(contact?.display_name ?? '');
  const [hcp, setHcp] = useState(String(contact?.handicap ?? ''));
  const [suffix, setSuffix] = useState(contact?.suffix ?? '');
  const [email, setEmail] = useState(contact?.email ?? '');
  const [err, setErr] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { add, update } = useContactsMutations();

  const isEdit = contact !== null;
  const loading = add.isPending || update.isPending;
  const isFav = isEdit && favSet.has(contact.player_id);

  async function save() {
    setErr('');
    if (!name.trim()) { setErr('Ingresa el nombre'); return; }
    const h = parseInt(hcp, 10);
    if (isNaN(h) || h < 0) { setErr('Handicap inválido'); return; }
    const suffixVal = suffix.trim() || null;
    const emailVal = email.trim().toLowerCase() || null;
    try {
      if (isEdit) {
        await update.mutateAsync({ ...contact, display_name: name.trim(), handicap: h, suffix: suffixVal, email: emailVal });
      } else {
        await add.mutateAsync({ display_name: name.trim(), handicap: h, suffix: suffixVal, email: emailVal });
      }
      onClose();
    } catch (e: any) {
      setErr(e?.message ?? 'Error al guardar');
    }
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
            onPress={() => onToggleFav(contact.player_id)}
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
            onPress={() => { onClose(); onHistorial(contact.player_id); }}
            style={{ alignItems: 'center', paddingVertical: 8 }}
          >
            <Text style={{ fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1, color: Colors.textSecondary }}>VER HISTORIAL ›</Text>
          </Pressable>
        )}

        {isEdit && !confirmDelete && (
          <Pressable
            onPress={() => setConfirmDelete(true)}
            style={{ alignItems: 'center', paddingVertical: 8 }}
          >
            <Text style={{ fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1, color: Colors.error + 'AA' }}>ELIMINAR DEL ROSTER</Text>
          </Pressable>
        )}

        {isEdit && confirmDelete && (
          <View style={{ backgroundColor: Colors.error + '12', borderRadius: 6, borderWidth: 1, borderColor: Colors.error + '44', padding: 16, gap: 12 }}>
            <Text style={{ fontFamily: Fonts.serif, fontSize: 16, color: Colors.text }}>¿Eliminar a {contact.display_name} del Roster?</Text>
            <Text style={{ fontFamily: Fonts.fraunces, fontStyle: 'italic', fontSize: 13, color: Colors.textSecondary, lineHeight: 18 }}>
              Las partidas y el historial no se borran, pero si lo vuelves a agregar sin email no se ligará con sus datos anteriores y puede afectar el ranking.
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable
                onPress={() => setConfirmDelete(false)}
                style={{ flex: 1, padding: 12, borderRadius: 4, alignItems: 'center', borderWidth: 1, borderColor: Colors.border }}
              >
                <Text style={{ fontFamily: Fonts.mono, fontWeight: '700', fontSize: 11, letterSpacing: 1, color: Colors.textSecondary }}>CANCELAR</Text>
              </Pressable>
              <Pressable
                onPress={() => onDelete(contact)}
                style={{ flex: 1, padding: 12, borderRadius: 4, alignItems: 'center', backgroundColor: Colors.error, borderWidth: 1, borderColor: Colors.error }}
              >
                <Text style={{ fontFamily: Fonts.mono, fontWeight: '700', fontSize: 11, letterSpacing: 1, color: Colors.white }}>ELIMINAR</Text>
              </Pressable>
            </View>
          </View>
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
      <View style={{ position: 'absolute', left: 0, top: 0, width: 2, height: poleH, backgroundColor: color, borderRadius: 1 }} />
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
  const accent = isFav ? Colors.gold : '#A8A8A0';
  return (
    <View style={{
      width: 52, height: 52, borderRadius: 26,
      backgroundColor: Colors.greenDark,
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 1.5, borderColor: accent,
    }}>
      <Text style={{ fontFamily: Fonts.serif, fontSize: 20, color: accent, lineHeight: 24 }}>{initial}</Text>
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

function RankingView({ contacts, balances }: { contacts: Contact[]; balances: Record<string, BalanceEntry> }) {
  const ranked = contacts
    .filter(c => balances[c.player_id] !== undefined)
    .sort((a, b) => (balances[b.player_id]?.balance ?? 0) - (balances[a.player_id]?.balance ?? 0));

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
          {ranked.map((c, i) => {
            const b = balances[c.player_id];
            const name = c.suffix ? `${c.display_name} ${c.suffix}` : c.display_name;
            return (
              <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 12, backgroundColor: Colors.card, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: Colors.border + '55' }}>
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

function useBirdieCount() {
  const year = new Date().getFullYear();
  return useQuery<Record<string, number>>({
    queryKey: ['birdie_counts', year],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_birdie_counts', { p_year: year });
      if (error) throw error;
      const map: Record<string, number> = {};
      (data ?? []).forEach((r: { player_id: string; birdies: number }) => {
        map[r.player_id] = Number(r.birdies);
      });
      return map;
    },
  });
}

function BirdieRankingView({ contacts, birdies }: { contacts: Contact[]; birdies: Record<string, number> }) {
  const ranked = contacts
    .filter(c => birdies[c.player_id] !== undefined)
    .sort((a, b) => (birdies[b.player_id] ?? 0) - (birdies[a.player_id] ?? 0));

  const NAME_W = 130;
  const NUM_W = 32;
  const COL_W = 72;

  if (ranked.length === 0) return null;

  return (
    <View style={{ margin: 12, marginTop: 4, borderRadius: 6, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border }}>
      <View style={{ flexDirection: 'row', backgroundColor: Colors.greenDark, paddingHorizontal: 10, paddingVertical: 10, alignItems: 'center' }}>
        <View style={{ width: NUM_W }} />
        <Text style={{ width: NAME_W, fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1, color: Colors.white + 'BB' }}>JUGADOR</Text>
        <Text style={{ width: COL_W, textAlign: 'center', fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1, color: Colors.gold }}>BIRDIES</Text>
      </View>
      {ranked.map((c, i) => {
        const name = c.suffix ? `${c.display_name} ${c.suffix}` : c.display_name;
        return (
          <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 12, backgroundColor: Colors.card, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: Colors.border + '55' }}>
            <Text style={{ width: NUM_W, fontFamily: Fonts.mono, fontSize: 12, color: Colors.textSecondary, textAlign: 'center' }}>#{i + 1}</Text>
            <Text style={{ width: NAME_W, fontFamily: Fonts.serif, fontSize: 14, color: Colors.text }} numberOfLines={1}>{name}</Text>
            <Text style={{ width: COL_W, textAlign: 'center', fontFamily: Fonts.mono, fontSize: 15, fontWeight: '700', color: Colors.success }}>{birdies[c.player_id]}</Text>
          </View>
        );
      })}
    </View>
  );
}

export default function PlayersScreen() {
  const router = useRouter();
  const [modalVisible, setModalVisible] = useState(false);
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [modalKey, setModalKey] = useState(0);
  const [view, setView] = useState<'roster' | 'ranking'>('roster');
  const { width } = useWindowDimensions();
  const { favSet, toggleFavorite } = useFavorites();
  const { data: balances = {} } = usePlayerBalances();
  const { data: birdies = {} } = useBirdieCount();

  const { data: contacts = [], isLoading } = useQuery<Contact[]>({
    queryKey: ['contacts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contacts')
        .select('id, player_id, display_name, suffix, handicap, email, players(user_id)')
        .order('display_name');
      if (error) throw error;
      return (data as any[]).map(c => ({
        id: c.id,
        player_id: c.player_id,
        display_name: c.display_name,
        suffix: c.suffix,
        handicap: c.handicap,
        email: c.email,
        user_id: c.players?.user_id ?? null,
      }));
    },
  });

  const { deleteContact } = useContactsMutations();

  function openNew() { setEditContact(null); setModalKey(k => k + 1); setModalVisible(true); }
  function openEdit(c: Contact) { setEditContact(c); setModalKey(k => k + 1); setModalVisible(true); }
  function closeModal() { setModalVisible(false); setEditContact(null); }
  async function handleDeleteContact(contact: Contact) {
    closeModal();
    await deleteContact.mutateAsync(contact);
  }

  const numCols = width >= 900 ? 3 : width >= 560 ? 2 : 1;
  const gap = 12;
  const pad = 16;
  const itemWidth = (width - pad * 2 - gap * (numCols - 1)) / numCols;

  const favorites = contacts.filter(c => favSet.has(c.player_id));
  const others = contacts.filter(c => !favSet.has(c.player_id));
  const hasSections = favorites.length > 0;

  function renderCard(c: Contact) {
    const isFav = favSet.has(c.player_id);
    return (
      <Pressable
        key={c.id}
        onPress={() => openEdit(c)}
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
        <PlayerAvatar name={c.display_name} isFav={isFav} />
        <View style={{ flex: 1, gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <Text style={{ fontFamily: Fonts.serif, fontSize: 17, color: Colors.text }} numberOfLines={1}>{c.display_name}</Text>
            {!!c.suffix && (
              <Text style={{ fontFamily: Fonts.serif, fontSize: 13, color: Colors.textSecondary, fontStyle: 'italic' }}>{c.suffix}</Text>
            )}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5 }}>
            <Text style={{ fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1, color: Colors.textSecondary }}>HANDICAP</Text>
            <Text style={{ fontFamily: Fonts.mono, fontSize: 13, fontWeight: '700', color: Colors.gold }}>{c.handicap}</Text>
          </View>
          {!!c.email && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.user_id ? Colors.success : Colors.border }} />
              <Text style={{ fontFamily: Fonts.mono, fontSize: 9, color: Colors.textSecondary }} numberOfLines={1}>{c.email}</Text>
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
          <>
            <RankingView contacts={contacts} balances={balances} />
            <BirdieRankingView contacts={contacts} birdies={birdies} />
          </>
        ) : contacts.length === 0 ? (
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
                {favorites.map(c => renderCard(c))}
              </View>
            )}
            {hasSections && others.length > 0 && <SectionLabel title="OTROS JUGADORES" />}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>
              {others.map(c => renderCard(c))}
            </View>
          </View>
        )}
      </ScrollView>

      <PlayerModal
        key={modalKey}
        visible={modalVisible}
        contact={editContact}
        onClose={closeModal}
        onDelete={handleDeleteContact}
        favSet={favSet}
        onToggleFav={toggleFavorite}
        onHistorial={(playerId) => router.push(`/(app)/(players)/${playerId}`)}
      />
    </View>
  );
}
