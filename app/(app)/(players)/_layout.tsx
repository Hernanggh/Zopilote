import { Stack } from 'expo-router';
import { Colors } from '@/constants/colors';
import { Platform } from 'react-native';

export default function PlayersLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: Colors.card },
        headerTintColor: Colors.greenDark,
        headerTitleStyle: { fontWeight: '700', fontSize: 18 },
        headerShadowVisible: false,
        // Ocultar header nativo en web (usamos WebNav del layout padre)
        headerShown: Platform.OS !== 'web',
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Jugadores' }} />
    </Stack>
  );
}
