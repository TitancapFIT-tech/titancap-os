// =====================================================
// TitanCap.OS - js/generator.js (v2 - upsert en semana)
// =====================================================

import { supabase } from './supabase-client.js';
import {
  VOLUME_TABLE,
  BASELINE_HYPERTROPHY,
  SPLIT_PATTERNS,
  REP_RANGES,
  ADJUSTMENT_FACTORS,
  INTERDEPENDENCIA_FATIGA,
  EXERCISE_PRIORITIES,
  DELOAD_RULES
} from './config.js';

// -----------------------------------------------
// 1. DETERMINAR NIVEL
// -----------------------------------------------
function determinarNivel(meses) {
  if (meses < 12) return 'principiante';
  if (meses < 24) return 'intermedio';
  return 'avanzado';
}

// -----------------------------------------------
// 2. VOLUMEN BÁSICO (Chad Wesley Smith)
// -----------------------------------------------
function calcularVolumenBasico(ejercicio, perfil) {
  const base = BASELINE_HYPERTROPHY[ejercicio] || 0;
  if (base === 0) return 0;
  let ajuste = 0;

  if (perfil.genero === 'femenino') ajuste += ADJUSTMENT_FACTORS.genero.femenino;
  if (perfil.peso_kg < ADJUSTMENT_FACTORS.peso.ligero.umbral) ajuste += ADJUSTMENT_FACTORS.peso.ligero.ajuste;
  else if (perfil.peso_kg > ADJUSTMENT_FACTORS.peso.superpesado.umbral) ajuste += ADJUSTMENT_FACTORS.peso.superpesado.ajuste;
  if (perfil.estatura_cm < ADJUSTMENT_FACTORS.estatura.baja.umbral) ajuste += ADJUSTMENT_FACTORS.estatura.baja.ajuste;
  else if (perfil.estatura_cm > ADJUSTMENT_FACTORS.estatura.alta.umbral) ajuste += ADJUSTMENT_FACTORS.estatura.alta.ajuste;
  if (perfil.experiencia_entrenamiento_meses > ADJUSTMENT_FACTORS.experiencia_avanzada.anios * 12)
    ajuste += ADJUSTMENT_FACTORS.experiencia_avanzada.ajuste;
  if (perfil.edad < ADJUSTMENT_FACTORS.edad.joven.umbral) ajuste += ADJUSTMENT_FACTORS.edad.joven.ajuste;
  else if (perfil.edad > ADJUSTMENT_FACTORS.edad.mayor.umbral) ajuste += ADJUSTMENT_FACTORS.edad.mayor.ajuste;
  if (perfil.dieta === 'superavit' && perfil.horas_sueno_promedio > 7.5) ajuste += ADJUSTMENT_FACTORS.estilo_vida.optimo.ajuste;
  else if (perfil.horas_sueno_promedio < 6 || perfil.dieta === 'deficit') ajuste += ADJUSTMENT_FACTORS.estilo_vida.estresado.ajuste;

  return Math.max(4, Math.round(base + ajuste));
}

// -----------------------------------------------
// 3. VOLUMEN POR GRUPO NO BÁSICO
// -----------------------------------------------
function calcularVolumenGrupo(grupo, nivel, perfil) {
  const range = VOLUME_TABLE[grupo][nivel];
  let vol = range.MV[0];
  if (perfil.dieta === 'superavit') vol = range.ideal[0];
  else if (perfil.dieta === 'deficit') vol = Math.max(2, range.MV[0] - 2);
  if (perfil.horas_sueno_promedio > 7.5) vol = Math.min(vol + 1, range.MRV[1] * 0.8);
  else if (perfil.horas_sueno_promedio < 6) vol = Math.max(2, vol - 1);
  return vol;
}

