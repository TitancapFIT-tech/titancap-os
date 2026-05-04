// =====================================================
// TitanCap.OS - js/workout.js (v3.2 - Auditoría final)
// Renderizado de día de entrenamiento, registro de
// series, e1RM, Stress Index y feedback sensorial.
// =====================================================

import { supabase } from './supabase-client.js';
import { getWorkoutExercises, getWorkoutSets, saveWorkoutSet } from './supabase-client.js';
import { calcularStressIndex } from './generator.js'; // fórmula centralizada
import { calcularE1RM, sugerirPeso } from './erm.js';
import { showScreen } from './nav.js';

let currentDayId = null;

/**
 * Renderiza el día de entrenamiento completo con pesos sugeridos,
 * Stress Index en tiempo real y listeners interactivos.
 * @param {string} dayId - UUID del workout_day
 */
export async function renderWorkoutDay(dayId) {
  currentDayId = dayId;

  // 1. Obtener datos del día y ejercicios asignados (con detalles del ejercicio)
  const { data: dayData, error: dayError } = await supabase
    .from('workout_days')
    .select('*, weekly_programs(week_number, progression_system)')
    .eq('id', dayId)
    .single();

  if (dayError) {
    console.error('Error cargando día:', dayError);
    return;
  }

  const exercises = await getWorkoutExercises(dayId);
  // exercises ya incluye el join con exercises(*) gracias a getWorkoutExercises

  // 2. Obtener todas las series de una vez
  const exerciseIds = exercises.map(ex => ex.id);
  const allSets = await getWorkoutSets(exerciseIds);

  // Agrupar sets por ejercicio
  const setsPorEjercicio = {};
  allSets.forEach(s => {
    if (!setsPorEjercicio[s.workout_exercise_id]) {
      setsPorEjercicio[s.workout_exercise_id] = [];
    }
    setsPorEjercicio[s.workout_exercise_id].push(s);
  });

  // 3. Título
  document.getElementById('dia-titulo').textContent =
    `Día ${dayData.day_number} · ${dayData.enfoque || ''}`;

  // 4. Renderizar cada ejercicio
  const container = document.getElementById('ejercicios-container');
  container.innerHTML = '';

  const { data: { user } } = await supabase.auth.getUser();

  for (const ex of exercises) {
    const block = document.createElement('div');
    block.className = 'exercise-block';
    block.dataset.exerciseId = ex.id;
    block.dataset.tipo = ex.exercises.tipo;
    block.dataset.esBasico = ex.exercises.es_basico ? 'true' : 'false';
    block.dataset.nombreEjercicio = ex.exercises.nombre;

    const setsDeEsteEjercicio = setsPorEjercicio[ex.id] || [];

    // Peso sugerido para básicos: usar último e1RM disponible
    let pesoSugerido = ex.peso_sugerido || null;
    if (ex.exercises.es_basico && user) {
      try {
        const ultimoE1RM = await obtenerUltimoE1RM(user.id, ex.exercise_id);
        if (ultimoE1RM && ultimoE1RM > 0) {
          const repsMedio = Math.round((ex.reps_min + ex.reps_max) / 2);
          pesoSugerido = sugerirPeso(ultimoE1RM, repsMedio, ex.rir_objetivo || 2);
        }
      } catch (e) { /* ignorar */ }
    }

    // Construir HTML de cada serie
    const setsHtml = Array.from({ length: ex.series_objetivo }, (_, i) => {
      const setNumber = i + 1;
      const existingSet = setsDeEsteEjercicio.find(s => s.set_number === setNumber);
      const pesoValor = existingSet?.peso_kg || (i === 0 && pesoSugerido ? pesoSugerido : '');
      const repsValor = existingSet?.reps_completadas || '';
      const rpeValor = existingSet?.rpe_reportado || ex.rpe_objetivo || '';
      const checkedClass = existingSet?.completed ? 'checked' : '';

      return `
        <div class="set-row" data-set="${setNumber}">
          <span class="set-label">S${setNumber}</span>
          <input type="number" class="weight-input" placeholder="${i === 0 && pesoSugerido ? `${pesoSugerido} kg` : 'kg'}"
            value="${pesoValor}" step="0.5" min="0" max="500">
          <input type="number" class="reps-input" placeholder="Reps"
            value="${repsValor}" min="0" max="${ex.reps_max + 5}">
          <input type="number" class="rpe-input" placeholder="RPE"
            value="${rpeValor}" step="0.5" min="5" max="10">
          <div class="check-btn ${checkedClass}" data-set="${setNumber}"></div>
        </div>
      `;
    }).join('');

    // Calcular Stress Index total actual para mostrar
    const stressTotal = setsDeEsteEjercicio
      .filter(s => s.completed)
      .reduce((sum, s) => sum + (s.stress_index || 0), 0);

    block.innerHTML = `
      <h3>${ex.exercises.nombre} ${ex.exercises.es_basico ? '⭐' : ''}</h3>
      <p class="meta">
        ${ex.series_objetivo} series · ${ex.reps_min}-${ex.reps_max} reps · 
        RPE ${ex.rpe_objetivo} · RIR ${ex.rir_objetivo}
        ${ex.dup_type ? `· DUP: ${ex.dup_type}` : ''}
        ${ex.wup_phase ? `· Fase: ${ex.wup_phase}` : ''}
        ${pesoSugerido && pesoSugerido > 0 ? `· Sugerido: ${pesoSugerido} kg` : ''}
      </p>
      <div class="sets-container">${setsHtml}</div>
      <div class="stress-indicator" style="font-size:0.75rem;color:#aaa;margin-top:6px;">
        Stress Index: <span id="stress-${ex.id}">${stressTotal.toFixed(1)}</span>
      </div>
    `;
    container.appendChild(block);
  }

  // 5. Activar todos los eventos
  attachAllListeners(dayId, exercises);
}

