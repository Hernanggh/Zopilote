import { Stack } from 'expo-router';
import { Colors } from '@/constants/colors';
import { Platform } from 'react-native';

export default function RoundsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: Colors.greenDark },
        headerTintColor: Colors.gold,
        headerTitleStyle: { fontWeight: '700', fontSize: 17, color: Colors.white },
        headerShadowVisible: false,
        headerShown: Platform.OS !== 'web',
      }}
    >
      <Stack.Screen name="index" options={{ title: 'GolfJuegos' }} />
      <Stack.Screen name="new" options={{ title: 'Nueva Partida', headerBackTitle: 'Atrás' }} />
      <Stack.Screen name="[id]" options={{ title: 'Partida', headerBackTitle: 'Atrás' }} />
    </Stack>
  );
}
