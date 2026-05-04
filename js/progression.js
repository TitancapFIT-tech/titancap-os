// =====================================================
// TitanCap.OS - js/progression.js (NUEVO - Motor de Progresión)
// Sistemas: Lineal, Doble, Triple, DUP, WUP
// Pivote automático entre sistemas según estancamiento
// =====================================================

import { supabase } from './supabase-client.js';
import { PROGRESSION_SYSTEMS, REP_RANGES } from './config.js';
import { calcularE1RM, sugerirPeso, incrementarPeso } from './erm.js';

// ------------------------------------------------------
// 1. DETERMINAR SISTEMA DE PROGRESIÓN SEGÚN NIVEL Y PERFIL
// ------------------------------------------------------
export function determinarSistemaProgresion(perfil) {
    const meses = perfil.experiencia_entrenamiento_meses || 12;
    const dias = perfil.dias_disponibles || 4;
    const fuerzaAbsoluta = {
        sentadilla: perfil.rm_sentadilla || 0,
        press_banca: perfil.rm_banca || 0,
        peso_muerto: perfil.rm_peso_muerto || 0
    };

    // Nivel según meses
    let nivel = 'principiante';
    if (meses >= 12 && meses < 24) nivel = 'intermedio';
    else if (meses >= 24) nivel = 'avanzado';

    // Sistema base por nivel
    let sistema = PROGRESSION_SYSTEMS[nivel]?.system || 'lineal';

    // Si es avanzado, decidir entre Triple, DUP o WUP
    if (nivel === 'avanzado') {
        if (dias >= 4 && fuerzaAbsoluta.sentadilla < 250 && fuerzaAbsoluta.press_banca < 140 && fuerzaAbsoluta.peso_muerto < 250) {
            sistema = 'dup'; // Alta frecuencia, cargas moderadas
        } else if (fuerzaAbsoluta.sentadilla >= 250 || fuerzaAbsoluta.press_banca >= 140 || fuerzaAbsoluta.peso_muerto >= 250) {
            sistema = 'wup'; // Cargas muy altas, necesita más recuperación
        } else {
            sistema = 'triple';
        }
    } else if (nivel === 'intermedio') {
        sistema = 'doble';
    } else {
        sistema = 'lineal';
    }

    return { nivel, sistema };
}

// ------------------------------------------------------
// 2. APLICAR PROGRESIÓN DE CARGAS A UN EJERCICIO
// ------------------------------------------------------
export function aplicarProgresionCargas(workoutExercise, perfil, historialReciente) {
    const { nivel, sistema } = determinarSistemaProgresion(perfil);
    const ejercicio = workoutExercise.exercises;

    // Solo progresamos ejercicios básicos con pesos
    if (!ejercicio.es_basico) {
        return aplicarProgresionNoBasico(workoutExercise, historialReciente);
    }

    switch (sistema) {
        case 'lineal':
            return aplicarLineal(workoutExercise, historialReciente);
        case 'doble':
            return aplicarDoble(workoutExercise, historialReciente);
        case 'triple':
            return aplicarTriple(workoutExercise, historialReciente);
        case 'dup':
            return aplicarDUP(workoutExercise, historialReciente, perfil);
        case 'wup':
            return aplicarWUP(workoutExercise, historialReciente, perfil);
        default:
            return { peso: null, repsMin: workoutExercise.reps_min, repsMax: workoutExercise.reps_max, series: workoutExercise.series_objetivo };
    }
}

// ------------------------------------------------------
// 3. SISTEMA LINEAL (Principiante)
//    Subir peso +2.5 o +5 kg cada sesión si completa con RPE <= 8
// ------------------------------------------------------
function aplicarLineal(workoutExercise, historial) {
    const ultimo = historial?.[0];
    let nuevoPeso = null;
    let stallDetectado = false;

    if (ultimo && ultimo.completed && ultimo.rpe_reportado <= 8) {
        // Éxito: incrementar
        const basico = mapearBasico(workoutExercise.exercises.nombre);
        nuevoPeso = incrementarPeso(ultimo.peso_kg, basico);
    } else if (ultimo && (!ultimo.completed || ultimo.rpe_reportado > 9)) {
        // Fallo: mantener peso, registrar posible stall
        nuevoPeso = ultimo.peso_kg;
        stallDetectado = true;
    }

    // Verificar stall: 2 sesiones consecutivas sin éxito -> sugerir pivotar a doble
    if (stallDetectado && historial.length >= 2) {
        const anterior = historial[1];
        if (anterior && (!anterior.completed || anterior.rpe_reportado > 9)) {
            return {
                peso: nuevoPeso,
                repsMin: workoutExercise.reps_min,
                repsMax: workoutExercise.reps_max,
                series: workoutExercise.series_objetivo,
                pivotarA: 'doble',
                motivo: 'Dos sesiones consecutivas sin completar con RPE ≤ 9'
            };
        }
    }

    return { peso: nuevoPeso, repsMin: workoutExercise.reps_min, repsMax: workoutExercise.reps_max, series: workoutExercise.series_objetivo };
}