// -----------------------------------------------
// 4. GENERAR PRIMERA SEMANA
// -----------------------------------------------
export async function generateFirstWeek(userId) {
  const { data: perfil, error: perfilError } = await supabase
    .from('profiles').select('*').eq('id', userId).single();
  if (perfilError || !perfil) throw new Error('Perfil no encontrado');

  const { data: equipment } = await supabase
    .from('user_equipment').select('exercise_id, exercises(*)').eq('user_id', userId);
  const availableExercises = equipment.map(e => e.exercises);

  const nivel = determinarNivel(perfil.experiencia_entrenamiento_meses);
  const dias = perfil.dias_disponibles;
  const objetivo = perfil.objetivo;
  const splitConfig = SPLIT_PATTERNS[dias] || SPLIT_PATTERNS[4];
  const splitType = splitConfig.type;

  // Calcular volúmenes objetivo por grupo
  const volumenObjetivo = {};
  const grupos = ['pecho','espalda','deltoides','cuadriceps','isquios','gluteos','biceps','triceps','pantorrilla','abdomen','antebrazo'];
  grupos.forEach(g => { volumenObjetivo[g] = calcularVolumenGrupo(g, nivel, perfil); });

  // Volumen de básicos
  const basicosVol = {
    sentadilla: calcularVolumenBasico('sentadilla', perfil),
    press_banca: calcularVolumenBasico('press_banca', perfil),
    peso_muerto: calcularVolumenBasico('peso_muerto', perfil)
  };

  volumenObjetivo['cuadriceps'] = Math.max(volumenObjetivo['cuadriceps'], basicosVol.sentadilla);
  volumenObjetivo['pecho'] = Math.max(volumenObjetivo['pecho'], basicosVol.press_banca);
  volumenObjetivo['espalda'] = Math.max(volumenObjetivo['espalda'], basicosVol.peso_muerto);

  // Interdependencia de fatiga
  if (volumenObjetivo['pecho'] > 10) {
    volumenObjetivo['triceps'] = Math.round(volumenObjetivo['triceps'] * 0.7);
    volumenObjetivo['deltoides'] = Math.round(volumenObjetivo['deltoides'] * 0.8);
  }
  if (volumenObjetivo['espalda'] > 12 && basicosVol.peso_muerto > 8) {
    volumenObjetivo['isquios'] = Math.round(volumenObjetivo['isquios'] * 0.7);
  }

  // UPSERT en weekly_programs (por si ya existía una semana 1)
  const today = new Date();
  const { data: weekProgram, error: weekError } = await supabase
    .from('weekly_programs')
    .upsert({
      user_id: userId,
      week_number: 1,
      fecha_inicio: today.toISOString().split('T')[0],
      type: 'normal',
      split_type: splitType
    }, { onConflict: 'user_id, week_number' })
    .select()
    .single();

  if (weekError) throw weekError;

  // Eliminar días anteriores de esta semana (si los había)
  await supabase.from('workout_days').delete().eq('weekly_program_id', weekProgram.id);

  await construirDias(weekProgram, perfil, availableExercises, volumenObjetivo, objetivo, null);
  return weekProgram;
}

