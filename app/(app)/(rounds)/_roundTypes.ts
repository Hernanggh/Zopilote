export type RoundData = {
  id: string;
  course_id: string;
  start_hole: number;
  status: string;
  created_at: string;
  created_by: string;
  courses: { name: string };
  round_players: { player_id: string; handicap: number; position: number; players: { name: string; suffix?: string | null; user_id?: string | null } }[];
  round_game_config: { game_type: string; active: boolean; bet_amount: number }[];
  round_pairings: { pair_number: number; player1_id: string; player2_id: string }[];
  round_base_pair: { player1_id: string; player2_id: string }[];
};

export type ScoreMap = Record<string, Record<number, number>>; // player_id → hole → gross

export type MarcasEspMap = Record<string, Record<number, string>>;
