import { useRef, useCallback } from 'react';
import { Tabs, useSegments } from 'expo-router';
import { View, Text, Pressable, Platform } from 'react-native';
import { Colors } from '@/constants/colors';
import { Ionicons } from '@expo/vector-icons';

export default function AppLayout() {
  const isWeb = Platform.OS === 'web';
  // Ref to the Tabs navigator's navigation object — set from inside the tabBar callback
  // so we can call navigation.navigate('(rounds)') / navigation.navigate('(players)')
  // directly without going through URL routing (which routes /players to [id].tsx)
  const tabNavRef = useRef<any>(null);
  const segments = useSegments();
  const isRounds = (segments as string[]).includes('(rounds)');
  const isPlayers = (segments as string[]).includes('(players)');
  const isSettings = (segments as string[]).includes('(settings)');

  // On web: replace the default tab bar with a null render, but capture the nav ref
  const webTabBar = useCallback((props: any) => {
    tabNavRef.current = props.navigation;
    return null;
  }, []);

  return (
    <View style={{ flex: 1 }}>
      {isWeb && (
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          backgroundColor: Colors.greenDark, paddingHorizontal: 20, paddingVertical: 14,
        }}>
          <Text style={{ color: Colors.white, fontSize: 20, fontWeight: '800' }}>⛳ GolfJuegos</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable
              onPress={() => tabNavRef.current?.navigate('(rounds)')}
              style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: isRounds ? Colors.greenLight : 'transparent' }}
            >
              <Text style={{ color: Colors.white, fontWeight: '700' }}>Partidas</Text>
            </Pressable>
            <Pressable
              onPress={() => tabNavRef.current?.navigate('(players)')}
              style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: isPlayers ? Colors.greenLight : 'transparent' }}
            >
              <Text style={{ color: Colors.white, fontWeight: '700' }}>Jugadores</Text>
            </Pressable>
            <Pressable
              onPress={() => tabNavRef.current?.navigate('(settings)')}
              style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: isSettings ? Colors.greenLight : 'transparent' }}
            >
              <Text style={{ color: Colors.white, fontWeight: '700' }}>⚙️ Config</Text>
            </Pressable>
          </View>
        </View>
      )}
      <Tabs
        tabBar={isWeb ? webTabBar : undefined}
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: Colors.green,
          tabBarInactiveTintColor: Colors.textSecondary,
          tabBarStyle: isWeb
            ? { display: 'none' }
            : { backgroundColor: Colors.card, borderTopColor: Colors.border },
          tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
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
