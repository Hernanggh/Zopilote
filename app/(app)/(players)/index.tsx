import { useState } from 'react';
import { View, Text, FlatList, Pressable, TextInput, Modal, ActivityIndicator } from 'react-native';
import { Stack } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/constants/colors';

type Player = { id: string; name: string; default_handicap: number };

function usePlayersMutations() {
  const qc = useQueryClient();
  const add = useMutation({
    mutationFn: async (p: { name: string; default_handicap: number }) => {
      const { error } = await supabase.from('players').insert(p);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['players'] }),
  });
  const update = useMutation({
    mutationFn: async (p: Player) => {
      const { error } = await supabase.from('players').update({ name: p.name, default_handicap: p.default_handicap }).eq('id', p.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['players'] }),
  });
  return { add, update };
}

function PlayerModal({ visible, player, onClose }: { visible: boolean; player: Player | null; onClose: () => void }) {
  const [name, setName] = useState(player?.name ?? '');
  const [hcp, setHcp] = useState(String(player?.default_handicap ?? ''));
  const [err, setErr] = useState('');
  const { add, update } = usePlayersMutations();

  const isEdit = player !== null;
  const loading = add.isPending || update.isPending;

  async function save() {
    setErr('');
    if (!name.trim()) { setErr('Ingresa el nombre'); return; }
    const h = parseInt(hcp, 10);
    if (isNaN(h) || h < 0) { setErr('Handicap inválido'); return; }
    if (isEdit) {
      await update.mutateAsync({ ...player, name: name.trim(), default_handicap: h });
    } else {
      await add.mutateAsync({ name: name.trim(), default_handicap: h });
    }
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: Colors.background, padding: 24, gap: 16 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 20, fontWeight: '700', color: Colors.text }}>
            {isEdit ? 'Editar jugador' : 'Nuevo jugador'}
          </Text>
          <Pressable onPress={onClose}>
            <Text style={{ fontSize: 16, color: Colors.textSecondary }}>Cancelar</Text>
          </Pressable>
        </View>
        {!!err && (
          <View style={{ backgroundColor: '#FFEBEE', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: Colors.error }}>
            <Text style={{ color: Colors.error, fontWeight: '600' }}>⚠️ {err}</Text>
          </View>
        )}

        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: Colors.textSecondary }}>NOMBRE</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Nombre del jugador"
            placeholderTextColor={Colors.textSecondary}
            autoFocus
            style={{ backgroundColor: Colors.card, borderRadius: 10, padding: 14, fontSize: 16, color: Colors.text, borderWidth: 1, borderColor: Colors.border }}
          />
        </View>

        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: Colors.textSecondary }}>HANDICAP</Text>
          <TextInput
            value={hcp}
            onChangeText={setHcp}
            placeholder="0"
            placeholderTextColor={Colors.textSecondary}
            keyboardType="number-pad"
            style={{ backgroundColor: Colors.card, borderRadius: 10, padding: 14, fontSize: 16, color: Colors.text, borderWidth: 1, borderColor: Colors.border, width: 100 }}
          />
        </View>

        <Pressable
          onPress={save}
          disabled={loading}
          style={{ backgroundColor: Colors.green, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8, opacity: loading ? 0.7 : 1 }}
        >
          {loading ? <ActivityIndicator color={Colors.white} /> : <Text style={{ color: Colors.white, fontSize: 17, fontWeight: '700' }}>Guardar</Text>}
        </Pressable>
      </View>
    </Modal>
  );
}

export default function PlayersScreen() {
  const [modalVisible, setModalVisible] = useState(false);
  const [editPlayer, setEditPlayer] = useState<Player | null>(null);

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

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <Stack.Screen options={{ title: 'Jugadores', headerRight: () => (
        <Pressable onPress={openNew} style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
          <Text style={{ color: Colors.green, fontSize: 17, fontWeight: '600' }}>+ Nuevo</Text>
        </Pressable>
      )}} />

      {isLoading ? (
        <ActivityIndicator style={{ flex: 1 }} color={Colors.green} />
      ) : (
        <FlatList
          data={players}
          keyExtractor={p => p.id}
          contentContainerStyle={{ padding: 16, gap: 8 }}
          contentInsetAdjustmentBehavior="automatic"
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 60, gap: 12 }}>
              <Text style={{ fontSize: 48 }}>👤</Text>
              <Text style={{ fontSize: 18, fontWeight: '600', color: Colors.textSecondary }}>Sin jugadores</Text>
              <Text style={{ color: Colors.textSecondary }}>Agrega los jugadores de tu grupo</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => openEdit(item)}
              style={{ backgroundColor: Colors.card, borderRadius: 12, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: Colors.border }}
            >
              <View>
                <Text style={{ fontSize: 16, fontWeight: '600', color: Colors.text }} selectable>{item.name}</Text>
                <Text style={{ fontSize: 13, color: Colors.textSecondary, marginTop: 2 }}>Handicap: {item.default_handicap}</Text>
              </View>
              <Text style={{ fontSize: 20, color: Colors.textSecondary }}>›</Text>
            </Pressable>
          )}
        />
      )}

      {/* FAB visible en web (el headerRight está oculto en web) */}
      <Pressable
        onPress={openNew}
        style={{
          position: 'absolute', bottom: 32, right: 24,
          backgroundColor: Colors.green, borderRadius: 28,
          paddingHorizontal: 22, paddingVertical: 16,
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
          flexDirection: 'row', alignItems: 'center', gap: 8,
        }}
      >
        <Text style={{ color: Colors.white, fontSize: 22, lineHeight: 24 }}>+</Text>
        <Text style={{ color: Colors.white, fontSize: 16, fontWeight: '700' }}>Nuevo Jugador</Text>
      </Pressable>

      <PlayerModal key={editPlayer?.id ?? 'new'} visible={modalVisible} player={editPlayer} onClose={closeModal} />
    </View>
  );
}
