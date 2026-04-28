import { View, Text, ScrollView, Pressable } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';

function NavRow({ label, icon, subtitle, onPress }: { label: string; icon: string; subtitle: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', padding: 16,
        backgroundColor: pressed ? Colors.background : Colors.card, gap: 14,
      })}
    >
      <Text style={{ fontSize: 22, width: 30, textAlign: 'center' }}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: Colors.text }}>{label}</Text>
        <Text style={{ fontSize: 12, color: Colors.textSecondary, marginTop: 2 }}>{subtitle}</Text>
      </View>
      <Text style={{ fontSize: 20, color: Colors.textSecondary }}>›</Text>
    </Pressable>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ backgroundColor: Colors.card, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border, marginHorizontal: 16 }}>
      {children}
    </View>
  );
}

function Divider() {
  return <View style={{ height: 1, backgroundColor: Colors.border, marginLeft: 60 }} />;
}

export default function SettingsIndex() {
  const router = useRouter();

  return (
    <ScrollView contentContainerStyle={{ paddingVertical: 24, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'Configuración' }} />

      <Section>
        <NavRow
          icon="👤"
          label="Mi cuenta"
          subtitle="Email y cerrar sesión"
          onPress={() => router.push('/(app)/(settings)/cuenta')}
        />
      </Section>

      <Section>
        <NavRow
          icon="🎮"
          label="Juegos por defecto"
          subtitle="Qué juegos y montos vienen pre-seleccionados al crear partida"
          onPress={() => router.push('/(app)/(settings)/defaults')}
        />
        <Divider />
        <NavRow
          icon="⛳"
          label="Campos"
          subtitle="Par, ventajas por hoyo y campo default por jugador"
          onPress={() => router.push('/(app)/(settings)/campos')}
        />
      </Section>

      <Section>
        <NavRow
          icon="📖"
          label="Reglas de juegos"
          subtitle="Cómo se calculan las apuestas"
          onPress={() => router.push('/(app)/(settings)/reglas')}
        />
      </Section>
    </ScrollView>
  );
}
