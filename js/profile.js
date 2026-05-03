// =====================================================
// TitanCap.OS - js/profile.js
// Formulario de creación de perfil del atleta
// =====================================================

import { supabase } from './supabase-client.js';
import { generateFirstWeek } from './generator.js';

// Renderizar el formulario de perfil
export async function renderProfileForm() {
  const container = document.getElementById('profile-form');
  
  // Obtener catálogo de ejercicios para selección de equipamiento
  const { data: exercises } = await supabase
    .from('exercises')
    .select('*')
    .order('grupo_muscular');

  // Agrupar por grupo muscular
  const grouped = {};
  exercises.forEach(ex => {
    if (!grouped[ex.grupo_muscular]) grouped[ex.grupo_muscular] = [];
    grouped[ex.grupo_muscular].push(ex);
  });

  container.innerHTML = `
    <h2 style="margin-bottom: 20px;">🔧 Configuración de tu perfil</h2>
    <form id="profile-form-inner">
      <!-- DATOS BÁSICOS -->
      <div class="section">
        <h3>Datos básicos</h3>
        <div class="input-group">
          <label>Nombre</label>
          <input type="text" id="nombre" required>
        </div>
        <div class="input-row">
          <div class="input-group">
            <label>Edad</label>
            <input type="number" id="edad" min="14" max="80" required>
          </div>
          <div class="input-group">
            <label>Peso (kg)</label>
            <input type="number" id="peso" step="0.1" required>
          </div>
          <div class="input-group">
            <label>Estatura (cm)</label>
            <input type="number" id="estatura" required>
          </div>
        </div>
        <div class="input-group">
          <label>Género</label>
          <select id="genero">
            <option value="masculino">Masculino</option>
            <option value="femenino">Femenino</option>
          </select>
        </div>
      </div>

      <!-- EXPERIENCIA Y DIETA -->
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
            <option value="deficit">Déficit calórico (pérdida de grasa)</option>
            <option value="mantenimiento" selected>Mantenimiento</option>
            <option value="superavit">Superávit calórico (ganancia muscular)</option>
          </select>
        </div>
        <div class="input-group">
          <label>Horas de sueño promedio</label>
          <input type="number" id="horas_sueno" min="4" max="12" step="0.5" value="7">
        </div>
      </div>

      <!-- MARCAS DE FUERZA -->
      <div class="section">
        <h3>1RM en ejercicios básicos (kg)</h3>
        <div class="input-row">
          <div class="input-group">
            <label>Sentadilla</label>
            <input type="number" id="rm_sentadilla" step="0.5" placeholder="0 si no sabes">
          </div>
          <div class="input-group">
            <label>Press Banca</label>
            <input type="number" id="rm_banca" step="0.5" placeholder="0 si no sabes">
          </div>
          <div class="input-group">
            <label>Peso Muerto</label>
            <input type="number" id="rm_peso_muerto" step="0.5" placeholder="0 si no sabes">
          </div>
        </div>
      </div>

      <!-- OBJETIVO Y DISPONIBILIDAD -->
      <div class="section">
        <h3>Objetivo y disponibilidad</h3>
        <div class="input-group">
          <label>Objetivo principal</label>
          <select id="objetivo">
            <option value="hipertrofia">Ganar masa muscular</option>
            <option value="fuerza">Fuerza máxima en básicos</option>
            <option value="mixto">Mixto (fuerza + hipertrofia)</option>
          </select>
        </div>
        <div class="input-row">
          <div class="input-group">
            <label>Días/semana</label>
            <input type="number" id="dias_disponibles" min="2" max="6" value="4">
          </div>
          <div class="input-group">
            <label>Minutos/sesión</label>
            <input type="number" id="tiempo_sesion" min="30" max="120" value="60">
          </div>
        </div>
        <div class="input-group">
          <label>Preferencia de esfuerzo</label>
          <select id="preferencia_fallo">
            <option value="siempre_fallo">Siempre al fallo</option>
            <option value="rir_1_3" selected>Dejo 1-3 repeticiones en reserva (RIR)</option>
          </select>
        </div>
      </div>

      <!-- EQUIPAMIENTO DISPONIBLE -->
      <div class="section">
        <h3>Equipamiento disponible</h3>
        <p style="font-size: 0.85rem; color: #aaa;">Marca los ejercicios/equipos que tienes</p>
        <div id="equipment-groups"></div>
      </div>

      <button type="submit" class="btn-primary" style="margin-top: 20px;">Generar mi Primera Semana</button>
    </form>
  `;

  // Renderizar grupos de equipamiento
  const eqContainer = document.getElementById('equipment-groups');
  const grupoNames = {
    pecho: 'Pecho',
    espalda: 'Espalda',
    deltoides: 'Hombros',
    biceps: 'Bíceps',
    triceps: 'Tríceps',
    antebrazo: 'Antebrazos',
    cuadriceps: 'Cuádriceps',
    isquios: 'Isquiotibiales',
    gluteos: 'Glúteos',
    pantorrilla: 'Gemelos',
    abdomen: 'Abdomen'
  };
  
  for (const [grupo, ejercicios] of Object.entries(grouped)) {
    const div = document.createElement('div');
    div.className = 'equipment-group';
    div.innerHTML = `
      <h4>${grupoNames[grupo] || grupo}</h4>
      <div class="checkbox-grid">
        ${ejercicios.map(ex => `
          <label class="checkbox-item">
            <input type="checkbox" name="equipamiento" value="${ex.id}" ${ex.es_basico ? 'checked' : ''}>
            <span>${ex.nombre} <small>(${ex.equipamiento})</small></span>
          </label>
        `).join('')}
      </div>
    `;
    eqContainer.appendChild(div);
  }

  // Enviar formulario
  document.getElementById('profile-form-inner').addEventListener('submit', async (e) => {
    e.preventDefault();
    await guardarPerfil();
  });
}

