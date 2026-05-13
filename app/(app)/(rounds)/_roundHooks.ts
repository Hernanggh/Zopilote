import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { type HoleInfo, type ScoreEntry } from '@/lib/calculations';
import { type RoundData, type ScoreMap, type MarcasEspMap } from './_roundTypes';

export function useRoundData(id: string) {
  const qc = useQueryClient();
  const isValid = !!id && id !== 'players';

  useEffect(() => {
    if (!isValid) return;
    const uid = Math.random().toString(36).slice(2, 7);
    const channel = supabase
      .channel(`round-players-${id}-${uid}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'round_players', filter: `round_id=eq.${id}` },
        () => qc.invalidateQueries({ queryKey: ['round', id] })
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id, qc, isValid]);

  return useQuery<RoundData>({
    queryKey: ['round', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rounds')
        .select(`id, course_id, start_hole, status, official, created_by, courses(name),
          round_players(player_id, contact_id, handicap, position, display_name_snapshot, players(name, suffix, user_id), contacts(display_name, suffix)),
          round_game_config(game_type, active, bet_amount),
          round_pairings(pair_number, player1_id, player2_id),
          round_base_pair(player1_id, player2_id),
          round_organizers(user_id)`)
        .eq('id', id)
        .single();
      if (error) throw error;
      const d = data as unknown as RoundData;
      // Supabase returns 1:1 unique FK as object, normalize to array
      if (d.round_base_pair && !Array.isArray(d.round_base_pair)) {
        (d as any).round_base_pair = [d.round_base_pair];
      }
      // Resolve display name: contacts (owner) → display_name_snapshot → players.name
      (d as any).round_players = (d as any).round_players.map((rp: any) => {
        let displayName: string;
        let displaySuffix: string | null;
        if (rp.contacts?.display_name) {
          displayName = rp.contacts.display_name;
          displaySuffix = rp.contacts.suffix ?? rp.players?.suffix ?? null;
        } else if (rp.display_name_snapshot) {
          displayName = rp.display_name_snapshot;
          displaySuffix = null;
        } else {
          displayName = rp.players?.name ?? '';
          displaySuffix = rp.players?.suffix ?? null;
        }
        return { ...rp, players: { ...rp.players, name: displayName, suffix: displaySuffix } };
      });
      return d;
    },
    enabled: isValid,
  });
}

export function useCourseHoles(courseId: string) {
  return useQuery<HoleInfo[]>({
    queryKey: ['holes', courseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('course_holes')
        .select('hole_number, par, handicap_rank')
        .eq('course_id', courseId)
        .order('hole_number');
      if (error) throw error;
      return data as HoleInfo[];
    },
    enabled: !!courseId,
  });
}

export function useScores(roundId: string) {
  const qc = useQueryClient();
  const isValid = !!roundId && roundId !== 'players';

  const { data: scores = [] } = useQuery<ScoreEntry[]>({
    queryKey: ['scores', roundId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('scores')
        .select('player_id, hole_number, gross_score')
        .eq('round_id', roundId);
      if (error) throw error;
      return data;
    },
    enabled: isValid,
  });

  // Realtime subscription — unique name per mount avoids StrictMode double-subscribe error
  useEffect(() => {
    if (!isValid) return;
    const uid = Math.random().toString(36).slice(2, 7);
    const channel = supabase
      .channel(`scores-${roundId}-${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores', filter: `round_id=eq.${roundId}` },
        () => qc.invalidateQueries({ queryKey: ['scores', roundId] })
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [roundId, qc, isValid]);

  // Build gross map
  const grossMap: ScoreMap = {};
  scores.forEach(s => {
    if (!grossMap[s.player_id]) grossMap[s.player_id] = {};
    grossMap[s.player_id][s.hole_number] = s.gross_score;
  });

  return { scores, grossMap };
}

export function useSpecialMarcas(roundId: string) {
  const qc = useQueryClient();
  const isValid = !!roundId && roundId !== 'players';

  const { data: rows = [] } = useQuery<{ player_id: string; hole_number: number; nota: string }[]>({
    queryKey: ['marcas_esp', roundId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('round_marcas')
        .select('player_id, hole_number, nota')
        .eq('round_id', roundId);
      if (error) throw error;
      return data;
    },
    enabled: isValid,
  });

  useEffect(() => {
    if (!isValid) return;
    const uid = Math.random().toString(36).slice(2, 7);
    const channel = supabase
      .channel(`marcas-esp-${roundId}-${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'round_marcas', filter: `round_id=eq.${roundId}` },
        () => qc.invalidateQueries({ queryKey: ['marcas_esp', roundId] })
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [roundId, qc, isValid]);

  const marcasEspMap: MarcasEspMap = {};
  rows.forEach(r => {
    if (!marcasEspMap[r.player_id]) marcasEspMap[r.player_id] = {};
    marcasEspMap[r.player_id][r.hole_number] = r.nota;
  });

  return { marcasEspMap };
}
