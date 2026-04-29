import { useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Colors, Fonts } from '@/constants/colors';

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
    <ScrollView style={{ flex: 1, backgroundColor: Colors.background }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Page header */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingVertical: 8, paddingHorizontal: 4, marginBottom: 4 }}>
        <View style={{ gap: 4 }}>
          <Text style={{ fontFamily: Fonts.serif, fontSize: 28, color: Colors.text }}>Campos</Text>
          <Text style={{ fontFamily: Fonts.fraunces, fontStyle: 'italic', fontSize: 13, color: Colors.textSecondary }}>
            Par, ventajas y campo por defecto
          </Text>
        </View>
        <Pressable
          onPress={() => setShowNew(true)}
          style={{ borderWidth: 1, borderColor: Colors.gold, borderRadius: 4, paddingHorizontal: 14, paddingVertical: 8, marginTop: 6 }}
        >
          <Text style={{ fontFamily: Fonts.mono, fontSize: 11, fontWeight: '700', letterSpacing: 1, color: Colors.goldText }}>+ NUEVO</Text>
        </Pressable>
      </View>

      {/* New course form */}
      {showNew && (
        <View style={{ backgroundColor: Colors.card, borderRadius: 6, borderWidth: 1, borderColor: Colors.gold + '66', padding: 16, gap: 12 }}>
          {!!createErr && (
            <Text style={{ fontFamily: Fonts.mono, fontSize: 12, color: Colors.error }}>{createErr}</Text>
          )}
          <View style={{ gap: 4 }}>
            <Text style={{ fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1.5, color: Colors.textSecondary }}>NOMBRE DEL CAMPO</Text>
            <TextInput
              value={newName}
              onChangeText={setNewName}
              placeholder="Nombre del campo"
              placeholderTextColor={Colors.textSecondary + '88'}
              autoFocus
              style={{ fontFamily: Fonts.serif, fontSize: 18, color: Colors.text, borderBottomWidth: 1, borderColor: Colors.border, paddingVertical: 6 }}
            />
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable
              onPress={() => { setShowNew(false); setCreateErr(''); }}
              style={{ flex: 1, padding: 12, borderRadius: 4, alignItems: 'center', borderWidth: 1, borderColor: Colors.border }}
            >
              <Text style={{ fontFamily: Fonts.mono, fontWeight: '700', fontSize: 11, letterSpacing: 1, color: Colors.textSecondary }}>CANCELAR</Text>
            </Pressable>
            <Pressable
              onPress={createCourse}
              disabled={creating || !newName.trim()}
              style={{ flex: 1, padding: 12, borderRadius: 4, backgroundColor: Colors.greenDark, alignItems: 'center', borderWidth: 1, borderColor: Colors.gold, opacity: !newName.trim() ? 0.5 : 1 }}
            >
              {creating
                ? <ActivityIndicator color={Colors.gold} size="small" />
                : <Text style={{ fontFamily: Fonts.mono, fontWeight: '700', fontSize: 11, letterSpacing: 1, color: Colors.white }}>CREAR</Text>
              }
            </Pressable>
          </View>
        </View>
      )}

      {/* Course list */}
      {isLoading ? (
        <ActivityIndicator color={Colors.greenDark} style={{ marginTop: 40 }} />
      ) : courses.length > 0 ? (
        <View style={{ backgroundColor: Colors.card, borderRadius: 6, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border }}>
          {courses.map((course, i) => (
            <View key={course.id}>
              {i > 0 && <View style={{ height: 1, backgroundColor: Colors.border, marginLeft: 18 }} />}
              <Pressable
                onPress={() => router.push(`/(app)/(settings)/campo/${course.id}` as any)}
                style={({ pressed }) => ({
                  flexDirection: 'row', alignItems: 'center',
                  paddingHorizontal: 18, paddingVertical: 14,
                  backgroundColor: pressed ? Colors.creamDeep : Colors.card,
                  gap: 12,
                })}
              >
                <Text style={{ flex: 1, fontFamily: Fonts.serif, fontSize: 17, color: Colors.text }}>{course.name}</Text>
                <Text style={{ fontFamily: Fonts.mono, fontSize: 18, color: Colors.textSecondary + '88' }}>›</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : (
        !showNew && (
          <View style={{ alignItems: 'center', marginTop: 40, gap: 8 }}>
            <Text style={{ fontFamily: Fonts.serif, fontSize: 20, color: Colors.textSecondary }}>Sin campos registrados</Text>
            <Text style={{ fontFamily: Fonts.fraunces, fontStyle: 'italic', fontSize: 13, color: Colors.textSecondary }}>
              Agrega tu campo para configurar par y ventajas
            </Text>
          </View>
        )
      )}
    </ScrollView>
  );
}
