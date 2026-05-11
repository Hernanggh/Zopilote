import { useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Colors, Fonts } from '@/constants/colors';

export default function JoinScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) { router.replace('/(app)/(rounds)'); return; }

    async function processToken() {
      const { data, error: dbErr } = await supabase
        .from('round_invitations')
        .select('round_id, expires_at')
        .eq('token', token)
        .single();

      if (dbErr || !data) { setError('El link de invitación no es válido.'); return; }
      if (new Date(data.expires_at) < new Date()) { setError('El link de invitación ha expirado.'); return; }

      router.replace(`/partida/${data.round_id}` as any);
    }

    processToken();
  }, [token]);

  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background, padding: 32, gap: 16 }}>
        <Text style={{ fontFamily: Fonts.serif, fontSize: 22, color: Colors.text, textAlign: 'center' }}>Link inválido</Text>
        <Text style={{ fontFamily: Fonts.fraunces, fontStyle: 'italic', fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 }}>
          {error}
        </Text>
        <Pressable
          onPress={() => router.replace('/(app)/(rounds)')}
          style={{ borderWidth: 1, borderColor: Colors.gold, borderRadius: 4, paddingHorizontal: 24, paddingVertical: 12, marginTop: 8 }}
        >
          <Text style={{ fontFamily: Fonts.mono, color: Colors.goldText, fontSize: 11, fontWeight: '700', letterSpacing: 1.5 }}>IR AL INICIO</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background, gap: 16 }}>
      <ActivityIndicator size="large" color={Colors.greenDark} />
      <Text style={{ fontFamily: Fonts.fraunces, fontStyle: 'italic', fontSize: 14, color: Colors.textSecondary }}>
        Abriendo partida...
      </Text>
    </View>
  );
}
