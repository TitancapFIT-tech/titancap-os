// =====================================================
// TitanCap.OS - js/nav.js (CORREGIDO - integración limpia)
// =====================================================

import { checkSession, renderAuthForm, signOut } from './auth.js';
import { renderProfileForm } from './profile.js';
import { renderDashboard } from './dashboard.js';
import { renderWorkoutDay } from './workout.js';
import { openSurvey } from './survey.js';

// Referencias a los contenedores de pantalla
const screens = {
  'loading-screen': document.getElementById('loading-screen'),
  'auth-screen': document.getElementById('auth-screen'),
  'profile-screen': document.getElementById('profile-screen'),
  'dashboard-screen': document.getElementById('dashboard-screen'),
  'workout-screen': document.getElementById('workout-screen'),
};

/**
 * Cambia a una pantalla específica y ejecuta su lógica de renderizado.
 * @param {string} screenId - ID de la pantalla a mostrar.
 * @param {object} [data] - Datos adicionales (ej. dayId para workout-screen).
 */
export function showScreen(screenId, data = null) {
  // Ocultar todas las pantallas
  Object.values(screens).forEach(s => s?.classList.remove('active'));
  // Cerrar modal de encuesta si estuviera abierto
  const modal = document.getElementById('survey-modal');
  if (modal) modal.classList.remove('active');
  
  // Mostrar la pantalla solicitada
  const target = screens[screenId];
  if (target) target.classList.add('active');

  // Disparar la función de renderizado correspondiente
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

/**
 * Navega a la pantalla de entrenamiento del día.
 * @param {string} dayId - ID del workout_day en Supabase.
 */
export function navigateToDay(dayId) {
  showScreen('workout-screen', { dayId });
}

/**
 * Abre el modal de encuesta de fatiga para una semana concreta.
 * @param {string} weekId - ID del weekly_program en Supabase.
 */
export function showSurvey(weekId) {
  openSurvey(weekId);
}

/**
 * Cierra sesión y vuelve a la pantalla de autenticación.
 */
export async function logout() {
  await signOut();
  showScreen('auth-screen');
}

/**
 * Inicializa la aplicación:
 * 1. Muestra pantalla de carga.
 * 2. Verifica sesión en Supabase.
 * 3. Redirige a la pantalla correcta (auth, perfil o dashboard).
 * Incluye un timeout de seguridad por si la verificación se bloquea.
 */
export function initApp() {
  showScreen('loading-screen');

  // Timeout de seguridad: si tras 6 segundos sigue en loading, forzamos auth
  let resolved = false;
  const safetyTimeout = setTimeout(() => {
    if (!resolved && screens['loading-screen']?.classList.contains('active')) {
      console.warn('Timeout de verificación alcanzado. Mostrando auth por seguridad.');
      showScreen('auth-screen');
    }
  }, 6000);

  // Verificar sesión
  checkSession()
    .then(sessionData => {
      resolved = true;
      clearTimeout(safetyTimeout);
      if (!sessionData) {
        // No hay sesión activa
        showScreen('auth-screen');
      } else if (!sessionData.hasProfile) {
        // Sesión activa pero falta perfil de atleta
        showScreen('profile-screen');
      } else {
        // Sesión activa con perfil completo -> Dashboard
        showScreen('dashboard-screen');
      }
    })
    .catch(error => {
      resolved = true;
      clearTimeout(safetyTimeout);
      console.error('Error en initApp:', error);
      showScreen('auth-screen');
    });
}
