import { useState } from 'react';
import { View, Text, TextInput, Pressable, KeyboardAvoidingView, ScrollView, ActivityIndicator, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Colors, Fonts } from '@/constants/colors';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  async function handleReset() {
    setErr('');
    if (!password) { setErr('Ingresa una contraseña'); return; }
    if (password.length < 6) { setErr('Mínimo 6 caracteres'); return; }
    if (password !== confirm) { setErr('Las contraseñas no coinciden'); return; }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) { setErr(error.message); return; }
    // Contraseña actualizada — redirigir a la app
    router.replace('/(app)/(rounds)');
  }

  const inputStyle = {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
    padding: 14,
    fontSize: 16,
    fontFamily: Fonts.serif,
    color: Colors.text,
    outlineWidth: 0,
  } as any;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: Colors.background }} behavior="padding">
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 32 }}>

        <View style={{ alignItems: 'center', marginBottom: 48 }}>
          <Image source={require('@/assets/images/logo-transparent.png')} style={{ width: 100, height: 100 }} />
          <Text style={{ fontFamily: Fonts.serif, fontSize: 32, color: Colors.greenDark, marginTop: 12 }}>Zopilote</Text>
          <Text style={{ fontFamily: Fonts.fraunces, fontStyle: 'italic', fontSize: 15, color: Colors.textSecondary, marginTop: 4 }}>
            Nueva contraseña
          </Text>
        </View>

        <View style={{ gap: 14 }}>
          {!!err && (
            <View style={{ backgroundColor: Colors.error + '18', borderRadius: 6, padding: 12, borderLeftWidth: 3, borderLeftColor: Colors.error }}>
              <Text style={{ color: Colors.error, fontFamily: Fonts.mono, fontSize: 12 }}>{err}</Text>
            </View>
          )}

          <View style={{ gap: 6 }}>
            <Text style={{ fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1.5, color: Colors.textSecondary }}>NUEVA CONTRASEÑA</Text>
            <TextInput
              value={password}
              onChangeText={v => { setPassword(v); setErr(''); }}
              placeholder="········"
              placeholderTextColor={Colors.textSecondary + '88'}
              secureTextEntry
              autoFocus
              style={inputStyle}
            />
          </View>

          <View style={{ gap: 6 }}>
            <Text style={{ fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1.5, color: Colors.textSecondary }}>CONFIRMAR CONTRASEÑA</Text>
            <TextInput
              value={confirm}
              onChangeText={v => { setConfirm(v); setErr(''); }}
              placeholder="········"
              placeholderTextColor={Colors.textSecondary + '88'}
              secureTextEntry
              style={inputStyle}
            />
          </View>

          <Pressable
            onPress={handleReset}
            disabled={loading}
            style={{ backgroundColor: Colors.greenDark, borderWidth: 1, borderColor: Colors.gold, borderRadius: 4, padding: 14, alignItems: 'center', marginTop: 4, opacity: loading ? 0.7 : 1 }}
          >
            {loading
              ? <ActivityIndicator color={Colors.gold} />
              : <Text style={{ fontFamily: Fonts.mono, color: Colors.white, fontSize: 11, fontWeight: '700', letterSpacing: 1.5 }}>GUARDAR CONTRASEÑA</Text>
            }
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
