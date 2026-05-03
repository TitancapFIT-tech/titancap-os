// =====================================================
// TitanCap.OS - js/generator.js
// Motor de periodización: genera semanas de entrenamiento
// =====================================================

import { supabase } from './supabase-client.js';
import {
  VOLUME_TABLE,
  BASELINE_HYPERTROPHY,
  STRESS_INDEX_COEFFICIENTS,
  SPLIT_PATTERNS,
  REP_RANGES,
  ADJUSTMENT_FACTORS,
  INTERDEPENDENCIA_FATIGA,
  EXERCISE_PRIORITIES,
  DELOAD_RULES
} from './config.js';

// Determinar nivel del atleta
function determinarNivel(meses) {
  if (meses < 12) return 'principiante';
  if (meses < 24) return 'intermedio';
  return 'avanzado';
}

// Calcular volumen base para un ejercicio básico
function calcularVolumenBasico(ejercicio, perfil) {
  const base = BASELINE_HYPERTROPHY[ejercicio] || 0;
  if (base === 0) return 0;
  let ajuste = 0;

  // Género
  if (perfil.genero === 'femenino') ajuste += ADJUSTMENT_FACTORS.genero.femenino;
  // Peso
  if (perfil.peso_kg < ADJUSTMENT_FACTORS.peso.ligero.umbral) ajuste += ADJUSTMENT_FACTORS.peso.ligero.ajuste;
  else if (perfil.peso_kg > ADJUSTMENT_FACTORS.peso.superpesado.umbral) ajuste += ADJUSTMENT_FACTORS.peso.superpesado.ajuste;
  // Estatura
  if (perfil.estatura_cm < ADJUSTMENT_FACTORS.estatura.baja.umbral) ajuste += ADJUSTMENT_FACTORS.estatura.baja.ajuste;
  else if (perfil.estatura_cm > ADJUSTMENT_FACTORS.estatura.alta.umbral) ajuste += ADJUSTMENT_FACTORS.estatura.alta.ajuste;
  // Experiencia avanzada (>12 años)
  if (perfil.experiencia_entrenamiento_meses > ADJUSTMENT_FACTORS.experiencia_avanzada.anios * 12)
    ajuste += ADJUSTMENT_FACTORS.experiencia_avanzada.ajuste;
  // Edad
  if (perfil.edad < ADJUSTMENT_FACTORS.edad.joven.umbral) ajuste += ADJUSTMENT_FACTORS.edad.joven.ajuste;
  else if (perfil.edad > ADJUSTMENT_FACTORS.edad.mayor.umbral) ajuste += ADJUSTMENT_FACTORS.edad.mayor.ajuste;
  // Estilo de vida (dieta y sueño)
  if (perfil.dieta === 'superavit' && perfil.horas_sueno_promedio > 7.5) ajuste += ADJUSTMENT_FACTORS.estilo_vida.optimo.ajuste;
  else if (perfil.horas_sueno_promedio < 6 || perfil.dieta === 'deficit') ajuste += ADJUSTMENT_FACTORS.estilo_vida.estresado.ajuste;

  return Math.max(4, Math.round(base + ajuste));
}

// Calcular volumen semanal para un grupo muscular no básico
function calcularVolumenGrupo(grupo, nivel, perfil) {
  const range = VOLUME_TABLE[grupo][nivel];
  // Empezar en el mínimo del rango conservador, MV
  let vol = range.MV[0];
  // Si dieta es superávit, podemos subir un poco más
  if (perfil.dieta === 'superavit') vol = range.ideal[0];
  else if (perfil.dieta === 'deficit') vol = Math.max(2, range.MV[0] - 2);
  // Ajustes por sueño y estrés
  if (perfil.horas_sueno_promedio > 7.5) vol = Math.min(vol + 1, range.MRV[1] * 0.8);
  else if (perfil.horas_sueno_promedio < 6) vol = Math.max(2, vol - 1);
  return vol;
}

