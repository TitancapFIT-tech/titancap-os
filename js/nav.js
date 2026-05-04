// =====================================================
// TitanCap.OS - js/nav.js (v3 - Ajustado PWA + Navegación)
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
 * 1. Captura el evento de instalación PWA.
 * 2. Muestra pantalla de carga.
 * 3. Verifica sesión en Supabase.
 * 4. Redirige a la pantalla correcta (auth, perfil o dashboard).
 * Incluye un timeout de seguridad por si la verificación se bloquea.
 */
export function initApp() {
  console.log('initApp() ejecutada');
  
  // Capturar evento de instalación PWA lo antes posible
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    window.__pwaDeferredPrompt = e;
    console.log('Evento beforeinstallprompt capturado');
  });

  // Detectar cuando la app fue instalada exitosamente
  window.addEventListener('appinstalled', () => {
    console.log('TitanCap.OS instalada exitosamente');
    window.__pwaDeferredPrompt = null;
    const modal = document.querySelector('.install-modal-glass');
    if (modal) modal.remove();
  });

  // Mostrar pantalla de carga
  showScreen('loading-screen');
  console.log('Pantalla de carga mostrada');

  // Timeout de seguridad: si tras 8 segundos sigue en loading, forzamos auth
  let resolved = false;
  const safetyTimeout = setTimeout(() => {
    if (!resolved && screens['loading-screen']?.classList.contains('active')) {
      console.warn('Timeout de verificación alcanzado. Mostrando auth por seguridad.');
      showScreen('auth-screen');
    }
  }, 8000);

  // Verificar sesión
  console.log('Verificando sesión...');
  checkSession()
    .then(sessionData => {
      resolved = true;
      clearTimeout(safetyTimeout);
      console.log('Sesión verificada:', sessionData);
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
      console.error('Error en initApp:', error);
      showScreen('auth-screen');
    });
}
