// =====================================================
// TitanCap.OS - js/profile.js (v3.2 – Onboarding premium)
// Formulario de perfil con catálogo desde Supabase,
// precarga de datos existentes y validación mejorada.
// =====================================================

import { supabase } from './supabase-client.js';
import { generateFirstWeek } from './generator.js';
import { showScreen } from './nav.js';

// Mapeo de nombres de grupo para UI
const grupoNames = {
  pecho: 'Pecho', espalda: 'Espalda', deltoides: 'Hombros',
  biceps: 'Bíceps', triceps: 'Tríceps', antebrazo: 'Antebrazos',
  cuadriceps: 'Cuádriceps', isquios: 'Isquiotibiales', gluteos: 'Glúteos',
  pantorrilla: 'Gemelos', abdomen: 'Abdomen'
};

/**
 * Renderiza el formulario de perfil, cargando ejercicios desde Supabase
 * y precargando los datos si el perfil ya existe.
 */
export async function renderProfileForm() {
  const formContainer = document.getElementById('profile-form');
  if (!formContainer) return;

  // Mostrar mini-loader mientras se cargan los datos
  formContainer.innerHTML = '<div class="spinner">Cargando configuración…</div>';

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    formContainer.innerHTML = '<p style="color:red;">Sesión expirada. Recarga la página.</p>';
    return;
  }

  // Obtener perfil existente (si ya completó el onboarding)
  const { data: perfilExistente } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  // Obtener ejercicios desde Supabase
  const { data: exercises, error: exError } = await supabase
    .from('exercises')
    .select('*')
    .order('grupo_muscular');

  if (exError || !exercises || exercises.length === 0) {
    formContainer.innerHTML = '<p style="color:red;">Error al cargar ejercicios. Recarga la página.</p>';
    return;
  }

  // Obtener equipamiento ya seleccionado
  const { data: equipamientoExistente } = await supabase
    .from('user_equipment')
    .select('exercise_id')
    .eq('user_id', user.id);

  const selectedIds = (equipamientoExistente || []).map(e => e.exercise_id);

  // Agrupar ejercicios por grupo muscular
  const grouped = {};
  exercises.forEach(ex => {
    if (!grouped[ex.grupo_muscular]) grouped[ex.grupo_muscular] = [];
    grouped[ex.grupo_muscular].push(ex);
  });

  // Prellenar valores del perfil
  const p = perfilExistente || {};

  // Construir el formulario
  formContainer.innerHTML = `
    <h2 style="margin-bottom: 20px;">🔧 Configuración de tu perfil</h2>

    <div class="section">
      <h3>Datos básicos</h3>
      <div class="input-group"><label>Nombre</label><input type="text" id="nombre" value="${p.nombre || ''}" required></div>
      <div class="input-row">
        <div class="input-group"><label>Edad</label><input type="number" id="edad" min="14" max="80" value="${p.edad || ''}" required></div>
        <div class="input-group"><label>Peso (kg)</label><input type="number" id="peso" step="0.1" value="${p.peso_kg || ''}" required></div>
        <div class="input-group"><label>Estatura (cm)</label><input type="number" id="estatura" value="${p.estatura_cm || ''}" required></div>
      </div>
      <div class="input-group">
        <label>Género</label>
        <select id="genero">
          <option value="masculino" ${p.genero === 'masculino' ? 'selected' : ''}>Masculino</option>
          <option value="femenino" ${p.genero === 'femenino' ? 'selected' : ''}>Femenino</option>
        </select>
      </div>
    </div>

    <div class="section">
      <h3>Experiencia y nutrición</h3>
      <div class="input-group">
        <label>Experiencia en gimnasio</label>
        <select id="experiencia">
          <option value="1" ${p.experiencia_entrenamiento_meses == 1 ? 'selected' : ''}>Menos de 6 meses</option>
          <option value="6" ${p.experiencia_entrenamiento_meses == 6 ? 'selected' : ''}>6 meses - 1 año</option>
          <option value="12" ${p.experiencia_entrenamiento_meses == 12 ? 'selected' : ''}>1 - 2 años</option>
          <option value="24" ${p.experiencia_entrenamiento_meses == 24 ? 'selected' : ''}>2 - 4 años</option>
          <option value="48" ${p.experiencia_entrenamiento_meses == 48 ? 'selected' : ''}>Más de 4 años</option>
        </select>
      </div>
      <div class="input-group">
        <label>Dieta actual</label>
        <select id="dieta">
          <option value="deficit" ${p.dieta === 'deficit' ? 'selected' : ''}>Déficit calórico</option>
          <option value="mantenimiento" ${(!p.dieta || p.dieta === 'mantenimiento') ? 'selected' : ''}>Mantenimiento</option>
          <option value="superavit" ${p.dieta === 'superavit' ? 'selected' : ''}>Superávit calórico</option>
        </select>
      </div>
      <div class="input-group">
        <label>Horas de sueño promedio</label><input type="number" id="horas_sueno" min="4" max="12" step="0.5" value="${p.horas_sueno_promedio || '7'}">
      </div>
    </div>

    <div class="section">
      <h3>1RM en ejercicios básicos (kg)</h3>
      <div class="input-row">
        <div class="input-group"><label>Sentadilla</label><input type="number" id="rm_sentadilla" step="0.5" placeholder="0" value="${p.rm_sentadilla || ''}"></div>
        <div class="input-group"><label>Press Banca</label><input type="number" id="rm_banca" step="0.5" placeholder="0" value="${p.rm_banca || ''}"></div>
        <div class="input-group"><label>Peso Muerto</label><input type="number" id="rm_peso_muerto" step="0.5" placeholder="0" value="${p.rm_peso_muerto || ''}"></div>
      </div>
    </div>

    <div class="section">
      <h3>Objetivo y disponibilidad</h3>
      <div class="input-group">
        <label>Objetivo principal</label>
        <select id="objetivo">
          <option value="hipertrofia" ${p.objetivo === 'hipertrofia' ? 'selected' : ''}>Ganar masa muscular</option>
          <option value="fuerza" ${p.objetivo === 'fuerza' ? 'selected' : ''}>Fuerza máxima en básicos</option>
          <option value="mixto" ${(!p.objetivo || p.objetivo === 'mixto') ? 'selected' : ''}>Mixto (fuerza + hipertrofia)</option>
        </select>
      </div>
      <div class="input-row">
        <div class="input-group"><label>Días/semana</label><input type="number" id="dias_disponibles" min="2" max="6" value="${p.dias_disponibles || '4'}"></div>
        <div class="input-group"><label>Minutos/sesión</label><input type="number" id="tiempo_sesion" min="30" max="120" value="${p.tiempo_por_sesion_min || '60'}"></div>
      </div>
      <div class="input-group">
        <label>Preferencia de esfuerzo</label>
        <select id="preferencia_fallo">
          <option value="siempre_fallo" ${p.preferencia_fallo === 'siempre_fallo' ? 'selected' : ''}>Siempre al fallo</option>
          <option value="rir_1_3" ${(!p.preferencia_fallo || p.preferencia_fallo === 'rir_1_3') ? 'selected' : ''}>Dejo 1-3 repeticiones en reserva</option>
        </select>
      </div>
    </div>

    <div class="section">
      <h3>Equipamiento disponible</h3>
      <p style="font-size: 0.85rem; color: #aaa;">Marca los ejercicios/equipos que tienes</p>
      <div id="equipment-groups"></div>
    </div>

    <div class="form-actions">
      <button type="submit" class="btn-primary" id="btn-guardar-perfil">
        <span id="btn-texto">${perfilExistente ? 'Actualizar perfil y regenerar' : 'Generar mi Primera Semana'}</span>
        <span id="btn-loader" style="display:none;">⏳ Guardando…</span>
      </button>
    </div>
  `;

  // Construir dinámicamente la sección de equipamiento
  const eqContainer = document.getElementById('equipment-groups');
  for (const [grupo, ejerciciosGrupo] of Object.entries(grouped)) {
    const div = document.createElement('div');
    div.className = 'equipment-group';
    div.innerHTML = `
      <h4>${grupoNames[grupo] || grupo}</h4>
      <div class="checkbox-grid">
        ${ejerciciosGrupo.map(ex => {
          const checked = selectedIds.includes(ex.id) || ex.es_basico;
          return `
            <label class="checkbox-item ${checked ? 'selected' : ''}">
              <input type="checkbox" name="equipamiento" value="${ex.id}" ${checked ? 'checked' : ''}>
              <span>${ex.nombre} <small>(${ex.equipamiento})</small></span>
            </label>
          `;
        }).join('')}
      </div>
    `;
    eqContainer.appendChild(div);
  }

  // Efecto visual: al hacer clic en la etiqueta, se marca/desmarca
  eqContainer.addEventListener('change', (e) => {
    if (e.target.name === 'equipamiento') {
      e.target.closest('.checkbox-item')?.classList.toggle('selected', e.target.checked);
    }
  });

  // Escuchar el envío del formulario
  formContainer.addEventListener('submit', async (e) => {
    e.preventDefault();
    await guardarPerfil();
  });
}