// Generar la primera semana de entrenamiento
export async function generateFirstWeek(userId) {
  // Obtener perfil
  const { data: perfil, error: perfilError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (perfilError || !perfil) throw new Error('Perfil no encontrado');

  // Obtener equipamiento disponible
  const { data: equipment } = await supabase
    .from('user_equipment')
    .select('exercise_id, exercises(*)')
    .eq('user_id', userId);
  const availableExercises = equipment.map(e => e.exercises);

  const nivel = determinarNivel(perfil.experiencia_entrenamiento_meses);
  const dias = perfil.dias_disponibles;
  const tiempoSesion = perfil.tiempo_por_sesion_min;
  const objetivo = perfil.objetivo;

  // 1. Determinar split
  const splitConfig = SPLIT_PATTERNS[dias] || SPLIT_PATTERNS[4];
  const splitType = splitConfig.type;

  // 2. Calcular volúmenes objetivo por grupo
  const volumenObjetivo = {};
  const grupos = [
    'pecho', 'espalda', 'deltoides', 'cuadriceps', 'isquios',
    'gluteos', 'biceps', 'triceps', 'pantorrilla', 'abdomen', 'antebrazo'
  ];
  grupos.forEach(grupo => {
    volumenObjetivo[grupo] = calcularVolumenGrupo(grupo, nivel, perfil);
  });

  // 3. Calcular volúmenes de básicos y reemplazar en los grupos principales
  const basicosNombres = ['sentadilla', 'press_banca', 'peso_muerto'];
  const basicosVol = {};
  basicosNombres.forEach(nombre => {
    basicosVol[nombre] = calcularVolumenBasico(nombre, perfil);
  });

  // Mapear básicos a grupos
  volumenObjetivo['cuadriceps'] = Math.max(volumenObjetivo['cuadriceps'], basicosVol.sentadilla);
  volumenObjetivo['pecho'] = Math.max(volumenObjetivo['pecho'], basicosVol.press_banca);
  volumenObjetivo['espalda'] = Math.max(volumenObjetivo['espalda'], basicosVol.peso_muerto);

  // Aplicar interdependencia de fatiga
  if (volumenObjetivo['pecho'] > 10) {
    volumenObjetivo['triceps'] = Math.round(volumenObjetivo['triceps'] * 0.7);
    volumenObjetivo['deltoides'] = Math.round(volumenObjetivo['deltoides'] * 0.8);
  }
  if (volumenObjetivo['espalda'] > 12 && basicosVol.peso_muerto > 8) {
    volumenObjetivo['isquios'] = Math.round(volumenObjetivo['isquios'] * 0.7);
  }

  // 4. Crear la semana en la base de datos
  const today = new Date();
  const { data: weekProgram, error: weekError } = await supabase
    .from('weekly_programs')
    .insert({
      user_id: userId,
      week_number: 1,
      fecha_inicio: today.toISOString().split('T')[0],
      type: 'normal',
      split_type: splitType
    })
    .select()
    .single();
  if (weekError) throw weekError;

  // 5. Generar días y ejercicios según split
  const days = splitConfig.days;
  const volumenPorDia = {};
  const frecuenciaSemanal = {};
  // Contar cuántas veces aparece un grupo muscular en el split
  // Definimos mapeo de enfoque de cada día a grupos musculares
  // Esto depende del split. Implementaremos un mapeo flexible.

  // Función para asignar enfoque a un día según el split
  function getDayFocus(dayIndex) {
    if (splitType === 'full_body' || splitType === 'full_body_alt') return 'full_body';
    if (splitType === 'torso_pierna') {
      return dayIndex % 2 === 0 ? 'torso' : 'pierna';
    }
    if (splitType === 'ppl' || splitType === 'ppl_modificado') {
      const pattern = ['push', 'pull', 'legs', 'push', 'pull', 'legs'];
      return pattern[dayIndex % pattern.length];
    }
    return 'full_body';
  }

  // Mapa de grupos musculares involucrados en cada enfoque
  const enfoqueGrupos = {
    full_body: ['pecho', 'espalda', 'deltoides', 'cuadriceps', 'isquios', 'biceps', 'triceps', 'pantorrilla', 'abdomen'],
    torso: ['pecho', 'espalda', 'deltoides', 'biceps', 'triceps'],
    pierna: ['cuadriceps', 'isquios', 'gluteos', 'pantorrilla', 'abdomen'],
    push: ['pecho', 'deltoides', 'triceps'],
    pull: ['espalda', 'biceps', 'antebrazo'],
    legs: ['cuadriceps', 'isquios', 'gluteos', 'pantorrilla']
  };

  // Contar frecuencia semanal por grupo
  const frecuenciaGrupo = {};
  for (let d = 0; d < days.length; d++) {
    const enfoque = getDayFocus(d);
    const gruposDia = enfoqueGrupos[enfoque] || enfoqueGrupos.full_body;
    gruposDia.forEach(g => {
      frecuenciaGrupo[g] = (frecuenciaGrupo[g] || 0) + 1;
    });
  }

  // Volumen diario por grupo: volumen total / frecuencia, redondeado
  const volumenDiario = {};
  for (const [grupo, volTotal] of Object.entries(volumenObjetivo)) {
    if (frecuenciaGrupo[grupo]) {
      volumenDiario[grupo] = Math.max(1, Math.round(volTotal / frecuenciaGrupo[grupo]));
    }
  }

  // 6. Para cada día, seleccionar ejercicios, asignar series y reps
  for (let d = 0; d < days.length; d++) {
    const diaNumber = d + 1;
    const enfoque = getDayFocus(d);
    const { data: diaProgram, error: diaError } = await supabase
      .from('workout_days')
      .insert({
        weekly_program_id: weekProgram.id,
        day_number: diaNumber,
        enfoque: enfoque
      })
      .select()
      .single();
    if (diaError) throw diaError;

    const gruposDia = enfoqueGrupos[enfoque] || enfoqueGrupos.full_body;
    // Seleccionar ejercicios disponibles para los grupos del día
    const ejerciciosAsignados = [];
    for (const grupo of gruposDia) {
      if (!volumenDiario[grupo] || volumenDiario[grupo] <= 0) continue;
      const ejerciciosDisponibles = availableExercises.filter(
        ex => ex.grupo_muscular === grupo
      );
      if (ejerciciosDisponibles.length === 0) continue;

      // Ordenar por prioridad (según EXERCISE_PRIORITIES)
      const prioridades = EXERCISE_PRIORITIES[grupo] || [];
      ejerciciosDisponibles.sort((a, b) => {
        const idxA = prioridades.indexOf(a.nombre);
        const idxB = prioridades.indexOf(b.nombre);
        if (idxA === -1) return 1;
        if (idxB === -1) return -1;
        return idxA - idxB;
      });

      // Tomar 1-2 ejercicios por grupo por día dependiendo del volumen disponible
      const numEjercicios = Math.min(2, ejerciciosDisponibles.length);
      let seriesRestantes = volumenDiario[grupo];
      for (let i = 0; i < numEjercicios && seriesRestantes > 0; i++) {
        const ejercicio = ejerciciosDisponibles[i];
        let series;
        if (ejercicio.es_basico) {
          series = Math.min(4, seriesRestantes); // básicos hasta 4 series
        } else {
          series = Math.min(3, seriesRestantes); // aislados hasta 3 series
        }
        series = Math.max(1, series);
        ejerciciosAsignados.push({
          exercise_id: ejercicio.id,
          ejercicio,
          series,
          repsRange: getRepRange(ejercicio, objetivo),
          rpe: getRpeTarget(ejercicio, objetivo)
        });
        seriesRestantes -= series;
      }
    }

    // Insertar ejercicios del día
    let orden = 1;
    for (const asig of ejerciciosAsignados) {
      const repsRange = asig.repsRange;
      await supabase.from('workout_exercises').insert({
        workout_day_id: diaProgram.id,
        exercise_id: asig.exercise_id,
        series_objetivo: asig.series,
        reps_min: repsRange.min,
        reps_max: repsRange.max,
        rpe_objetivo: asig.rpe.target,
        rir_objetivo: asig.rpe.rir,
        orden: orden++
      });
    }
  }

  return weekProgram;
}

// Obtener rango de repeticiones según tipo de ejercicio y objetivo
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

// Obtener RPE/RIR objetivo según tipo de ejercicio
function getRpeTarget(ejercicio, objetivo) {
  if (ejercicio.es_basico || ejercicio.tipo.startsWith('multi')) {
    // Básicos lejos del fallo para control de fatiga
    return { target: 7.5, rir: 2.5 };
  } else {
    // Aislados más cerca del fallo
    return { target: 8.5, rir: 1.5 };
  }
}
