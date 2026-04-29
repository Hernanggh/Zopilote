import { Stack } from 'expo-router';
import { Colors, Fonts } from '@/constants/colors';

export default function SettingsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: Colors.background },
        headerTintColor: Colors.greenDark,
        headerTitleStyle: { fontFamily: Fonts.mono, fontWeight: '700', fontSize: 14, letterSpacing: 0.5, color: Colors.text },
        headerShadowVisible: false,
        headerShown: true,
        headerBackTitle: 'Atrás',
      }}
    />
  );
}
