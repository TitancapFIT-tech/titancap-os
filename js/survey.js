// =====================================================
// TitanCap.OS - js/survey.js (v3 - Auditoría Completa)
// Encuesta de fatiga post-semana con evaluación de e1RM,
// Stress Index semanal, deload individualizado y MRV
// =====================================================

import { supabase } from './supabase-client.js';
import { DELOAD_RULES, STRESS_INDEX_COEFFICIENTS } from './config.js';
import { generateNextWeek } from './generator.js';
import { obtenerHistorialE1RM, necesitaDeloadPorE1RM } from './erm.js';
import { showScreen } from './nav.js';

let currentWeekId = null;

// ------------------------------------------------------
// 1. ABRIR MODAL DE ENCUESTA
// ------------------------------------------------------
export async function openSurvey(weekId) {
  currentWeekId = weekId;
  const modal = document.getElementById('survey-modal');
  const formContainer = document.getElementById('survey-form');

  // Obtener datos de la semana actual
  const { data: week } = await supabase
    .from('weekly_programs')
    .select('week_number')
    .eq('id', weekId)
    .single();

  formContainer.innerHTML = `
    <h2>Encuesta Fin de Semana ${week?.week_number || ''}</h2>
    <p>Responde para ajustar tu siguiente ciclo con precisión.</p>

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
      <label>Comentarios adicionales</label>
      <textarea id="survey-comentarios" rows="2" placeholder="Opcional..."></textarea>
    </div>

    <button type="submit" class="btn-primary">Enviar y programar siguiente semana</button>
  `;

  // Mostrar modal
  modal.classList.add('active');

  // Listener para enviar
  formContainer.addEventListener('submit', async (e) => {
    e.preventDefault();
    await procesarEncuesta();
  });

  // Cerrar modal al hacer clic fuera
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('active');
    }
  });
}

// ------------------------------------------------------
// 2. PROCESAR ENCUESTA Y GUARDAR FEEDBACK
// ------------------------------------------------------
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

  // Guardar feedback en Supabase
  const { error } = await supabase
    .from('weekly_feedback')
    .insert(feedback);

  if (error) {
    alert('Error al guardar encuesta: ' + error.message);
    return;
  }

  // Cerrar modal
  document.getElementById('survey-modal').classList.remove('active');

  // Evaluar fatiga y generar siguiente semana
  await evaluarYGenerarSiguiente(user.id, feedback);
}

// ------------------------------------------------------
// 3. EVALUAR FATIGA Y DECIDIR TIPO DE SEMANA (NORMAL/DELOAD)
// ------------------------------------------------------
async function evaluarYGenerarSiguiente(userId, feedback) {
  // Obtener perfil
  const { data: perfil } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  // Calcular Stress Index semanal por grupo muscular
  const stressPorGrupo = await calcularStressIndexSemanal(currentWeekId);
  console.log('Stress Index semanal por grupo:', stressPorGrupo);

  // Evaluar deload por cada básico (Trigger A: caída de e1RM)
  const basicos = [
    { nombre: 'Sentadilla libre trasera', clave: 'sentadilla' },
    { nombre: 'Press de banca plano con barra', clave: 'press_banca' },
    { nombre: 'Peso muerto convencional', clave: 'peso_muerto' }
  ];

  const basicosEnDeload = [];

  for (const basico of basicos) {
    const historial = await obtenerHistorialE1RM(userId, basico.nombre, 4);
    if (necesitaDeloadPorE1RM(historial, 5)) { // 5% de caída en 2 semanas
      basicosEnDeload.push(basico.clave);
      console.log(`Deload detectado para: ${basico.nombre}`);

      // Guardar MRV individual: el Stress Index actual es el máximo para este básico
      await guardarMRV(userId, basico.clave, stressPorGrupo, historial[0]?.e1rm || 0);
    }
  }

  // Trigger B: fatiga subjetiva
  let decision = 'normal';
  const suenoMalo = feedback.horas_sueno_promedio < 6;
  const estresAlto = feedback.nivel_estres >= 7;
  const dolorArticular = feedback.dolores_articulares;
  const rendimientoMuyBajo = feedback.rendimiento_percibido <= 4;

  if (feedback.fatiga_cronica) {
    decision = 'deload';
  }

  if (dolorArticular && rendimientoMuyBajo) {
    decision = 'deload';
  }

  if (suenoMalo && estresAlto) {
    decision = 'deload';
  }

  // Si hay básicos en deload pero la decisión general es normal, hacer deload parcial
  if (basicosEnDeload.length > 0 && decision === 'normal') {
    decision = 'deload_parcial';
  } else if (basicosEnDeload.length > 0) {
    decision = 'deload';
  }

  // Si todo va bien
  if (feedback.rendimiento_percibido >= 7 && !feedback.fallo_pesos_asignados && !dolorArticular && feedback.horas_sueno_promedio >= 7 && feedback.nivel_estres <= 3) {
    decision = 'normal';
    // Limpiar básicos en deload si la recuperación fue buena
    basicosEnDeload.length = 0;
  }

  console.log('Decisión:', decision, 'Básicos en deload:', basicosEnDeload);

  // Generar la siguiente semana
  try {
    const nuevaSemana = await generateNextWeek(userId, decision, basicosEnDeload);
    const tipoSemana = decision === 'deload' || decision === 'deload_parcial' ? 'descarga' : 'progresión';
    alert(`Próxima semana generada: Semana de ${tipoSemana}`);
    showScreen('dashboard-screen');
  } catch (err) {
    console.error('Error al generar siguiente semana:', err);
    alert('Error al generar la siguiente semana: ' + err.message);
  }
}

