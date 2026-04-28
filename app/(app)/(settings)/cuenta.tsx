import { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/constants/colors';

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
    <ScrollView contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'Mi cuenta' }} />

      <View style={{ backgroundColor: Colors.card, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border }}>
        <View style={{ padding: 16, gap: 4 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: Colors.textSecondary, letterSpacing: 0.5 }}>CORREO</Text>
          <Text style={{ fontSize: 15, color: Colors.text }}>{email || '—'}</Text>
        </View>
      </View>

      <Pressable
        onPress={handleLogout}
        disabled={loading}
        style={{ backgroundColor: Colors.error + '15', borderRadius: 14, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: Colors.error + '44' }}
      >
        {loading
          ? <ActivityIndicator color={Colors.error} />
          : <Text style={{ fontSize: 15, fontWeight: '700', color: Colors.error }}>Cerrar sesión</Text>
        }
      </Pressable>
    </ScrollView>
  );
}
