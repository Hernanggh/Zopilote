import { View, Text, ScrollView } from 'react-native';
import { Colors, Fonts } from '@/constants/colors';
import { type HoleInfo } from '@/lib/calculations';
import { type RoundData, type ScoreMap, type MarcasEspMap } from './_roundTypes';
import { computeDineros } from './_calcDineros';

export function DinerosTab({ round, holes, grossMap, marcasEspMap, holeOrder }: {
  round: RoundData;
  holes: HoleInfo[];
  grossMap: ScoreMap;
  marcasEspMap: MarcasEspMap;
  holeOrder: number[];
}) {
  const players = [...round.round_players].sort((a, b) => a.position - b.position);
  const gameConfigs: Record<string, { active: boolean; bet_amount: number }> = {};
  round.round_game_config.forEach(g => { gameConfigs[g.game_type] = { active: g.active, bet_amount: g.bet_amount }; });

  const displayMap: Record<string, string> = {};
  players.forEach(p => {
    displayMap[p.player_id] = p.players.suffix ? `${p.players.name} ${p.players.suffix}` : p.players.name;
  });

  const dineros = computeDineros(round, holes, grossMap, marcasEspMap, holeOrder);

  function fmt(n: number) { return (n >= 0 ? '+' : '-') + `$${Math.abs(n).toLocaleString('es-MX')}`; }
  function color(n: number) { return n > 0 ? Colors.success : n < 0 ? Colors.error : Colors.textSecondary; }

  const colGroups = [
    { key: 'marcas_col',    label: 'Marcas',     fields: ['marcas_esp', 'marcas'] },
    { key: 'ind_col',       label: 'Individual',  fields: ['individuales', 'individuales_medal'] },
    { key: 'presiones_col', label: 'Presiones',  fields: ['presiones'] },
    { key: 'parejas_col',   label: 'Parejas',    fields: ['parejas', 'parejas_medal'] },
    { key: 'base_col',      label: 'P.Base',     fields: ['parejas_base', 'parejas_base_medal'] },
  ].filter(g => g.fields.some(f => gameConfigs[f]?.active));

  function groupVal(row: typeof dineros[0], fields: string[]) {
    return fields.reduce((s, f) => s + ((row as any)[f] ?? 0), 0);
  }

  const NAME_W = 130;
  const COL_W = 72;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }} contentInsetAdjustmentBehavior="automatic">
      <View style={{ borderRadius: 6, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border }}>
        <View style={{ overflowX: 'auto' } as any}>
          <View style={{ minWidth: 'max-content' } as any}>
            {/* Header */}
            <View style={{ flexDirection: 'row', backgroundColor: Colors.greenDark, paddingHorizontal: 14, paddingVertical: 10 }}>
              <Text style={{ width: NAME_W, fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1, color: Colors.white + 'BB' }}>JUGADOR</Text>
              <Text style={{ width: 70, textAlign: 'center', fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1, color: Colors.gold }}>TOTAL</Text>
              {colGroups.map(g => (
                <Text key={g.key} style={{ width: COL_W, textAlign: 'center', fontFamily: Fonts.mono, fontSize: 10, letterSpacing: 1, color: Colors.white + 'BB' }}>{g.label.toUpperCase()}</Text>
              ))}
            </View>

            {/* Rows */}
            {dineros.sort((a, b) => b.total - a.total).map((row, i) => (
              <View key={row.player_id} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, backgroundColor: Colors.card, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: Colors.border + '55' }}>
                <Text style={{ width: NAME_W, fontFamily: Fonts.serif, fontSize: 14, color: Colors.text }}>
                  {displayMap[row.player_id]}
                </Text>
                <Text style={{ width: 70, textAlign: 'center', fontFamily: Fonts.serif, fontSize: 15, fontWeight: '700', color: color(row.total), fontVariant: ['tabular-nums'] }}>
                  {fmt(row.total)}
                </Text>
                {colGroups.map(g => {
                  const val = groupVal(row, g.fields);
                  return (
                    <Text key={g.key} style={{ width: COL_W, textAlign: 'center', fontFamily: Fonts.serif, fontSize: 13, fontWeight: '700', color: color(val), fontVariant: ['tabular-nums'] }}>
                      {val !== 0 ? fmt(val) : '—'}
                    </Text>
                  );
                })}
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* Comprobación */}
      <View style={{ marginTop: 10, alignItems: 'center' }}>
        <Text style={{ fontFamily: Fonts.mono, fontSize: 10, color: Colors.textSecondary + 'AA', letterSpacing: 0.5 }}>
          SUMA TOTAL: ${dineros.reduce((s, r) => s + r.total, 0).toLocaleString('es-MX')} (debe ser $0)
        </Text>
      </View>
    </ScrollView>
  );
}
