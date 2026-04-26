import { useState } from 'react';
import { View, Text, TextInput, Pressable, KeyboardAvoidingView, ScrollView, ActivityIndicator } from 'react-native';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/constants/colors';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');

  async function handleLogin() {
    setErr('');
    if (!email.trim()) { setErr('Ingresa tu email'); return; }
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim().toLowerCase() });
    setLoading(false);
    if (error) { setErr(error.message); return; }
    setSent(true);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: Colors.background }} behavior="padding">
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 32 }}>
        {/* Logo area */}
        <View style={{ alignItems: 'center', marginBottom: 48 }}>
          <Text style={{ fontSize: 56 }}>⛳</Text>
          <Text style={{ fontSize: 32, fontWeight: '800', color: Colors.greenDark, marginTop: 8 }}>
            GolfJuegos
          </Text>
          <Text style={{ fontSize: 16, color: Colors.textSecondary, marginTop: 4 }}>
            Calcula tus apuestas al instante
          </Text>
        </View>

        {sent ? (
          <View style={{ alignItems: 'center', gap: 16 }}>
            <Text style={{ fontSize: 48 }}>📬</Text>
            <Text style={{ fontSize: 20, fontWeight: '700', color: Colors.text, textAlign: 'center' }}>
              Revisa tu email
            </Text>
            <Text style={{ fontSize: 15, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 }}>
              Te enviamos un link mágico a {email}. Tócalo para entrar.
            </Text>
            <Pressable onPress={() => setSent(false)} style={{ marginTop: 8 }}>
              <Text style={{ color: Colors.green, fontSize: 15 }}>Usar otro email</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ gap: 16 }}>
            {!!err && (
              <View style={{ backgroundColor: '#FFEBEE', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: Colors.error }}>
                <Text style={{ color: Colors.error, fontWeight: '600' }}>⚠️ {err}</Text>
              </View>
            )}
            <Text style={{ fontSize: 16, fontWeight: '600', color: Colors.text }}>
              Email
            </Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="tu@email.com"
              placeholderTextColor={Colors.textSecondary}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              style={{
                backgroundColor: Colors.card,
                borderWidth: 1,
                borderColor: Colors.border,
                borderRadius: 12,
                padding: 16,
                fontSize: 16,
                color: Colors.text,
              }}
            />
            <Pressable
              onPress={handleLogin}
              disabled={loading}
              style={{
                backgroundColor: Colors.green,
                borderRadius: 12,
                padding: 18,
                alignItems: 'center',
                marginTop: 8,
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading
                ? <ActivityIndicator color={Colors.white} />
                : <Text style={{ color: Colors.white, fontSize: 17, fontWeight: '700' }}>Entrar</Text>
              }
            </Pressable>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
