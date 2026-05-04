// =====================================================
// TitanCap.OS - js/generator.js (v3 - Auditoría Completa)
// Generación de semanas con motor e1RM, progresión,
// ondulación DUP/WUP, deload individualizado
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
import { calcularE1RM, sugerirPeso, obtenerHistorialE1RM, necesitaDeloadPorE1RM } from './erm.js';
import { determinarSistemaProgresion, guardarSistemaProgresion } from './progression.js';

// -----------------------------------------------
// 1. DETERMINAR NIVEL DEL USUARIO
// -----------------------------------------------
function determinarNivel(meses) {
  if (meses < 12) return 'principiante';
  if (meses >= 12 && meses < 24) return 'intermedio';
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
// 4. GENERAR PRIMERA SEMANA (SEMANA DE PRUEBA/CALIBRACIÓN)
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

  // Determinar sistema de progresión
  const { nivel: nivelProg, sistema } = determinarSistemaProgresion(perfil);

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

  // Interdependencia de fatiga dinámica
  if (volumenObjetivo['pecho'] > 10) {
    volumenObjetivo['triceps'] = Math.round(volumenObjetivo['triceps'] * INTERDEPENDENCIA_FATIGA.pecho.reduceA.find(r => r.grupo === 'triceps').factor);
    volumenObjetivo['deltoides'] = Math.round(volumenObjetivo['deltoides'] * INTERDEPENDENCIA_FATIGA.pecho.reduceA.find(r => r.grupo === 'deltoides').factor);
  }
  if (volumenObjetivo['espalda'] > 12 && basicosVol.peso_muerto > 8) {
    volumenObjetivo['isquios'] = Math.round(volumenObjetivo['isquios'] * INTERDEPENDENCIA_FATIGA.espalda.reduceA.find(r => r.grupo === 'isquios').factor);
  }

  // UPSERT en weekly_programs
  const today = new Date();
  const weekData = {
    user_id: userId,
    week_number: 1,
    fecha_inicio: today.toISOString().split('T')[0],
    type: 'normal',
    split_type: splitType,
    progression_system: sistema,
    es_semana_prueba: true
  };

  const { data: weekProgram, error: weekError } = await supabase
    .from('weekly_programs')
    .upsert(weekData, { onConflict: 'user_id, week_number' })
    .select()
    .single();

  if (weekError) throw weekError;

  // Eliminar días anteriores de esta semana (si los había)
  await supabase.from('workout_days').delete().eq('weekly_program_id', weekProgram.id);

  // Construir los días con pesos iniciales basados en RM declarado
  await construirDias(weekProgram, perfil, availableExercises, volumenObjetivo, objetivo, {
    factorInt: 1.0,
    esSemanaPrueba: true,
    sistemaProgresion: sistema,
    pesosIniciales: {
      sentadilla: perfil.rm_sentadilla || 0,
      press_banca: perfil.rm_banca || 0,
      peso_muerto: perfil.rm_peso_muerto || 0
    }
  });

  return weekProgram;
}

// -----------------------------------------------
// 5. GENERAR SIGUIENTE SEMANA (NORMAL O DESCARGA)
// -----------------------------------------------
export async function generateNextWeek(userId, decision, deloadPorBasico = []) {
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

  const { nivel: nivelProg, sistema } = determinarSistemaProgresion(perfil);

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
    volumenObjetivo['triceps'] = Math.round(volumenObjetivo['triceps'] * INTERDEPENDENCIA_FATIGA.pecho.reduceA.find(r => r.grupo === 'triceps').factor);
    volumenObjetivo['deltoides'] = Math.round(volumenObjetivo['deltoides'] * INTERDEPENDENCIA_FATIGA.pecho.reduceA.find(r => r.grupo === 'deltoides').factor);
  }
  if (volumenObjetivo['espalda'] > 12 && basicosVol.peso_muerto > 8) {
    volumenObjetivo['isquios'] = Math.round(volumenObjetivo['isquios'] * INTERDEPENDENCIA_FATIGA.espalda.reduceA.find(r => r.grupo === 'isquios').factor);
  }

  const splitConfig = SPLIT_PATTERNS[dias] || SPLIT_PATTERNS[4];
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + 1);

  const weekData = {
    user_id: userId,
    week_number: newWeekNumber,
    fecha_inicio: fecha.toISOString().split('T')[0],
    type: weekType,
    split_type: splitConfig.type,
    progression_system: sistema,
    es_semana_prueba: false
  };

  const { data: newWeek, error: weekErr } = await supabase
    .from('weekly_programs')
    .upsert(weekData, { onConflict: 'user_id, week_number' })
    .select()
    .single();

  if (weekErr) throw weekErr;

  // Limpiar días viejos
  await supabase.from('workout_days').delete().eq('weekly_program_id', newWeek.id);

  await construirDias(newWeek, perfil, availableExercises, volumenObjetivo, objetivo, {
    factorInt: factorInt,
    esSemanaPrueba: false,
    sistemaProgresion: sistema,
    deloadPorBasico: deloadPorBasico,
    previousWeekId: lastWeek?.id
  });

  return newWeek;
}