/**
 * Guarda el perfil y el equipamiento, y genera la primera semana.
 * Muestra un loader mientras trabaja.
 */
async function guardarPerfil() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    alert('Sesión no encontrada. Vuelve a iniciar sesión.');
    return;
  }

  const btnTexto = document.getElementById('btn-texto');
  const btnLoader = document.getElementById('btn-loader');
  const btnGuardar = document.getElementById('btn-guardar-perfil');

  // Deshabilitar botón y mostrar loader
  btnGuardar.disabled = true;
  btnTexto.style.display = 'none';
  btnLoader.style.display = 'inline';

  // Recoger valores del formulario
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

  // Guardar perfil
  const { error: perfilError } = await supabase
    .from('profiles')
    .upsert(perfil, { onConflict: 'id' });

  if (perfilError) {
    console.error('Error al guardar perfil:', perfilError);
    alert('Error al guardar perfil: ' + perfilError.message);
    btnGuardar.disabled = false;
    btnTexto.style.display = 'inline';
    btnLoader.style.display = 'none';
    return;
  }

  // Recoger ejercicios seleccionados
  const checkboxes = document.querySelectorAll('input[name="equipamiento"]:checked');
  const exerciseIds = Array.from(checkboxes).map(cb => parseInt(cb.value));

  if (exerciseIds.length === 0) {
    alert('Selecciona al menos un ejercicio.');
    btnGuardar.disabled = false;
    btnTexto.style.display = 'inline';
    btnLoader.style.display = 'none';
    return;
  }

  // Guardar equipamiento (upsert)
  const equipamiento = exerciseIds.map(exId => ({
    user_id: user.id,
    exercise_id: exId
  }));

  const { error: eqError } = await supabase
    .from('user_equipment')
    .upsert(equipamiento, { onConflict: 'user_id, exercise_id' });

  if (eqError) {
    console.error('Error al guardar equipamiento:', eqError);
    alert('Error al guardar el equipamiento: ' + eqError.message);
    btnGuardar.disabled = false;
    btnTexto.style.display = 'inline';
    btnLoader.style.display = 'none';
    return;
  }

  // Generar primera semana
  try {
    await generateFirstWeek(user.id);
    // Ir al dashboard (donde se mostrará la instalación PWA si corresponde)
    showScreen('dashboard-screen');
  } catch (err) {
    console.error('Error al generar rutina:', err);
    alert('Error al generar la primera semana: ' + err.message);
    btnGuardar.disabled = false;
    btnTexto.style.display = 'inline';
    btnLoader.style.display = 'none';
  }
}
