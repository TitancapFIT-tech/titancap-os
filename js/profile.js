// =====================================================
// TitanCap.OS - js/profile.js (FORMULARIO CORREGIDO)
// =====================================================

import { supabase } from './supabase-client.js';
import { generateFirstWeek } from './generator.js';
import { EXERCISES } from './config.js';

const grupoNames = {
  pecho: 'Pecho', espalda: 'Espalda', deltoides: 'Hombros',
  biceps: 'Bíceps', triceps: 'Tríceps', antebrazo: 'Antebrazos',
  cuadriceps: 'Cuádriceps', isquios: 'Isquiotibiales', gluteos: 'Glúteos',
  pantorrilla: 'Gemelos', abdomen: 'Abdomen'
};

export async function renderProfileForm() {
  const formContainer = document.getElementById('profile-form'); // es un <form>
  if (!formContainer) return;

  // Catálogo local para la interfaz
  const exercises = EXERCISES.map((ex, idx) => ({ ...ex, localId: idx + 1 }));
  console.log('Ejercicios cargados desde catálogo local:', exercises.length);

  const grouped = {};
  exercises.forEach(ex => {
    if (!grouped[ex.grupo_muscular]) grouped[ex.grupo_muscular] = [];
    grouped[ex.grupo_muscular].push(ex);
  });

  // Construir el interior del formulario (sin <form> anidado)
  formContainer.innerHTML = `
    <h2 style="margin-bottom: 20px;">🔧 Configuración de tu perfil</h2>

    <div class="section">
      <h3>Datos básicos</h3>
      <div class="input-group"><label>Nombre</label><input type="text" id="nombre" required></div>
      <div class="input-row">
        <div class="input-group"><label>Edad</label><input type="number" id="edad" min="14" max="80" required></div>
        <div class="input-group"><label>Peso (kg)</label><input type="number" id="peso" step="0.1" required></div>
        <div class="input-group"><label>Estatura (cm)</label><input type="number" id="estatura" required></div>
      </div>
      <div class="input-group">
        <label>Género</label>
        <select id="genero"><option value="masculino">Masculino</option><option value="femenino">Femenino</option></select>
      </div>
    </div>

    <div class="section">
      <h3>Experiencia y nutrición</h3>
      <div class="input-group">
        <label>Experiencia en gimnasio</label>
        <select id="experiencia">
          <option value="1">Menos de 6 meses</option>
          <option value="6">6 meses - 1 año</option>
          <option value="12" selected>1 - 2 años</option>
          <option value="24">2 - 4 años</option>
          <option value="48">Más de 4 años</option>
        </select>
      </div>
      <div class="input-group">
        <label>Dieta actual</label>
        <select id="dieta">
          <option value="deficit">Déficit calórico</option>
          <option value="mantenimiento" selected>Mantenimiento</option>
          <option value="superavit">Superávit calórico</option>
        </select>
      </div>
      <div class="input-group">
        <label>Horas de sueño promedio</label><input type="number" id="horas_sueno" min="4" max="12" step="0.5" value="7">
      </div>
    </div>

    <div class="section">
      <h3>1RM en ejercicios básicos (kg)</h3>
      <div class="input-row">
        <div class="input-group"><label>Sentadilla</label><input type="number" id="rm_sentadilla" step="0.5" placeholder="0"></div>
        <div class="input-group"><label>Press Banca</label><input type="number" id="rm_banca" step="0.5" placeholder="0"></div>
        <div class="input-group"><label>Peso Muerto</label><input type="number" id="rm_peso_muerto" step="0.5" placeholder="0"></div>
      </div>
    </div>

    <div class="section">
      <h3>Objetivo y disponibilidad</h3>
      <div class="input-group">
        <label>Objetivo principal</label>
        <select id="objetivo">
          <option value="hipertrofia">Ganar masa muscular</option>
          <option value="fuerza">Fuerza máxima en básicos</option>
          <option value="mixto" selected>Mixto (fuerza + hipertrofia)</option>
        </select>
      </div>
      <div class="input-row">
        <div class="input-group"><label>Días/semana</label><input type="number" id="dias_disponibles" min="2" max="6" value="4"></div>
        <div class="input-group"><label>Minutos/sesión</label><input type="number" id="tiempo_sesion" min="30" max="120" value="60"></div>
      </div>
      <div class="input-group">
        <label>Preferencia de esfuerzo</label>
        <select id="preferencia_fallo">
          <option value="siempre_fallo">Siempre al fallo</option>
          <option value="rir_1_3" selected>Dejo 1-3 repeticiones en reserva</option>
        </select>
      </div>
    </div>

    <div class="section">
      <h3>Equipamiento disponible</h3>
      <p style="font-size: 0.85rem; color: #aaa;">Marca los ejercicios/equipos que tienes</p>
      <div id="equipment-groups"></div>
    </div>

    <button type="submit" class="btn-primary" style="margin-top: 20px;">Generar mi Primera Semana</button>
  `;

  // Construir la sección de equipamiento (checkboxes)
  const eqContainer = document.getElementById('equipment-groups');
  for (const [grupo, ejercicios] of Object.entries(grouped)) {
    const div = document.createElement('div');
    div.className = 'equipment-group';
    div.innerHTML = `
      <h4>${grupoNames[grupo] || grupo}</h4>
      <div class="checkbox-grid">
        ${ejercicios.map(ex => `
          <label class="checkbox-item">
            <input type="checkbox" name="equipamiento" value="${ex.nombre}" ${ex.es_basico ? 'checked' : ''}>
            <span>${ex.nombre} <small>(${ex.equipamiento})</small></span>
          </label>
        `).join('')}
      </div>
    `;
    eqContainer.appendChild(div);
  }

  // Escuchar el envío del formulario principal (sin anidamiento)
  formContainer.addEventListener('submit', async (e) => {
    e.preventDefault();
    await guardarPerfil();
  });
}

