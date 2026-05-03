// =====================================================
// TitanCap.OS - js/config.js (completo)
// Tablas científicas, constantes y catálogo de ejercicios
// =====================================================

// ------------------------------------------------------
// VOLUME_TABLE: Volumen semanal por grupo muscular
// ------------------------------------------------------
export const VOLUME_TABLE = {
    pecho: {
        principiante: { MV: [4,6],  ideal: [6,8],   MRV: [8,12]  },
        intermedio:   { MV: [6,8],  ideal: [8,12],  MRV: [12,16] },
        avanzado:     { MV: [8,10], ideal: [10,14], MRV: [14,20] }
    },
    espalda: {
        principiante: { MV: [5,7],  ideal: [7,10],  MRV: [10,14] },
        intermedio:   { MV: [8,10], ideal: [10,14], MRV: [14,20] },
        avanzado:     { MV: [10,12], ideal: [12,16], MRV: [16,24] }
    },
    deltoides: {
        principiante: { MV: [4,6],  ideal: [6,8],   MRV: [8,12]  },
        intermedio:   { MV: [6,8],  ideal: [8,12],  MRV: [12,16] },
        avanzado:     { MV: [8,10], ideal: [10,14], MRV: [14,20] }
    },
    cuadriceps: {
        principiante: { MV: [4,6],  ideal: [6,8],   MRV: [8,12]  },
        intermedio:   { MV: [6,8],  ideal: [8,12],  MRV: [12,18] },
        avanzado:     { MV: [8,10], ideal: [10,14], MRV: [14,22] }
    },
    isquios: {
        principiante: { MV: [4,6],  ideal: [6,8],   MRV: [8,12]  },
        intermedio:   { MV: [6,8],  ideal: [8,12],  MRV: [12,16] },
        avanzado:     { MV: [8,10], ideal: [10,14], MRV: [14,20] }
    },
    gluteos: {
        principiante: { MV: [4,6],  ideal: [6,8],   MRV: [8,12]  },
        intermedio:   { MV: [6,8],  ideal: [8,12],  MRV: [12,16] },
        avanzado:     { MV: [8,10], ideal: [10,14], MRV: [14,20] }
    },
    biceps: {
        principiante: { MV: [2,4],  ideal: [4,6],   MRV: [6,10]  },
        intermedio:   { MV: [4,6],  ideal: [6,10],  MRV: [10,14] },
        avanzado:     { MV: [6,8],  ideal: [8,12],  MRV: [12,16] }
    },
    triceps: {
        principiante: { MV: [2,4],  ideal: [4,6],   MRV: [6,10]  },
        intermedio:   { MV: [4,6],  ideal: [6,10],  MRV: [10,16] },
        avanzado:     { MV: [6,8],  ideal: [8,14],  MRV: [14,20] }
    },
    pantorrilla: {
        principiante: { MV: [4,6],  ideal: [6,8],   MRV: [8,14]  },
        intermedio:   { MV: [6,8],  ideal: [8,12],  MRV: [12,18] },
        avanzado:     { MV: [8,10], ideal: [10,14], MRV: [14,20] }
    },
    abdomen: {
        principiante: { MV: [3,5],  ideal: [5,8],   MRV: [8,12]  },
        intermedio:   { MV: [4,6],  ideal: [6,10],  MRV: [10,14] },
        avanzado:     { MV: [6,8],  ideal: [8,12],  MRV: [12,16] }
    },
    antebrazo: {
        principiante: { MV: [2,4],  ideal: [4,6],   MRV: [6,8]   },
        intermedio:   { MV: [4,6],  ideal: [6,8],   MRV: [8,12]  },
        avanzado:     { MV: [6,8],  ideal: [8,10],  MRV: [10,14] }
    }
};

// ------------------------------------------------------
// BASELINE_HYPERTROPHY: básicos (Chad Wesley Smith)
// ------------------------------------------------------
export const BASELINE_HYPERTROPHY = {
    sentadilla: 13,
    press_banca: 17,
    peso_muerto: 9
};

// ------------------------------------------------------
// STRESS_INDEX_COEFFICIENTS
// ------------------------------------------------------
export const STRESS_INDEX_COEFFICIENTS = {
    multi_libre:    { intercept: 1.4, slope: -0.2 },
    multi_maquina:  { intercept: 1.3, slope: -0.2 },
    mono_libre:     { intercept: 1.3, slope: -0.2 },
    mono_maquina:   { intercept: 1.2, slope: -0.2 }
};