/**
 * Conecta eventos de checkboxes, inputs y botones de finalización.
 */
function attachAllListeners(dayId, exercises) {
  // Click en check de serie
  document.querySelectorAll('.check-btn').forEach(btn => {
    btn.addEventListener('click', async function () {
      const setRow = this.closest('.set-row');
      const setNumber = parseInt(setRow.dataset.set);
      const exerciseBlock = this.closest('.exercise-block');
      const exerciseId = exerciseBlock.dataset.exerciseId;
      const tipo = exerciseBlock.dataset.tipo;
      const esBasico = exerciseBlock.dataset.esBasico === 'true';

      const weight = parseFloat(setRow.querySelector('.weight-input').value) || 0;
      const reps = parseInt(setRow.querySelector('.reps-input').value) || 0;
      const rpe = parseFloat(setRow.querySelector('.rpe-input').value) || 7;

      // Validaciones
      if (weight <= 0 || reps <= 0) {
        playErrorSound();
        alert('Introduce peso y repeticiones antes de marcar como completado.');
        return;
      }
      if (weight > 500 || reps > 50) {
        playErrorSound();
        alert('Valores poco realistas. Revisa peso o repeticiones.');
        return;
      }

      const rir = Math.max(0, Math.round((10 - rpe) * 10) / 10); // RPE a RIR aproximado

      // Calcular e1RM si es básico
      const e1rm = esBasico ? calcularE1RM(weight, reps, rir) : null;

      // Stress Index de esta serie específica (usando la fórmula redondeada)
      const stress = calcularStressIndex(tipo, rir);

      // Alternar estado visual
      this.classList.toggle('checked');
      const completed = this.classList.contains('checked');

      // Guardar en BD mediante el helper centralizado
      const setData = {
        workout_exercise_id: exerciseId,
        set_number: setNumber,
        reps_completadas: reps,
        peso_kg: weight,
        rpe_reportado: rpe,
        rir_reportado: rir,
        completed: completed,
        e1rm_estimado: e1rm,
        stress_index: completed ? stress : 0
      };

      const savedSet = await saveWorkoutSet(setData);
      if (!savedSet) {
        playErrorSound();
        this.classList.toggle('checked'); // revertir cambio visual
        return;
      }

      playCheckSound();

      // Actualizar el display del Stress Index del ejercicio
      await actualizarStressDisplay(exerciseId, tipo);
    });
  });

  // Recalcular Stress al cambiar manualmente peso/reps/rpe
  document.querySelectorAll('.weight-input, .reps-input, .rpe-input').forEach(input => {
    input.addEventListener('change', function () {
      const exerciseBlock = this.closest('.exercise-block');
      if (exerciseBlock) {
        actualizarStressDisplay(exerciseBlock.dataset.exerciseId, exerciseBlock.dataset.tipo);
      }
    });
  });

  // Botón "Finalizar Día"
  const btnFinalizar = document.getElementById('btn-finalizar-dia');
  if (btnFinalizar) {
    btnFinalizar.replaceWith(btnFinalizar.cloneNode(true)); // eliminar listeners previos
    document.getElementById('btn-finalizar-dia').addEventListener('click', async () => {
      const allChecks = document.querySelectorAll('.check-btn');
      const allChecked = Array.from(allChecks).every(cb => cb.classList.contains('checked'));

      if (!allChecked) {
        const confirmar = confirm('Hay series sin completar. ¿Finalizar día igualmente?');
        if (!confirmar) return;
      }

      // Marcar día como completado
      await supabase.from('workout_days')
        .update({ completed: true })
        .eq('id', dayId);

      // Verificar si la semana completa está terminada
      const { data: dayInfo } = await supabase
        .from('workout_days')
        .select('weekly_program_id')
        .eq('id', dayId)
        .single();

      const { data: allDays } = await supabase
        .from('workout_days')
        .select('completed')
        .eq('weekly_program_id', dayInfo.weekly_program_id);

      const semanaCompleta = allDays?.every(d => d.completed);

      if (semanaCompleta) {
        playCompletionSound();
        if (confirm('¡Semana completada! ¿Rellenar encuesta de fatiga?')) {
          const { openSurvey } = await import('./survey.js');
          openSurvey(dayInfo.weekly_program_id);
        }
      }

      showScreen('dashboard-screen');
    });
  }

  // Botón "Volver"
  const btnBack = document.getElementById('btn-back');
  if (btnBack) {
    btnBack.replaceWith(btnBack.cloneNode(true));
    document.getElementById('btn-back').addEventListener('click', () => {
      showScreen('dashboard-screen');
    });
  }
}

