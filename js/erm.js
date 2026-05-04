// =====================================================
// TitanCap.OS - js/erm.js (NUEVO - Motor de e1RM)
// Cálculo del 1RM estimado con Brzycki adaptado a RIR
// Progresión automática de pesos
// =====================================================

import { supabase } from './supabase-client.js';

/**
 * Calcula el 1RM estimado con la fórmula Brzycki adaptada a RIR
 * e1RM = Peso / (1.0278 - 0.0278 * (Reps + RIR))
 * 
 * @param {number} peso - Peso levantado en kg
 * @param {number} reps - Repeticiones completadas
 * @param {number} rir - Repeticiones en reserva (0-5)
 * @returns {number} e1RM estimado (redondeado a 1 decimal)
 */
export function calcularE1RM(peso, reps, rir = 0) {
    if (!peso || peso <= 0 || !reps || reps <= 0) return 0;
    const repsEfectivas = reps + rir;
    const denominador = 1.0278 - 0.0278 * repsEfectivas;
    if (denominador <= 0) return peso * repsEfectivas * 0.0333 + peso; // Fórmula de respaldo (Epley)
    const e1rm = peso / denominador;
    return Math.round(e1rm * 10) / 10;
}

/**
 * Calcula el peso sugerido para un objetivo de reps y RIR basado en e1RM
 * Despeje: Peso = e1RM * (1.0278 - 0.0278 * (Reps + RIR))
 * 
 * @param {number} e1rm - 1RM estimado
 * @param {number} repsObjetivo - Repeticiones objetivo
 * @param {number} rirObjetivo - RIR objetivo (por defecto 2)
 * @returns {number} Peso sugerido (redondeado a 0.5 kg)
 */
export function sugerirPeso(e1rm, repsObjetivo, rirObjetivo = 2) {
    if (!e1rm || e1rm <= 0) return 0;
    const repsEfectivas = repsObjetivo + rirObjetivo;
    const peso = e1rm * (1.0278 - 0.0278 * repsEfectivas);
    return Math.round(peso * 2) / 2; // Redondear a 0.5 kg
}

/**
 * Aplica el incremento estándar según ejercicio básico
 * Press banca: +2.5 kg
 * Sentadilla/Peso muerto: +5 kg (o +10 si la ganancia lo permite)
 * 
 * @param {number} pesoActual - Peso actual en kg
 * @param {string} ejercicioBasico - Nombre del básico (sentadilla, press_banca, peso_muerto)
 * @returns {number} Nuevo peso sugerido
 */
export function incrementarPeso(pesoActual, ejercicioBasico) {
    const saltos = {
        sentadilla: 5,
        peso_muerto: 5,
        press_banca: 2.5
    };
    const salto = saltos[ejercicioBasico] || 2.5;
    return Math.round((pesoActual + salto) * 2) / 2;
}

/**
 * Obtiene el historial de e1RM de un básico para un usuario
 * @param {string} userId - ID del usuario
 * @param {string} nombreBasico - Nombre exacto del ejercicio básico
 * @param {number} semanas - Número de semanas hacia atrás (default 4)
 * @returns {Array} Historial de e1RM [{fecha, e1rm_estimado, peso, reps, rir}]
 */
export async function obtenerHistorialE1RM(userId, nombreBasico, semanas = 4) {
    const { data, error } = await supabase
        .from('workout_sets')
        .select(`
            e1rm_estimado,
            peso_kg,
            reps_completadas,
            rir_reportado,
            created_at,
            workout_exercises!inner(
                exercises!inner(nombre)
            )
        `)
        .eq('workout_exercises.exercises.nombre', nombreBasico)
        .order('created_at', { ascending: false })
        .limit(50);

    if (error) {
        console.error('Error obteniendo historial e1RM:', error);
        return [];
    }

    return (data || []).map(s => ({
        fecha: s.created_at,
        e1rm: s.e1rm_estimado || calcularE1RM(s.peso_kg, s.reps_completadas, s.rir_reportado || 0),
        peso: s.peso_kg,
        reps: s.reps_completadas,
        rir: s.rir_reportado
    }));
}

/**
 * Evalúa si un básico necesita deload por caída de e1RM
 * @param {Array} historial - Array de {e1rm, fecha} ordenado descendente
 * @param {number} umbralCaida - Porcentaje de caída para activar deload (default 5)
 * @returns {boolean} True si necesita deload
 */
export function necesitaDeloadPorE1RM(historial, umbralCaida = 5) {
    if (!historial || historial.length < 3) return false;

    // Agrupar por semana
    const porSemana = {};
    historial.forEach(h => {
        const semana = h.fecha.split('T')[0].slice(0, 7); // YYYY-MM
        if (!porSemana[semana] || h.e1rm > porSemana[semana]) {
            porSemana[semana] = h.e1rm;
        }
    });

    const semanas = Object.entries(porSemana).sort((a, b) => b[0].localeCompare(a[0]));
    if (semanas.length < 3) return false;

    // Comparar las últimas 2 semanas con la anterior
    const actual = semanas[0][1];
    const anterior = semanas[1][1];
    const hace2 = semanas[2][1];

    const caida1 = ((anterior - actual) / anterior) * 100;
    const caida2 = ((hace2 - anterior) / hace2) * 100;

    return caida1 > umbralCaida && caida2 > 0; // 2 semanas consecutivas de caída
}

/**
 * Obtiene el último e1RM guardado para un ejercicio específico del usuario
 * @param {string} userId - ID del usuario
 * @param {number} exerciseId - ID del ejercicio en Supabase
 * @returns {number|null} Último e1RM estimado
 */
export async function obtenerUltimoE1RM(userId, exerciseId) {
    const { data } = await supabase
        .from('workout_sets')
        .select('e1rm_estimado')
        .eq('workout_exercises.exercise_id', exerciseId)
        .not('e1rm_estimado', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

    return data?.e1rm_estimado || null;
}

/**
 * Guarda o actualiza el e1RM calculado en la serie
 * @param {string} setId - ID del workout_set
 * @param {number} peso - Peso usado
 * @param {number} reps - Reps completadas
 * @param {number} rir - RIR reportado
 */
export async function guardarE1RMEnSerie(setId, peso, reps, rir) {
    const e1rm = calcularE1RM(peso, reps, rir);
    if (e1rm > 0) {
        await supabase
            .from('workout_sets')
            .update({ e1rm_estimado: e1rm })
            .eq('id', setId);
    }
}
