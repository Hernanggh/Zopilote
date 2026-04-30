import { useState } from 'react';
import { View, Text, TextInput, Pressable, KeyboardAvoidingView, ScrollView, ActivityIndicator, Platform, Image } from 'react-native';
import { supabase } from '@/lib/supabase';
import { Colors, Fonts } from '@/constants/colors';

export default function LoginScreen() {
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');

  function translateError(msg: string): string {
    if (msg.includes('Invalid login credentials')) return 'Email o contraseña incorrectos';
    if (msg.includes('Email not confirmed')) return 'Confirma tu email antes de entrar';
    if (msg.includes('User already registered')) return 'Este email ya tiene cuenta — intenta entrar';
    if (msg.includes('Password should be at least')) return 'La contraseña debe tener al menos 6 caracteres';
    if (msg.includes('Unable to validate email')) return 'Email inválido';
    return msg;
  }

  async function handleSubmit() {
    setErr('');
    setInfo('');

    if (mode === 'forgot') {
      if (!email.trim()) { setErr('Ingresa tu email'); return; }
      setLoading(true);
      const redirectTo = Platform.OS === 'web' ? window.location.origin : undefined;
      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        { redirectTo }
      );
      setLoading(false);
      if (error) { setErr(translateError(error.message)); return; }
      setInfo('Revisa tu email — te mandamos un link para restablecer tu contraseña');
      return;
    }

    if (!email.trim()) { setErr('Ingresa tu email'); return; }
    if (!password) { setErr('Ingresa tu contraseña'); return; }
    if (password.length < 6) { setErr('La contraseña debe tener al menos 6 caracteres'); return; }

    setLoading(true);

    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      setLoading(false);
      if (error) setErr(translateError(error.message));
    } else {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
      });
      setLoading(false);
      if (error) { setErr(translateError(error.message)); return; }
      if (!data.session) setInfo('Revisa tu email para confirmar tu cuenta');
    }
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

        {/* Logo */}
        <View style={{ alignItems: 'center', marginBottom: 48 }}>
          <Image source={require('@/assets/images/logo-transparent.png')} style={{ width: 100, height: 100 }} />
          <Text style={{ fontFamily: Fonts.serif, fontSize: 32, color: Colors.greenDark, marginTop: 12 }}>Zopilote</Text>

        </View>

        <View style={{ gap: 14 }}>

          {/* Error */}
          {!!err && (
            <View style={{ backgroundColor: Colors.error + '18', borderRadius: 6, padding: 12, borderLeftWidth: 3, borderLeftColor: Colors.error }}>
              <Text style={{ color: Colors.error, fontFamily: Fonts.mono, fontSize: 12 }}>{err}</Text>
            </View>
          )}

          {/* Info (confirmación de email) */}
          {!!info && (
            <View style={{ backgroundColor: Colors.success + '18', borderRadius: 6, padding: 12, borderLeftWidth: 3, borderLeftColor: Colors.success }}>
              <Text style={{ color: Colors.success, fontFamily: Fonts.mono, fontSize: 12 }}>{info}</Text>
            </View>
          )}

          {/* Email */}
          <View style={{ gap: 6 }}>
            <Text style={{ fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1.5, color: Colors.textSecondary }}>EMAIL</Text>
            <TextInput
              value={email}
              onChangeText={v => { setEmail(v); setErr(''); setInfo(''); }}
              placeholder="tu@email.com"
              placeholderTextColor={Colors.textSecondary + '88'}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              style={inputStyle}
            />
          </View>

          {/* Password — oculto en modo forgot */}
          {mode !== 'forgot' && (
            <View style={{ gap: 6 }}>
              <Text style={{ fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1.5, color: Colors.textSecondary }}>CONTRASEÑA</Text>
              <TextInput
                value={password}
                onChangeText={v => { setPassword(v); setErr(''); setInfo(''); }}
                placeholder="········"
                placeholderTextColor={Colors.textSecondary + '88'}
                secureTextEntry
                style={inputStyle}
              />
            </View>
          )}

          {/* Submit */}
          <Pressable
            onPress={handleSubmit}
            disabled={loading}
            style={{ backgroundColor: Colors.greenDark, borderWidth: 1, borderColor: Colors.gold, borderRadius: 4, padding: 14, alignItems: 'center', marginTop: 4, opacity: loading ? 0.7 : 1 }}
          >
            {loading
              ? <ActivityIndicator color={Colors.gold} />
              : <Text style={{ fontFamily: Fonts.mono, color: Colors.white, fontSize: 11, fontWeight: '700', letterSpacing: 1.5 }}>
                  {mode === 'signin' ? 'ENTRAR' : mode === 'signup' ? 'CREAR CUENTA' : 'ENVIAR LINK'}
                </Text>
            }
          </Pressable>

          {/* Olvidé contraseña — solo en modo signin */}
          {mode === 'signin' && (
            <Pressable
              onPress={() => { setMode('forgot'); setErr(''); setInfo(''); }}
              style={{ alignItems: 'center', paddingVertical: 4 }}
            >
              <Text style={{ fontFamily: Fonts.mono, fontSize: 11, color: Colors.textSecondary, letterSpacing: 0.5 }}>
                OLVIDÉ MI CONTRASEÑA
              </Text>
            </Pressable>
          )}

          {/* Toggle modo */}
          <Pressable
            onPress={() => { setMode(m => m === 'signup' ? 'signin' : m === 'forgot' ? 'signin' : 'signup'); setErr(''); setInfo(''); }}
            style={{ alignItems: 'center', paddingVertical: 4 }}
          >
            <Text style={{ fontFamily: Fonts.mono, fontSize: 11, color: Colors.textSecondary, letterSpacing: 0.5 }}>
              {mode === 'signin' ? '¿SIN CUENTA? REGÍSTRATE' : '← VOLVER'}
            </Text>
          </Pressable>

        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
