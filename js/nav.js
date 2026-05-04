// =====================================================
// TitanCap.OS - js/nav.js (v3.2 – Navegación unificada)
// Control de pantallas, enrutamiento y arranque
// =====================================================

import { checkSession, renderAuthForm, signOut, initPWA } from './auth.js';
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
 * Muestra la pantalla indicada y dispara su lógica de renderizado.
 * @param {string} screenId - ID del contenedor a mostrar.
 * @param {object} [data] - Datos adicionales (ej. { dayId } para workout).
 */
export function showScreen(screenId, data = null) {
  // Ocultar todas las pantallas
  Object.values(screens).forEach(s => s?.classList.remove('active'));

  // Cerrar modal de encuesta si estuviera abierto
  const modal = document.getElementById('survey-modal');
  if (modal) modal.classList.remove('active');

  // Mostrar la pantalla deseada
  const target = screens[screenId];
  if (target) target.classList.add('active');

  // Llamar a la función de renderizado correspondiente
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
 * @param {string} dayId - UUID del workout_day.
 */
export function navigateToDay(dayId) {
  showScreen('workout-screen', { dayId });
}

/**
 * Abre el modal de la encuesta de fatiga para una semana.
 * @param {string} weekId - UUID del weekly_program.
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
 * Punto de entrada de la aplicación.
 * 1. Inicializa el listener de instalación PWA (centralizado en auth.js).
 * 2. Muestra pantalla de carga con feedback visual.
 * 3. Verifica la sesión y redirige a la pantalla adecuada.
 * 4. Incluye un timeout de seguridad para evitar bloqueos.
 */
export function initApp() {
  console.log('[TitanCap.OS] initApp() ejecutada');

  // 1. Inicializar el listener de instalación PWA (no duplicado)
  initPWA();

  // 2. Mostrar pantalla de carga con mensaje dinámico
  showScreen('loading-screen');
  const loadingMsg = document.getElementById('loading-message');
  if (loadingMsg) {
    loadingMsg.textContent = 'TitanCap.OS está iniciando tu sistema…';
  }

  // 3. Timeout de seguridad (8 segundos)
  let resolved = false;
  const safetyTimeout = setTimeout(() => {
    if (!resolved && screens['loading-screen']?.classList.contains('active')) {
      console.warn('[TitanCap.OS] Timeout de verificación alcanzado. Redirigiendo a auth.');
      showScreen('auth-screen');
    }
  }, 8000);

  // 4. Verificar sesión
  console.log('[TitanCap.OS] Verificando sesión…');
  checkSession()
    .then(sessionData => {
      resolved = true;
      clearTimeout(safetyTimeout);
      console.log('[TitanCap.OS] Sesión verificada:', sessionData);
      if (!sessionData) {
        showScreen('auth-screen');
      } else if (!sessionData.hasProfile) {
        showScreen('profile-screen');
      } else {
        showScreen('dashboard-screen');
      }
    })
    .catch(error => {
      resolved = true;
      clearTimeout(safetyTimeout);
      console.error('[TitanCap.OS] Error en initApp:', error);
      showScreen('auth-screen');
    });
}
