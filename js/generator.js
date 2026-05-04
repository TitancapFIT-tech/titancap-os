// =====================================================
// TitanCap.OS - js/generator.js (v3.1 - Optimizado y sin duplicados)
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

// ------------------------------------------------------
// 1. GENERAR PRIMERA SEMANA (SEMANA DE PRUEBA)
// ------------------------------------------------------
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
    user_id: userId,
    week_number: 1,
    fecha_inicio: today.toISOString().split('T')[0],
    type: 'normal',
    split_type: splitConfig.type,
    progression_system: sistema,
    es_semana_prueba: true
  };

  const { data: weekProgram } = await supabase
    .from('weekly_programs')
    .upsert(weekData, { onConflict: 'user_id, week_number' })
    .select()
    .single();

  if (!weekProgram) throw new Error('Error creando semana');

  // Eliminar días previos de manera segura
  await supabase.from('workout_days').delete().eq('weekly_program_id', weekProgram.id);

  await construirDias(weekProgram, perfil, availableExercises, volumenObjetivo, {
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

// ------------------------------------------------------
// 2. GENERAR SIGUIENTE SEMANA (NORMAL O DESCARGA)
// ------------------------------------------------------
export async function generateNextWeek(userId, decision, deloadPorBasico = []) {
  const { data: perfil } = await supabase.from('profiles').select('*').eq('id', userId).single();
  const { data: lastWeek } = await supabase
    .from('weekly_programs')
    .select('*')
    .eq('user_id', userId)
    .order('week_number', { ascending: false })
    .limit(1)
    .single();

  const newWeekNumber = (lastWeek?.week_number || 0) + 1;
  const nivel = determinarNivel(perfil.experiencia_entrenamiento_meses);
  const splitConfig = SPLIT_PATTERNS[perfil.dias_disponibles] || SPLIT_PATTERNS[4];
  const { sistema } = determinarSistemaProgresion(perfil);

  const { data: equipment } = await supabase.from('user_equipment').select('exercise_id, exercises(*)').eq('user_id', userId);
  const availableExercises = equipment.map(e => e.exercises);

  let factorVol = 1.0, factorInt = 1.0, weekType = 'normal';
  if (decision === 'deload' || decision === 'deload_parcial') {
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
    volumenObjetivo['triceps'] = Math.round(volumenObjetivo['triceps'] * 0.7);
    volumenObjetivo['deltoides'] = Math.round(volumenObjetivo['deltoides'] * 0.8);
  }
  if (volumenObjetivo['espalda'] > 12 && basicosVol.peso_muerto > 8) {
    volumenObjetivo['isquios'] = Math.round(volumenObjetivo['isquios'] * 0.7);
  }

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

  const { data: newWeek } = await supabase
    .from('weekly_programs')
    .upsert(weekData, { onConflict: 'user_id, week_number' })
    .select()
    .single();

  if (!newWeek) throw new Error('Error creando nueva semana');

  await supabase.from('workout_days').delete().eq('weekly_program_id', newWeek.id);
  await construirDias(newWeek, perfil, availableExercises, volumenObjetivo, {
    factorInt,
    sistemaProgresion: sistema,
    deloadPorBasico
  });

  return newWeek;
}

// ------------------------------------------------------
// 3. CONSTRUIR DÍAS (BATCH INSERT OPTIMIZADO)
// ------------------------------------------------------
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

  const frecuenciaGrupo = {};
  for (let d = 0; d < diasNombres.length; d++) {
    const enfoque = getDayFocus(d);
    (enfoqueGrupos[enfoque] || []).forEach(g => frecuenciaGrupo[g] = (frecuenciaGrupo[g] || 0) + 1);
  }

  const volumenDiario = {};
  for (const [grupo, volTotal] of Object.entries(volumenObjetivo)) {
    if (frecuenciaGrupo[grupo]) volumenDiario[grupo] = Math.max(1, Math.round(volTotal / frecuenciaGrupo[grupo]));
  }

  const dupCiclo = ['fuerza', 'volumen', 'potencia'];
  let dupIndex = 0;
  let wupPhase = 'hipertrofia';
  if (sistemaProgresion === 'wup') {
    const fases = ['hipertrofia', 'fuerza', 'pico', 'descarga'];
    wupPhase = fases[(weekProgram.week_number - 1) % 4];
  }

  // Arrays para batch insert
  const diasParaInsertar = [];
  const ejerciciosParaInsertar = [];

  for (let d = 0; d < diasNombres.length; d++) {
    const enfoque = getDayFocus(d);
    let dupType = null;
    if (sistemaProgresion === 'dup') {
      dupType = dupCiclo[dupIndex % 3];
      dupIndex++;
    }

    const diaTempId = `temp_${d}`;
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

  // Inserción masiva de días
  const { data: diasInsertados } = await supabase
    .from('workout_days')
    .insert(diasParaInsertar.map(({ temp_id, ...rest }) => rest))
    .select('id, day_number');

  if (!diasInsertados) throw new Error('Error insertando días');

  // Mapeo de IDs temporales a reales
  const ejerciciosFinales = ejerciciosParaInsertar.map(ej => {
    const diaReal = diasInsertados.find((_, idx) => `temp_${idx}` === ej.dia_temp_id);
    if (!diaReal) throw new Error('No se encontró día para ejercicio');
    return {
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
    };
  });

  // Inserción masiva de ejercicios
  if (ejerciciosFinales.length > 0) {
    const { error } = await supabase.from('workout_exercises').insert(ejerciciosFinales);
    if (error) console.error('Error insertando ejercicios:', error);
  }
}

// ------------------------------------------------------
// FUNCIONES AUXILIARES
// ------------------------------------------------------
function getRepRange(ejercicio, objetivo, dupType, wupPhase) {
  if (dupType === 'fuerza') return REP_RANGES.dup_fuerza;
  if (dupType === 'volumen') return REP_RANGES.dup_volumen;
  if (dupType === 'potencia') return REP_RANGES.dup_potencia;
  if (wupPhase === 'hipertrofia') return REP_RANGES.wup_hipertrofia;
  if (wupPhase === 'fuerza') return REP_RANGES.wup_fuerza;
  if (wupPhase === 'pico') return REP_RANGES.wup_pico;
  if (wupPhase === 'descarga') return REP_RANGES.wup_descarga;

  if (ejercicio.es_basico) {
    if (objetivo === 'fuerza') return REP_RANGES.basico_fuerza;
    return REP_RANGES.basico_hipertrofia;
  } else if (ejercicio.tipo.startsWith('multi')) {
    return REP_RANGES.alta_demanda_axial;
  } else {
    return REP_RANGES.aislado_hipertrofia;
  }
}

function getRpeTarget(ejercicio, objetivo, dupType, wupPhase, factorInt = 1.0) {
  let rpeBase = 7.5;
  if (ejercicio.es_basico || ejercicio.tipo.startsWith('multi')) rpeBase = 7.5;
  else rpeBase = 8.5;

  if (dupType === 'fuerza') rpeBase = 8.5;
  else if (dupType === 'volumen') rpeBase = 7.0;
  else if (dupType === 'potencia') rpeBase = 5.5;
  if (wupPhase === 'hipertrofia') rpeBase = 8.0;
  else if (wupPhase === 'fuerza') rpeBase = 8.5;
  else if (wupPhase === 'pico') rpeBase = 9.5;
  else if (wupPhase === 'descarga') rpeBase = 6.0;

  const rpe = Math.round(rpeBase * factorInt * 10) / 10;
  return { target: rpe, rir: Math.max(0, Math.round((10 - rpe) * 10) / 10) };
}

function mapearBasico(nombre) {
  const map = {
    'Sentadilla libre trasera': 'sentadilla',
    'Peso muerto convencional': 'peso_muerto',
    'Press de banca plano con barra': 'press_banca'
  };
  return map[nombre] || 'press_banca';
}
