// =====================================================
// TitanCap.OS - js/generator.js (v3.1 - Optimizado)
// =====================================================

import { supabase } from './supabase-client.js';
import {
  VOLUME_TABLE, BASELINE_HYPERTROPHY, SPLIT_PATTERNS, REP_RANGES,
  ADJUSTMENT_FACTORS, INTERDEPENDENCIA_FATIGA, EXERCISE_PRIORITIES, DELOAD_RULES
} from './config.js';
import { sugerirPeso } from './erm.js';
import { determinarSistemaProgresion } from './progression.js';

function determinarNivel(meses) {
  if (meses < 12) return 'principiante';
  if (meses >= 12 && meses < 24) return 'intermedio';
  return 'avanzado';
}

function calcularVolumenBasico(ejercicio, perfil) {
  const base = BASELINE_HYPERTROPHY[ejercicio] || 0;
  if (base === 0) return 0;
  let ajuste = 0;
  if (perfil.genero === 'femenino') ajuste += ADJUSTMENT_FACTORS.genero.femenino;
  if (perfil.peso_kg < ADJUSTMENT_FACTORS.peso.ligero.umbral) ajuste += ADJUSTMENT_FACTORS.peso.ligero.ajuste;
  else if (perfil.peso_kg > ADJUSTMENT_FACTORS.peso.superpesado.umbral) ajuste += ADJUSTMENT_FACTORS.peso.superpesado.ajuste;
  if (perfil.estatura_cm < ADJUSTMENT_FACTORS.estatura.baja.umbral) ajuste += ADJUSTMENT_FACTORS.estatura.baja.ajuste;
  else if (perfil.estatura_cm > ADJUSTMENT_FACTORS.estatura.alta.umbral) ajuste += ADJUSTMENT_FACTORS.estatura.alta.ajuste;
  if (perfil.experiencia_entrenamiento_meses > ADJUSTMENT_FACTORS.experiencia_avanzada.anios * 12) ajuste += ADJUSTMENT_FACTORS.experiencia_avanzada.ajuste;
  if (perfil.edad < ADJUSTMENT_FACTORS.edad.joven.umbral) ajuste += ADJUSTMENT_FACTORS.edad.joven.ajuste;
  else if (perfil.edad > ADJUSTMENT_FACTORS.edad.mayor.umbral) ajuste += ADJUSTMENT_FACTORS.edad.mayor.ajuste;
  if (perfil.dieta === 'superavit' && perfil.horas_sueno_promedio > 7.5) ajuste += ADJUSTMENT_FACTORS.estilo_vida.optimo.ajuste;
  else if (perfil.horas_sueno_promedio < 6 || perfil.dieta === 'deficit') ajuste += ADJUSTMENT_FACTORS.estilo_vida.estresado.ajuste;
  return Math.max(4, Math.round(base + ajuste));
}

function calcularVolumenGrupo(grupo, nivel, perfil) {
  const range = VOLUME_TABLE[grupo][nivel];
  let vol = range.MV[0];
  if (perfil.dieta === 'superavit') vol = range.ideal[0];
  else if (perfil.dieta === 'deficit') vol = Math.max(2, range.MV[0] - 2);
  if (perfil.horas_sueno_promedio > 7.5) vol = Math.min(vol + 1, range.MRV[1] * 0.8);
  else if (perfil.horas_sueno_promedio < 6) vol = Math.max(2, vol - 1);
  return vol;
}

