import { useEffect, useRef, useState } from 'react';
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
  const router = useRouter();
  const segments = useSegments();
  const isRecovery = useRef(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') {
        isRecovery.current = true;
        setSession(s);
        router.replace('/(auth)/reset-password');
        return;
      }
      if (event === 'USER_UPDATED' || event === 'SIGNED_IN') {
        isRecovery.current = false;
      }
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session === undefined) return;
    if (isRecovery.current) return;
    const inAuth = segments[0] === '(auth)';
    const inJoin = segments[0] === 'join';

    if (!session) {
      if (inJoin && segments[1]) pendingInviteToken = segments[1];
      if (!inAuth) router.replace('/(auth)/login');
      return;
    }

    if (inAuth) {
      if (pendingInviteToken) {
        const token = pendingInviteToken;
        pendingInviteToken = null;
        router.replace(`/join/${token}` as any);
      } else {
        router.replace('/(app)/(rounds)');
      }
    }
  }, [session, segments]);

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