// -----------------------------------------------
// 5. GENERAR SIGUIENTE SEMANA (NORMAL O DESCARGA)
// -----------------------------------------------
export async function generateNextWeek(userId, decision) {
  const { data: perfil } = await supabase.from('profiles').select('*').eq('id', userId).single();
  const { data: lastWeek } = await supabase
    .from('weekly_programs').select('*').eq('user_id', userId)
    .order('week_number', { ascending: false }).limit(1).single();

  const newWeekNumber = (lastWeek?.week_number || 0) + 1;
  const nivel = determinarNivel(perfil.experiencia_entrenamiento_meses);
  const objetivo = perfil.objetivo;
  const dias = perfil.dias_disponibles;

  const { data: equipment } = await supabase
    .from('user_equipment').select('exercise_id, exercises(*)').eq('user_id', userId);
  const availableExercises = equipment.map(e => e.exercises);

  const prevVolumeData = await calcularVolumenesPrevios(userId, lastWeek.id);

  let factorVol = 1.0;
  let factorInt = 1.0;
  let weekType = 'normal';

  if (decision === 'deload') {
    factorVol = DELOAD_RULES.volumePercent;
    factorInt = DELOAD_RULES.intensityPercent;
    weekType = 'descarga';
  }

  const volumenObjetivo = {};
  const grupos = ['pecho','espalda','deltoides','cuadriceps','isquios','gluteos','biceps','triceps','pantorrilla','abdomen','antebrazo'];
  grupos.forEach(g => {
    let vol = calcularVolumenGrupo(g, nivel, perfil);
    vol = Math.round(vol * factorVol);
    if (decision === 'normal' && prevVolumeData[g]) {
      const feedback = prevVolumeData._feedback;
      vol = aplicarProgresion(vol, g, perfil, prevVolumeData, feedback);
    }
    volumenObjetivo[g] = vol;
  });

  const basicosVol = {
    sentadilla: Math.round(calcularVolumenBasico('sentadilla', perfil) * factorVol),
    press_banca: Math.round(calcularVolumenBasico('press_banca', perfil) * factorVol),
    peso_muerto: Math.round(calcularVolumenBasico('peso_muerto', perfil) * factorVol)
  };
  volumenObjetivo['cuadriceps'] = Math.max(volumenObjetivo['cuadriceps'], basicosVol.sentadilla);
  volumenObjetivo['pecho'] = Math.max(volumenObjetivo['pecho'], basicosVol.press_banca);
  volumenObjetivo['espalda'] = Math.max(volumenObjetivo['espalda'], basicosVol.peso_muerto);

  if (volumenObjetivo['pecho'] > 10) {
    volumenObjetivo['triceps'] = Math.round(volumenObjetivo['triceps'] * 0.7);
    volumenObjetivo['deltoides'] = Math.round(volumenObjetivo['deltoides'] * 0.8);
  }
  if (volumenObjetivo['espalda'] > 12 && basicosVol.peso_muerto > 8) {
    volumenObjetivo['isquios'] = Math.round(volumenObjetivo['isquios'] * 0.7);
  }

  const splitConfig = SPLIT_PATTERNS[dias] || SPLIT_PATTERNS[4];
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + 1);

  const { data: newWeek, error: weekErr } = await supabase
    .from('weekly_programs')
    .upsert({
      user_id: userId,
      week_number: newWeekNumber,
      fecha_inicio: fecha.toISOString().split('T')[0],
      type: weekType,
      split_type: splitConfig.type
    }, { onConflict: 'user_id, week_number' })
    .select()
    .single();

  if (weekErr) throw weekErr;

  // Limpiar días viejos
  await supabase.from('workout_days').delete().eq('weekly_program_id', newWeek.id);

  await construirDias(newWeek, perfil, availableExercises, volumenObjetivo, objetivo, { factorInt });
  return newWeek;
}

// -----------------------------------------------
// 6. APLICAR PROGRESIÓN
// -----------------------------------------------
function aplicarProgresion(volBase, grupo, perfil, prevData, feedback) {
  if (!feedback) return volBase;
  const { dolores_articulares, fatiga_cronica, rendimiento_percibido, fallo_pesos_asignados } = feedback;
  if (fatiga_cronica || dolores_articulares || rendimiento_percibido <= 5) {
    return Math.max(2, volBase - 2);
  }
  if (rendimiento_percibido >= 8 && !fallo_pesos_asignados) {
    return Math.min(volBase + 2, VOLUME_TABLE[grupo][determinarNivel(perfil.experiencia_entrenamiento_meses)].MRV[1]);
  }
  return volBase;
}

