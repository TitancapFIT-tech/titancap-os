// =====================================================
// TitanCap.OS - js/dashboard.js (v3.1 - Limpio)
// =====================================================

import { supabase } from './supabase-client.js';
import { showScreen, navigateToDay, showSurvey, logout } from './nav.js';

let currentWeekId = null;
let currentWeekNumber = null;

export async function renderDashboard() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { showScreen('auth-screen'); return; }

  const { data: perfil } = await supabase.from('profiles').select('nombre').eq('id', user.id).single();
  const { data: activeWeek, error } = await supabase.from('weekly_programs')
    .select('*').eq('user_id', user.id).order('week_number', { ascending: false }).limit(1).single();

  if (error || !activeWeek) { showScreen('profile-screen'); return; }

  currentWeekId = activeWeek.id;
  currentWeekNumber = activeWeek.week_number;

  document.getElementById('saludo-personalizado').textContent = `Hola ${perfil?.nombre || 'Atleta'}, es hora de tu Semana ${currentWeekNumber}`;
  cargarFraseMotivacional();

  const { data: days } = await supabase.from('workout_days')
    .select('*').eq('weekly_program_id', activeWeek.id).order('day_number');

  const container = document.getElementById('week-days-container');
  container.innerHTML = '';

  days.forEach(day => {
    const card = document.createElement('div');
    card.className = 'day-card' + (day.completed ? ' completed' : '');
    card.innerHTML = `<h3>Día ${day.day_number}</h3><p>${day.enfoque || ''}</p><span class="status">${day.completed ? '✅' : '⏳'}</span>`;
    card.addEventListener('click', () => navigateToDay(day.id));
    container.appendChild(card);
  });

  const allCompleted = days.every(d => d.completed);
  const btnCompletar = document.getElementById('btn-completar-semana');
  btnCompletar.textContent = allCompleted ? '✅ Encuesta de Fatiga' : '⏳ Semana en progreso';
  btnCompletar.onclick = allCompleted ? () => showSurvey(currentWeekId) : () => alert('Completa todos los días antes de enviar la encuesta.');

  document.getElementById('btn-reiniciar').onclick = async () => {
    if (confirm('¿Reiniciar todo?')) {
      await supabase.from('weekly_programs').delete().eq('id', currentWeekId);
      showScreen('profile-screen');
    }
  };

  document.getElementById('btn-logout').onclick = () => logout();
  initPWAInstall();
}

async function cargarFraseMotivacional() { /* lógica sin cambios */ }

// PWA Install
let deferredPrompt;
function initPWAInstall() {
  if (window.matchMedia('(display-mode: standalone)').matches) return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); deferredPrompt = e;
    setTimeout(() => {
      if (document.getElementById('dashboard-screen').classList.contains('active')) mostrarModalInstalacion();
    }, 3000);
  });
}
function mostrarModalInstalacion() { /* lógica del modal */ }
