// =====================================================
// TitanCap.OS - js/progression.js (v3.2 - Auditoría final)
// Motor de Progresión: Lineal, Doble, Triple, DUP, WUP
// Pivote automático entre sistemas según estancamiento.
// =====================================================

import { supabase } from './supabase-client.js';
import { PROGRESSION_SYSTEMS, PESO_INCREMENTOS } from './config.js';
import { incrementarPeso } from './erm.js';

// ------------------------------------------------------
// 1. DETERMINAR SISTEMA DE PROGRESIÓN SEGÚN NIVEL Y PERFIL
//    Basado en "como hacer una sobrecarga segun nivel del usuario"
// ------------------------------------------------------
export function determinarSistemaProgresion(perfil) {
    const meses = perfil.experiencia_entrenamiento_meses || 0;
    const dias = perfil.dias_disponibles || 4;
    const fuerzaAbsoluta = {
        sentadilla: perfil.rm_sentadilla || 0,
        press_banca: perfil.rm_banca || 0,
        peso_muerto: perfil.rm_peso_muerto || 0
    };

    // Clasificación de nivel (documento)
    let nivel = 'principiante';
    if (meses >= 12 && meses < 24) nivel = 'intermedio';
    else if (meses >= 24) nivel = 'avanzado';

    // Sistema base según nivel (tabla del documento)
    let sistema = PROGRESSION_SYSTEMS[nivel]?.system || 'lineal';

    // Refinamiento para avanzados: DUP vs WUP
    if (nivel === 'avanzado') {
        const esMuyFuerte = fuerzaAbsoluta.sentadilla >= 250 ||
                            fuerzaAbsoluta.press_banca >= 140 ||
                            fuerzaAbsoluta.peso_muerto >= 250;
        if (dias >= 4 && !esMuyFuerte) {
            sistema = 'dup';  // Alta frecuencia, cargas moderadas
        } else if (dias < 4 || esMuyFuerte) {
            sistema = 'wup';  // Necesita más recuperación (cargas altas o baja frecuencia)
        } else {
            sistema = 'triple'; // Caso intermedio
        }
    } else if (nivel === 'intermedio') {
        sistema = 'doble';   // Doble progresión clásica
    } else {
        sistema = 'lineal';  // Principiante: lineal sesión a sesión
    }

    return { nivel, sistema };
}

// ------------------------------------------------------
// 2. APLICAR PROGRESIÓN DE CARGAS A UN EJERCICIO
//    Entrada: workoutExercise (objeto con exercises anidado),
//    perfil del usuario, historial reciente de series.
// ------------------------------------------------------
export function aplicarProgresionCargas(workoutExercise, perfil, historialReciente) {
    const { nivel, sistema } = determinarSistemaProgresion(perfil);
    const ejercicio = workoutExercise.exercises;

    // Los ejercicios no básicos siempre usan doble progresión
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
            // Fallback: mantener parámetros actuales
            return {
                peso: null,
                repsMin: workoutExercise.reps_min,
                repsMax: workoutExercise.reps_max,
                series: workoutExercise.series_objetivo
            };
    }
}

// ------------------------------------------------------
// 3. SISTEMA LINEAL (Principiante)
//    +2.5 / +5 kg por sesión si completa con RPE ≤ 8.
//    Tras dos fallos → sugiere pivotar a Doble.
// ------------------------------------------------------
function aplicarLineal(workoutExercise, historial) {
    const ultimo = historial?.[0];
    let nuevoPeso = null;
    let stallDetectado = false;

    if (ultimo && ultimo.completed && ultimo.rpe_reportado <= 8) {
        const basico = mapearBasico(workoutExercise.exercises.nombre);
        nuevoPeso = incrementarPeso(ultimo.peso_kg, basico);
    } else if (ultimo && (!ultimo.completed || ultimo.rpe_reportado > 9)) {
        nuevoPeso = ultimo.peso_kg;
        stallDetectado = true;
    }

    // Detectar estancamiento (dos sesiones consecutivas fallidas)
    if (stallDetectado && historial.length >= 2) {
        const anterior = historial[1];
        if (anterior && (!anterior.completed || anterior.rpe_reportado > 9)) {
            return {
                peso: nuevoPeso,
                repsMin: workoutExercise.reps_min,
                repsMax: workoutExercise.reps_max,
                series: workoutExercise.series_objetivo,
                pivotarA: 'doble',
                motivo: 'Dos sesiones consecutivas sin completar con RPE ≤ 9 (Stall)'
            };
        }
    }

    return {
        peso: nuevoPeso,
        repsMin: workoutExercise.reps_min,
        repsMax: workoutExercise.reps_max,
        series: workoutExercise.series_objetivo
    };
}

