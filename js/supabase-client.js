// =====================================================
// TitanCap.OS - js/supabase-client.js (v3.2 - Auditoría final)
// Inicialización del SDK de Supabase + utilidades centralizadas
// =====================================================

// ------------------------------------------------------
// 1. CONFIGURACIÓN DE CONEXIÓN (ORIGINAL - SIN CAMBIOS)
// ------------------------------------------------------
const SUPABASE_URL = 'https://htfslnteeqxryssauxmy.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_qWAlzldXvkEOK4jc541F_A_mnZG2Dgl';

// Import dinámico desde CDN (módulo ES)
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

// ------------------------------------------------------
// 2. PLACEHOLDER MERCADO PAGO (Tarea 5)
//    Aquí se configurarán las credenciales cuando estén listas.
//    Los endpoints reales irán en una Supabase Edge Function.
// ------------------------------------------------------
export const MERCADO_PAGO_CONFIG = {
  // TODO: Reemplazar con valores reales al integrar Mercado Pago
  publicKey: 'TEST-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
  accessToken: 'TEST-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  webhookUrl: 'https://htfslnteeqxryssauxmy.supabase.co/functions/v1/mercadopago-webhook',
  // El webhook recibe notificaciones de pago y actualiza la tabla `payments`.
  // Documentación de integración al final del informe general.
};

// ------------------------------------------------------
// 3. FUNCIONES DE UTILIDAD PARA LA BASE DE DATOS
// ------------------------------------------------------

/**
 * Verifica si un email tiene un pago aprobado en la tabla `payments`.
 * Centralizada aquí para que todos los módulos consulten el mismo estado.
 * @param {string} email - Email del usuario autenticado
 * @returns {Promise<boolean>} true si existe un pago con status 'approved'
 */
export async function checkPaymentStatus(email) {
  try {
    const { data, error } = await supabase
      .from('payments')
      .select('status')
      .eq('email', email)
      .eq('status', 'approved')
      .maybeSingle();

    if (error) {
      console.warn('[Supabase] No se pudo verificar estado del pago:', error.message);
      return false;
    }

    const pagado = !!data;
    console.log(`[Supabase] Pago para ${email}:`, pagado ? 'APROBADO' : 'pendiente/no encontrado');
    return pagado;
  } catch (err) {
    console.error('[Supabase] Error inesperado al verificar pago:', err);
    return false; // No bloquear el login si falla la consulta
  }
}

/**
 * Obtiene el perfil completo del usuario por su ID.
 * @param {string} userId - UUID del usuario en auth.users
 * @returns {Promise<object|null>} Datos del perfil o null si no existe
 */
export async function getUserProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) {
    console.warn('[Supabase] Perfil no encontrado para:', userId, error.message);
    return null;
  }
  return data;
}

/**
 * Obtiene la semana actual del programa para un usuario.
 * @param {string} userId - UUID del usuario
 * @param {number} weekNumber - Número de semana a consultar
 * @returns {Promise<object|null>} El registro de weekly_programs o null
 */
export async function getWeeklyProgram(userId, weekNumber) {
  const { data, error } = await supabase
    .from('weekly_programs')
    .select('*')
    .eq('user_id', userId)
    .eq('week_number', weekNumber)
    .single();

  if (error) {
    console.warn(`[Supabase] Semana ${weekNumber} no encontrada:`, error.message);
    return null;
  }
  return data;
}

/**
 * Obtiene los días de entrenamiento de una semana específica.
 * @param {string} programId - UUID del weekly_program
 * @returns {Promise<Array>} Lista de workout_days ordenados por day_number
 */
export async function getWorkoutDays(programId) {
  const { data, error } = await supabase
    .from('workout_days')
    .select('*')
    .eq('weekly_program_id', programId)
    .order('day_number', { ascending: true });

  if (error) {
    console.error('[Supabase] Error al obtener días de entrenamiento:', error.message);
    return [];
  }
  return data;
}

