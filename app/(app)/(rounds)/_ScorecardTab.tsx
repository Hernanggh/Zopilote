import { useState, useRef, useCallback } from 'react';
import { View, Text, ScrollView, TextInput, useWindowDimensions } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Colors, Fonts } from '@/constants/colors';
import { calcRelativeHandicaps, type HoleInfo } from '@/lib/calculations';
import { type RoundData, type ScoreMap, type MarcasEspMap } from './_roundTypes';

export function ScorecardTab({ round, holes, grossMap, marcasEspMap, holeOrder, readonly, isOrganizer, currentUserId }: {
  round: RoundData;
  holes: HoleInfo[];
  grossMap: ScoreMap;
  marcasEspMap: MarcasEspMap;
  holeOrder: number[];
  readonly: boolean;
  isOrganizer: boolean;
  currentUserId?: string | null;
}) {
  const qc = useQueryClient();
  const inputRefs = useRef<Record<string, TextInput | null>>({});
  const [localScores, setLocalScores] = useState<ScoreMap>({});
  const [localMarcas, setLocalMarcas] = useState<MarcasEspMap>({});
  const [saveErr, setSaveErr] = useState('');

  const { width: screenWidth } = useWindowDimensions();
  const players = [...round.round_players].sort((a, b) => a.position - b.position);

  const getValue = (pid: string, hole: number) => {
    return localScores[pid]?.[hole] !== undefined
      ? String(localScores[pid][hole] === 0 ? '' : localScores[pid][hole])
      : grossMap[pid]?.[hole] !== undefined
        ? String(grossMap[pid][hole])
        : '';
  };

  const getMarcaValue = (pid: string, hole: number) => {
    return localMarcas[pid]?.[hole] !== undefined
      ? localMarcas[pid][hole]
      : marcasEspMap[pid]?.[hole] ?? '';
  };

  const handleChange = (pid: string, hole: number, val: string) => {
    setLocalScores(prev => ({
      ...prev,
      [pid]: { ...(prev[pid] ?? {}), [hole]: val === '' ? 0 : parseInt(val, 10) || 0 },
    }));
  };

  const handleMarcaChange = async (pid: string, hole: number, val: string) => {
    setLocalMarcas(prev => ({
      ...prev,
      [pid]: { ...(prev[pid] ?? {}), [hole]: val },
    }));
    const n = parseInt(val, 10);
    if (!val.trim() || n <= 0 || isNaN(n)) {
      const { error } = await supabase.from('round_marcas').delete()
        .eq('round_id', round.id).eq('player_id', pid).eq('hole_number', hole);
      if (error) setSaveErr(error.message);
      else await qc.invalidateQueries({ queryKey: ['marcas_esp', round.id] });
    } else {
      const { error } = await supabase.from('round_marcas').upsert(
        { round_id: round.id, player_id: pid, hole_number: hole, nota: String(n) },
        { onConflict: 'round_id,player_id,hole_number' }
      );
      if (error) setSaveErr(error.message);
    }
  };

  const handleBlur = useCallback(async (pid: string, hole: number) => {
    const val = localScores[pid]?.[hole];
    if (val === undefined || val === 0) return;
    const { error } = await supabase.from('scores').upsert(
      { round_id: round.id, player_id: pid, hole_number: hole, gross_score: val },
      { onConflict: 'round_id,player_id,hole_number' }
    );
    if (error) setSaveErr(error.message);
  }, [localScores, round.id]);


  const holeMap: Record<number, HoleInfo> = {};
  holes.forEach(h => { holeMap[h.hole_number] = h; });

  const relHcps = calcRelativeHandicaps(players.map(p => ({ id: p.player_id, handicap: p.handicap })));
  const relHcpMap: Record<string, number> = {};
  relHcps.forEach(r => { relHcpMap[r.id] = r.relative; });

  const COL_W = 52;
  const HOLE_COL_W = 56;
  const V_COL_W = 56;
  const MARCA_COL_W = 48;
  const MARCA_LABEL_W = 20;

  function playerInitials(name: string) {
    return name.trim().split(/\s+/).map(w => w[0].toUpperCase()).join('');
  }

  function playerLabel(p: { players: { name: string; suffix?: string | null } }) {
    const initials = playerInitials(p.players.name);
    return p.players.suffix ? `${initials} ${p.players.suffix}` : initials;
  }

  // Scorecard symbols: only birdie and eagle
  function scoreSymbol(gross: number, par: number): { double: boolean } | null {
    const diff = gross - par;
    if (diff <= -2) return { double: true };  // eagle or better
    if (diff === -1) return { double: false }; // birdie
    return null;
  }

  const FIXED_BG = Colors.creamDeep;

  // Score vs par del jugador activo
  const myPlayer = currentUserId ? players.find(p => p.players.user_id === currentUserId) : null;
  const myScore = myPlayer
    ? holeOrder.reduce((sum, h) => {
        const gross = grossMap[myPlayer.player_id]?.[h] ?? 0;
        const par = holeMap[h]?.par ?? 0;
        return gross > 0 && par > 0 ? sum + (gross - par) : sum;
      }, 0)
    : null;
  const myHolesPlayed = myPlayer
    ? holeOrder.filter(h => (grossMap[myPlayer.player_id]?.[h] ?? 0) > 0).length
    : 0;

  return (
    <ScrollView style={{ flex: 1, overscrollBehaviorX: 'contain' } as any} contentContainerStyle={{ paddingBottom: 32, flexGrow: 1 }} contentInsetAdjustmentBehavior="automatic">
      {readonly && (
        <View style={{ backgroundColor: Colors.gold + '22', padding: 10, borderBottomWidth: 1, borderColor: Colors.gold + '55' }}>
          <Text style={{ color: Colors.goldText, fontWeight: '600', fontSize: 12, textAlign: 'center', fontFamily: Fonts.mono, letterSpacing: 0.5 }}>
            {isOrganizer ? 'PARTIDA CERRADA · TOCA EDITAR PARA MODIFICAR' : 'MODO ESPECTADOR · SOLO LECTURA'}
          </Text>
        </View>
      )}
      {!!saveErr && (
        <View style={{ backgroundColor: '#FFEBEE', margin: 12, borderRadius: 6, padding: 12, borderWidth: 1, borderColor: Colors.error }}>
          <Text style={{ color: Colors.error, fontWeight: '600' }}>Error guardando: {saveErr}</Text>
        </View>
      )}

      {/* Card wrapper */}
      <View style={{ margin: 12, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, maxWidth: screenWidth - 24 }}>
        {/* Card header */}
        <View style={{ backgroundColor: Colors.greenDark, paddingHorizontal: 14, paddingVertical: 10, borderTopLeftRadius: 8, borderTopRightRadius: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ color: Colors.white, fontSize: 11, fontFamily: Fonts.mono, letterSpacing: 2 }}>SCORECARD</Text>
            {myPlayer && myHolesPlayed > 0 && myScore !== null && (
              <Text style={{ fontFamily: Fonts.mono, fontSize: 14, fontWeight: '700', color: Colors.gold }}>
                {myScore > 0 ? `+${myScore}` : myScore === 0 ? 'E' : String(myScore)}
              </Text>
            )}
          </View>
          <Text style={{ color: Colors.gold, fontSize: 10, fontFamily: Fonts.mono, letterSpacing: 1.5 }}>MARCAS</Text>
        </View>

      <View style={{ overflowX: 'auto' } as any}>
        <View style={{ minWidth: 'max-content' } as any}>
          {/* Header row */}
          <View style={{ flexDirection: 'row', backgroundColor: Colors.greenMid, paddingVertical: 8, alignItems: 'center' }}>
            {/* Fixed cols */}
            <View style={{ width: V_COL_W, alignItems: 'center', backgroundColor: Colors.greenDark, paddingVertical: 4 }}>
              <Text style={{ color: Colors.white, fontWeight: '600', fontSize: 10, fontFamily: Fonts.mono, letterSpacing: 0.5 }}>Ventaja</Text>
            </View>
            <View style={{ width: 36, alignItems: 'center', backgroundColor: Colors.greenDark, paddingVertical: 4 }}>
              <Text style={{ color: Colors.white, fontWeight: '600', fontSize: 10, fontFamily: Fonts.mono, letterSpacing: 0.5 }}>Par</Text>
            </View>
            <View style={{ width: HOLE_COL_W, alignItems: 'center', backgroundColor: Colors.greenDark, paddingVertical: 4 }}>
              <Text style={{ color: Colors.white, fontWeight: '600', fontSize: 10, fontFamily: Fonts.mono, letterSpacing: 0.5 }}>Hoyo</Text>
            </View>
            {players.map(p => (
              <View key={p.player_id} style={{ width: COL_W, alignItems: 'center', gap: 1 }}>
                <Text style={{ color: Colors.white, fontWeight: '600', fontSize: 12, fontFamily: Fonts.serif, textAlign: 'center' }} numberOfLines={1}>
                  {playerLabel(p)}
                </Text>
                <Text style={{ color: Colors.gold + 'BB', fontSize: 9, fontFamily: Fonts.mono }}>
                  HCP {relHcpMap[p.player_id] ?? 0}
                </Text>
              </View>
            ))}
            {/* Gold divider */}
            <View style={{ width: MARCA_LABEL_W, borderLeftWidth: 2, borderLeftColor: Colors.gold, alignSelf: 'stretch', backgroundColor: Colors.greenMid }} />
            {players.map(p => (
              <View key={p.player_id} style={{ width: MARCA_COL_W, alignItems: 'center', backgroundColor: Colors.greenMid }}>
                <Text style={{ color: Colors.gold, fontWeight: '600', fontSize: 12, fontFamily: Fonts.serif, textAlign: 'center' }} numberOfLines={1}>
                  {playerLabel(p)}
                </Text>
              </View>
            ))}
          </View>

          {/* Holes */}
          {holeOrder.map((holeNum, idx) => {
            const hole = holeMap[holeNum];
            const isNinth = holeNum === 9;
            const is18th = holeNum === 18;
            return (
              <View key={holeNum}>
                <View style={{ flexDirection: 'row', alignItems: 'stretch' }}>
                  {/* Fixed cols */}
                  <View style={{ width: V_COL_W, alignItems: 'center', justifyContent: 'center', backgroundColor: FIXED_BG, paddingVertical: 7, borderTopWidth: 1, borderTopColor: Colors.borderDeep + '44' }}>
                    <Text style={{ fontFamily: Fonts.serif, fontSize: 14, color: Colors.textSecondary }}>{hole?.handicap_rank ?? ''}</Text>
                  </View>
                  <View style={{ width: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: FIXED_BG, paddingVertical: 7, borderTopWidth: 1, borderTopColor: Colors.borderDeep + '44' }}>
                    <Text style={{ fontFamily: Fonts.serif, fontSize: 14, color: Colors.textSecondary }}>{hole?.par ?? ''}</Text>
                  </View>
                  <View style={{ width: HOLE_COL_W, alignItems: 'center', justifyContent: 'center', backgroundColor: FIXED_BG, paddingVertical: 7, borderTopWidth: 1, borderTopColor: Colors.borderDeep + '44' }}>
                    <Text style={{ fontFamily: Fonts.serif, fontWeight: '700', fontSize: 14, color: Colors.error }}>{holeNum}</Text>
                  </View>
                  {/* Score inputs */}
                  {players.map(p => {
                    const relHcp = relHcpMap[p.player_id] ?? 0;
                    const ventaja = hole && hole.handicap_rank <= relHcp;
                    const dobleVentaja = hole && hole.handicap_rank <= relHcp - 18;
                    const rawVal = getValue(p.player_id, holeNum);
                    const gross = parseInt(rawVal, 10);
                    const sym = !isNaN(gross) && gross > 0 && hole ? scoreSymbol(gross, hole.par) : null;
                    const isUnsaved = !!localScores[p.player_id]?.[holeNum];
                    const scoreColor = readonly ? Colors.textSecondary : Colors.text;
                    return (
                      <View key={p.player_id} style={{ width: COL_W, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.card, borderTopWidth: 1, borderTopColor: Colors.border + '55', paddingVertical: 4 }}>
                        <View style={{ alignItems: 'center', justifyContent: 'center', backgroundColor: dobleVentaja ? 'rgba(255, 140, 0, 0.5)' : ventaja ? 'rgba(255, 235, 0, 0.45)' : 'transparent', borderRadius: 3, paddingHorizontal: 2, paddingVertical: 1 }}>
                          <TextInput
                            ref={ref => { inputRefs.current[`${p.player_id}-${holeNum}`] = ref; }}
                            value={rawVal}
                            onChangeText={v => !readonly && handleChange(p.player_id, holeNum, v)}
                            onBlur={() => !readonly && handleBlur(p.player_id, holeNum)}
                            editable={!readonly}
                            keyboardType="number-pad"
                            inputMode="numeric"
                            maxLength={2}
                            style={{
                              width: 36, height: 36,
                              backgroundColor: 'transparent',
                              borderRadius: 4,
                              textAlign: 'center',
                              fontSize: 17,
                              fontFamily: Fonts.serif,
                              fontWeight: '700',
                              color: scoreColor,
                              borderWidth: isUnsaved ? 1 : 0,
                              borderColor: Colors.gold,
                              outlineWidth: 0,
                            } as any}
                          />
                          {sym && (
                            <View pointerEvents="none" style={{
                              position: 'absolute', width: 42, height: 42, borderRadius: 21,
                              borderWidth: 1.5, borderColor: Colors.greenDark + 'BB',
                              transform: [{ rotate: '5deg' }],
                            }} />
                          )}
                          {sym?.double && (
                            <View pointerEvents="none" style={{
                              position: 'absolute', width: 50, height: 50, borderRadius: 25,
                              borderWidth: 1.5, borderColor: Colors.greenDark + 'BB',
                              transform: [{ rotate: '-4deg' }],
                            }} />
                          )}
                        </View>
                      </View>
                    );
                  })}
                  {/* Gold divider */}
                  <View style={{ width: MARCA_LABEL_W, alignSelf: 'stretch', backgroundColor: Colors.card, borderTopWidth: 1, borderTopColor: Colors.border + '55', borderLeftWidth: 2, borderLeftColor: Colors.gold }} />
                  {/* Marca inputs */}
                  {players.map(p => {
                    const marcaVal = getMarcaValue(p.player_id, holeNum);
                    const hasMarca = !!marcaVal;
                    return (
                      <View key={p.player_id} style={{ width: MARCA_COL_W, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.card, borderTopWidth: 1, borderTopColor: Colors.border + '55', paddingVertical: 4 }}>
                        <TextInput
                          value={marcaVal}
                          onChangeText={v => !readonly && handleMarcaChange(p.player_id, holeNum, v)}
                          editable={!readonly}
                          keyboardType="number-pad"
                          inputMode="numeric"
                          maxLength={2}
                          style={{
                            width: 36, height: 36,
                            backgroundColor: hasMarca ? Colors.gold + '33' : 'transparent',
                            borderRadius: 4,
                            textAlign: 'center',
                            fontSize: 16,
                            fontFamily: Fonts.serif,
                            fontWeight: '700',
                            color: Colors.goldText,
                            borderWidth: localMarcas[p.player_id]?.[holeNum] ? 1 : 0,
                            borderColor: Colors.gold,
                            outlineWidth: 0,
                          } as any}
                        />
                      </View>
                    );
                  })}
                </View>
                {(isNinth || is18th) && (
                  <>
                    {is18th && (() => {
                      const secondHalf = holeOrder.slice(9);
                      return (
                        <View style={{ flexDirection: 'row', backgroundColor: Colors.greenMid, paddingVertical: 8, alignItems: 'center' }}>
                          <View style={{ width: HOLE_COL_W + 36 + V_COL_W, alignItems: 'center' }}>
                            <Text style={{ color: Colors.white, fontSize: 10, fontFamily: Fonts.mono, letterSpacing: 1.5, fontWeight: '700' }}>2ª VUELTA</Text>
                          </View>
                          {players.map(p => {
                            const sum = secondHalf.reduce((s, h) => s + (grossMap[p.player_id]?.[h] ?? 0), 0);
                            return (
                              <View key={p.player_id} style={{ width: COL_W, alignItems: 'center' }}>
                                <Text style={{ color: Colors.white, fontWeight: '700', fontSize: 16, fontFamily: Fonts.serif }}>{sum || '—'}</Text>
                              </View>
                            );
                          })}
                          <View style={{ width: MARCA_LABEL_W, alignSelf: 'stretch', borderLeftWidth: 2, borderLeftColor: Colors.gold, backgroundColor: Colors.greenMid }} />
                          {players.map(p => {
                            const count = secondHalf.reduce((s, h) => s + (parseInt(marcasEspMap[p.player_id]?.[h] ?? '', 10) || 0), 0);
                            return (
                              <View key={p.player_id} style={{ width: MARCA_COL_W, alignItems: 'center', backgroundColor: Colors.greenMid }}>
                                <Text style={{ color: Colors.gold, fontWeight: '700', fontSize: 15, fontFamily: Fonts.serif }}>{count > 0 ? String(count) : '—'}</Text>
                              </View>
                            );
                          })}
                        </View>
                      );
                    })()}
                    <View style={{ flexDirection: 'row', backgroundColor: isNinth ? Colors.greenMid : Colors.greenDark, paddingVertical: 8, alignItems: 'center' }}>
                      <View style={{ width: HOLE_COL_W + 36 + V_COL_W, alignItems: 'center' }}>
                        <Text style={{ color: isNinth ? Colors.white : Colors.gold, fontSize: 10, fontFamily: Fonts.mono, letterSpacing: 1.5, fontWeight: '700' }}>
                          {isNinth ? '1ª VUELTA' : 'TOTAL'}
                        </Text>
                      </View>
                      {players.map(p => {
                        const halfHoles = isNinth ? holeOrder.slice(0, idx + 1) : holeOrder;
                        const sum = halfHoles.reduce((s, h) => s + (grossMap[p.player_id]?.[h] ?? 0), 0);
                        return (
                          <View key={p.player_id} style={{ width: COL_W, alignItems: 'center' }}>
                            <Text style={{ color: isNinth ? Colors.white : Colors.gold, fontWeight: '700', fontSize: 16, fontFamily: Fonts.serif }}>{sum || '—'}</Text>
                          </View>
                        );
                      })}
                      <View style={{ width: MARCA_LABEL_W, alignSelf: 'stretch', borderLeftWidth: 2, borderLeftColor: Colors.gold, backgroundColor: isNinth ? Colors.greenMid : Colors.greenDark }} />
                      {players.map(p => {
                        const halfHoles = isNinth ? holeOrder.slice(0, idx + 1) : holeOrder;
                        const count = halfHoles.reduce((s, h) => s + (parseInt(marcasEspMap[p.player_id]?.[h] ?? '', 10) || 0), 0);
                        return (
                          <View key={p.player_id} style={{ width: MARCA_COL_W, alignItems: 'center', backgroundColor: isNinth ? Colors.greenMid : Colors.greenDark }}>
                            <Text style={{ color: Colors.gold, fontWeight: '700', fontSize: 15, fontFamily: Fonts.serif }}>{count > 0 ? String(count) : '—'}</Text>
                          </View>
                        );
                      })}
                    </View>
                  </>
                )}
              </View>
            );
          })}
        </View>
      </View>
      </View>
    </ScrollView>
  );
}