// ------------------------------------------------------
// 4. CALCULAR STRESS INDEX SEMANAL POR GRUPO MUSCULAR
// ------------------------------------------------------
async function calcularStressIndexSemanal(weekId) {
  // Obtener todas las series completadas de la semana
  const { data: sets } = await supabase
    .from('workout_sets')
    .select(`
      rir_reportado,
      completed,
      workout_exercises!inner(
        workout_days!inner(weekly_program_id),
        exercises(grupo_muscular, tipo, nombre)
      )
    `)
    .eq('workout_exercises.workout_days.weekly_program_id', weekId)
    .eq('completed', true);

  if (!sets || sets.length === 0) return {};

  // Agrupar por grupo muscular
  const stressPorGrupo = {};

  sets.forEach(s => {
    const ejercicio = s.workout_exercises?.exercises;
    if (!ejercicio) return;

    const grupo = ejercicio.grupo_muscular;
    const tipo = ejercicio.tipo;
    const coef = STRESS_INDEX_COEFFICIENTS[tipo] || STRESS_INDEX_COEFFICIENTS.mono_maquina;
    const rir = s.rir_reportado != null ? s.rir_reportado : 2;
    const si = Math.max(0.1, coef.intercept + coef.slope * rir);

    if (!stressPorGrupo[grupo]) stressPorGrupo[grupo] = 0;
    stressPorGrupo[grupo] += si;
  });

  // Redondear
  for (const grupo in stressPorGrupo) {
    stressPorGrupo[grupo] = Math.round(stressPorGrupo[grupo] * 10) / 10;
  }

  return stressPorGrupo;
}

// ------------------------------------------------------
// 5. GUARDAR MRV INDIVIDUAL (Máximo Volumen Recuperable)
// ------------------------------------------------------
async function guardarMRV(userId, basicoClave, stressPorGrupo, e1rmActual) {
  // Mapear básico a grupo muscular principal
  const mapBasicoGrupo = {
    sentadilla: 'cuadriceps',
    press_banca: 'pecho',
    peso_muerto: 'espalda'
  };

  const grupo = mapBasicoGrupo[basicoClave];
  const siGrupo = stressPorGrupo[grupo] || 0;

  if (siGrupo <= 0) return;

  // Guardar en tabla user_mrv
  const { error } = await supabase
    .from('user_mrv')
    .upsert({
      user_id: userId,
      basic_exercise: basicoClave,
      grupo_muscular: grupo,
      stress_index_max: siGrupo,
      e1rm_at_mrv: e1rmActual,
      fecha_registro: new Date().toISOString().split('T')[0]
    }, { onConflict: 'user_id, basic_exercise' });

  if (error) {
    console.error('Error guardando MRV:', error);
  } else {
    console.log(`MRV guardado para ${basicoClave}: SI=${siGrupo}, e1RM=${e1rmActual}`);
  }
}
