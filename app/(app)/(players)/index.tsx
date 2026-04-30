import { useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Modal, ActivityIndicator, useWindowDimensions, KeyboardAvoidingView, Platform } from 'react-native';
import { Stack } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Colors, Fonts } from '@/constants/colors';

type Player = { id: string; name: string; default_handicap: number; suffix?: string | null };

function usePlayersMutations() {
  const qc = useQueryClient();
  const add = useMutation({
    mutationFn: async (p: { name: string; default_handicap: number; suffix?: string | null }) => {
      const { error } = await supabase.from('players').insert(p);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['players'] }),
  });
  const update = useMutation({
    mutationFn: async (p: Player) => {
      const { error } = await supabase.from('players').update({ name: p.name, default_handicap: p.default_handicap, suffix: p.suffix ?? null }).eq('id', p.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['players'] }),
  });
  return { add, update };
}

function PlayerModal({ visible, player, onClose }: { visible: boolean; player: Player | null; onClose: () => void }) {
  const [name, setName] = useState(player?.name ?? '');
  const [hcp, setHcp] = useState(String(player?.default_handicap ?? ''));
  const [suffix, setSuffix] = useState(player?.suffix ?? '');
  const [err, setErr] = useState('');
  const { add, update } = usePlayersMutations();

  const isEdit = player !== null;
  const loading = add.isPending || update.isPending;

  async function save() {
    setErr('');
    if (!name.trim()) { setErr('Ingresa el nombre'); return; }
    const h = parseInt(hcp, 10);
    if (isNaN(h) || h < 0) { setErr('Handicap inválido'); return; }
    const suffixVal = suffix.trim() || null;
    if (isEdit) {
      await update.mutateAsync({ ...player, name: name.trim(), default_handicap: h, suffix: suffixVal });
    } else {
      await add.mutateAsync({ name: name.trim(), default_handicap: h, suffix: suffixVal });
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
      </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// Avatar circle with player initial
function PlayerAvatar({ name }: { name: string }) {
  const initial = name.trim().charAt(0).toUpperCase();
  return (
    <View style={{
      width: 52, height: 52, borderRadius: 26,
      backgroundColor: Colors.greenDark,
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 1.5, borderColor: Colors.gold + '55',
    }}>
      <Text style={{ fontFamily: Fonts.serif, fontSize: 20, color: Colors.gold, lineHeight: 24 }}>{initial}</Text>
    </View>
  );
}

export default function PlayersScreen() {
  const [modalVisible, setModalVisible] = useState(false);
  const [editPlayer, setEditPlayer] = useState<Player | null>(null);
  const { width } = useWindowDimensions();

  const { data: players = [], isLoading } = useQuery<Player[]>({
    queryKey: ['players'],
    queryFn: async () => {
      const { data, error } = await supabase.from('players').select('*').order('name');
      if (error) throw error;
      return data;
    },
  });

  function openNew() { setEditPlayer(null); setModalVisible(true); }
  function openEdit(p: Player) { setEditPlayer(p); setModalVisible(true); }
  function closeModal() { setModalVisible(false); setEditPlayer(null); }

  const numCols = width >= 900 ? 3 : width >= 560 ? 2 : 1;
  const gap = 12;
  const pad = 16;
  const itemWidth = (width - pad * 2 - gap * (numCols - 1)) / numCols;

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView contentInsetAdjustmentBehavior="automatic">
        {/* Page header */}
        <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, gap: 12, borderBottomWidth: 1, borderColor: Colors.border }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ gap: 4, flex: 1, marginRight: 12 }}>
              <Text style={{ fontFamily: Fonts.serif, fontSize: 28, color: Colors.text }}>Roster del Foursome</Text>
              <Text style={{ fontFamily: Fonts.fraunces, fontStyle: 'italic', fontSize: 13, color: Colors.textSecondary }}>
                {players.length} {players.length === 1 ? 'jugador registrado' : 'jugadores registrados'}
              </Text>
            </View>
            <Pressable
              onPress={openNew}
              style={{ backgroundColor: Colors.gold, borderRadius: 4, paddingHorizontal: 16, paddingVertical: 10, marginTop: 4 }}
            >
              <Text style={{ fontFamily: Fonts.mono, fontSize: 11, fontWeight: '700', letterSpacing: 1.2, color: Colors.greenDark }}>+ NUEVO JUGADOR</Text>
            </Pressable>
          </View>
        </View>

        {isLoading ? (
          <ActivityIndicator style={{ marginTop: 60 }} color={Colors.greenDark} />
        ) : players.length === 0 ? (
          <View style={{ alignItems: 'center', marginTop: 80, gap: 10 }}>
            <Text style={{ fontFamily: Fonts.serif, fontSize: 22, color: Colors.text }}>Sin jugadores</Text>
            <Text style={{ fontFamily: Fonts.fraunces, fontStyle: 'italic', color: Colors.textSecondary, fontSize: 14 }}>
              Agrega los jugadores de tu grupo
            </Text>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', padding: pad, gap }}>
            {players.map(p => (
              <Pressable
                key={p.id}
                onPress={() => openEdit(p)}
                style={{
                  width: itemWidth,
                  backgroundColor: Colors.card,
                  borderRadius: 6,
                  borderWidth: 1,
                  borderColor: Colors.border,
                  padding: 14,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 14,
                }}
              >
                <PlayerAvatar name={p.name} />
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
                </View>
                <Text style={{ fontFamily: Fonts.mono, fontSize: 16, color: Colors.textSecondary + '66' }}>›</Text>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      <PlayerModal key={editPlayer?.id ?? 'new'} visible={modalVisible} player={editPlayer} onClose={closeModal} />
    </View>
  );
}