// ------------------------------------------------------
// 4. SISTEMA DOBLE PROGRESIÓN (Intermedio)
//    Subir reps dentro del rango → al tope subir peso y volver al mínimo.
// ------------------------------------------------------
function aplicarDoble(workoutExercise, historial) {
    const ultimo = historial?.[0];
    if (!ultimo || !ultimo.completed) {
        return {
            peso: ultimo?.peso_kg || null,
            repsMin: workoutExercise.reps_min,
            repsMax: workoutExercise.reps_max,
            series: workoutExercise.series_objetivo
        };
    }

    const repsActuales = ultimo.reps_completadas;
    const repsMax = workoutExercise.reps_max;
    const repsMin = workoutExercise.reps_min;

    if (repsActuales >= repsMax) {
        // Alcanzó el tope: aumentar peso y volver al mínimo de reps
        const basico = mapearBasico(workoutExercise.exercises.nombre);
        const nuevoPeso = incrementarPeso(ultimo.peso_kg, basico);
        return {
            peso: nuevoPeso,
            repsMin: repsMin,
            repsMax: repsMax,
            series: workoutExercise.series_objetivo
        };
    } else {
        // Subir reps (1-2 reps adicionales)
        const nuevasReps = Math.min(repsMax, repsActuales + 2);
        return {
            peso: ultimo.peso_kg,
            repsMin: nuevasReps,
            repsMax: nuevasReps,
            series: workoutExercise.series_objetivo
        };
    }
}

// ------------------------------------------------------
// 5. SISTEMA TRIPLE PROGRESIÓN (Avanzado)
//    Fase 1: subir reps → Fase 2: añadir series → Fase 3: subir peso.
// ------------------------------------------------------
function aplicarTriple(workoutExercise, historial) {
    const ultimo = historial?.[0];
    if (!ultimo || !ultimo.completed) {
        return {
            peso: ultimo?.peso_kg || null,
            repsMin: workoutExercise.reps_min,
            repsMax: workoutExercise.reps_max,
            series: workoutExercise.series_objetivo
        };
    }

    const repsActuales = ultimo.reps_completadas;
    const repsMax = workoutExercise.reps_max;
    const seriesActuales = workoutExercise.series_objetivo;

    if (repsActuales >= repsMax && seriesActuales < 5) {
        // Fase Series: mantener peso y reps máximas, añadir 1 serie
        return {
            peso: ultimo.peso_kg,
            repsMin: repsMax,
            repsMax: repsMax,
            series: seriesActuales + 1
        };
    } else if (repsActuales >= repsMax && seriesActuales >= 5) {
        // Fase Peso: subir peso, reiniciar series (a 3) y reps al mínimo
        const basico = mapearBasico(workoutExercise.exercises.nombre);
        const nuevoPeso = incrementarPeso(ultimo.peso_kg, basico);
        return {
            peso: nuevoPeso,
            repsMin: workoutExercise.reps_min,
            repsMax: workoutExercise.reps_max,
            series: 3 // series iniciales originales (configurable)
        };
    } else {
        // Fase Reps: incrementar reps
        const nuevasReps = Math.min(repsMax, repsActuales + 1);
        return {
            peso: ultimo.peso_kg,
            repsMin: nuevasReps,
            repsMax: nuevasReps,
            series: seriesActuales
        };
    }
}

