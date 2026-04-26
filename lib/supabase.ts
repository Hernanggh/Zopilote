import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

// On web (browser), use localStorage; on native, use AsyncStorage
const authStorage = Platform.OS === 'web'
  ? (typeof window !== 'undefined' ? window.localStorage : undefined)
  : AsyncStorage;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: authStorage as any,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});

export type Database = {
  public: {
    Tables: {
      courses: {
        Row: { id: string; name: string };
        Insert: { id?: string; name: string };
      };
      course_holes: {
        Row: { id: string; course_id: string; hole_number: number; par: number; handicap_rank: number };
        Insert: { id?: string; course_id: string; hole_number: number; par: number; handicap_rank: number };
      };
      players: {
        Row: { id: string; user_id: string | null; name: string; default_handicap: number };
        Insert: { id?: string; user_id?: string | null; name: string; default_handicap: number };
        Update: { name?: string; default_handicap?: number };
      };
      rounds: {
        Row: { id: string; course_id: string; start_hole: number; date: string; created_by: string; status: 'setup' | 'active' | 'finished' };
        Insert: { id?: string; course_id: string; start_hole: number; date?: string; created_by: string; status?: 'setup' | 'active' | 'finished' };
        Update: { status?: 'setup' | 'active' | 'finished' };
      };
      round_players: {
        Row: { id: string; round_id: string; player_id: string; handicap: number; position: number };
        Insert: { id?: string; round_id: string; player_id: string; handicap: number; position: number };
      };
      round_game_config: {
        Row: { id: string; round_id: string; game_type: string; active: boolean; bet_amount: number };
        Insert: { id?: string; round_id: string; game_type: string; active: boolean; bet_amount: number };
        Update: { active?: boolean; bet_amount?: number };
      };
      round_pairings: {
        Row: { id: string; round_id: string; pair_number: number; player1_id: string; player2_id: string };
        Insert: { id?: string; round_id: string; pair_number: number; player1_id: string; player2_id: string };
      };
      round_base_pair: {
        Row: { id: string; round_id: string; player1_id: string; player2_id: string };
        Insert: { id?: string; round_id: string; player1_id: string; player2_id: string };
      };
      scores: {
        Row: { id: string; round_id: string; player_id: string; hole_number: number; gross_score: number };
        Insert: { id?: string; round_id: string; player_id: string; hole_number: number; gross_score: number };
        Update: { gross_score?: number };
      };
    };
  };
};
