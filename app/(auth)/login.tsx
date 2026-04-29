import { useState } from 'react';
import { View, Text, TextInput, Pressable, KeyboardAvoidingView, ScrollView, ActivityIndicator } from 'react-native';
import { supabase } from '@/lib/supabase';
import { Colors, Fonts } from '@/constants/colors';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  async function sendOtp() {
    setErr('');
    if (!email.trim()) { setErr('Ingresa tu email'); return; }
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { shouldCreateUser: true } });
    setLoading(false);
    if (error) { setErr(error.message); return; }
    setStep('code');
  }

  async function verifyOtp() {
    setErr('');
    if (!code.trim()) { setErr('Ingresa el código'); return; }
    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: 'email' });
    setLoading(false);
    if (error) { setErr('Código incorrecto'); return; }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: Colors.background }} behavior="padding">
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 32 }}>
        <View style={{ alignItems: 'center', marginBottom: 48 }}>
          <Text style={{ fontSize: 56 }}>⛳</Text>
          <Text style={{ fontFamily: Fonts.serif, fontSize: 32, color: Colors.greenDark, marginTop: 8 }}>GolfJuegos</Text>
          <Text style={{ fontFamily: Fonts.fraunces, fontStyle: 'italic', fontSize: 15, color: Colors.textSecondary, marginTop: 4 }}>
            Calcula tus apuestas al instante
          </Text>
        </View>

        <View style={{ gap: 14 }}>
          {!!err && (
            <View style={{ backgroundColor: Colors.error + '18', borderRadius: 6, padding: 12, borderLeftWidth: 3, borderLeftColor: Colors.error }}>
              <Text style={{ color: Colors.error, fontFamily: Fonts.mono, fontSize: 12 }}>{err}</Text>
            </View>
          )}

          {step === 'email' ? (
            <>
              <View style={{ gap: 6 }}>
                <Text style={{ fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1.5, color: Colors.textSecondary }}>EMAIL</Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="tu@email.com"
                  placeholderTextColor={Colors.textSecondary + '88'}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={{ backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border, borderRadius: 4, padding: 14, fontSize: 16, fontFamily: Fonts.serif, color: Colors.text }}
                />
              </View>
              <Pressable
                onPress={sendOtp}
                disabled={loading}
                style={{ backgroundColor: Colors.greenDark, borderWidth: 1, borderColor: Colors.gold, borderRadius: 4, padding: 14, alignItems: 'center', marginTop: 4, opacity: loading ? 0.7 : 1 }}
              >
                {loading
                  ? <ActivityIndicator color={Colors.gold} />
                  : <Text style={{ fontFamily: Fonts.mono, color: Colors.white, fontSize: 11, fontWeight: '700', letterSpacing: 1.5 }}>ENVIAR CÓDIGO</Text>
                }
              </Pressable>
            </>
          ) : (
            <>
              <Text style={{ fontFamily: Fonts.fraunces, fontStyle: 'italic', fontSize: 14, color: Colors.textSecondary, textAlign: 'center' }}>
                Código enviado a {email}
              </Text>
              <View style={{ gap: 6 }}>
                <Text style={{ fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1.5, color: Colors.textSecondary }}>CÓDIGO DEL EMAIL</Text>
                <TextInput
                  value={code}
                  onChangeText={setCode}
                  placeholder="Pega el código aquí"
                  placeholderTextColor={Colors.textSecondary + '88'}
                  keyboardType="number-pad"
                  autoFocus
                  style={{ backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border, borderRadius: 4, padding: 14, fontSize: 16, fontFamily: Fonts.mono, color: Colors.text, textAlign: 'center' }}
                />
              </View>
              <Pressable
                onPress={verifyOtp}
                disabled={loading}
                style={{ backgroundColor: Colors.greenDark, borderWidth: 1, borderColor: Colors.gold, borderRadius: 4, padding: 14, alignItems: 'center', marginTop: 4, opacity: loading ? 0.7 : 1 }}
              >
                {loading
                  ? <ActivityIndicator color={Colors.gold} />
                  : <Text style={{ fontFamily: Fonts.mono, color: Colors.white, fontSize: 11, fontWeight: '700', letterSpacing: 1.5 }}>ENTRAR</Text>
                }
              </Pressable>
              <Pressable onPress={() => { setStep('email'); setCode(''); setErr(''); }} style={{ alignItems: 'center', paddingVertical: 8 }}>
                <Text style={{ fontFamily: Fonts.mono, fontSize: 11, color: Colors.textSecondary, letterSpacing: 0.5 }}>CAMBIAR EMAIL</Text>
              </Pressable>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
