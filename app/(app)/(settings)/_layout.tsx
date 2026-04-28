import { Stack } from 'expo-router';
import { Colors } from '@/constants/colors';

export default function SettingsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: Colors.card },
        headerTintColor: Colors.greenDark,
        headerTitleStyle: { fontWeight: '700', fontSize: 18 },
        headerShadowVisible: false,
        headerShown: true,
        headerBackTitle: 'Atrás',
      }}
    />
  );
}
