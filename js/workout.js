// =====================================================
// TitanCap.OS - js/workout.js (v3 - Auditoría Completa)
// Registro de entrenamiento con e1RM, Stress Index,
// pesos sugeridos, validaciones y feedback sonoro
// =====================================================

import { supabase } from './supabase-client.js';
import { STRESS_INDEX_COEFFICIENTS } from './config.js';
import { showScreen } from './nav.js';
import { calcularE1RM, sugerirPeso, guardarE1RMEnSerie, obtenerUltimoE1RM } from './erm.js';

let currentDayId = null;

/**
 * Renderiza el día de entrenamiento con pesos sugeridos,
 * calcula Stress Index en tiempo real y prepara listeners
 */
export async function renderWorkoutDay(dayId) {
  currentDayId = dayId;

  // Obtener datos del día
  const { data: dayData } = await supabase
    .from('workout_days')
    .select('*, weekly_programs(week_number, progression_system)')
    .eq('id', dayId)
    .single();

  // Obtener ejercicios asignados
  const { data: exercises, error } = await supabase
    .from('workout_exercises')
    .select('*, exercises(*)')
    .eq('workout_day_id', dayId)
    .order('orden');

  if (error) {
    console.error(error);
    return;
  }

  // Obtener TODOS los sets de una sola consulta (evitar N+1)
  const exerciseIds = exercises.map(ex => ex.id);
  const { data: allSets } = await supabase
    .from('workout_sets')
    .select('*')
    .in('workout_exercise_id', exerciseIds)
    .order('set_number');

  // Agrupar sets por ejercicio
  const setsPorEjercicio = {};
  if (allSets) {
    allSets.forEach(s => {
      if (!setsPorEjercicio[s.workout_exercise_id]) setsPorEjercicio[s.workout_exercise_id] = [];
      setsPorEjercicio[s.workout_exercise_id].push(s);
    });
  }

  // Título del día
  document.getElementById('dia-titulo').textContent =
    `Día ${dayData.day_number} · ${dayData.enfoque}`;

  // Contenedor de ejercicios
  const container = document.getElementById('ejercicios-container');
  container.innerHTML = '';

  for (const ex of exercises) {
    const block = document.createElement('div');
    block.className = 'exercise-block';
    block.dataset.exerciseId = ex.id;
    block.dataset.tipo = ex.exercises.tipo;
    block.dataset.esBasico = ex.exercises.es_basico ? 'true' : 'false';
    block.dataset.nombreEjercicio = ex.exercises.nombre;

    const sets = setsPorEjercicio[ex.id] || [];

    // Calcular e1RM previo para básicos y sugerir peso
    let pesoSugerido = ex.peso_sugerido || null;
    if (ex.exercises.es_basico) {
      const ultimoE1RM = await obtenerUltimoE1RM((await supabase.auth.getUser()).data.user.id, ex.exercise_id);
      if (ultimoE1RM && ultimoE1RM > 0) {
        const repsMedio = Math.round((ex.reps_min + ex.reps_max) / 2);
        pesoSugerido = sugerirPeso(ultimoE1RM, repsMedio, ex.rir_objetivo || 2);
      }
    }

    const setsHtml = Array.from({ length: ex.series_objetivo }, (_, i) => {
      const setNumber = i + 1;
      const existingSet = sets.find(s => s.set_number === setNumber);
      const pesoValor = existingSet?.peso_kg || (i === 0 && pesoSugerido ? pesoSugerido : '');
      const placeholderTexto = (i === 0 && pesoSugerido) ? `${pesoSugerido} kg sugerido` : 'kg';
      return `
        <div class="set-row" data-set="${setNumber}">
          <span class="set-label">S${setNumber}</span>
          <input type="number" class="weight-input" placeholder="${placeholderTexto}"
            value="${pesoValor}" step="0.5" min="0" max="500">
          <input type="number" class="reps-input" placeholder="Reps"
            value="${existingSet?.reps_completadas || ''}" min="0" max="${ex.reps_max + 5}">
          <input type="number" class="rpe-input" placeholder="RPE"
            value="${existingSet?.rpe_reportado || ex.rpe_objetivo || ''}"
            step="0.5" min="5" max="10">
          <div class="check-btn ${existingSet?.completed ? 'checked' : ''}" data-set="${setNumber}"></div>
        </div>
      `;
    }).join('');

    block.innerHTML = `
      <h3>${ex.exercises.nombre} ${ex.exercises.es_basico ? '⭐' : ''}</h3>
      <p class="meta">
        ${ex.series_objetivo} series · ${ex.reps_min}-${ex.reps_max} reps · 
        RPE ${ex.rpe_objetivo} · RIR ${ex.rir_objetivo}
        ${ex.dup_type ? `· DUP: ${ex.dup_type}` : ''}
        ${ex.wup_phase ? `· Fase: ${ex.wup_phase}` : ''}
        ${pesoSugerido && pesoSugerido > 0 ? `· Peso sugerido: ${pesoSugerido} kg` : ''}
      </p>
      <div class="sets-container">${setsHtml}</div>
      <div class="stress-indicator" style="font-size:0.75rem;color:#aaa;margin-top:6px;">
        Stress Index: <span id="stress-${ex.id}">${calcularStressLocal(sets, ex.exercises.tipo).toFixed(1)}</span>
      </div>
    `;
    container.appendChild(block);
  }

  // Activar listeners de interacción
  attachAllListeners(dayId, exercises);
}