// ------------------------------------------------------
// PROGRESSION_SYSTEMS
// ------------------------------------------------------
export const PROGRESSION_SYSTEMS = {
    principiante: {
        system: 'lineal',
        description: 'Lineal sesión a sesión',
        mechanism: 'Aumento de carga fija (+2.5 a +5 kg por sesión)',
        stallRule: '2 sesiones consecutivas sin completar reps con técnica perfecta o RPE > 9',
        exitTo: 'doble'
    },
    intermedio: {
        system: 'doble',
        description: 'Doble progresión (Reps → Peso)',
        mechanism: 'Aumentar reps dentro del rango hasta el tope, luego subir peso 2.5-5% y volver al mínimo de reps',
        stallRule: 'No se logra aumentar reps en 2-3 semanas consecutivas',
        exitTo: 'triple'
    },
    avanzado: {
        system: 'triple_ondulante',
        description: 'Triple progresión / DUP / WUP',
        mechanism: 'Reps → Series → Peso, u ondulación diaria/semanal',
        stallRule: 'Estancamiento en dos mesociclos consecutivos',
        exitTo: 'descarga_prolongada'
    }
};

// ------------------------------------------------------
// SPLIT_PATTERNS
// ------------------------------------------------------
export const SPLIT_PATTERNS = {
    2: {
        type: 'full_body',
        days: ['Full Body A', 'Full Body B'],
        frequency: 'Alta frecuencia / bajo volumen por sesión'
    },
    3: {
        type: 'full_body_alt',
        days: ['Full Body A', 'Full Body B', 'Full Body C'],
        frequency: 'Alternancia de ejercicios'
    },
    4: {
        type: 'torso_pierna',
        days: ['Torso (Empuje)', 'Pierna', 'Torso (Tirón)', 'Pierna'],
        frequency: 'Frecuencia 2x por grupo muscular'
    },
    5: {
        type: 'ppl_modificado',
        days: ['Push', 'Pull', 'Legs', 'Push', 'Pull'],
        frequency: 'Frecuencia 1.6-2x'
    },
    6: {
        type: 'ppl',
        days: ['Push', 'Pull', 'Legs', 'Push', 'Pull', 'Legs'],
        frequency: 'Frecuencia 2x por grupo muscular'
    }
};

// ------------------------------------------------------
// REP_RANGES
// ------------------------------------------------------
export const REP_RANGES = {
    basico_fuerza:       { min: 4, max: 8,  rpe: [6,9], rir: [4,1] },
    basico_hipertrofia:  { min: 6, max: 10, rpe: [6,9], rir: [4,1] },
    aislado_hipertrofia: { min: 8, max: 20, rpe: [7,10], rir: [3,0] },
    alta_demanda_axial:  { min: 3, max: 6,  rpe: [6,8], rir: [4,2] }
};

// ------------------------------------------------------
// DELOAD_RULES
// ------------------------------------------------------
export const DELOAD_RULES = {
    volumePercent: 0.60,
    intensityPercent: 0.70,
    durationDays: 7,
    maxDurationDays: 10,
    triggers: [
        'Rendimiento sostenido a la baja',
        'Dolor articular que aumenta',
        'Sueño pobre varios días',
        'Apatía marcada',
        'Fatiga acumulada que no baja'
    ],
    rules: 'Bajar volumen más que intensidad. No es parar, es descomprimir.'
};

// ------------------------------------------------------
// FATIGA_DECISION_RULES
// ------------------------------------------------------
export const FATIGA_DECISION_RULES = {
    increase: {
        conditions: ['Sueño bueno (>7h)', 'Dieta en superávit', 'Estrés bajo', 'e1RM sube'],
        action: 'Aumentar 1-2 series hacia MRV'
    },
    decrease: {
        conditions: ['Dolor articular sí', 'e1RM cae significativamente'],
        action: 'Reducir 2-3 series o cambiar ejercicio'
    },
    deload: {
        conditions: ['Fatiga crónica sí'],
        action: 'Programar semana de descarga (60% volumen, 70% intensidad)'
    }
};

