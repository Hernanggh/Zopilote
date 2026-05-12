import { useEffect, useRef, useState } from 'react';
import { View, Image } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { StatusBar } from 'expo-status-bar';

// Token pendiente guardado en memoria durante el flujo de auth
let pendingInviteToken: string | null = null;

const queryClient = new QueryClient();

function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [showSplash, setShowSplash] = useState(false);
  const router = useRouter();
  const segments = useSegments();
  const isRecovery = useRef(false);
  const prevSession = useRef<Session | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) {
        await supabase.rpc('link_player_for_current_user');
        queryClient.invalidateQueries({ queryKey: ['players'] });
        queryClient.invalidateQueries({ queryKey: ['rounds'] });
      }
      setSession(data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') {
        isRecovery.current = true;
        setSession(s);
        router.replace('/(auth)/reset-password');
        return;
      }
      if (event === 'USER_UPDATED' || event === 'SIGNED_IN') {
        isRecovery.current = false;
        supabase.rpc('link_player_for_current_user').then(() => {
          queryClient.invalidateQueries({ queryKey: ['players'] });
          queryClient.invalidateQueries({ queryKey: ['rounds'] });
        });
      }
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, [router]);

  useEffect(() => {
    if (session === undefined) return;
    if (isRecovery.current) return;
    const inAuth = segments[0] === '(auth)';
    const inJoin = segments[0] === 'join';

    if (!session) {
      prevSession.current = null;
      if (inJoin && segments[1]) pendingInviteToken = segments[1];
      if (!inAuth) router.replace('/(auth)/login');
      return;
    }

    if (inAuth) {
      const justLoggedIn = prevSession.current === null;
      prevSession.current = session;

      const navigate = () => {
        if (pendingInviteToken) {
          const token = pendingInviteToken;
          pendingInviteToken = null;
          router.replace(`/join/${token}` as any);
        } else {
          router.replace('/(app)/(rounds)');
        }
      };

      if (justLoggedIn) {
        setShowSplash(true);
        setTimeout(() => {
          setShowSplash(false);
          navigate();
        }, 1500);
      } else {
        navigate();
      }
    }
  }, [session, segments, router]);

  if (showSplash) {
    return (
      <View style={{ flex: 1, backgroundColor: '#F5F0E8', justifyContent: 'center', alignItems: 'center' }}>
        <Image
          source={require('@/assets/images/logo-transparent.png')}
          style={{ width: 220, height: 220 }}
          resizeMode="contain"
        />
      </View>
    );
  }

  if (session === undefined) return null;
  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthGate>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(app)" />
          <Stack.Screen name="join" />
        </Stack>
      </AuthGate>
    </QueryClientProvider>
  );
}
