// =====================================================
// TitanCap.OS - js/workout.js
// Visualización diaria y registro interactivo de series
// =====================================================

import { supabase } from './supabase-client.js';
import { STRESS_INDEX_COEFFICIENTS } from './config.js';

let currentDayId = null;

// Renderizar día de entrenamiento
export async function renderWorkoutDay(dayId) {
  currentDayId = dayId;

  // Obtener datos del día
  const { data: dayData } = await supabase
    .from('workout_days')
    .select('*, weekly_programs(week_number)')
    .eq('id', dayId)
    .single();

  // Obtener ejercicios asignados a este día
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

  // Renderizar lista de ejercicios
  const container = document.getElementById('ejercicios-container');
  container.innerHTML = '';

  for (const ex of exercises) {
    const block = document.createElement('div');
    block.className = 'exercise-block';
    block.dataset.exerciseId = ex.id;

    // Obtener series ya registradas para este ejercicio
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
          <div class="check-btn ${existingSet?.completed ? 'checked' : ''}"
            data-set="${setNumber}"></div>
        </div>
      `;
    }).join('');

    block.innerHTML = `
      <h3>${ex.exercises.nombre}</h3>
      <p class="meta">${ex.series_objetivo} series · ${ex.reps_min}-${ex.reps_max} reps · RIR ${ex.rir_objetivo}</p>
      <div class="sets-container">
        ${setsHtml}
      </div>
      <div class="stress-indicator" style="font-size:0.75rem;color:#aaa;margin-top:6px;">
        Stress Index: <span id="stress-${ex.id}">--</span>
      </div>
    `;
    container.appendChild(block);

    // Actualizar stress index inicial
    updateStressIndex(ex.id, ex.exercises.tipo, ex.series_objetivo);
  }

  // Event listeners para checks y inputs
  attachListeners(dayId);
}

function attachListeners(dayId) {
  // Botones check
  document.querySelectorAll('.check-btn').forEach(btn => {
    btn.addEventListener('click', async function () {
      this.classList.toggle('checked');
      playCheckSound();

      const setRow = this.closest('.set-row');
      const setNumber = parseInt(setRow.dataset.set);
      const exerciseBlock = this.closest('.exercise-block');
      const exerciseId = exerciseBlock.dataset.exerciseId;

      const weight = parseFloat(setRow.querySelector('.weight-input').value) || 0;
      const reps = parseInt(setRow.querySelector('.reps-input').value) || 0;
      const rpe = parseFloat(setRow.querySelector('.rpe-input').value) || 7;

      if (weight <= 0 || reps <= 0) {
        alert('Introduce peso y repeticiones antes de marcar como completado.');
        this.classList.remove('checked');
        return;
      }

      const rir = Math.max(0, 10 - rpe);

      // Guardar o actualizar serie en Supabase
      const { data: existing } = await supabase
        .from('workout_sets')
        .select('id')
        .eq('workout_exercise_id', exerciseId)
        .eq('set_number', setNumber)
        .single();

      if (existing) {
        await supabase
          .from('workout_sets')
          .update({
            reps_completadas: reps,
            peso_kg: weight,
            rpe_reportado: rpe,
            rir_reportado: rir,
            completed: this.classList.contains('checked')
          })
          .eq('id', existing.id);
      } else {
        await supabase
          .from('workout_sets')
          .insert({
            workout_exercise_id: exerciseId,
            set_number: setNumber,
            reps_completadas: reps,
            peso_kg: weight,
            rpe_reportado: rpe,
            rir_reportado: rir,
            completed: this.classList.contains('checked')
          });
      }

      // Actualizar stress index
      const tipo = exerciseBlock.querySelector('.meta')?.dataset?.tipo;
      updateStressIndex(exerciseId, null, null);
    });
  });

  // Inputs de peso/reps/RPE actualizan automáticamente
  document.querySelectorAll('.weight-input, .reps-input, .rpe-input').forEach(input => {
    input.addEventListener('change', function () {
      const exerciseBlock = this.closest('.exercise-block');
      const exerciseId = exerciseBlock.dataset.exerciseId;
      updateStressIndex(exerciseId, null, null);
    });
  });

  // Botón Finalizar Día
  document.getElementById('btn-finalizar-dia').addEventListener('click', async () => {
    const allChecks = document.querySelectorAll('.check-btn');
    const allChecked = Array.from(allChecks).every(cb => cb.classList.contains('checked'));

    if (!allChecked) {
      const confirmar = confirm('Hay series sin completar. ¿Finalizar día igualmente?');
      if (!confirmar) return;
    }

    // Marcar día como completado
    await supabase
      .from('workout_days')
      .update({ completed: true })
      .eq('id', dayId);

    // Verificar si toda la semana está completada
    const { data: dayInfo } = await supabase
      .from('workout_days')
      .select('weekly_program_id')
      .eq('id', dayId)
      .single();

    const { data: allDays } = await supabase
      .from('workout_days')
      .select('completed')
      .eq('weekly_program_id', dayInfo.weekly_program_id);

    const allDaysCompleted = allDays.every(d => d.completed);

    if (allDaysCompleted) {
      if (confirm('¡Has completado todos los días de esta semana! ¿Rellenar encuesta de fatiga?')) {
        showScreen('survey-modal');
      }
    }

    showScreen('dashboard-screen');
  });
}

// Calcular y mostrar el stress index de un ejercicio
async function updateStressIndex(exerciseId, tipoOverride, seriesOverride) {
  const { data: sets } = await supabase
    .from('workout_sets')
    .select('rir_reportado')
    .eq('workout_exercise_id', exerciseId);

  const { data: exerciseInfo } = await supabase
    .from('workout_exercises')
    .select('*, exercises(tipo)')
    .eq('id', exerciseId)
    .single();

  if (!exerciseInfo) return;

  const tipo = tipoOverride || exerciseInfo.exercises.tipo;
  const coef = STRESS_INDEX_COEFFICIENTS[tipo] || STRESS_INDEX_COEFFICIENTS.mono_libre;
  const totalSets = seriesOverride || exerciseInfo.series_objetivo;

  let totalStress = 0;
  if (sets) {
    sets.forEach(s => {
      const rir = s.rir_reportado || 2;
      const stress = Math.max(0.1, coef.intercept + coef.slope * rir);
      totalStress += stress;
    });
  } else {
    // Si no hay sets registrados, estimar con RIR objetivo
    const rirEst = exerciseInfo.rir_objetivo || 2;
    totalStress = totalSets * Math.max(0.1, coef.intercept + coef.slope * rirEst);
  }

  const span = document.getElementById(`stress-${exerciseId}`);
  if (span) {
    span.textContent = totalStress.toFixed(1);
    span.style.color = totalStress > 4 ? '#e53935' : '#4caf50';
  }
}

// Sonido de check
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
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.15);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  } catch (e) { /* silencioso */ }
}
