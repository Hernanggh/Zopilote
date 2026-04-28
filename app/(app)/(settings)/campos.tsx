import { useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/constants/colors';

type Course = { id: string; name: string };

export default function Campos() {
  const router = useRouter();
  const qc = useQueryClient();
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [createErr, setCreateErr] = useState('');

  const { data: courses = [], isLoading } = useQuery<Course[]>({
    queryKey: ['courses'],
    queryFn: async () => {
      const { data, error } = await supabase.from('courses').select('id, name').order('name');
      if (error) throw error;
      return data;
    },
  });

  async function createCourse() {
    if (!newName.trim()) return;
    setCreating(true);
    setCreateErr('');
    const { data, error } = await supabase.from('courses').insert({ name: newName.trim() }).select('id').single();
    setCreating(false);
    if (error) { setCreateErr(error.message); return; }
    setNewName('');
    setShowNew(false);
    qc.invalidateQueries({ queryKey: ['courses'] });
    router.push(`/(app)/(settings)/campo/${data.id}` as any);
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'Campos' }} />

      {isLoading ? (
        <ActivityIndicator color={Colors.green} style={{ marginTop: 40 }} />
      ) : courses.length > 0 ? (
        <View style={{ backgroundColor: Colors.card, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border }}>
          {courses.map((course, i) => (
            <View key={course.id}>
              {i > 0 && <View style={{ height: 1, backgroundColor: Colors.border, marginLeft: 16 }} />}
              <Pressable
                onPress={() => router.push(`/(app)/(settings)/campo/${course.id}` as any)}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: pressed ? Colors.background : Colors.card, gap: 12 })}
              >
                <Text style={{ fontSize: 20 }}>⛳</Text>
                <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: Colors.text }}>{course.name}</Text>
                <Text style={{ fontSize: 20, color: Colors.textSecondary }}>›</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      {showNew ? (
        <View style={{ backgroundColor: Colors.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: Colors.green + '66', gap: 12 }}>
          {!!createErr && <Text style={{ color: Colors.error, fontSize: 13 }}>⚠️ {createErr}</Text>}
          <TextInput
            value={newName}
            onChangeText={setNewName}
            placeholder="Nombre del campo"
            autoFocus
            style={{ fontSize: 15, color: Colors.text, borderBottomWidth: 1, borderColor: Colors.border, paddingVertical: 8 }}
          />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable
              onPress={() => { setShowNew(false); setCreateErr(''); }}
              style={{ flex: 1, padding: 12, borderRadius: 10, backgroundColor: Colors.background, alignItems: 'center', borderWidth: 1, borderColor: Colors.border }}
            >
              <Text style={{ fontWeight: '600', color: Colors.text }}>Cancelar</Text>
            </Pressable>
            <Pressable
              onPress={createCourse}
              disabled={creating || !newName.trim()}
              style={{ flex: 1, padding: 12, borderRadius: 10, backgroundColor: Colors.green, alignItems: 'center', opacity: !newName.trim() ? 0.5 : 1 }}
            >
              {creating ? <ActivityIndicator color="white" size="small" /> : <Text style={{ fontWeight: '700', color: 'white' }}>Crear</Text>}
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable
          onPress={() => setShowNew(true)}
          style={{ borderStyle: 'dashed', borderWidth: 1.5, borderColor: Colors.green, borderRadius: 14, padding: 16, alignItems: 'center' }}
        >
          <Text style={{ color: Colors.green, fontWeight: '600', fontSize: 15 }}>+ Nuevo campo</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}
