import { Stack } from 'expo-router';
import { Colors } from '@/constants/colors';
import { Platform } from 'react-native';

export default function RoundsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: Colors.card },
        headerTintColor: Colors.greenDark,
        headerTitleStyle: { fontWeight: '700', fontSize: 18 },
        headerShadowVisible: false,
        headerShown: Platform.OS !== 'web',
      }}
    >
      <Stack.Screen name="index" options={{ title: 'GolfJuegos ⛳' }} />
      <Stack.Screen name="new" options={{ title: 'Nueva Partida', headerBackTitle: 'Atrás' }} />
      <Stack.Screen name="[id]" options={{ title: 'Partida', headerBackTitle: 'Atrás' }} />
    </Stack>
  );
}