// -----------------------------------------------
// 6. CONSTRUIR DÍAS Y EJERCICIOS DE UNA SEMANA
// -----------------------------------------------
async function construirDias(weekProgram, perfil, availableExercises, volumenObjetivo, objetivo, opts = {}) {
  const dias = SPLIT_PATTERNS[perfil.dias_disponibles]?.days || SPLIT_PATTERNS[4].days;
  const splitType = weekProgram.split_type;
  const factorInt = opts.factorInt || 1.0;
  const esSemanaPrueba = opts.esSemanaPrueba || false;
  const sistemaProgresion = opts.sistemaProgresion || 'lineal';
  const pesosIniciales = opts.pesosIniciales || {};
  const deloadPorBasico = opts.deloadPorBasico || [];
  const previousWeekId = opts.previousWeekId;

  // Mapa de grupos musculares por tipo de día
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

  // Calcular frecuencia de cada grupo muscular en la semana
  const frecuenciaGrupo = {};
  for (let d = 0; d < dias.length; d++) {
    const enfoque = getDayFocus(d);
    (enfoqueGrupos[enfoque] || []).forEach(g => frecuenciaGrupo[g] = (frecuenciaGrupo[g] || 0) + 1);
  }

  // Volumen diario por grupo muscular
  const volumenDiario = {};
  for (const [grupo, volTotal] of Object.entries(volumenObjetivo)) {
    if (frecuenciaGrupo[grupo]) {
      volumenDiario[grupo] = Math.max(1, Math.round(volTotal / frecuenciaGrupo[grupo]));
    }
  }

  // Para DUP, ciclo de 3 tipos de día
  const dupCiclo = ['fuerza', 'volumen', 'potencia'];
  let dupIndex = 0;

  // Para WUP, determinar fase según semana del bloque
  let wupPhase = 'hipertrofia';
  if (sistemaProgresion === 'wup') {
    const semanaEnBloque = (weekProgram.week_number - 1) % 4;
    const fases = ['hipertrofia', 'fuerza', 'pico', 'descarga'];
    wupPhase = fases[semanaEnBloque];
  }

  // Construir cada día
  for (let d = 0; d < dias.length; d++) {
    const enfoque = getDayFocus(d);

    // DUP: asignar tipo de día ondulante
    let dupType = null;
    if (sistemaProgresion === 'dup') {
      dupType = dupCiclo[dupIndex % 3];
      dupIndex++;
    }

    const { data: diaProgram, error: diaError } = await supabase
      .from('workout_days').insert({
        weekly_program_id: weekProgram.id,
        day_number: d + 1,
        enfoque: enfoque,
        dup_type: dupType,
        wup_phase: sistemaProgresion === 'wup' ? wupPhase : null
      }).select().single();
    if (diaError) throw diaError;

    const gruposDia = enfoqueGrupos[enfoque] || [];
    let orden = 1;

    for (const grupo of gruposDia) {
      if (!volumenDiario[grupo] || volumenDiario[grupo] <= 0) continue;

      const ejerciciosDisponibles = availableExercises.filter(ex => ex.grupo_muscular === grupo);
      if (ejerciciosDisponibles.length === 0) continue;

      // Ordenar por prioridad
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

        // Obtener rango de reps según tipo de ejercicio y objetivo
        const repsRange = getRepRange(ejercicio, objetivo, dupType, wupPhase);

        // Obtener RPE/RIR objetivo según sistema de progresión
        const rpeTarget = getRpeTarget(ejercicio, objetivo, dupType, wupPhase, factorInt);
        const rpeFinal = Math.round(rpeTarget.target * 10) / 10;
        const rirFinal = Math.max(0, 10 - rpeFinal);

        // Determinar peso sugerido inicial
        let pesoSugerido = null;
        if (ejercicio.es_basico && esSemanaPrueba && pesosIniciales[mapearBasico(ejercicio.nombre)]) {
          const rm = pesosIniciales[mapearBasico(ejercicio.nombre)];
          if (rm > 0) {
            pesoSugerido = sugerirPeso(rm, repsRange.min, rirFinal);
          }
        }

        // Verificar si este básico está en deload parcial
        const esDeloadEjercicio = deloadPorBasico.includes(mapearBasico(ejercicio.nombre));
        let seriesFinal = series;
        let repsMinFinal = repsRange.min;
        let repsMaxFinal = repsRange.max;
        let rpeFinalAjustado = rpeFinal;
        let rirFinalAjustado = rirFinal;

        if (esDeloadEjercicio) {
          seriesFinal = Math.max(1, Math.round(series * DELOAD_RULES.volumePercent));
          rpeFinalAjustado = Math.round(rpeFinal * DELOAD_RULES.intensityPercent * 10) / 10;
          rirFinalAjustado = Math.max(0, 10 - rpeFinalAjustado);
        }

        await supabase.from('workout_exercises').insert({
          workout_day_id: diaProgram.id,
          exercise_id: ejercicio.id,
          series_objetivo: seriesFinal,
          reps_min: repsMinFinal,
          reps_max: repsMaxFinal,
          rpe_objetivo: rpeFinalAjustado,
          rir_objetivo: Math.round(rirFinalAjustado),
          peso_sugerido: pesoSugerido,
          dup_type: dupType,
          wup_phase: sistemaProgresion === 'wup' ? wupPhase : null,
          orden: orden++
        });

        seriesRestantes -= series;
      }
    }
  }
}