async function guardarPerfil() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    alert('Sesión no encontrada. Vuelve a iniciar sesión.');
    return;
  }

  const perfil = {
    id: user.id,
    email: user.email,
    nombre: document.getElementById('nombre').value.trim(),
    edad: parseInt(document.getElementById('edad').value) || 20,
    peso_kg: parseFloat(document.getElementById('peso').value) || 70,
    estatura_cm: parseInt(document.getElementById('estatura').value) || 170,
    genero: document.getElementById('genero').value,
    experiencia_entrenamiento_meses: parseInt(document.getElementById('experiencia').value) || 12,
    dieta: document.getElementById('dieta').value,
    horas_sueno_promedio: parseFloat(document.getElementById('horas_sueno').value) || 7,
    rm_sentadilla: parseFloat(document.getElementById('rm_sentadilla').value) || 0,
    rm_banca: parseFloat(document.getElementById('rm_banca').value) || 0,
    rm_peso_muerto: parseFloat(document.getElementById('rm_peso_muerto').value) || 0,
    objetivo: document.getElementById('objetivo').value,
    dias_disponibles: parseInt(document.getElementById('dias_disponibles').value) || 4,
    tiempo_por_sesion_min: parseInt(document.getElementById('tiempo_sesion').value) || 60,
    preferencia_fallo: document.getElementById('preferencia_fallo').value,
    nivel_estres: 3
  };

  const { error: perfilError } = await supabase
    .from('profiles')
    .upsert(perfil, { onConflict: 'id' });

  if (perfilError) {
    console.error('Error al guardar perfil:', perfilError);
    alert('Error al guardar perfil: ' + perfilError.message);
    return;
  }

  const checkboxes = document.querySelectorAll('input[name="equipamiento"]:checked');
  const nombresSeleccionados = Array.from(checkboxes).map(cb => cb.value);
  if (nombresSeleccionados.length === 0) {
    alert('Selecciona al menos un ejercicio.');
    return;
  }

  // Obtener los IDs reales desde la tabla exercises usando los nombres
  let exercisesSupabase = [];
  try {
    const { data, error } = await supabase
      .from('exercises')
      .select('id, nombre')
      .in('nombre', nombresSeleccionados);
    if (error) throw error;
    exercisesSupabase = data || [];
  } catch (err) {
    console.error('Error obteniendo ejercicios de Supabase:', err);
    alert('Error al sincronizar el equipamiento. Intenta de nuevo.');
    return;
  }

  if (exercisesSupabase.length === 0) {
    alert('No se encontraron los ejercicios seleccionados en la base de datos.');
    return;
  }

  const equipamiento = exercisesSupabase.map(ex => ({
    user_id: user.id,
    exercise_id: ex.id
  }));

  await supabase.from('user_equipment').delete().eq('user_id', user.id);
  const { error: eqError } = await supabase.from('user_equipment').insert(equipamiento);

  if (eqError) {
    console.error('Error al guardar equipamiento:', eqError);
    alert('Error al guardar el equipamiento: ' + eqError.message);
    return;
  }

  try {
    await generateFirstWeek(user.id);
    const { showScreen } = await import('./nav.js');
    showScreen('dashboard-screen');
  } catch (err) {
    console.error('Error al generar rutina:', err);
    alert('Error al generar la primera semana: ' + err.message);
  }
}