// ------------------------------------------------------
// ADJUSTMENT_FACTORS
// ------------------------------------------------------
export const ADJUSTMENT_FACTORS = {
    genero: {
        femenino: +5,
        masculino: 0
    },
    peso: {
        ligero: { umbral: 70, ajuste: +4 },
        superpesado: { umbral: 100, ajuste: -4 }
    },
    estatura: {
        baja: { umbral: 165, ajuste: +2 },
        alta: { umbral: 190, ajuste: -1 }
    },
    fuerza_absoluta: {
        elite: { ajuste: -3 }
    },
    experiencia_avanzada: {
        anios: 12,
        ajuste: -2
    },
    edad: {
        joven: { umbral: 25, ajuste: +1 },
        mayor: { umbral: 45, ajuste: -2 }
    },
    estilo_vida: {
        optimo: { ajuste: +1 },
        estresado: { ajuste: -3 }
    },
    peds: {
        uso: { ajuste: +3 }
    },
    recuperacion: {
        excepcional: { ajuste: +2 }
    }
};

// ------------------------------------------------------
// INTERDEPENDENCIA_FATIGA
// ------------------------------------------------------
export const INTERDEPENDENCIA_FATIGA = {
    pecho: {
        reduceA: [
            { grupo: 'triceps', factor: 0.7 },
            { grupo: 'deltoides', factor: 0.8 }
        ]
    },
    espalda: {
        reduceA: [
            { grupo: 'isquios', factor: 0.7 }
        ],
        nota: 'Si hay peso muerto pesado, reducir isquios un 30%'
    },
    cuadriceps: {
        reduceA: [
            { grupo: 'gluteos', factor: 0.85 }
        ]
    }
};

// ------------------------------------------------------
// EXERCISE_PRIORITIES
// ------------------------------------------------------
export const EXERCISE_PRIORITIES = {
    pecho: ['Press de banca plano con barra', 'Press inclinado con mancuernas', 'Aperturas con mancuernas', 'Cruces en poleas altas', 'Fondos en paralelas para pecho'],
    espalda: ['Dominadas', 'Remo con barra', 'Jalón al pecho en polea alta', 'Remo en punta o Barra T', 'Pull-over con mancuerna o polea'],
    deltoides: ['Press militar con barra', 'Elevaciones laterales con mancuernas', 'Face Pulls con cuerda', 'Pájaros / Elevaciones posteriores'],
    cuadriceps: ['Sentadilla libre trasera', 'Prensa de piernas 45°', 'Sentadilla búlgara', 'Extensiones de cuádriceps en máquina'],
    isquios: ['Peso muerto rumano', 'Curl femoral tumbado', 'Curl femoral sentado', 'Buenos días con barra'],
    gluteos: ['Puente de glúteos', 'Sentadilla búlgara', 'Zancadas / Lunges'],
    biceps: ['Curl de bíceps con barra recta o Z', 'Curl alterno con mancuernas', 'Curl martillo con mancuernas'],
    triceps: ['Press francés con barra Z', 'Extensiones en polea alta con barra o cuerda', 'Press de banca con agarre cerrado'],
    pantorrilla: ['Elevación de talones de pie en máquina', 'Elevación de talones sentado'],
    abdomen: ['Crunch abdominal', 'Plancha', 'Rueda abdominal'],
    antebrazo: ['Curl de muñeca en supinación', 'Paseo del granjero', 'Curl invertido con barra']
};

