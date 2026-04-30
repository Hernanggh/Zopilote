import { View, Text, ScrollView, Pressable } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Colors, Fonts } from '@/constants/colors';

function NavRow({ label, subtitle, onPress, last }: {
  label: string; subtitle: string; onPress: () => void; last?: boolean;
}) {
  return (
    <>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => ({
          flexDirection: 'row', alignItems: 'center',
          paddingHorizontal: 18, paddingVertical: 14,
          backgroundColor: pressed ? Colors.creamDeep : Colors.card,
          gap: 12,
        })}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontFamily: Fonts.serif, fontSize: 17, color: Colors.text }}>{label}</Text>
          <Text style={{ fontFamily: Fonts.fraunces, fontStyle: 'italic', fontSize: 12, color: Colors.textSecondary }}>{subtitle}</Text>
        </View>
        <Text style={{ fontFamily: Fonts.mono, fontSize: 18, color: Colors.textSecondary + '88' }}>›</Text>
      </Pressable>
      {!last && <View style={{ height: 1, backgroundColor: Colors.border, marginLeft: 18 }} />}
    </>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <Text style={{ fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1.5, color: Colors.textSecondary, paddingHorizontal: 4, paddingTop: 4 }}>
      {title}
    </Text>
  );
}

export default function SettingsIndex() {
  const router = useRouter();

  return (
    <ScrollView style={{ flex: 1, backgroundColor: Colors.background }} contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 60 }}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Page title */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 4, marginBottom: 4, gap: 12 }}>
        <Pressable onPress={() => router.replace('/(app)/(rounds)')}>
          <Text style={{ fontFamily: Fonts.mono, fontSize: 11, letterSpacing: 1, color: Colors.textSecondary }}>‹ REGRESAR</Text>
        </Pressable>
        <Text style={{ fontFamily: Fonts.serif, fontSize: 28, color: Colors.text }}>Configuración</Text>
      </View>

      <SectionHeader title="CUENTA" />
      <View style={{ backgroundColor: Colors.card, borderRadius: 6, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border }}>
        <NavRow
          label="Mi cuenta"
          subtitle="Email y cerrar sesión"
          onPress={() => router.push('/(app)/(settings)/cuenta')}
          last
        />
      </View>

      <SectionHeader title="PARTIDAS" />
      <View style={{ backgroundColor: Colors.card, borderRadius: 6, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border }}>
        <NavRow
          label="Juegos por defecto"
          subtitle="Apuestas pre-seleccionadas al crear partida"
          onPress={() => router.push('/(app)/(settings)/defaults')}
        />
        <NavRow
          label="Campos"
          subtitle="Par, ventajas y campo default"
          onPress={() => router.push('/(app)/(settings)/campos')}
          last
        />
      </View>

      <SectionHeader title="INFORMACIÓN" />
      <View style={{ backgroundColor: Colors.card, borderRadius: 6, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border }}>
        <NavRow
          label="Reglas de juegos"
          subtitle="Cómo se calculan las apuestas"
          onPress={() => router.push('/(app)/(settings)/reglas')}
          last
        />
      </View>
    </ScrollView>
  );
}
