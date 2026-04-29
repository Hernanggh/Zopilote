import { View, Text, ScrollView } from 'react-native';
import { Stack } from 'expo-router';
import { Colors, Fonts } from '@/constants/colors';

function RuleCard({ title, items }: { title: string; items: string[] }) {
  return (
    <View style={{ backgroundColor: Colors.card, borderRadius: 6, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' }}>
      <View style={{ backgroundColor: Colors.greenDark, paddingHorizontal: 18, paddingVertical: 12 }}>
        <Text style={{ fontFamily: Fonts.serif, fontSize: 18, color: Colors.white }}>{title}</Text>
      </View>
      <View style={{ padding: 16, gap: 10 }}>
        {items.map((item, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 10 }}>
            <Text style={{ fontFamily: Fonts.mono, fontSize: 11, color: Colors.gold, marginTop: 3 }}>—</Text>
            <Text style={{ flex: 1, fontFamily: Fonts.fraunces, fontStyle: 'italic', fontSize: 14, color: Colors.textSecondary, lineHeight: 22 }}>{item}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const RULES = [
  {
    title: 'Plumas (Marcas)',
    items: [
      'Se comparan los scores netos (gross − ventaja) de todos los jugadores en cada hoyo.',
      'Gana el jugador con el score neto más bajo.',
      'Si hay empate, el hoyo se "lleva" (carryover) y su valor se acumula al siguiente.',
      'El ganador del hoyo cobra 1 pluma + las acumuladas por empates previos.',
    ],
  },
  {
    title: 'Marcas Especiales',
    items: [
      'Se registran manualmente por hoyo: birdies, o\'yes, hole-outs, etc.',
      'Cada marca vale (N−1) × apuesta, donde N es el número de jugadores.',
      'Los demás jugadores pagan 1 × apuesta al que hizo la marca.',
    ],
  },
  {
    title: 'Individuales Match',
    items: [
      'Cada jugador juega 1 vs 1 contra todos los demás (round-robin).',
      'Se comparan scores netos hoyo por hoyo; gana quien tenga el menor.',
      'Se disputan 3 instancias independientes: 1ª Vuelta (1-9), 2ª Vuelta (10-18), Total (1-18).',
      'Quien termine con ventaja positiva en cada instancia cobra la apuesta al rival.',
    ],
  },
  {
    title: 'Individuales Medal',
    items: [
      'Mismos emparejamientos 1 vs 1 que el Match.',
      'En lugar de comparar hoyo por hoyo, se compara la suma total de netos en cada vuelta.',
      '3 instancias: 1ª Vuelta, 2ª Vuelta, Total.',
    ],
  },
  {
    title: 'Presiones',
    items: [
      'Se generan dentro de un partido individual cuando es matemáticamente imposible empatar.',
      'Ejemplo: vas +3 arriba con solo 2 hoyos por jugar — el otro no puede alcanzarte.',
      'Se abre un sub-partido con los hoyos restantes; quien gane esos hoyos cobra la apuesta de Individuales.',
      'Puede haber hasta 2 presiones por vuelta (P1, y P2 anidada dentro de P1).',
    ],
  },
  {
    title: 'Parejas Match',
    items: [
      'Dos jugadores forman una pareja y compiten contra las demás.',
      'Por hoyo se comparan el MEJOR score de cada pareja (best ball) Y el PEOR (worst ball): 2 puntos posibles por hoyo.',
      '3 instancias independientes: 1ª Vuelta, 2ª Vuelta, Total.',
    ],
  },
  {
    title: 'Parejas Medal',
    items: [
      'Mismas parejas que en Match.',
      'Se compara la SUMA de netos de ambos jugadores de la pareja por vuelta.',
      '3 instancias: 1ª Vuelta, 2ª Vuelta, Total.',
    ],
  },
  {
    title: 'Pareja Base Match / Medal',
    items: [
      'Una pareja especial ("la base") juega contra TODAS las combinaciones posibles del resto de jugadores.',
      'Los jugadores no-base se emparejan automáticamente en todas sus combinaciones posibles.',
      'Funciona igual que Parejas Match y Medal pero la base disputa varios partidos simultáneos.',
    ],
  },
];

export default function Reglas() {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.background }}
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}
    >
      <Stack.Screen options={{ headerShown: false }} />

      <View style={{ paddingVertical: 8, paddingHorizontal: 4, marginBottom: 4, gap: 4 }}>
        <Text style={{ fontFamily: Fonts.serif, fontSize: 28, color: Colors.text }}>Reglas de juegos</Text>
        <Text style={{ fontFamily: Fonts.fraunces, fontStyle: 'italic', fontSize: 13, color: Colors.textSecondary }}>
          Cómo se calculan las apuestas
        </Text>
      </View>

      {RULES.map(rule => (
        <RuleCard key={rule.title} title={rule.title} items={rule.items} />
      ))}
    </ScrollView>
  );
}
