import { useRef, useCallback } from 'react';
import { Tabs, useSegments } from 'expo-router';
import { View, Text, Pressable, Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts } from '@/constants/colors';
import { Ionicons } from '@expo/vector-icons';

export default function AppLayout() {
  const isWeb = Platform.OS === 'web';
  const { width } = useWindowDimensions();
  const showWebNav = isWeb && width >= 640;
  const insets = useSafeAreaInsets();
  const tabNavRef = useRef<any>(null);
  const segments = useSegments();
  const isRounds = (segments as string[]).includes('(rounds)');
  const isPlayers = (segments as string[]).includes('(players)');
  const isSettings = (segments as string[]).includes('(settings)');

  const webTabBar = useCallback((props: any) => {
    tabNavRef.current = props.navigation;
    return null;
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      {showWebNav && (
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          backgroundColor: Colors.greenDark,
          paddingHorizontal: 24, paddingVertical: 0,
          borderBottomWidth: 2, borderBottomColor: Colors.gold,
          minHeight: 56,
        }}>
          {/* Logo */}
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
            <Text style={{ color: Colors.gold, fontSize: 13 }}>⚑</Text>
            <Text style={{ color: Colors.white, fontSize: 17, letterSpacing: 3, fontFamily: Fonts.serif }}>
              GOLFJUEGOS
            </Text>
            <Text style={{ color: Colors.gold + 'AA', fontSize: 11, fontFamily: Fonts.fraunces, fontStyle: 'italic', letterSpacing: 0.5 }}>
              — established 2026 —
            </Text>
          </View>

          {/* Nav links */}
          <View style={{ flexDirection: 'row', alignItems: 'stretch', height: 56 }}>
            {([
              { label: 'PARTIDAS', tab: '(rounds)', active: isRounds },
              { label: 'JUGADORES', tab: '(players)', active: isPlayers },
              { label: 'CONFIG', tab: '(settings)', active: isSettings },
            ] as const).map(({ label, tab, active }) => (
              <Pressable
                key={tab}
                onPress={() => tabNavRef.current?.navigate(tab)}
                style={{
                  paddingHorizontal: 18,
                  justifyContent: 'center', alignItems: 'center',
                  borderWidth: active ? 1 : 0,
                  borderColor: Colors.gold,
                  borderRadius: active ? 4 : 0,
                  marginVertical: 10,
                  marginHorizontal: 2,
                  backgroundColor: active ? 'transparent' : 'transparent',
                }}
              >
                <Text style={{
                  color: active ? Colors.gold : Colors.white + 'BB',
                  fontSize: 11,
                  fontWeight: '700',
                  letterSpacing: 1.5,
                  fontFamily: Fonts.mono,
                }}>
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
      <Tabs
        tabBar={showWebNav ? webTabBar : undefined}
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: Colors.gold,
          tabBarInactiveTintColor: Colors.textSecondary,
          tabBarStyle: showWebNav
            ? { display: 'none' }
            : { backgroundColor: Colors.greenDark, borderTopColor: Colors.gold + '55', paddingBottom: insets.bottom || 8, height: 56 + (insets.bottom || 8) },
          tabBarLabelStyle: { fontFamily: Fonts.serif, fontSize: 12 },
        }}
      >
        <Tabs.Screen
          name="(rounds)"
          options={{
            title: 'Partidas',
            tabBarIcon: ({ color, size }) => <Ionicons name="flag" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="(players)"
          options={{
            title: 'Jugadores',
            tabBarIcon: ({ color, size }) => <Ionicons name="people" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="(settings)"
          options={{
            title: 'Config',
            tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" size={size} color={color} />,
          }}
        />
      </Tabs>
    </View>
  );
}
