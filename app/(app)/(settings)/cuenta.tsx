import { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Colors, Fonts } from '@/constants/colors';

export default function Cuenta() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setEmail(user.email ?? '');
    });
  }, []);

  async function handleLogout() {
    setLoading(true);
    await supabase.auth.signOut();
    router.replace('/(auth)/login');
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: Colors.background }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={{ paddingVertical: 8, paddingHorizontal: 4, marginBottom: 4 }}>
        <Text style={{ fontFamily: Fonts.serif, fontSize: 28, color: Colors.text }}>Mi cuenta</Text>
      </View>

      {/* Email */}
      <View style={{ backgroundColor: Colors.card, borderRadius: 6, borderWidth: 1, borderColor: Colors.border, padding: 18, gap: 4 }}>
        <Text style={{ fontFamily: Fonts.mono, fontSize: 9, letterSpacing: 1.5, color: Colors.textSecondary }}>CORREO</Text>
        <Text style={{ fontFamily: Fonts.serif, fontSize: 18, color: Colors.text }}>{email || '—'}</Text>
      </View>

      {/* Logout */}
      <Pressable
        onPress={handleLogout}
        disabled={loading}
        style={({ pressed }) => ({
          borderWidth: 1, borderColor: Colors.error + '66',
          borderRadius: 6, padding: 14,
          alignItems: 'center',
          backgroundColor: pressed ? Colors.error + '11' : 'transparent',
        })}
      >
        {loading
          ? <ActivityIndicator color={Colors.error} />
          : <Text style={{ fontFamily: Fonts.mono, fontSize: 11, fontWeight: '700', letterSpacing: 1.5, color: Colors.error }}>CERRAR SESIÓN</Text>
        }
      </Pressable>
    </ScrollView>
  );
}
