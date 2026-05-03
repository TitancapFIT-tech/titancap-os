// =====================================================
// TitanCap.OS - js/nav.js
// Enrutamiento de pantallas (SPA) y menú de navegación
// =====================================================

import { supabase } from './supabase-client.js';
import { checkSession, renderAuthForm, signOut } from './auth.js';
import { renderProfileForm } from './profile.js';
import { renderDashboard } from './dashboard.js';
import { renderWorkoutDay } from './workout.js';
import { openSurvey } from './survey.js';

// Mapa de pantallas
const screens = {
  'loading-screen': document.getElementById('loading-screen'),
  'auth-screen': document.getElementById('auth-screen'),
  'profile-screen': document.getElementById('profile-screen'),
  'dashboard-screen': document.getElementById('dashboard-screen'),
  'workout-screen': document.getElementById('workout-screen'),
};

// Cambiar de pantalla
export function showScreen(screenId, data = null) {
  // Ocultar todas las pantallas
  Object.values(screens).forEach(s => s?.classList.remove('active'));
  // Cerrar modal si está abierto
  document.getElementById('survey-modal')?.classList.remove('active');
  
  const target = screens[screenId];
  if (target) target.classList.add('active');

  // Renderizar contenido según pantalla
  switch (screenId) {
    case 'auth-screen':
      renderAuthForm();
      break;
    case 'profile-screen':
      renderProfileForm();
      break;
    case 'dashboard-screen':
      renderDashboard();
      break;
    case 'workout-screen':
      if (data?.dayId) renderWorkoutDay(data.dayId);
      break;
  }
}

// Navegación hacia un día de entrenamiento
export function navigateToDay(dayId) {
  showScreen('workout-screen', { dayId });
}

// Abrir encuesta desde cualquier lugar
export function showSurvey(weekId) {
  openSurvey(weekId);
}

// Cerrar sesión
export async function logout() {
  await signOut();
  showScreen('auth-screen');
}

// Inicializar la app
export async function initApp() {
  // Pantalla de carga rápida
  showScreen('loading-screen');
  
  // Verificar sesión existente
  await checkSession();
  
  // Ocultar loading tras breve pausa para transición suave
  setTimeout(() => {
    const loading = screens['loading-screen'];
    if (loading?.classList.contains('active')) {
      // Si sigue en loading, mostrar auth
      showScreen('auth-screen');
    }
  }, 1000);
}