/**
 * Recalcula el Stress Index total del ejercicio usando los datos en BD
 * y actualiza el span correspondiente.
 */
async function actualizarStressDisplay(exerciseId, tipo) {
  const sets = await getWorkoutSets(exerciseId);
  // getWorkoutSets solo devuelve los sets de ese exercise, ordenados
  const total = sets
    .filter(s => s.completed)
    .reduce((sum, s) => sum + (s.stress_index || 0), 0);

  const span = document.getElementById(`stress-${exerciseId}`);
  if (span) {
    span.textContent = total.toFixed(1);
    span.style.color = total > 4 ? '#ff9800' : '#30d158';
  }
}

// ------------------------------------------------------
// SONIDOS DE FEEDBACK (auditivos, no bloqueantes)
// ------------------------------------------------------

function playCheckSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1100, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  } catch (e) { /* sin audio */ }
}

function playErrorSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'square';
    osc.frequency.setValueAtTime(400, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
  } catch (e) { /* sin audio */ }
}

function playCompletionSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, ctx.currentTime);
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  } catch (e) { /* sin audio */ }
}

/**
 * Función privada para obtener el último e1RM de un ejercicio (reutilizada de erm.js,
 * pero adaptada al contexto del workout donde necesitamos el dato para sugerencia).
 */
async function obtenerUltimoE1RM(userId, exerciseId) {
  const { data } = await supabase
    .from('workout_sets')
    .select('e1rm_estimado')
    .filter('workout_exercises.exercise_id', 'eq', exerciseId)
    .not('e1rm_estimado', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.e1rm_estimado || null;
}
