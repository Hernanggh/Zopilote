import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, ActivityIndicator, Switch } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Colors, Fonts } from '@/constants/colors';

type HoleData = { hole_number: number; par: number; handicap_rank: number };

export default function CampoEdit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [holes, setHoles] = useState<HoleData[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
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

  const { data: myPrefs } = useQuery<{ default_course_id: string | null } | null>({
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
      setSaved(true);
      setTimeout(() => { setSaved(false); router.back(); }, 600);
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
        <ActivityIndicator color={Colors.greenDark} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.background }}
      contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}
    >
      <Stack.Screen options={{ headerShown: false }} />

      {/* Page header */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingVertical: 8, paddingHorizontal: 4, marginBottom: 4 }}>
        <View style={{ gap: 4 }}>
          <Text style={{ fontFamily: Fonts.serif, fontSize: 28, color: Colors.text }}>{name || 'Campo'}</Text>
          <Text style={{ fontFamily: Fonts.fraunces, fontStyle: 'italic', fontSize: 13, color: Colors.textSecondary }}>
            Par y ventaja por hoyo
          </Text>
        </View>
        <Pressable
          onPress={save}
          disabled={saving}
          style={{ borderWidth: 1, borderColor: saved ? Colors.success : Colors.gold, borderRadius: 4, paddingHorizontal: 14, paddingVertical: 8, marginTop: 6 }}
        >
          {saving
            ? <ActivityIndicator size="small" color={Colors.gold} />
            : <Text style={{ fontFamily: Fonts.mono, fontSize: 11, fontWeight: '700', letterSpacing: 1, color: saved ? Colors.success : Colors.goldText }}>
                {saved ? 'GUARDADO' : 'GUARDAR'}
              </Text>
          }
        </Pressable>
      </View>

      {!!err && (
        <View style={{ backgroundColor: Colors.error + '15', borderRadius: 4, padding: 12, borderLeftWidth: 3, borderLeftColor: Colors.error }}>
          <Text style={{ fontFamily: Fonts.mono, fontSize: 12, color: Colors.error }}>{err}</Text>
        </View>
      )}

      {/* Nombre */}
      <View style={{ gap: 6 }}>
        <Text style={{ fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1.5, color: Colors.textSecondary, paddingHorizontal: 4 }}>NOMBRE DEL CAMPO</Text>
        <View style={{ backgroundColor: Colors.card, borderRadius: 6, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 16, paddingVertical: 12 }}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Nombre del campo"
            placeholderTextColor={Colors.textSecondary + '88'}
            style={{ fontFamily: Fonts.serif, fontSize: 18, color: Colors.text }}
          />
        </View>
      </View>

      {/* Campo default */}
      <View style={{ backgroundColor: Colors.card, borderRadius: 6, borderWidth: 1, borderColor: Colors.border }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14, gap: 12 }}>
          <Switch
            value={myPrefs?.default_course_id === id}
            onValueChange={toggleMyDefault}
            trackColor={{ false: Colors.border, true: Colors.greenDark }}
            thumbColor={myPrefs?.default_course_id === id ? Colors.gold : Colors.white}
          />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontFamily: Fonts.serif, fontSize: 16, color: Colors.text }}>Campo por defecto</Text>
            <Text style={{ fontFamily: Fonts.fraunces, fontStyle: 'italic', fontSize: 12, color: Colors.textSecondary }}>
              Se pre-selecciona al crear una nueva partida
            </Text>
          </View>
        </View>
      </View>

      {/* Hoyos */}
      <View style={{ gap: 6 }}>
        <Text style={{ fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1.5, color: Colors.textSecondary, paddingHorizontal: 4 }}>HOYOS</Text>
        <View style={{ backgroundColor: Colors.card, borderRadius: 6, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', backgroundColor: Colors.greenDark, paddingVertical: 10, paddingHorizontal: 12 }}>
            <Text style={{ width: 52, fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1, color: Colors.white + 'BB', textAlign: 'center' }}>HOYO</Text>
            <Text style={{ flex: 1, fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1, color: Colors.white + 'BB', textAlign: 'center' }}>PAR</Text>
            <Text style={{ flex: 1, fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1, color: Colors.gold, textAlign: 'center' }}>VENTAJA</Text>
          </View>
          {holes.map((hole, i) => (
            <View key={hole.hole_number} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: Colors.border + '55' }}>
              <View style={{ width: 52, alignItems: 'center', backgroundColor: Colors.creamDeep, paddingVertical: 6, borderRadius: 3 }}>
                <Text style={{ fontFamily: Fonts.mono, fontSize: 13, fontWeight: '700', color: Colors.text }}>{hole.hole_number}</Text>
              </View>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <TextInput
                  value={String(hole.par)}
                  onChangeText={v => updateHole(hole.hole_number, 'par', v)}
                  keyboardType="number-pad"
                  style={{
                    width: 50, textAlign: 'center',
                    fontFamily: Fonts.mono, fontSize: 15, fontWeight: '600',
                    color: Colors.text,
                    borderBottomWidth: 1, borderColor: Colors.border,
                    paddingVertical: 4,
                  }}
                />
              </View>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <TextInput
                  value={String(hole.handicap_rank)}
                  onChangeText={v => updateHole(hole.hole_number, 'handicap_rank', v)}
                  keyboardType="number-pad"
                  style={{
                    width: 50, textAlign: 'center',
                    fontFamily: Fonts.mono, fontSize: 15, fontWeight: '600',
                    color: Colors.text,
                    borderBottomWidth: 1, borderColor: Colors.border,
                    paddingVertical: 4,
                  }}
                />
              </View>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}
