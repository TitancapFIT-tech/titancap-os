// =====================================================
// TitanCap.OS - js/survey.js (v3.2 – Auditoría final)
// Encuesta de fatiga post-semana, Stress Index semanal,
// deload reactivo (e1RM, fatiga subjetiva y correlación
// inversa SI vs e1RM), almacenamiento de MRV individual.
// =====================================================

import { supabase } from './supabase-client.js';
import {
  DELOAD_RULES,
  BASICO_GRUPO_MAP,
  FATIGA_DECISION_RULES
} from './config.js';
import { generateNextWeek } from './generator.js';
import { calcularStressIndex } from './generator.js'; // fórmula centralizada
import {
  obtenerHistorialE1RM,
  necesitaDeloadPorE1RM
} from './erm.js';
import { showScreen } from './nav.js';

let currentWeekId = null;

/**
 * Abre el modal con el formulario de encuesta de fatiga
 * para la semana recién completada.
 * @param {string} weekId – UUID del weekly_program.
 */
export async function openSurvey(weekId) {
  currentWeekId = weekId;
  const modal = document.getElementById('survey-modal');
  const formContainer = document.getElementById('survey-form');

  // Obtener número de semana para el título
  const { data: week } = await supabase
    .from('weekly_programs')
    .select('week_number')
    .eq('id', weekId)
    .single();

  formContainer.innerHTML = `
    <h2>Encuesta Fin de Semana ${week?.week_number || ''}</h2>
    <p>Responde con sinceridad. Con esta información el sistema ajusta tu siguiente semana.</p>

    <div class="input-group">
      <label>Horas de sueño promedio esta semana</label>
      <input type="number" id="survey-sueno" step="0.5" min="0" max="12" placeholder="Ej: 7.5" required>
    </div>

    <div class="input-group">
      <label>Dieta actual</label>
      <select id="survey-dieta">
        <option value="superavit">Superávit calórico</option>
        <option value="mantenimiento" selected>Mantenimiento</option>
        <option value="deficit">Déficit calórico</option>
      </select>
    </div>

    <div class="input-group">
      <label>Nivel de estrés laboral/diario (1-10)</label>
      <input type="range" id="survey-estres" min="1" max="10" value="3" oninput="this.nextElementSibling.textContent=this.value">
      <span>3</span>
    </div>

    <div class="input-group">
      <label>¿Cumpliste con todos los entrenamientos?</label>
      <select id="survey-cumplio">
        <option value="true">Sí</option>
        <option value="false">No</option>
      </select>
    </div>

    <div class="input-group">
      <label>¿Sientes dolores articulares?</label>
      <select id="survey-dolores">
        <option value="false">No</option>
        <option value="true">Sí</option>
      </select>
    </div>

    <div class="input-group">
      <label>Si respondiste "Sí", indica en qué articulación o ejercicio</label>
      <input type="text" id="survey-articulaciones" placeholder="Ej: rodilla, sentadilla, press banca...">
    </div>

    <div class="input-group">
      <label>¿Fatiga crónica (te sientes inusualmente cansado)?</label>
      <select id="survey-fatiga">
        <option value="false">No</option>
        <option value="true">Sí</option>
      </select>
    </div>

    <div class="input-group">
      <label>¿Más agujetas de lo normal?</label>
      <select id="survey-agujetas">
        <option value="false">No</option>
        <option value="true">Sí</option>
      </select>
    </div>

    <div class="input-group">
      <label>¿Has fallado al levantar los pesos asignados?</label>
      <select id="survey-fallo">
        <option value="false">No</option>
        <option value="true">Sí</option>
      </select>
    </div>

    <div class="input-group">
      <label>Rendimiento percibido (1-10)</label>
      <input type="range" id="survey-rendimiento" min="1" max="10" value="7" oninput="this.nextElementSibling.textContent=this.value">
      <span>7</span>
    </div>

    <div class="input-group">
      <label>Comentarios adicionales (opcional)</label>
      <textarea id="survey-comentarios" rows="2" placeholder="Cualquier observación..."></textarea>
    </div>

    <button type="submit" class="btn-primary">Enviar y programar siguiente semana</button>
  `;

  modal.classList.add('active');

  formContainer.addEventListener('submit', async (e) => {
    e.preventDefault();
    await procesarEncuesta();
  });

  // Cerrar modal si se hace clic fuera del contenido
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('active');
    }
  });
}