/**
 * Obtiene los ejercicios asignados a un día específico.
 * @param {string} dayId - UUID del workout_day
 * @returns {Promise<Array>} Lista de workout_exercises con los datos del ejercicio incluidos
 */
export async function getWorkoutExercises(dayId) {
  const { data, error } = await supabase
    .from('workout_exercises')
    .select(`
      *,
      exercises (*)
    `)
    .eq('workout_day_id', dayId)
    .order('orden', { ascending: true });

  if (error) {
    console.error('[Supabase] Error al obtener ejercicios del día:', error.message);
    return [];
  }
  return data;
}

/**
 * Obtiene las series reales ejecutadas para un ejercicio en un día.
 * @param {string} exerciseId - UUID del workout_exercise
 * @returns {Promise<Array>} Lista de workout_sets ordenados por set_number
 */
export async function getWorkoutSets(exerciseId) {
  const { data, error } = await supabase
    .from('workout_sets')
    .select('*')
    .eq('workout_exercise_id', exerciseId)
    .order('set_number', { ascending: true });

  if (error) {
    console.error('[Supabase] Error al obtener series:', error.message);
    return [];
  }
  return data;
}

/**
 * Guarda o actualiza una serie ejecutada (upsert manual).
 * @param {object} setData - Datos de la serie: workout_exercise_id, set_number, reps_completadas, peso_kg, rpe_reportado, rir_reportado, e1rm_estimado, stress_index, completed
 * @returns {Promise<object|null>} El registro creado/actualizado
 */
export async function saveWorkoutSet(setData) {
  // Intentamos un upsert usando el índice único compuesto (workout_exercise_id, set_number)
  const { data, error } = await supabase
    .from('workout_sets')
    .upsert(setData, {
      onConflict: 'workout_exercise_id, set_number',
      ignoreDuplicates: false // Actualiza si ya existe
    })
    .select()
    .single();

  if (error) {
    console.error('[Supabase] Error al guardar serie:', error.message);
    return null;
  }
  return data;
}

/**
 * Obtiene el feedback semanal del usuario para una semana específica.
 * @param {string} userId - UUID del usuario
 * @param {string} programId - UUID del weekly_program
 * @returns {Promise<object|null>} El registro de feedback o null
 */
export async function getWeeklyFeedback(userId, programId) {
  const { data, error } = await supabase
    .from('weekly_feedback')
    .select('*')
    .eq('user_id', userId)
    .eq('weekly_program_id', programId)
    .maybeSingle();

  if (error) {
    console.warn('[Supabase] No se encontró feedback para la semana:', error.message);
    return null;
  }
  return data;
}

/**
 * Inserta el feedback semanal (check-in).
 * @param {object} feedbackData - Todos los campos requeridos por weekly_feedback
 * @returns {Promise<object|null>} El registro creado
 */
export async function insertWeeklyFeedback(feedbackData) {
  const { data, error } = await supabase
    .from('weekly_feedback')
    .insert(feedbackData)
    .select()
    .single();

  if (error) {
    console.error('[Supabase] Error al guardar feedback:', error.message);
    return null;
  }
  return data;
}

/**
 * Registra qué frase motivacional se mostró al usuario esta semana (evita repeticiones).
 * @param {string} userId - UUID del usuario
 * @param {number} phraseId - ID de la frase
 * @param {number} weekNumber - Semana en la que se asignó
 */
export async function trackPhraseUsage(userId, phraseId, weekNumber) {
  const { error } = await supabase
    .from('user_phrase_history')
    .insert({
      user_id: userId,
      phrase_id: phraseId,
      week_number: weekNumber
    });

  if (error) {
    console.warn('[Supabase] Error al registrar frase mostrada:', error.message);
  }
}

// ------------------------------------------------------
// NOTA: Las credenciales de Mercado Pago nunca se exponen
// en el frontend. La integración real se hará en una
// Supabase Edge Function que reciba el webhook y escriba
// en la tabla `payments`.
// ------------------------------------------------------