// ------------------------------------------------------
// 6. DUP (Daily Undulating Periodization)
//    Ondula intensidad/volumen por día (Fuerza, Volumen, Potencia).
// ------------------------------------------------------
function aplicarDUP(workoutExercise, historial, perfil) {
    const tipoDia = workoutExercise.dup_type || 'volumen'; // 'fuerza', 'volumen', 'potencia'
    const ultimo = historial?.[0];

    if (!ultimo || !ultimo.completed) {
        return {
            peso: ultimo?.peso_kg || null,
            repsMin: workoutExercise.reps_min,
            repsMax: workoutExercise.reps_max,
            series: workoutExercise.series_objetivo
        };
    }

    switch (tipoDia) {
        case 'fuerza':
            // Progresión lineal simple en día de fuerza
            if (ultimo.rpe_reportado <= 8) {
                const basico = mapearBasico(workoutExercise.exercises.nombre);
                return {
                    peso: incrementarPeso(ultimo.peso_kg, basico),
                    repsMin: workoutExercise.reps_min,
                    repsMax: workoutExercise.reps_max,
                    series: workoutExercise.series_objetivo
                };
            }
            break;
        case 'volumen':
            // Doble progresión en día de volumen
            return aplicarDoble(workoutExercise, historial);
        case 'potencia':
            // Mantener peso ligero, solo subir si RPE < 5
            if (ultimo.rpe_reportado < 5) {
                return {
                    peso: ultimo.peso_kg + 2.5,
                    repsMin: workoutExercise.reps_min,
                    repsMax: workoutExercise.reps_max,
                    series: workoutExercise.series_objetivo
                };
            }
            break;
    }

    // Por defecto, mantener peso
    return {
        peso: ultimo.peso_kg,
        repsMin: workoutExercise.reps_min,
        repsMax: workoutExercise.reps_max,
        series: workoutExercise.series_objetivo
    };
}

// ------------------------------------------------------
// 7. WUP (Weekly Undulating Periodization)
//    Ondula por semana: Hipertrofia → Fuerza → Pico → Descarga.
// ------------------------------------------------------
function aplicarWUP(workoutExercise, historial, perfil) {
    const tipoSemana = workoutExercise.wup_phase || 'hipertrofia';

    if (tipoSemana === 'descarga') {
        // En descarga no se progresa; peso libre según RPE bajo
        return {
            peso: null,
            repsMin: workoutExercise.reps_min,
            repsMax: workoutExercise.reps_max,
            series: workoutExercise.series_objetivo
        };
    }

    // Progresión doble dentro de cada semana (entre ciclos se compara más tarde)
    return aplicarDoble(workoutExercise, historial);
}

// ------------------------------------------------------
// 8. PROGRESIÓN PARA EJERCICIOS NO BÁSICOS (AISLADOS)
//    Doble progresión clásica (reps → peso) guiada por RIR.
// ------------------------------------------------------
function aplicarProgresionNoBasico(workoutExercise, historial) {
    const ultimo = historial?.[0];
    if (!ultimo || !ultimo.completed) {
        return {
            peso: null,
            repsMin: workoutExercise.reps_min,
            repsMax: workoutExercise.reps_max,
            series: workoutExercise.series_objetivo
        };
    }

    const repsActuales = ultimo.reps_completadas;
    const repsMax = workoutExercise.reps_max;

    if (repsActuales >= repsMax && ultimo.rir_reportado <= 2) {
        // Subir peso ligeramente (2.5 kg)
        const nuevoPeso = ultimo.peso_kg + 2.5;
        return {
            peso: nuevoPeso,
            repsMin: workoutExercise.reps_min,
            repsMax: workoutExercise.reps_max,
            series: workoutExercise.series_objetivo
        };
    } else if (repsActuales < repsMax) {
        const nuevasReps = Math.min(repsMax, repsActuales + 2);
        return {
            peso: ultimo.peso_kg,
            repsMin: nuevasReps,
            repsMax: nuevasReps,
            series: workoutExercise.series_objetivo
        };
    }

    // Mantener
    return {
        peso: ultimo.peso_kg,
        repsMin: workoutExercise.reps_min,
        repsMax: workoutExercise.reps_max,
        series: workoutExercise.series_objetivo
    };
}

// ------------------------------------------------------
// 9. GUARDAR SISTEMA DE PROGRESIÓN ACTUAL EN LA BD
// ------------------------------------------------------
export async function guardarSistemaProgresion(userId, weekProgramId, sistema) {
    const { error } = await supabase
        .from('weekly_programs')
        .update({ progression_system: sistema })
        .eq('id', weekProgramId)
        .eq('user_id', userId);

    if (error) {
        console.error('Error al guardar el sistema de progresión:', error.message);
    }
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