/**
 * Procesa las respuestas: guarda el feedback, evalúa fatiga
 * (incluyendo Trigger C) y genera la semana siguiente.
 */
async function procesarEncuesta() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const feedback = {
    user_id: user.id,
    weekly_program_id: currentWeekId,
    horas_sueno_promedio: parseFloat(document.getElementById('survey-sueno').value) || 7,
    dieta: document.getElementById('survey-dieta').value,
    nivel_estres: parseInt(document.getElementById('survey-estres').value) || 3,
    cumplio_entrenamiento: document.getElementById('survey-cumplio').value === 'true',
    dolores_articulares: document.getElementById('survey-dolores').value === 'true',
    articulaciones_afectadas: document.getElementById('survey-articulaciones').value || null,
    fatiga_cronica: document.getElementById('survey-fatiga').value === 'true',
    agujetas_extremas: document.getElementById('survey-agujetas').value === 'true',
    fallo_pesos_asignados: document.getElementById('survey-fallo').value === 'true',
    rendimiento_percibido: parseInt(document.getElementById('survey-rendimiento').value) || 7,
    comentarios: document.getElementById('survey-comentarios').value || null
  };

  // Guardar feedback
  const { error } = await supabase.from('weekly_feedback').insert(feedback);
  if (error) {
    alert('Error al guardar la encuesta: ' + error.message);
    return;
  }

  // Cerrar modal
  document.getElementById('survey-modal').classList.remove('active');

  // Evaluar fatiga y generar siguiente semana
  await evaluarYGenerarSiguiente(user.id, feedback);
}

/**
 * Evalúa la fatiga mediante:
 * - Trigger A: caída de e1RM por ejercicio básico.
 * - Trigger B: fatiga subjetiva (sueño, estrés, dolor).
 * - Trigger C: correlación inversa (Stress Index ↑ y e1RM ↓).
 * Decide si se necesita 'normal', 'deload' o 'deload_parcial'.
 */
async function evaluarYGenerarSiguiente(userId, feedback) {
  // Obtener perfil (para acceder a rm de básicos si se necesita)
  const { data: perfil } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  // Calcular Stress Index semanal por grupo muscular
  const stressPorGrupo = await calcularStressIndexSemanal(currentWeekId);
  console.log('Stress Index semanal por grupo:', stressPorGrupo);

  // Evaluar deload por cada básico (Trigger A + C)
  const basicos = [
    { nombre: 'Sentadilla libre trasera', clave: 'sentadilla' },
    { nombre: 'Press de banca plano con barra', clave: 'press_banca' },
    { nombre: 'Peso muerto convencional', clave: 'peso_muerto' }
  ];

  const basicosEnDeload = []; // guardamos el nombre completo del ejercicio

  for (const basico of basicos) {
    const historial = await obtenerHistorialE1RM(userId, basico.nombre, 4);
    const e1rmCae = necesitaDeloadPorE1RM(historial, DELOAD_RULES.caidaE1RMPorcentaje || 5);

    // Trigger C: Stress Index del grupo está aumentando respecto al máximo registrado (MRV)
    const grupo = BASICO_GRUPO_MAP[basico.clave] || basico.clave;
    const siActual = stressPorGrupo[grupo] || 0;
    const { data: mrvData } = await supabase
      .from('user_mrv')
      .select('stress_index_max')
      .eq('user_id', userId)
      .eq('basic_exercise', basico.clave)
      .maybeSingle();
    const mrvMax = mrvData?.stress_index_max || 0;
    const siSuperaMRV = mrvMax > 0 && siActual >= mrvMax * 0.9; // casi o supera el máximo registrado
    const triggerC = e1rmCae && siSuperaMRV;

    if (e1rmCae || triggerC) {
      basicosEnDeload.push(basico.nombre); // nombre completo para el generador
      console.log(
        `Deload detectado para ${basico.nombre} (e1RM cae:${e1rmCae}, Trigger C:${triggerC})`
      );

      // Guardar/actualizar MRV individual con el Stress Index y e1RM actuales
      await guardarMRV(
        userId,
        basico.clave,
        grupo,
        siActual,
        historial[0]?.e1rm || 0
      );
    }
  }

  // Trigger B: fatiga subjetiva
  let decision = 'normal';
  const suenoMalo = feedback.horas_sueno_promedio < 6;
  const estresAlto = feedback.nivel_estres >= 7;
  const dolorArticular = feedback.dolores_articulares;
  const rendimientoMuyBajo = feedback.rendimiento_percibido <= 4;

  if (
    feedback.fatiga_cronica ||
    (dolorArticular && rendimientoMuyBajo) ||
    (suenoMalo && estresAlto)
  ) {
    decision = 'deload';
  }

  // Deload parcial si solo algunos básicos necesitan alivio
  if (basicosEnDeload.length > 0 && decision !== 'deload') {
    decision = 'deload_parcial';
  }

  // Si la recuperación es óptima, forzar normal incluso si había señales aisladas
  if (
    feedback.rendimiento_percibido >= 7 &&
    !feedback.fallo_pesos_asignados &&
    !dolorArticular &&
    feedback.horas_sueno_promedio >= 7 &&
    feedback.nivel_estres <= 3
  ) {
    decision = 'normal';
    basicosEnDeload.length = 0; // resetear deload parcial
  }

  console.log('Decisión:', decision, 'Básicos en deload:', basicosEnDeload);

  try {
    await generateNextWeek(userId, decision, basicosEnDeload);
    const tipoSemana =
      decision === 'deload' || decision === 'deload_parcial'
        ? 'descarga'
        : 'progresión';
    alert(`Próxima semana generada: Semana de ${tipoSemana}`);
    showScreen('dashboard-screen');
  } catch (err) {
    console.error('Error al generar siguiente semana:', err);
    alert('Error al generar la siguiente semana: ' + err.message);
  }
}