export async function generateFirstWeek(userId) {
  const { data: perfil } = await supabase.from('profiles').select('*').eq('id', userId).single();
  if (!perfil) throw new Error('Perfil no encontrado');

  const { data: equipment } = await supabase.from('user_equipment').select('exercise_id, exercises(*)').eq('user_id', userId);
  const availableExercises = equipment.map(e => e.exercises);
  const nivel = determinarNivel(perfil.experiencia_entrenamiento_meses);
  const splitConfig = SPLIT_PATTERNS[perfil.dias_disponibles] || SPLIT_PATTERNS[4];
  const { sistema } = determinarSistemaProgresion(perfil);

  const volumenObjetivo = {};
  const grupos = ['pecho','espalda','deltoides','cuadriceps','isquios','gluteos','biceps','triceps','pantorrilla','abdomen','antebrazo'];
  grupos.forEach(g => { volumenObjetivo[g] = calcularVolumenGrupo(g, nivel, perfil); });

  const basicosVol = {
    sentadilla: calcularVolumenBasico('sentadilla', perfil),
    press_banca: calcularVolumenBasico('press_banca', perfil),
    peso_muerto: calcularVolumenBasico('peso_muerto', perfil)
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

  const today = new Date();
  const weekData = {
    user_id: userId, week_number: 1, fecha_inicio: today.toISOString().split('T')[0],
    type: 'normal', split_type: splitConfig.type, progression_system: sistema, es_semana_prueba: true
  };

  const { data: weekProgram } = await supabase.from('weekly_programs')
    .upsert(weekData, { onConflict: 'user_id, week_number' }).select().single();
  if (!weekProgram) throw new Error('Error creando semana');

  // Eliminar días anteriores de forma segura
  await supabase.from('workout_days').delete().eq('weekly_program_id', weekProgram.id);

  await construirDias(weekProgram, perfil, availableExercises, volumenObjetivo, {
    factorInt: 1.0, esSemanaPrueba: true, sistemaProgresion: sistema,
    pesosIniciales: { sentadilla: perfil.rm_sentadilla, press_banca: perfil.rm_banca, peso_muerto: perfil.rm_peso_muerto }
  });
  return weekProgram;
}

export async function generateNextWeek(userId, decision, deloadPorBasico = []) {
  const { data: perfil } = await supabase.from('profiles').select('*').eq('id', userId).single();
  const { data: lastWeek } = await supabase.from('weekly_programs').select('*').eq('user_id', userId).order('week_number', { ascending: false }).limit(1).single();

  const newWeekNumber = (lastWeek?.week_number || 0) + 1;
  const nivel = determinarNivel(perfil.experiencia_entrenamiento_meses);
  const splitConfig = SPLIT_PATTERNS[perfil.dias_disponibles] || SPLIT_PATTERNS[4];
  const { sistema } = determinarSistemaProgresion(perfil);

  const { data: equipment } = await supabase.from('user_equipment').select('exercise_id, exercises(*)').eq('user_id', userId);
  const availableExercises = equipment.map(e => e.exercises);

  let factorVol = 1.0, factorInt = 1.0, weekType = 'normal';
  if (decision === 'deload' || decision === 'deload_parcial') {
    factorVol = DELOAD_RULES.volumePercent; factorInt = DELOAD_RULES.intensityPercent; weekType = 'descarga';
  }

  const volumenObjetivo = {};
  const grupos = ['pecho','espalda','deltoides','cuadriceps','isquios','gluteos','biceps','triceps','pantorrilla','abdomen','antebrazo'];
  grupos.forEach(g => { volumenObjetivo[g] = Math.round(calcularVolumenGrupo(g, nivel, perfil) * factorVol); });

  const basicosVol = {
    sentadilla: Math.round(calcularVolumenBasico('sentadilla', perfil) * factorVol),
    press_banca: Math.round(calcularVolumenBasico('press_banca', perfil) * factorVol),
    peso_muerto: Math.round(calcularVolumenBasico('peso_muerto', perfil) * factorVol)
  };
  volumenObjetivo['cuadriceps'] = Math.max(volumenObjetivo['cuadriceps'], basicosVol.sentadilla);
  volumenObjetivo['pecho'] = Math.max(volumenObjetivo['pecho'], basicosVol.press_banca);
  volumenObjetivo['espalda'] = Math.max(volumenObjetivo['espalda'], basicosVol.peso_muerto);

  const fecha = new Date(); fecha.setDate(fecha.getDate() + 1);
  const weekData = {
    user_id: userId, week_number: newWeekNumber, fecha_inicio: fecha.toISOString().split('T')[0],
    type: weekType, split_type: splitConfig.type, progression_system: sistema, es_semana_prueba: false
  };

  const { data: newWeek } = await supabase.from('weekly_programs')
    .upsert(weekData, { onConflict: 'user_id, week_number' }).select().single();
  await supabase.from('workout_days').delete().eq('weekly_program_id', newWeek.id);
  await construirDias(newWeek, perfil, availableExercises, volumenObjetivo, { factorInt, deloadPorBasico });
  return newWeek;
}

// ===============================================
// LÓGICA PRINCIPAL OPTIMIZADA (BATCH INSERT)
// ===============================================
async function construirDias(weekProgram, perfil, availableExercises, volumenObjetivo, opts = {}) {
  const diasNombres = SPLIT_PATTERNS[perfil.dias_disponibles]?.days || SPLIT_PATTERNS[4].days;
  const splitType = weekProgram.split_type;
  const factorInt = opts.factorInt || 1.0;
  const esSemanaPrueba = opts.esSemanaPrueba || false;
  const sistemaProgresion = opts.sistemaProgresion || 'lineal';
  const pesosIniciales = opts.pesosIniciales || {};
  const deloadPorBasico = opts.deloadPorBasico || [];

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

  // 1. Preparar arrays para inserción masiva
  const diasParaInsertar = [];
  const ejerciciosParaInsertar = [];
  const dupCiclo = ['fuerza', 'volumen', 'potencia'];
  let dupIndex = 0;
  let wupPhase = 'hipertrofia';
  if (sistemaProgresion === 'wup') {
    const fases = ['hipertrofia', 'fuerza', 'pico', 'descarga'];
    wupPhase = fases[(weekProgram.week_number - 1) % 4];
  }

  const frecuenciaGrupo = {};
  for (let d = 0; d < diasNombres.length; d++) {
    const enfoque = getDayFocus(d);
    (enfoqueGrupos[enfoque] || []).forEach(g => frecuenciaGrupo[g] = (frecuenciaGrupo[g] || 0) + 1);
  }

  const volumenDiario = {};
  for (const [grupo, volTotal] of Object.entries(volumenObjetivo)) {
    if (frecuenciaGrupo[grupo]) volumenDiario[grupo] = Math.max(1, Math.round(volTotal / frecuenciaGrupo[grupo]));
  }

  // Construir datos para cada día
  for (let d = 0; d < diasNombres.length; d++) {
    const enfoque = getDayFocus(d);
    let dupType = null;
    if (sistemaProgresion === 'dup') {
      dupType = dupCiclo[dupIndex % 3];
      dupIndex++;
    }

    const diaTempId = `temp_${d}`; // ID temporal para relacionar ejercicios
    diasParaInsertar.push({
      temp_id: diaTempId,
      weekly_program_id: weekProgram.id,
      day_number: d + 1,
      enfoque: enfoque,
      dup_type: dupType,
      wup_phase: sistemaProgresion === 'wup' ? wupPhase : null
    });

    const gruposDia = enfoqueGrupos[enfoque] || [];
    let orden = 1;
    for (const grupo of gruposDia) {
      if (!volumenDiario[grupo] || volumenDiario[grupo] <= 0) continue;
      const ejerciciosDisponibles = availableExercises.filter(ex => ex.grupo_muscular === grupo);
      if (ejerciciosDisponibles.length === 0) continue;

      const prioridades = EXERCISE_PRIORITIES[grupo] || [];
      ejerciciosDisponibles.sort((a, b) => {
        const idxA = prioridades.indexOf(a.nombre), idxB = prioridades.indexOf(b.nombre);
        if (idxA === -1) return 1; if (idxB === -1) return -1; return idxA - idxB;
      });

      const numEjercicios = Math.min(2, ejerciciosDisponibles.length);
      let seriesRestantes = volumenDiario[grupo];

      for (let i = 0; i < numEjercicios && seriesRestantes > 0; i++) {
        const ejercicio = ejerciciosDisponibles[i];
        let series = ejercicio.es_basico ? Math.min(4, seriesRestantes) : Math.min(3, seriesRestantes);
        series = Math.max(1, series);
        const repsRange = getRepRange(ejercicio, perfil.objetivo, dupType, wupPhase);
        const rpeTarget = getRpeTarget(ejercicio, perfil.objetivo, dupType, wupPhase, factorInt);
        
        let pesoSugerido = null;
        if (ejercicio.es_basico && esSemanaPrueba && pesosIniciales[mapearBasico(ejercicio.nombre)]) {
          const rm = pesosIniciales[mapearBasico(ejercicio.nombre)];
          if (rm > 0) pesoSugerido = sugerirPeso(rm, repsRange.min, rpeTarget.rir);
        }

        ejerciciosParaInsertar.push({
          dia_temp_id: diaTempId,
          exercise_id: ejercicio.id,
          series_objetivo: series,
          reps_min: repsRange.min,
          reps_max: repsRange.max,
          rpe_objetivo: rpeTarget.target,
          rir_objetivo: rpeTarget.rir,
          peso_sugerido: pesoSugerido,
          dup_type: dupType,
          wup_phase: sistemaProgresion === 'wup' ? wupPhase : null,
          orden: orden++
        });
        seriesRestantes -= series;
      }
    }
  }

  // 2. Inserción masiva de días
  const { data: diasInsertados } = await supabase.from('workout_days').insert(
    diasParaInsertar.map(d => ({ ...d, temp_id: undefined }))
  ).select('id, day_number');

  if (!diasInsertados) throw new Error('Error insertando días');

  // 3. Mapear IDs reales y asignar a ejercicios
  const ejerciciosFinales = [];
  ejerciciosParaInsertar.forEach(ej => {
    const diaReal = diasInsertados.find((d, i) => i === parseInt(ej.dia_temp_id.split('_')[1]));
    if (diaReal) {
      ejerciciosFinales.push({
        workout_day_id: diaReal.id,
        exercise_id: ej.exercise_id,
        series_objetivo: ej.series_objetivo,
        reps_min: ej.reps_min,
        reps_max: ej.reps_max,
        rpe_objetivo: ej.rpe_objetivo,
        rir_objetivo: ej.rir_objetivo,
        peso_sugerido: ej.peso_sugerido,
        dup_type: ej.dup_type,
        wup_phase: ej.wup_phase,
        orden: ej.orden
      });
    }
  });

  // 4. Inserción masiva de ejercicios
  if (ejerciciosFinales.length > 0) {
    await supabase.from('workout_exercises').insert(ejerciciosFinales);
  }
}

function getRepRange(ejercicio, objetivo, dupType, wupPhase) { /* lógica sin cambios */ }
function getRpeTarget(ejercicio, objetivo, dupType, wupPhase, factorInt) { /* lógica sin cambios */ }
function mapearBasico(nombre) { /* lógica sin cambios */ }
