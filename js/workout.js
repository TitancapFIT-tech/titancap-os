// =====================================================
// TitanCap.OS - js/workout.js (v2 - Back + Finish + UI)
// =====================================================

import { supabase } from './supabase-client.js';
import { STRESS_INDEX_COEFFICIENTS } from './config.js';
import { showScreen } from './nav.js'; // <-- IMPORTANTE para navegar

let currentDayId = null;

/**
 * Renderiza el día de entrenamiento y activa los listeners
 */
export async function renderWorkoutDay(dayId) {
  currentDayId = dayId;

  // Obtener datos del día
  const { data: dayData } = await supabase
    .from('workout_days')
    .select('*, weekly_programs(week_number)')
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

    // Series ya registradas
    const { data: sets } = await supabase
      .from('workout_sets')
      .select('*')
      .eq('workout_exercise_id', ex.id)
      .order('set_number');

    const setsHtml = Array.from({ length: ex.series_objetivo }, (_, i) => {
      const setNumber = i + 1;
      const existingSet = sets?.find(s => s.set_number === setNumber);
      return `
        <div class="set-row" data-set="${setNumber}">
          <span class="set-label">S${setNumber}</span>
          <input type="number" class="weight-input" placeholder="kg"
            value="${existingSet?.peso_kg || ''}" step="0.5">
          <input type="number" class="reps-input" placeholder="Reps"
            value="${existingSet?.reps_completadas || ''}">
          <input type="number" class="rpe-input" placeholder="RPE"
            value="${existingSet?.rpe_reportado || ex.rpe_objetivo || ''}"
            step="0.5" min="5" max="10">
          <div class="check-btn ${existingSet?.completed ? 'checked' : ''}" data-set="${setNumber}"></div>
        </div>
      `;
    }).join('');

    block.innerHTML = `
      <h3>${ex.exercises.nombre}</h3>
      <p class="meta">${ex.series_objetivo} series · ${ex.reps_min}-${ex.reps_max} reps · RIR ${ex.rir_objetivo}</p>
      <div class="sets-container">${setsHtml}</div>
      <div class="stress-indicator" style="font-size:0.75rem;color:#aaa;margin-top:6px;">
        Stress Index: <span id="stress-${ex.id}">--</span>
      </div>
    `;
    container.appendChild(block);

    // Calcular stress index inicial
    updateStressIndex(ex.id, ex.exercises.tipo);
  }

  // Activar listeners de interacción
  attachAllListeners(dayId);
}

/**
 * Conecta los eventos de checkboxes, inputs y botones
 */
function attachAllListeners(dayId) {
  // 1. Botones de check por serie
  document.querySelectorAll('.check-btn').forEach(btn => {
    btn.addEventListener('click', async function () {
      this.classList.toggle('checked');
      playCheckSound();

      const setRow = this.closest('.set-row');
      const setNumber = parseInt(setRow.dataset.set);
      const exerciseId = this.closest('.exercise-block').dataset.exerciseId;

      const weight = parseFloat(setRow.querySelector('.weight-input').value) || 0;
      const reps = parseInt(setRow.querySelector('.reps-input').value) || 0;
      const rpe = parseFloat(setRow.querySelector('.rpe-input').value) || 7;

      if (weight <= 0 || reps <= 0) {
        alert('Introduce peso y repeticiones antes de marcar como completado.');
        this.classList.remove('checked');
        return;
      }

      const rir = Math.max(0, 10 - rpe);

      // Upsert automático en workout_sets
      await supabase
        .from('workout_sets')
        .upsert({
          workout_exercise_id: exerciseId,
          set_number: setNumber,
          reps_completadas: reps,
          peso_kg: weight,
          rpe_reportado: rpe,
          rir_reportado: rir,
          completed: this.classList.contains('checked')
        }, { onConflict: 'workout_exercise_id, set_number' });

      updateStressIndex(exerciseId);
    });
  });

  // 2. Recalcular stress al cambiar peso/reps/rpe
  document.querySelectorAll('.weight-input, .reps-input, .rpe-input').forEach(input => {
    input.addEventListener('change', function () {
      const exerciseId = this.closest('.exercise-block')?.dataset.exerciseId;
      if (exerciseId) updateStressIndex(exerciseId);
    });
  });

  // 3. Botón "Día Completado"
  const btnFinalizar = document.getElementById('btn-finalizar-dia');
  if (btnFinalizar) {
    btnFinalizar.replaceWith(btnFinalizar.cloneNode(true)); // limpiar listeners previos
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

      // Volver al dashboard (se actualizará automáticamente)
      showScreen('dashboard-screen');
    });
  }

  // 4. Botón "Volver" (back) - CORREGIDO
  const btnBack = document.getElementById('btn-back');
  if (btnBack) {
    btnBack.replaceWith(btnBack.cloneNode(true)); // limpiar listeners previos
    document.getElementById('btn-back').addEventListener('click', () => {
      showScreen('dashboard-screen');
    });
  }
}

/**
 * Calcula y muestra el índice de estrés de un ejercicio
 */
async function updateStressIndex(exerciseId) {
  const { data: sets } = await supabase
    .from('workout_sets')
    .select('rir_reportado')
    .eq('workout_exercise_id', exerciseId);

  const { data: exInfo } = await supabase
    .from('workout_exercises')
    .select('*, exercises(tipo)')
    .eq('id', exerciseId)
    .single();

  if (!exInfo) return;

  const tipo = exInfo.exercises.tipo;
  const coef = STRESS_INDEX_COEFFICIENTS[tipo] || STRESS_INDEX_COEFFICIENTS.mono_maquina;
  let total = 0;

  if (sets && sets.length > 0) {
    sets.forEach(s => {
      const rir = s.rir_reportado != null ? s.rir_reportado : 2;
      total += Math.max(0.1, coef.intercept + coef.slope * rir);
    });
  }

  const span = document.getElementById(`stress-${exerciseId}`);
  if (span) {
    span.textContent = total.toFixed(1);
    span.style.color = total > 4 ? '#e53935' : '#4caf50';
  }
}

/**
 * Efecto de sonido al marcar un check
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
