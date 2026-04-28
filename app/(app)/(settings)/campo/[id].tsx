import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, ActivityIndicator, Switch } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/constants/colors';

type HoleData = { hole_number: number; par: number; handicap_rank: number };

export default function CampoEdit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [holes, setHoles] = useState<HoleData[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const { data: course, isLoading } = useQuery({
    queryKey: ['course', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('courses')
        .select('id, name, course_holes(hole_number, par, handicap_rank)')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as { id: string; name: string; course_holes: HoleData[] };
    },
    enabled: !!id,
  });

  const { data: myPrefs, refetch: refetchPrefs } = useQuery<{ default_course_id: string | null } | null>({
    queryKey: ['user_preferences'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase.from('user_preferences').select('default_course_id').eq('user_id', user.id).maybeSingle();
      return data ?? { default_course_id: null };
    },
  });

  useEffect(() => {
    if (!course) return;
    setName(course.name);
    const sorted = [...course.course_holes].sort((a, b) => a.hole_number - b.hole_number);
    setHoles(
      Array.from({ length: 18 }, (_, i) => {
        const h = i + 1;
        return sorted.find(s => s.hole_number === h) ?? { hole_number: h, par: 4, handicap_rank: h };
      })
    );
  }, [course]);

  function updateHole(holeNum: number, field: 'par' | 'handicap_rank', val: string) {
    const n = parseInt(val, 10);
    setHoles(prev => prev.map(h =>
      h.hole_number === holeNum ? { ...h, [field]: isNaN(n) ? h[field] : n } : h
    ));
  }

  async function save() {
    setSaving(true);
    setErr('');
    const errs: string[] = [];

    const { error: nameErr } = await supabase.from('courses').update({ name: name.trim() }).eq('id', id);
    if (nameErr) errs.push(nameErr.message);

    const { error: holesErr } = await supabase.from('course_holes').upsert(
      holes.map(h => ({ course_id: id, hole_number: h.hole_number, par: h.par, handicap_rank: h.handicap_rank })),
      { onConflict: 'course_id,hole_number' }
    );
    if (holesErr) errs.push(holesErr.message);

    setSaving(false);
    if (errs.length) {
      setErr(errs[0]);
    } else {
      qc.invalidateQueries({ queryKey: ['course', id] });
      qc.invalidateQueries({ queryKey: ['courses'] });
      qc.invalidateQueries({ queryKey: ['holes', id] });
      router.back();
    }
  }

  async function toggleMyDefault(makeDefault: boolean) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('user_preferences').upsert(
      { user_id: user.id, default_course_id: makeDefault ? id : null },
      { onConflict: 'user_id' }
    );
    qc.invalidateQueries({ queryKey: ['user_preferences'] });
  }

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background }}>
        <ActivityIndicator color={Colors.green} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: 40 }}>
      <Stack.Screen options={{
        title: name || 'Campo',
        headerRight: () => (
          <Pressable onPress={save} disabled={saving} style={{ paddingHorizontal: 4 }}>
            {saving
              ? <ActivityIndicator size="small" color={Colors.green} />
              : <Text style={{ fontSize: 16, fontWeight: '700', color: Colors.green }}>Guardar</Text>
            }
          </Pressable>
        ),
      }} />

      {!!err && (
        <View style={{ backgroundColor: '#FFEBEE', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: Colors.error }}>
          <Text style={{ color: Colors.error, fontWeight: '600' }}>⚠️ {err}</Text>
        </View>
      )}

      {/* Nombre */}
      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.textSecondary, letterSpacing: 0.5 }}>NOMBRE DEL CAMPO</Text>
        <View style={{ backgroundColor: Colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.border }}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Nombre del campo"
            style={{ fontSize: 16, color: Colors.text }}
          />
        </View>
      </View>

      {/* Hoyos */}
      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.textSecondary, letterSpacing: 0.5 }}>HOYOS</Text>
        <View style={{ backgroundColor: Colors.card, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border }}>
          <View style={{ flexDirection: 'row', backgroundColor: Colors.greenDark, paddingVertical: 10, paddingHorizontal: 12 }}>
            <Text style={{ width: 52, fontSize: 12, fontWeight: '700', color: Colors.white, textAlign: 'center' }}>Hoyo</Text>
            <Text style={{ flex: 1, fontSize: 12, fontWeight: '700', color: Colors.greenLight, textAlign: 'center' }}>Par</Text>
            <Text style={{ flex: 1, fontSize: 12, fontWeight: '700', color: Colors.gold, textAlign: 'center' }}>Ventaja</Text>
          </View>
          {holes.map((hole, i) => (
            <View key={hole.hole_number} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 12, backgroundColor: i % 2 === 0 ? Colors.card : Colors.background, borderTopWidth: 1, borderColor: Colors.border + '44' }}>
              <View style={{ width: 52, alignItems: 'center' }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: Colors.text }}>{hole.hole_number}</Text>
              </View>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <TextInput
                  value={String(hole.par)}
                  onChangeText={v => updateHole(hole.hole_number, 'par', v)}
                  keyboardType="number-pad"
                  style={{ width: 50, textAlign: 'center', fontSize: 15, fontWeight: '600', color: Colors.text, backgroundColor: Colors.background, borderRadius: 8, paddingVertical: 4, borderWidth: 1, borderColor: Colors.border }}
                />
              </View>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <TextInput
                  value={String(hole.handicap_rank)}
                  onChangeText={v => updateHole(hole.hole_number, 'handicap_rank', v)}
                  keyboardType="number-pad"
                  style={{ width: 50, textAlign: 'center', fontSize: 15, fontWeight: '600', color: Colors.text, backgroundColor: Colors.background, borderRadius: 8, paddingVertical: 4, borderWidth: 1, borderColor: Colors.border }}
                />
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* Mi campo default */}
      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.textSecondary, letterSpacing: 0.5 }}>MI CAMPO DEFAULT</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.border }}>
          <Text style={{ flex: 1, fontSize: 14, color: Colors.text }}>Usar este campo al crear partidas</Text>
          <Switch
            value={myPrefs?.default_course_id === id}
            onValueChange={toggleMyDefault}
            trackColor={{ false: Colors.border, true: Colors.green }}
          />
        </View>
      </View>
    </ScrollView>
  );
}
