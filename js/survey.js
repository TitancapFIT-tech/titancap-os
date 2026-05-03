// =====================================================
// TitanCap.OS - js/survey.js
// Encuesta de fatiga post-semana y generación automática
// de la siguiente semana (normal o descarga)
// =====================================================

import { supabase } from './supabase-client.js';
import { DELOAD_RULES, FATIGA_DECISION_RULES } from './config.js';
// La función generateNextWeek se definirá en generator.js (próximo paso)
import { generateNextWeek } from './generator.js';

let currentWeekId = null;

// Abrir modal de encuesta para una semana específica
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
    <p>Responde para ajustar tu siguiente ciclo.</p>

    <div class="input-group">
      <label>Horas de sueño promedio esta semana</label>
      <input type="number" id="survey-sueno" step="0.5" min="0" max="12" required>
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
      <label>Si respondiste "Sí", indica en qué ejercicios</label>
      <input type="text" id="survey-articulaciones" placeholder="Ej: sentadilla, press banca...">
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

  // Cerrar modal al hacer clic fuera (opcional)
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('active');
    }
  });
}

async function procesarEncuesta() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const feedback = {
    user_id: user.id,
    weekly_program_id: currentWeekId,
    horas_sueno_promedio: parseFloat(document.getElementById('survey-sueno').value),
    nivel_estres: parseInt(document.getElementById('survey-estres').value),
    cumplio_entrenamiento: document.getElementById('survey-cumplio').value === 'true',
    dolores_articulares: document.getElementById('survey-dolores').value === 'true',
    articulaciones_afectadas: document.getElementById('survey-articulaciones').value || null,
    fatiga_cronica: document.getElementById('survey-fatiga').value === 'true',
    agujetas_extremas: document.getElementById('survey-agujetas').value === 'true',
    fallo_pesos_asignados: document.getElementById('survey-fallo').value === 'true',
    rendimiento_percibido: parseInt(document.getElementById('survey-rendimiento').value),
    comentarios: document.getElementById('survey-comentarios').value || null
  };

  // Guardar feedback
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

async function evaluarYGenerarSiguiente(userId, feedback) {
  // Obtener perfil para datos de dieta, sueño previo, etc.
  const { data: perfil } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  // Obtener la última semana generada
  const { data: ultimaSemana } = await supabase
    .from('weekly_programs')
    .select('*')
    .eq('user_id', userId)
    .order('week_number', { ascending: false })
    .limit(1)
    .single();

  // Calcular e1RM estimado (más adelante lo refinaremos, por ahora simple)
  // Aquí solo evaluaremos las reglas de fatiga
  let decision = 'normal'; // normal o deload

  // Regla de descarga por fatiga crónica
  if (feedback.fatiga_cronica) {
    decision = 'deload';
  }
  // Reglas combinadas de FATIGA_DECISION_RULES
  const suenoOk = feedback.horas_sueno_promedio >= 7;
  const estresBajo = feedback.nivel_estres <= 3;
  const dolores = feedback.dolores_articulares;
  const rendimientoBajo = feedback.rendimiento_percibido <= 5;

  if (dolores || rendimientoBajo) {
    decision = 'deload';
  }

  // Si todo va bien, normal
  if (suenoOk && estresBajo && !dolores && feedback.rendimiento_percibido >= 7 && !feedback.fallo_pesos_asignados) {
    decision = 'normal';
  }

  // Generar la siguiente semana en base a la decisión
  try {
    await generateNextWeek(userId, decision);
    alert(`Próxima semana generada: ${decision === 'deload' ? 'Semana de descarga activa' : 'Semana de progresión'}`);
    showScreen('dashboard-screen');
  } catch (err) {
    alert('Error al generar la siguiente semana: ' + err.message);
  }
}