// -----------------------------------------------
// 7. CONSTRUIR DÍAS Y EJERCICIOS
// -----------------------------------------------
async function construirDias(weekProgram, perfil, availableExercises, volumenObjetivo, objetivo, intensidadOpts = null) {
  const dias = SPLIT_PATTERNS[perfil.dias_disponibles]?.days || SPLIT_PATTERNS[4].days;
  const splitType = weekProgram.split_type;
  const factorInt = intensidadOpts?.factorInt || 1.0;

  const enfoqueGrupos = {
    full_body: ['pecho','espalda','deltoides','cuadriceps','isquios','gluteos','biceps','triceps','pantorrilla','abdomen'],
    torso: ['pecho','espalda','deltoides','biceps','triceps'],
    pierna: ['cuadriceps','isquios','gluteos','pantorrilla','abdomen'],
    push: ['pecho','deltoides','triceps'],
    pull: ['espalda','biceps','antebrazo'],
    legs: ['cuadriceps','isquios','gluteos','pantorrilla']
  };

  function getDayFocus(dayIndex) {
    if (splitType === 'full_body' || splitType === 'full_body_alt') return 'full_body';
    if (splitType === 'torso_pierna') return dayIndex % 2 === 0 ? 'torso' : 'pierna';
    const pattern = ['push','pull','legs','push','pull','legs'];
    return pattern[dayIndex % pattern.length];
  }

  const frecuenciaGrupo = {};
  for (let d = 0; d < dias.length; d++) {
    const enfoque = getDayFocus(d);
    (enfoqueGrupos[enfoque] || []).forEach(g => frecuenciaGrupo[g] = (frecuenciaGrupo[g] || 0) + 1);
  }

  const volumenDiario = {};
  for (const [grupo, volTotal] of Object.entries(volumenObjetivo)) {
    if (frecuenciaGrupo[grupo]) {
      volumenDiario[grupo] = Math.max(1, Math.round(volTotal / frecuenciaGrupo[grupo]));
    }
  }

  for (let d = 0; d < dias.length; d++) {
    const enfoque = getDayFocus(d);
    const { data: diaProgram, error: diaError } = await supabase
      .from('workout_days').insert({
        weekly_program_id: weekProgram.id,
        day_number: d + 1,
        enfoque: enfoque
      }).select().single();
    if (diaError) throw diaError;

    const gruposDia = enfoqueGrupos[enfoque] || [];
    let orden = 1;

    for (const grupo of gruposDia) {
      if (!volumenDiario[grupo] || volumenDiario[grupo] <= 0) continue;

      const ejerciciosDisponibles = availableExercises.filter(ex => ex.grupo_muscular === grupo);
      if (ejerciciosDisponibles.length === 0) continue;

      const prioridades = EXERCISE_PRIORITIES[grupo] || [];
      ejerciciosDisponibles.sort((a, b) => {
        const idxA = prioridades.indexOf(a.nombre);
        const idxB = prioridades.indexOf(b.nombre);
        if (idxA === -1) return 1;
        if (idxB === -1) return -1;
        return idxA - idxB;
      });

      const numEjercicios = Math.min(2, ejerciciosDisponibles.length);
      let seriesRestantes = volumenDiario[grupo];

      for (let i = 0; i < numEjercicios && seriesRestantes > 0; i++) {
        const ejercicio = ejerciciosDisponibles[i];
        let series = ejercicio.es_basico ? Math.min(4, seriesRestantes) : Math.min(3, seriesRestantes);
        series = Math.max(1, series);

        const repsRange = getRepRange(ejercicio, objetivo);
        const rpe = getRpeTarget(ejercicio, objetivo);
        const rpeFinal = Math.round((rpe.target * factorInt) * 10) / 10;
        const rirFinal = Math.max(0, 10 - rpeFinal);

        await supabase.from('workout_exercises').insert({
          workout_day_id: diaProgram.id,
          exercise_id: ejercicio.id,
          series_objetivo: series,
          reps_min: repsRange.min,
          reps_max: repsRange.max,
          rpe_objetivo: rpeFinal,
          rir_objetivo: Math.round(rirFinal),
          orden: orden++
        });
        seriesRestantes -= series;
      }
    }
  }
}

// -----------------------------------------------
// 8. CALCULAR VOLÚMENES PREVIOS
// -----------------------------------------------
async function calcularVolumenesPrevios(userId, previousWeekId) {
  const { data: feedback } = await supabase
    .from('weekly_feedback')
    .select('*')
    .eq('weekly_program_id', previousWeekId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  const result = { _feedback: feedback };
  return result;
}

// -----------------------------------------------
// 9. RANGOS DE REPETICIONES Y RPE
// -----------------------------------------------
function getRepRange(ejercicio, objetivo) {
  if (ejercicio.es_basico) {
    if (objetivo === 'fuerza') return REP_RANGES.basico_fuerza;
    return REP_RANGES.basico_hipertrofia;
  } else if (ejercicio.tipo.startsWith('multi')) {
    return REP_RANGES.alta_demanda_axial;
  } else {
    return REP_RANGES.aislado_hipertrofia;
  }
}

function getRpeTarget(ejercicio, objetivo) {
  if (ejercicio.es_basico || ejercicio.tipo.startsWith('multi')) {
    return { target: 7.5, rir: 2.5 };
  } else {
    return { target: 8.5, rir: 1.5 };
  }
}
