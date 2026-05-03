import { type Pairing } from '@/lib/calculations';

export const ALL_GAME_KEYS = ['marcas', 'marcas_esp', 'individuales', 'individuales_medal', 'parejas', 'parejas_medal', 'parejas_base', 'parejas_base_medal', 'presiones'];

export const GAME_LABELS_SETUP: Record<string, string> = {
  marcas: 'Plumas', marcas_esp: 'Marcas Especiales', individuales: 'Individuales Match',
  individuales_medal: 'Individuales Medal', parejas: 'Parejas Match', parejas_medal: 'Parejas Medal',
  parejas_base: 'Pareja Base Match', parejas_base_medal: 'Pareja Base Medal', presiones: 'Presiones',
};

export const TABS = ['Scorecard', 'Resultados', 'Dineros'] as const;

export function genRivalPairs(playerIds: string[], basePair: { player1_id: string; player2_id: string }): Pairing[] {
  const others = playerIds.filter(id => id !== basePair.player1_id && id !== basePair.player2_id);
  const pairs: Pairing[] = [];
  let n = 1;
  for (let i = 0; i < others.length; i++)
    for (let j = i + 1; j < others.length; j++)
      pairs.push({ pair_number: n++, player1_id: others[i], player2_id: others[j] });
  return pairs;
}