// ------------------------------------------------------
// 4. SISTEMA DOBLE PROGRESIÓN (Intermedio)
//    Subir reps dentro del rango → al tope subir peso y volver al mínimo
// ------------------------------------------------------
function aplicarDoble(workoutExercise, historial) {
    const ultimo = historial?.[0];
    if (!ultimo || !ultimo.completed) {
        return { peso: ultimo?.peso_kg || null, repsMin: workoutExercise.reps_min, repsMax: workoutExercise.reps_max, series: workoutExercise.series_objetivo };
    }

    const repsActuales = ultimo.reps_completadas;
    const repsMax = workoutExercise.reps_max;
    const repsMin = workoutExercise.reps_min;

    if (repsActuales >= repsMax) {
        // Llegó al tope: subir peso, bajar reps al mínimo
        const basico = mapearBasico(workoutExercise.exercises.nombre);
        const nuevoPeso = incrementarPeso(ultimo.peso_kg, basico);
        return { peso: nuevoPeso, repsMin: repsMin, repsMax: repsMax, series: workoutExercise.series_objetivo };
    } else {
        // Subir reps: incrementar 1-2 reps
        const nuevasReps = Math.min(repsMax, repsActuales + 2);
        return { peso: ultimo.peso_kg, repsMin: nuevasReps, repsMax: nuevasReps, series: workoutExercise.series_objetivo };
    }
}

// ------------------------------------------------------
// 5. SISTEMA TRIPLE PROGRESIÓN (Avanzado)
//    Reps → Series → Peso
// ------------------------------------------------------
function aplicarTriple(workoutExercise, historial) {
    // Similar a doble pero con una fase intermedia de añadir series
    // Fase 1: subir reps hasta tope
    // Fase 2: añadir 1 serie manteniendo reps al máximo
    // Fase 3: subir peso y reiniciar
    const ultimo = historial?.[0];
    if (!ultimo || !ultimo.completed) {
        return { peso: ultimo?.peso_kg || null, repsMin: workoutExercise.reps_min, repsMax: workoutExercise.reps_max, series: workoutExercise.series_objetivo };
    }

    const repsActuales = ultimo.reps_completadas;
    const repsMax = workoutExercise.reps_max;
    const seriesActuales = workoutExercise.series_objetivo; // Asumimos que esto se actualiza

    if (repsActuales >= repsMax && seriesActuales < 5) {
        // Fase Series: mantener peso y reps máximas, añadir 1 serie
        return { peso: ultimo.peso_kg, repsMin: repsMax, repsMax: repsMax, series: seriesActuales + 1 };
    } else if (repsActuales >= repsMax && seriesActuales >= 5) {
        // Fase Peso: subir peso, bajar series al original y reps al mínimo
        const basico = mapearBasico(workoutExercise.exercises.nombre);
        const nuevoPeso = incrementarPeso(ultimo.peso_kg, basico);
        return { peso: nuevoPeso, repsMin: workoutExercise.reps_min, repsMax: workoutExercise.reps_max, series: 3 }; // series iniciales originales
    } else {
        // Fase Reps: subir reps
        const nuevasReps = Math.min(repsMax, repsActuales + 1);
        return { peso: ultimo.peso_kg, repsMin: nuevasReps, repsMax: nuevasReps, series: seriesActuales };
    }
}

