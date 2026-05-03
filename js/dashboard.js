// =====================================================
// TitanCap.OS - js/dashboard.js
// Dashboard principal: saludo, frase, días de la semana
// =====================================================

import { supabase } from './supabase-client.js';
import { showScreen, navigateToDay, showSurvey, logout } from './nav.js';

let currentWeekId = null;
let currentWeekNumber = null;

// Renderizar dashboard
export async function renderDashboard() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    showScreen('auth-screen');
    return;
  }

  // Obtener perfil
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

  // Frase motivacional aleatoria
  const { data: phrases } = await supabase
    .from('motivational_phrases')
    .select('phrase, author');
  if (phrases && phrases.length > 0) {
    const random = phrases[Math.floor(Math.random() * phrases.length)];
    document.getElementById('frase-motivacional').textContent = 
      `"${random.phrase}" — ${random.author}`;
  }

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
    card.className = 'day-card';
    if (day.completed) card.classList.add('completed');
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

  // Verificar si todos los días están completados para mostrar botón de encuesta
  const allCompleted = days.every(d => d.completed);
  const btnCompletar = document.getElementById('btn-completar-semana');
  if (allCompleted) {
    btnCompletar.textContent = '✅ Encuesta de Fatiga';
    btnCompletar.onclick = () => showSurvey(currentWeekId);
  } else {
    btnCompletar.textContent = '⏳ Semana en progreso';
    btnCompletar.onclick = () => alert('Completa todos los días antes de enviar la encuesta.');
  }

  // Botón de reiniciar (elimina datos de la semana actual y vuelve a empezar)
  document.getElementById('btn-reiniciar').onclick = async () => {
    if (confirm('¿Reiniciar todo? Perderás el progreso de esta semana y empezarás de nuevo.')) {
      await supabase.from('weekly_programs').delete().eq('id', currentWeekId);
      // Redirigir a perfil para volver a generar primera semana
      showScreen('profile-screen');
    }
  };

  // Botón de cerrar sesión (lo añadimos en la esquina superior)
  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) logoutBtn.onclick = () => logout();
}