// ------------------------------------------------------
// CATÁLOGO COMPLETO DE EJERCICIOS (respaldo offline)
// ------------------------------------------------------
export const EXERCISES = [
    // PECHO
    { nombre: "Press de banca plano con barra", grupo_muscular: "pecho", tipo: "multi_libre", es_basico: true, equipamiento: "barra" },
    { nombre: "Press inclinado con mancuernas", grupo_muscular: "pecho", tipo: "multi_libre", es_basico: false, equipamiento: "mancuernas" },
    { nombre: "Aperturas con mancuernas", grupo_muscular: "pecho", tipo: "mono_libre", es_basico: false, equipamiento: "mancuernas" },
    { nombre: "Cruces en poleas altas", grupo_muscular: "pecho", tipo: "mono_maquina", es_basico: false, equipamiento: "cable" },
    { nombre: "Fondos en paralelas para pecho", grupo_muscular: "pecho", tipo: "multi_libre", es_basico: false, equipamiento: "peso_corporal" },
    { nombre: "Press de banca declinado", grupo_muscular: "pecho", tipo: "multi_libre", es_basico: false, equipamiento: "barra" },
    { nombre: "Peck Deck / Contratector", grupo_muscular: "pecho", tipo: "mono_maquina", es_basico: false, equipamiento: "maquina" },
    // ESPALDA
    { nombre: "Dominadas", grupo_muscular: "espalda", tipo: "multi_libre", es_basico: false, equipamiento: "peso_corporal" },
    { nombre: "Jalón al pecho en polea alta", grupo_muscular: "espalda", tipo: "multi_maquina", es_basico: false, equipamiento: "cable" },
    { nombre: "Remo con barra", grupo_muscular: "espalda", tipo: "multi_libre", es_basico: false, equipamiento: "barra" },
    { nombre: "Remo con mancuerna a una mano", grupo_muscular: "espalda", tipo: "multi_libre", es_basico: false, equipamiento: "mancuernas" },
    { nombre: "Remo Gironda / Polea baja", grupo_muscular: "espalda", tipo: "multi_maquina", es_basico: false, equipamiento: "cable" },
    { nombre: "Pull-over con mancuerna o polea", grupo_muscular: "espalda", tipo: "mono_libre", es_basico: false, equipamiento: "mancuernas" },
    { nombre: "Remo en punta o Barra T", grupo_muscular: "espalda", tipo: "multi_libre", es_basico: false, equipamiento: "barra" },
    { nombre: "Peso muerto convencional", grupo_muscular: "espalda", tipo: "multi_libre", es_basico: true, equipamiento: "barra" },
    // HOMBROS
    { nombre: "Press militar con barra", grupo_muscular: "deltoides", tipo: "multi_libre", es_basico: false, equipamiento: "barra" },
    { nombre: "Elevaciones laterales con mancuernas", grupo_muscular: "deltoides", tipo: "mono_libre", es_basico: false, equipamiento: "mancuernas" },
    { nombre: "Press Arnold", grupo_muscular: "deltoides", tipo: "multi_libre", es_basico: false, equipamiento: "mancuernas" },
    { nombre: "Pájaros / Elevaciones posteriores", grupo_muscular: "deltoides", tipo: "mono_libre", es_basico: false, equipamiento: "mancuernas" },
    { nombre: "Face Pulls con cuerda", grupo_muscular: "deltoides", tipo: "mono_maquina", es_basico: false, equipamiento: "cable" },
    { nombre: "Elevaciones frontales con disco o mancuerna", grupo_muscular: "deltoides", tipo: "mono_libre", es_basico: false, equipamiento: "mancuernas" },
    { nombre: "Remo al mentón", grupo_muscular: "deltoides", tipo: "multi_libre", es_basico: false, equipamiento: "barra" },
    // BÍCEPS
    { nombre: "Curl de bíceps con barra recta o Z", grupo_muscular: "biceps", tipo: "mono_libre", es_basico: false, equipamiento: "barra" },
    { nombre: "Curl alterno con mancuernas", grupo_muscular: "biceps", tipo: "mono_libre", es_basico: false, equipamiento: "mancuernas" },
    { nombre: "Curl martillo con mancuernas", grupo_muscular: "biceps", tipo: "mono_libre", es_basico: false, equipamiento: "mancuernas" },
    { nombre: "Curl predicador en banco Scott", grupo_muscular: "biceps", tipo: "mono_maquina", es_basico: false, equipamiento: "maquina" },
    { nombre: "Curl concentrado a una mano", grupo_muscular: "biceps", tipo: "mono_libre", es_basico: false, equipamiento: "mancuernas" },
    { nombre: "Curl de bíceps en polea baja", grupo_muscular: "biceps", tipo: "mono_maquina", es_basico: false, equipamiento: "cable" },
    // TRÍCEPS
    { nombre: "Press francés con barra Z", grupo_muscular: "triceps", tipo: "mono_libre", es_basico: false, equipamiento: "barra" },
    { nombre: "Extensiones en polea alta con barra o cuerda", grupo_muscular: "triceps", tipo: "mono_maquina", es_basico: false, equipamiento: "cable" },
    { nombre: "Press de banca con agarre cerrado", grupo_muscular: "triceps", tipo: "multi_libre", es_basico: false, equipamiento: "barra" },
    { nombre: "Fondos entre bancos o en paralelas", grupo_muscular: "triceps", tipo: "multi_libre", es_basico: false, equipamiento: "peso_corporal" },
    { nombre: "Extensión tras nuca / Copa", grupo_muscular: "triceps", tipo: "mono_libre", es_basico: false, equipamiento: "mancuernas" },
    { nombre: "Patada de tríceps con mancuerna", grupo_muscular: "triceps", tipo: "mono_libre", es_basico: false, equipamiento: "mancuernas" },
    // ANTEBRAZOS
    { nombre: "Curl de muñeca en supinación", grupo_muscular: "antebrazo", tipo: "mono_libre", es_basico: false, equipamiento: "mancuernas" },
    { nombre: "Curl de muñeca en pronación", grupo_muscular: "antebrazo", tipo: "mono_libre", es_basico: false, equipamiento: "mancuernas" },
    { nombre: "Paseo del granjero / Farmer's Walk", grupo_muscular: "antebrazo", tipo: "multi_libre", es_basico: false, equipamiento: "mancuernas" },
    { nombre: "Curl invertido con barra", grupo_muscular: "antebrazo", tipo: "mono_libre", es_basico: false, equipamiento: "barra" },
    // CUÁDRICEPS
    { nombre: "Sentadilla libre trasera", grupo_muscular: "cuadriceps", tipo: "multi_libre", es_basico: true, equipamiento: "barra" },
    { nombre: "Prensa de piernas 45°", grupo_muscular: "cuadriceps", tipo: "multi_maquina", es_basico: false, equipamiento: "maquina" },
    { nombre: "Extensiones de cuádriceps en máquina", grupo_muscular: "cuadriceps", tipo: "mono_maquina", es_basico: false, equipamiento: "maquina" },
    { nombre: "Sentadilla búlgara", grupo_muscular: "cuadriceps", tipo: "multi_libre", es_basico: false, equipamiento: "mancuernas" },
    { nombre: "Zancadas / Lunges", grupo_muscular: "cuadriceps", tipo: "multi_libre", es_basico: false, equipamiento: "mancuernas" },
    { nombre: "Sentadilla Hack", grupo_muscular: "cuadriceps", tipo: "multi_maquina", es_basico: false, equipamiento: "maquina" },
    // ISQUIOTIBIALES
    { nombre: "Peso muerto rumano", grupo_muscular: "isquios", tipo: "multi_libre", es_basico: false, equipamiento: "barra" },
    { nombre: "Curl femoral tumbado", grupo_muscular: "isquios", tipo: "mono_maquina", es_basico: false, equipamiento: "maquina" },
    { nombre: "Curl femoral sentado", grupo_muscular: "isquios", tipo: "mono_maquina", es_basico: false, equipamiento: "maquina" },
    { nombre: "Peso muerto piernas rígidas", grupo_muscular: "isquios", tipo: "multi_libre", es_basico: false, equipamiento: "barra" },
    { nombre: "Buenos días con barra", grupo_muscular: "isquios", tipo: "multi_libre", es_basico: false, equipamiento: "barra" },
    // GEMELOS
    { nombre: "Elevación de talones de pie en máquina", grupo_muscular: "pantorrilla", tipo: "mono_maquina", es_basico: false, equipamiento: "maquina" },
    { nombre: "Elevación de talones sentado", grupo_muscular: "pantorrilla", tipo: "mono_maquina", es_basico: false, equipamiento: "maquina" },
    { nombre: "Elevación de talones en prensa", grupo_muscular: "pantorrilla", tipo: "mono_maquina", es_basico: false, equipamiento: "maquina" },
    // ABDOMEN
    { nombre: "Crunch abdominal", grupo_muscular: "abdomen", tipo: "mono_libre", es_basico: false, equipamiento: "peso_corporal" },
    { nombre: "Rueda abdominal", grupo_muscular: "abdomen", tipo: "mono_libre", es_basico: false, equipamiento: "peso_corporal" },
    { nombre: "Crunch abdominal polea", grupo_muscular: "abdomen", tipo: "mono_maquina", es_basico: false, equipamiento: "cable" },
    { nombre: "Plancha", grupo_muscular: "abdomen", tipo: "mono_libre", es_basico: false, equipamiento: "peso_corporal" },
    // GLÚTEOS
    { nombre: "Puente de glúteos", grupo_muscular: "gluteos", tipo: "mono_libre", es_basico: false, equipamiento: "barra" }
];
