// =====================================================
// TitanCap.OS - js/erm.js (v3.2 - Auditoría final)
// Motor de e1RM con Brzycki adaptado a RIR,
// progresión de pesos, historial y deload por caída.
// =====================================================

import { supabase } from './supabase-client.js';
import { PESO_INCREMENTOS } from './config.js';

// ------------------------------------------------------
// FÓRMULA BRZYCKI ADAPTADA CON RIR (documento oficial)
// e1RM = Peso / (1.0278 - 0.0278 * (Reps + RIR))
// ------------------------------------------------------

/**
 * Calcula el 1RM estimado con la fórmula Brzycki adaptada a RIR.
 * Si el denominador es ≤ 0 (más de 36 repeticiones efectivas),
 * se recurre a la fórmula de Epley como respaldo fiable.
 *
 * @param {number} peso - Peso levantado en kg
 * @param {number} reps - Repeticiones completadas
 * @param {number} rir - Repeticiones en reserva (0-5, por defecto 0)
 * @returns {number} e1RM estimado (redondeado a 1 decimal)
 */
export function calcularE1RM(peso, reps, rir = 0) {
    if (!peso || peso <= 0 || !reps || reps <= 0) return 0;
    const repsEfectivas = reps + rir;
    const denominador = 1.0278 - 0.0278 * repsEfectivas;
    if (denominador <= 0) {
        // Respaldo: fórmula de Epley
        return Math.round((peso * repsEfectivas * 0.0333 + peso) * 10) / 10;
    }
    const e1rm = peso / denominador;
    return Math.round(e1rm * 10) / 10;
}

/**
 * Calcula el peso sugerido para un número objetivo de repeticiones y RIR,
 * a partir del e1RM estimado.
 * Despeje: Peso = e1RM * (1.0278 - 0.0278 * (Reps + RIR))
 *
 * @param {number} e1rm - 1RM estimado del atleta
 * @param {number} repsObjetivo - Repeticiones objetivo de la serie
 * @param {number} rirObjetivo - RIR objetivo (por defecto 2)
 * @returns {number} Peso sugerido redondeado a 0.5 kg
 */
export function sugerirPeso(e1rm, repsObjetivo, rirObjetivo = 2) {
    if (!e1rm || e1rm <= 0) return 0;
    const repsEfectivas = repsObjetivo + rirObjetivo;
    const peso = e1rm * (1.0278 - 0.0278 * repsEfectivas);
    return Math.round(peso * 2) / 2;
}

/**
 * Aplica el incremento estándar según el ejercicio básico,
 * usando los valores definidos en config.js.
 * Press banca: +2.5 kg | Sentadilla/Peso muerto: +5 kg.
 *
 * @param {number} pesoActual - Peso actual en kg
 * @param {string} ejercicioBasico - Clave del básico ('sentadilla', 'press_banca', 'peso_muerto')
 * @returns {number} Nuevo peso sugerido (redondeado a 0.5 kg)
 */
export function incrementarPeso(pesoActual, ejercicioBasico) {
    const salto = PESO_INCREMENTOS[ejercicioBasico] || 2.5;
    return Math.round((pesoActual + salto) * 2) / 2;
}

/**
 * Obtiene el historial completo de e1RM para un ejercicio básico del usuario.
 * Los datos se extraen de las series ya realizadas.
 *
 * @param {string} userId - ID del usuario autenticado
 * @param {string} nombreBasico - Nombre exacto del ejercicio (ej: 'Sentadilla libre trasera')
 * @param {number} semanas - Número de semanas hacia atrás a consultar (default 4)
 * @returns {Array<{fecha: string, e1rm: number, peso: number, reps: number, rir: number}>}
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
        .limit(100); // margen suficiente

    if (error || !data) {
        console.error('Error obteniendo historial e1RM:', error?.message);
        return [];
    }

    return data.map(s => ({
        fecha: s.created_at,
        e1rm: s.e1rm_estimado || calcularE1RM(s.peso_kg, s.reps_completadas, s.rir_reportado || 0),
        peso: s.peso_kg,
        reps: s.reps_completadas,
        rir: s.rir_reportado
    }));
}

/**
 * Determina si un básico necesita deload analizando la caída sostenida
 * del e1RM durante dos semanas consecutivas (Trigger A del documento).
 *
 * @param {Array} historial - Array de objetos {e1rm, fecha} ordenado desc por fecha
 * @param {number} umbralCaida - Porcentaje de caída para activar alarma (default 5%)
 * @returns {boolean} True si debe activarse un deload
 */
export function necesitaDeloadPorE1RM(historial, umbralCaida = 5) {
    if (!historial || historial.length < 3) return false;

    // Agrupar por semana ISO (año-semana)
    const porSemana = {};
    historial.forEach(h => {
        const fecha = new Date(h.fecha);
        const semanaISO = getISOWeek(fecha); // formato: "YYYY-Www"
        if (!porSemana[semanaISO] || h.e1rm > porSemana[semanaISO]) {
            porSemana[semanaISO] = h.e1rm;
        }
    });

    const semanas = Object.entries(porSemana)
        .sort((a, b) => b[0].localeCompare(a[0])); // más reciente primero

    if (semanas.length < 3) return false;

    // Ultimas tres semanas: [actual, anterior, anteanterior]
    const actual = semanas[0][1];
    const anterior = semanas[1][1];
    const hace2 = semanas[2][1];

    const caida1 = ((anterior - actual) / anterior) * 100;
    const caida2 = ((hace2 - anterior) / hace2) * 100;

    // Se activa si ambas caídas son positivas (e1RM bajando) y la primera supera el umbral
    return caida1 > umbralCaida && caida2 > 0;
}

/**
 * Devuelve la semana ISO de una fecha en formato "YYYY-Www".
 * @param {Date} date
 * @returns {string}
 */
function getISOWeek(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/**
 * Obtiene el último e1RM guardado para un ejercicio concreto del usuario.
 * (Filtro adicional por usuario implícito en las políticas RLS).
 *
 * @param {string} userId - ID del usuario
 * @param {number} exerciseId - ID del ejercicio en la tabla exercises
 * @returns {number|null} e1RM más reciente o null si no existe
 */
export async function obtenerUltimoE1RM(userId, exerciseId) {
    const { data, error } = await supabase
        .from('workout_sets')
        .select('e1rm_estimado')
        .filter('workout_exercises.exercise_id', 'eq', exerciseId)
        .not('e1rm_estimado', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) {
        console.warn('Error al obtener último e1RM:', error.message);
        return null;
    }
    return data?.e1rm_estimado || null;
}

/**
 * Calcula el e1RM y actualiza la serie correspondiente en la base de datos.
 *
 * @param {string} setId - ID del registro en workout_sets
 * @param {number} peso - Peso usado en la serie
 * @param {number} reps - Repeticiones completadas
 * @param {number} rir - RIR reportado (0-5)
 */
export async function guardarE1RMEnSerie(setId, peso, reps, rir) {
    const e1rm = calcularE1RM(peso, reps, rir);
    if (e1rm > 0) {
        const { error } = await supabase
            .from('workout_sets')
            .update({ e1rm_estimado: e1rm })
            .eq('id', setId);

        if (error) {
            console.error('Error al guardar e1RM en serie:', error.message);
        }
    }
}