async function guardarPerfil() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return alert('No estás autenticado');

  // Recoger datos del formulario
  const perfil = {
    id: user.id,
    email: user.email,
    nombre: document.getElementById('nombre').value,
    edad: parseInt(document.getElementById('edad').value),
    peso_kg: parseFloat(document.getElementById('peso').value),
    estatura_cm: parseInt(document.getElementById('estatura').value),
    genero: document.getElementById('genero').value,
    experiencia_entrenamiento_meses: parseInt(document.getElementById('experiencia').value),
    dieta: document.getElementById('dieta').value,
    horas_sueno_promedio: parseFloat(document.getElementById('horas_sueno').value),
    rm_sentadilla: parseFloat(document.getElementById('rm_sentadilla').value) || 0,
    rm_banca: parseFloat(document.getElementById('rm_banca').value) || 0,
    rm_peso_muerto: parseFloat(document.getElementById('rm_peso_muerto').value) || 0,
    objetivo: document.getElementById('objetivo').value,
    dias_disponibles: parseInt(document.getElementById('dias_disponibles').value),
    tiempo_por_sesion_min: parseInt(document.getElementById('tiempo_sesion').value),
    preferencia_fallo: document.getElementById('preferencia_fallo').value,
    nivel_estres: 3
  };

  // Insertar perfil
  const { error: perfilError } = await supabase
    .from('profiles')
    .upsert(perfil, { onConflict: 'id' });

  if (perfilError) return alert('Error guardando perfil: ' + perfilError.message);

  // Guardar equipamiento seleccionado
  const checkboxes = document.querySelectorAll('input[name="equipamiento"]:checked');
  const equipamiento = Array.from(checkboxes).map(cb => ({
    user_id: user.id,
    exercise_id: parseInt(cb.value)
  }));

  // Limpiar equipamiento anterior
  await supabase.from('user_equipment').delete().eq('user_id', user.id);
  if (equipamiento.length > 0) {
    await supabase.from('user_equipment').insert(equipamiento);
  }

  // Generar primera semana automáticamente
  try {
    await generateFirstWeek(user.id);
    showScreen('dashboard-screen');
  } catch (err) {
    alert('Error generando rutina: ' + err.message);
  }
}
