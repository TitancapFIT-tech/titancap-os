// =====================================================
// TitanCap.OS - js/dashboard.js (v2 - Frases + Refresco)
// =====================================================

import { supabase } from './supabase-client.js';
import { showScreen, navigateToDay, showSurvey, logout } from './nav.js';

let currentWeekId = null;
let currentWeekNumber = null;

/**
 * Renderiza el dashboard principal:
 * - Saludo personalizado
 * - Frase motivacional aleatoria
 * - Días de entrenamiento de la semana activa
 */
export async function renderDashboard() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    showScreen('auth-screen');
    return;
  }

  // Obtener perfil (nombre)
  const { data: perfil } = await supabase
    .from('profiles')
    .select('nombre')
    .eq('id', user.id)
    .single();

  // Obtener la semana activa más reciente
  const { data: activeWeek, error } = await supabase
    .from('weekly_programs')
    .select('*')
    .eq('user_id', user.id)
    .order('week_number', { ascending: false })
    .limit(1)
    .single();

  if (error || !activeWeek) {
    // Si no hay semana, redirigir a perfil para crear primera
    showScreen('profile-screen');
    return;
  }

  currentWeekId = activeWeek.id;
  currentWeekNumber = activeWeek.week_number;

  // Saludo personalizado
  const nombre = perfil?.nombre || 'Atleta';
  document.getElementById('saludo-personalizado').textContent =
    `Hola ${nombre}, es hora de tu Semana ${currentWeekNumber}`;

  // Cargar y mostrar frase motivacional aleatoria
  cargarFraseMotivacional();

  // Obtener los días de la semana activa
  const { data: days, error: daysError } = await supabase
    .from('workout_days')
    .select('*')
    .eq('weekly_program_id', activeWeek.id)
    .order('day_number');

  if (daysError) {
    console.error(daysError);
    return;
  }

  // Renderizar tarjetas de días
  const container = document.getElementById('week-days-container');
  container.innerHTML = '';

  days.forEach(day => {
    const card = document.createElement('div');
    card.className = 'day-card' + (day.completed ? ' completed' : '');
    card.innerHTML = `
      <h3>Día ${day.day_number}</h3>
      <p>${day.enfoque || ''}</p>
      <span class="status">${day.completed ? '✅' : '⏳'}</span>
    `;
    card.addEventListener('click', () => {
      navigateToDay(day.id);
    });
    container.appendChild(card);
  });

  // Configurar botón "Semana Completada"
  const allCompleted = days.every(d => d.completed);
  const btnCompletar = document.getElementById('btn-completar-semana');
  if (allCompleted) {
    btnCompletar.textContent = '✅ Encuesta de Fatiga';
    btnCompletar.onclick = () => showSurvey(currentWeekId);
  } else {
    btnCompletar.textContent = '⏳ Semana en progreso';
    btnCompletar.onclick = () => alert('Completa todos los días antes de enviar la encuesta.');
  }

  // Botón de reinicio
  document.getElementById('btn-reiniciar').onclick = async () => {
    if (confirm('¿Reiniciar todo? Perderás el progreso de esta semana y empezarás de nuevo.')) {
      await supabase.from('weekly_programs').delete().eq('id', currentWeekId);
      showScreen('profile-screen');
    }
  };

  // Botón de cerrar sesión
  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) logoutBtn.onclick = () => logout();
}

/**
 * Obtiene una frase aleatoria de la tabla motivational_phrases y la muestra.
 */
async function cargarFraseMotivacional() {
  const fraseEl = document.getElementById('frase-motivacional');
  if (!fraseEl) return;

  try {
    // Obtener frases de Supabase
    const { data: phrases, error } = await supabase
      .from('motivational_phrases')
      .select('phrase, author');

    if (error) throw error;

    if (phrases && phrases.length > 0) {
      const random = phrases[Math.floor(Math.random() * phrases.length)];
      fraseEl.textContent = `"${random.phrase}" — ${random.author}`;
      fraseEl.style.display = 'block';
    } else {
      // Respaldo: frase estática si la tabla está vacía
      fraseEl.textContent = '"El dolor de la disciplina no es nada comparado con el dolor del arrepentimiento." — Anónimo';
      fraseEl.style.display = 'block';
    }
  } catch (err) {
    console.warn('Error cargando frase motivacional:', err.message);
    // Mostrar frase de respaldo
    fraseEl.textContent = '"La disciplina es el puente entre las metas y los logros." — Jim Rohn';
    fraseEl.style.display = 'block';
  }
}