/**
 * Stress Index semanal por grupo muscular.
 * Suma el SI de todas las series completadas de la semana,
 * usando la función centralizada `calcularStressIndex`.
 * @param {string} weekId – UUID del weekly_program.
 * @returns {Object.<string, number>} Ej: {pecho: 4.2, espalda: 3.1, ...}
 */
async function calcularStressIndexSemanal(weekId) {
  const { data: sets, error } = await supabase
    .from('workout_sets')
    .select(
      `rir_reportado,
       completed,
       workout_exercises!inner(
         workout_days!inner(weekly_program_id),
         exercises(grupo_muscular, tipo, nombre)
       )`
    )
    .eq('workout_exercises.workout_days.weekly_program_id', weekId)
    .eq('completed', true);

  if (error || !sets || sets.length === 0) return {};

  const stressPorGrupo = {};

  sets.forEach((s) => {
    const ejercicio = s.workout_exercises?.exercises;
    if (!ejercicio) return;

    const grupo = ejercicio.grupo_muscular;
    const tipo = ejercicio.tipo;
    const rir = s.rir_reportado != null ? s.rir_reportado : 2;

    // Uso de la fórmula centralizada con redondeo correcto
    const si = calcularStressIndex(tipo, rir);

    if (!stressPorGrupo[grupo]) stressPorGrupo[grupo] = 0;
    stressPorGrupo[grupo] += si;
  });

  // Redondear total a 1 decimal
  for (const grupo in stressPorGrupo) {
    stressPorGrupo[grupo] = Math.round(stressPorGrupo[grupo] * 10) / 10;
  }
  return stressPorGrupo;
}

/**
 * Almacena (upsert) el MRV individual cuando se detecta que el e1RM
 * de un básico ha caído, guardando el Stress Index del grupo en ese
 * momento como umbral máximo recuperable.
 */
async function guardarMRV(
  userId,
  basicExercise,
  grupoMuscular,
  stressIndexActual,
  e1rmActual
) {
  if (stressIndexActual <= 0) return;

  const { error } = await supabase.from('user_mrv').upsert(
    {
      user_id: userId,
      basic_exercise: basicExercise,
      grupo_muscular: grupoMuscular,
      stress_index_max: stressIndexActual,
      e1rm_at_mrv: e1rmActual,
      fecha_registro: new Date().toISOString().split('T')[0]
    },
    { onConflict: 'user_id, basic_exercise' }
  );

  if (error) {
    console.error('Error guardando MRV:', error);
  } else {
    console.log(
      `MRV actualizado: ${basicExercise} SI=${stressIndexActual}, e1RM=${e1rmActual}`
    );
  }
}