// -----------------------------------------------
// 7. OBTENER RANGO DE REPETICIONES
// -----------------------------------------------
function getRepRange(ejercicio, objetivo, dupType = null, wupPhase = null) {
  // Ondulación DUP: ajustar según tipo de día
  if (dupType === 'fuerza') {
    return REP_RANGES.basico_fuerza; // 4-8 reps
  } else if (dupType === 'potencia') {
    return { min: 3, max: 5, rpe: [5, 6], rir: [5, 4] };
  } else if (dupType === 'volumen') {
    return ejercicio.es_basico ? REP_RANGES.basico_hipertrofia : REP_RANGES.aislado_hipertrofia;
  }

  // Ondulación WUP: ajustar según fase de la semana
  if (wupPhase === 'hipertrofia') {
    return ejercicio.es_basico ? REP_RANGES.basico_hipertrofia : REP_RANGES.aislado_hipertrofia;
  } else if (wupPhase === 'fuerza') {
    return REP_RANGES.basico_fuerza;
  } else if (wupPhase === 'pico') {
    return { min: 1, max: 3, rpe: [9, 10], rir: [2, 0] };
  } else if (wupPhase === 'descarga') {
    return ejercicio.es_basico ? { min: 4, max: 6, rpe: [5, 6], rir: [5, 4] } : { min: 8, max: 10, rpe: [6, 7], rir: [4, 3] };
  }

  // Sin ondulación: rangos estándar
  if (ejercicio.es_basico) {
    if (objetivo === 'fuerza') return REP_RANGES.basico_fuerza;
    return REP_RANGES.basico_hipertrofia;
  } else if (ejercicio.tipo.startsWith('multi')) {
    return REP_RANGES.alta_demanda_axial;
  } else {
    return REP_RANGES.aislado_hipertrofia;
  }
}

// -----------------------------------------------
// 8. OBTENER RPE OBJETIVO
// -----------------------------------------------
function getRpeTarget(ejercicio, objetivo, dupType = null, wupPhase = null, factorInt = 1.0) {
  // Ondulación DUP
  if (dupType === 'fuerza') {
    return { target: Math.round(8.5 * factorInt * 10) / 10, rir: Math.max(0, 10 - 8.5 * factorInt) };
  } else if (dupType === 'potencia') {
    return { target: Math.round(5.5 * factorInt * 10) / 10, rir: Math.max(0, 10 - 5.5 * factorInt) };
  } else if (dupType === 'volumen') {
    return { target: Math.round(7.0 * factorInt * 10) / 10, rir: Math.max(0, 10 - 7.0 * factorInt) };
  }

  // Ondulación WUP
  if (wupPhase === 'hipertrofia') {
    return { target: Math.round(8.0 * factorInt * 10) / 10, rir: Math.max(0, 10 - 8.0 * factorInt) };
  } else if (wupPhase === 'fuerza') {
    return { target: Math.round(8.5 * factorInt * 10) / 10, rir: Math.max(0, 10 - 8.5 * factorInt) };
  } else if (wupPhase === 'pico') {
    return { target: Math.round(9.5 * factorInt * 10) / 10, rir: Math.max(0, 10 - 9.5 * factorInt) };
  } else if (wupPhase === 'descarga') {
    return { target: Math.round(6.0 * factorInt * 10) / 10, rir: Math.max(0, 10 - 6.0 * factorInt) };
  }

  // Sin ondulación
  if (ejercicio.es_basico || ejercicio.tipo.startsWith('multi')) {
    return { target: Math.round(7.5 * factorInt * 10) / 10, rir: Math.max(0, 10 - 7.5 * factorInt) };
  } else {
    return { target: Math.round(8.5 * factorInt * 10) / 10, rir: Math.max(0, 10 - 8.5 * factorInt) };
  }
}

// -----------------------------------------------
// 9. UTILIDAD: MAPEAR NOMBRE DE EJERCICIO A CLAVE
// -----------------------------------------------
function mapearBasico(nombre) {
  const map = {
    'Sentadilla libre trasera': 'sentadilla',
    'Peso muerto convencional': 'peso_muerto',
    'Press de banca plano con barra': 'press_banca'
  };
  return map[nombre] || 'press_banca';
}