/**
 * Calcula Stress Index para un ejercicio a partir de sus sets
 */
function calcularStressLocal(sets, tipo) {
  const coef = STRESS_INDEX_COEFFICIENTS[tipo] || STRESS_INDEX_COEFFICIENTS.mono_maquina;
  let total = 0;
  if (sets && sets.length > 0) {
    sets.forEach(s => {
      if (s.completed) {
        const rir = s.rir_reportado != null ? s.rir_reportado : 2;
        total += Math.max(0.1, coef.intercept + coef.slope * rir);
      }
    });
  }
  return total;
}

/**
 * Conecta los eventos de checkboxes, inputs y botones
 */
function attachAllListeners(dayId, exercises) {
  // 1. Botones de check por serie
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

      if (weight > 500) {
        playErrorSound();
        alert('El peso parece excesivo. Verifica el valor.');
        return;
      }

      if (reps > 50) {
        playErrorSound();
        alert('Las repeticiones parecen excesivas. Verifica el valor.');
        return;
      }

      const rir = Math.max(0, Math.round((10 - rpe) * 10) / 10);

      // Calcular e1RM si es básico
      let e1rm = null;
      if (esBasico) {
        e1rm = calcularE1RM(weight, reps, rir);
      }

      // Alternar estado checked
      this.classList.toggle('checked');
      playCheckSound();

      // Upsert en workout_sets
      const { data: upsertData, error } = await supabase
        .from('workout_sets')
        .upsert({
          workout_exercise_id: exerciseId,
          set_number: setNumber,
          reps_completadas: reps,
          peso_kg: weight,
          rpe_reportado: rpe,
          rir_reportado: rir,
          e1rm_estimado: e1rm,
          stress_index: calcularStressLocal([{ completed: this.classList.contains('checked'), rir_reportado: rir }], tipo),
          completed: this.classList.contains('checked')
        }, { onConflict: 'workout_exercise_id, set_number' })
        .select()
        .single();

      if (error) {
        console.error('Error guardando set:', error);
        playErrorSound();
        return;
      }

      // Guardar e1RM en la serie si corresponde
      if (esBasico && e1rm && upsertData) {
        await guardarE1RMEnSerie(upsertData.id, weight, reps, rir);
      }

      // Recalcular y mostrar Stress Index del ejercicio
      await updateStressIndex(exerciseId, tipo);
    });
  });

  // 2. Recalcular stress al cambiar peso/reps/rpe manualmente
  document.querySelectorAll('.weight-input, .reps-input, .rpe-input').forEach(input => {
    input.addEventListener('change', function () {
      const exerciseBlock = this.closest('.exercise-block');
      const exerciseId = exerciseBlock?.dataset.exerciseId;
      const tipo = exerciseBlock?.dataset.tipo;
      if (exerciseId) updateStressIndex(exerciseId, tipo);
    });
  });

  // 3. Botón "Día Completado"
  const btnFinalizar = document.getElementById('btn-finalizar-dia');
  if (btnFinalizar) {
    btnFinalizar.replaceWith(btnFinalizar.cloneNode(true));
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

      // Verificar si toda la semana está lista
      const { data: dayInfo } = await supabase
        .from('workout_days')
        .select('weekly_program_id')
        .eq('id', dayId)
        .single();

      const { data: allDays } = await supabase
        .from('workout_days')
        .select('completed')
        .eq('weekly_program_id', dayInfo.weekly_program_id);

      const semanaCompleta = allDays.every(d => d.completed);

      if (semanaCompleta) {
        if (confirm('¡Semana completada! ¿Rellenar encuesta de fatiga?')) {
          const { openSurvey } = await import('./survey.js');
          openSurvey(dayInfo.weekly_program_id);
        }
      }

      showScreen('dashboard-screen');
    });
  }

  // 4. Botón "Volver"
  const btnBack = document.getElementById('btn-back');
  if (btnBack) {
    btnBack.replaceWith(btnBack.cloneNode(true));
    document.getElementById('btn-back').addEventListener('click', () => {
      showScreen('dashboard-screen');
    });
  }
}

/**
 * Calcula y actualiza el Stress Index en pantalla para un ejercicio
 */
async function updateStressIndex(exerciseId, tipo) {
  const { data: sets } = await supabase
    .from('workout_sets')
    .select('rir_reportado, completed')
    .eq('workout_exercise_id', exerciseId);

  const coef = STRESS_INDEX_COEFFICIENTS[tipo] || STRESS_INDEX_COEFFICIENTS.mono_maquina;
  let total = 0;

  if (sets && sets.length > 0) {
    sets.forEach(s => {
      if (s.completed) {
        const rir = s.rir_reportado != null ? s.rir_reportado : 2;
        total += Math.max(0.1, coef.intercept + coef.slope * rir);
      }
    });
  }

  const span = document.getElementById(`stress-${exerciseId}`);
  if (span) {
    span.textContent = total.toFixed(1);
    span.style.color = total > 4 ? '#ff9800' : '#4caf50';
  }
}

/**
 * Efecto de sonido al marcar un check (éxito)
 */
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
  } catch (e) { /* silencioso */ }
}

/**
 * Efecto de sonido de error (validación fallida)
 */
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
  } catch (e) { /* silencioso */ }
}