// ------------------------------------------------------
// 6. DUP (Daily Undulating Periodization)
//    Ondular intensidad/volumen por día dentro de la semana
// ------------------------------------------------------
function aplicarDUP(workoutExercise, historial, perfil) {
    // La ondulación se aplica en la construcción de la semana (generator.js)
    // Aquí solo devolvemos la progresión independiente por tipo de día
    // El tipo de día (Fuerza/Volumen/Potencia) viene en workoutExercise.duo_type
    const tipoDia = workoutExercise.dup_type || 'volumen'; // 'fuerza', 'volumen', 'potencia'
    const ultimo = historial?.[0];

    if (!ultimo || !ultimo.completed) {
        return { peso: ultimo?.peso_kg || null, repsMin: workoutExercise.reps_min, repsMax: workoutExercise.reps_max, series: workoutExercise.series_objetivo };
    }

    switch (tipoDia) {
        case 'fuerza':
            // Progresión lineal simple en día de fuerza
            if (ultimo.rpe_reportado <= 8) {
                const basico = mapearBasico(workoutExercise.exercises.nombre);
                return { peso: incrementarPeso(ultimo.peso_kg, basico), repsMin: workoutExercise.reps_min, repsMax: workoutExercise.reps_max, series: workoutExercise.series_objetivo };
            }
            break;
        case 'volumen':
            // Doble progresión en día de volumen
            return aplicarDoble(workoutExercise, historial);
        case 'potencia':
            // Mantener peso ligero, solo subir si RPE < 5
            if (ultimo.rpe_reportado < 5) {
                return { peso: ultimo.peso_kg + 2.5, repsMin: workoutExercise.reps_min, repsMax: workoutExercise.reps_max, series: workoutExercise.series_objetivo };
            }
            break;
    }
    return { peso: ultimo.peso_kg, repsMin: workoutExercise.reps_min, repsMax: workoutExercise.reps_max, series: workoutExercise.series_objetivo };
}

// ------------------------------------------------------
// 7. WUP (Weekly Undulating Periodization)
//    Ondular por semana: Hipertrofia → Fuerza → Pico → Descarga
// ------------------------------------------------------
function aplicarWUP(workoutExercise, historial, perfil) {
    // La semana actual tiene un tipo (hipertrofia, fuerza, pico, descarga)
    // que se establece en generator.js según el mesociclo.
    // Aquí la progresión solo aplica entre semanas del mismo tipo.
    const tipoSemana = workoutExercise.wup_phase || 'hipertrofia'; // 'hipertrofia', 'fuerza', 'pico', 'descarga'

    if (tipoSemana === 'descarga') {
        return { peso: null, repsMin: workoutExercise.reps_min, repsMax: workoutExercise.reps_max, series: workoutExercise.series_objetivo };
    }

    // Comparar con la misma semana del ciclo anterior (si existe)
    // Para simplificar, usamos progresión doble dentro de cada semana
    return aplicarDoble(workoutExercise, historial);
}

// ------------------------------------------------------
// 8. PROGRESIÓN PARA EJERCICIOS NO BÁSICOS (AISLADOS)
//    Doble progresión clásica (reps → peso) guiada por RIR
// ------------------------------------------------------
function aplicarProgresionNoBasico(workoutExercise, historial) {
    const ultimo = historial?.[0];
    if (!ultimo || !ultimo.completed) {
        return { peso: null, repsMin: workoutExercise.reps_min, repsMax: workoutExercise.reps_max, series: workoutExercise.series_objetivo };
    }

    const repsActuales = ultimo.reps_completadas;
    const repsMax = workoutExercise.reps_max;
    if (repsActuales >= repsMax && ultimo.rir_reportado <= 2) {
        // Subir peso ligeramente (2.5-5% o salto mínimo)
        const nuevoPeso = ultimo.peso_kg + 2.5;
        return { peso: nuevoPeso, repsMin: workoutExercise.reps_min, repsMax: workoutExercise.reps_max, series: workoutExercise.series_objetivo };
    } else if (repsActuales < repsMax) {
        const nuevasReps = Math.min(repsMax, repsActuales + 2);
        return { peso: ultimo.peso_kg, repsMin: nuevasReps, repsMax: nuevasReps, series: workoutExercise.series_objetivo };
    }
    return { peso: ultimo.peso_kg, repsMin: workoutExercise.reps_min, repsMax: workoutExercise.reps_max, series: workoutExercise.series_objetivo };
}

// ------------------------------------------------------
// 9. GUARDAR SISTEMA DE PROGRESIÓN ACTUAL EN EL PROGRAMA
// ------------------------------------------------------
export async function guardarSistemaProgresion(userId, weekProgramId, sistema) {
    await supabase
        .from('weekly_programs')
        .update({ progression_system: sistema })
        .eq('id', weekProgramId)
        .eq('user_id', userId);
}

// ------------------------------------------------------
// 10. UTILIDAD: MAPEAR NOMBRE DE EJERCICIO A CLAVE BÁSICO
// ------------------------------------------------------
function mapearBasico(nombre) {
    const map = {
        'Sentadilla libre trasera': 'sentadilla',
        'Peso muerto convencional': 'peso_muerto',
        'Press de banca plano con barra': 'press_banca'
    };
    return map[nombre] || 'press_banca';
}
