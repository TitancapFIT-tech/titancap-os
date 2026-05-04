// =====================================================
// TitanCap.OS - js/dashboard.js (v3.1 - Auditoría Completa)
// Renderizado limpio sin duplicados, PWA install,
// frases motivacionales, saludo personalizado y
// botones de acción con lógica de semana completada.
// =====================================================

import { supabase } from './supabase-client.js';
import { showScreen, navigateToDay, showSurvey, logout } from './nav.js';

let currentWeekId = null;
let currentWeekNumber = null;

/**
 * Renderiza el dashboard principal:
 * - Saludo personalizado con el nombre del atleta y número de semana.
 * - Frase motivacional aleatoria desde Supabase.
 * - Tarjetas de días de entrenamiento de la semana activa.
 * - Botón de completar semana / encuesta de fatiga.
 * - Botón de reinicio de semana.
 * - Botón de cerrar sesión.
 * - Modal de instalación PWA (si aplica).
 */
export async function renderDashboard() {
  // 1. Verificar autenticación
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    showScreen('auth-screen');
    return;
  }

  // 2. Obtener nombre del perfil
  const { data: perfil } = await supabase
    .from('profiles')
    .select('nombre')
    .eq('id', user.id)
    .single();

  // 3. Obtener la semana activa más reciente
  const { data: activeWeek, error } = await supabase
    .from('weekly_programs')
    .select('*')
    .eq('user_id', user.id)
    .order('week_number', { ascending: false })
    .limit(1)
    .single();

  // Si no hay semana activa, redirigir a creación de perfil
  if (error || !activeWeek) {
    showScreen('profile-screen');
    return;
  }

  // Guardar referencias globales de la semana actual
  currentWeekId = activeWeek.id;
  currentWeekNumber = activeWeek.week_number;

  // 4. Mostrar saludo personalizado
  const nombre = perfil?.nombre || 'Atleta';
  document.getElementById('saludo-personalizado').textContent =
    `Hola ${nombre}, es hora de tu Semana ${currentWeekNumber}`;

  // 5. Cargar frase motivacional aleatoria
  cargarFraseMotivacional();

  // 6. Obtener los días de la semana activa
  const { data: days, error: daysError } = await supabase
    .from('workout_days')
    .select('*')
    .eq('weekly_program_id', activeWeek.id)
    .order('day_number');

  if (daysError) {
    console.error('Error al obtener días:', daysError);
    return;
  }

  // 7. Renderizar tarjetas de días (limpiar contenedor primero)
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
    // Navegar al día al hacer clic
    card.addEventListener('click', () => {
      navigateToDay(day.id);
    });
    container.appendChild(card);
  });

  // 8. Configurar botón "Completar Semana" / "Encuesta de Fatiga"
  const allCompleted = days.every(d => d.completed);
  const btnCompletar = document.getElementById('btn-completar-semana');
  if (allCompleted) {
    btnCompletar.textContent = '✅ Encuesta de Fatiga';
    btnCompletar.onclick = () => showSurvey(currentWeekId);
  } else {
    btnCompletar.textContent = '⏳ Semana en progreso';
    btnCompletar.onclick = () => alert('Completa todos los días antes de enviar la encuesta.');
  }

  // 9. Botón de reinicio de semana
  document.getElementById('btn-reiniciar').onclick = async () => {
    if (confirm('¿Reiniciar todo? Perderás el progreso de esta semana y empezarás de nuevo.')) {
      await supabase.from('weekly_programs').delete().eq('id', currentWeekId);
      showScreen('profile-screen');
    }
  };

  // 10. Botón de cerrar sesión
  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) {
    logoutBtn.onclick = () => logout();
  }

  // 11. Inicializar lógica de instalación PWA
  initPWAInstall();
}

/**
 * Obtiene una frase aleatoria de la tabla motivational_phrases
 * y la muestra debajo del saludo. Si falla, muestra frase de respaldo.
 */
async function cargarFraseMotivacional() {
  const fraseEl = document.getElementById('frase-motivacional');
  if (!fraseEl) return;

  try {
    const { data: phrases, error } = await supabase
      .from('motivational_phrases')
      .select('phrase, author');

    if (error) throw error;

    if (phrases && phrases.length > 0) {
      const random = phrases[Math.floor(Math.random() * phrases.length)];
      fraseEl.textContent = `"${random.phrase}" — ${random.author}`;
    } else {
      // Respaldo si la tabla está vacía
      fraseEl.textContent = '"La disciplina es el puente entre las metas y los logros." — Jim Rohn';
    }
    fraseEl.style.display = 'block';
  } catch (err) {
    console.warn('Error cargando frase motivacional:', err.message);
    fraseEl.textContent = '"El dolor de la disciplina no es nada comparado con el dolor del arrepentimiento." — Anónimo';
    fraseEl.style.display = 'block';
  }
}

// =====================================================
// PWA: INSTALACIÓN NATIVA
// =====================================================

let deferredPrompt = null;

/**
 * Inicializa el listener para el evento beforeinstallprompt
 * y muestra el modal de instalación si corresponde.
 */
function initPWAInstall() {
  // Verificar si ya está instalada como PWA
  if (window.matchMedia('(display-mode: standalone)').matches) {
    console.log('App ya instalada como PWA');
    return;
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    // Prevenir que el navegador muestre el diálogo automático
    e.preventDefault();
    // Guardar el evento para usarlo después
    deferredPrompt = e;

    // Mostrar modal de instalación después de 3 segundos
    setTimeout(() => {
      if (document.getElementById('dashboard-screen').classList.contains('active')) {
        mostrarModalInstalacion();
      }
    }, 3000);
  });

  // Detectar cuando la app fue instalada
  window.addEventListener('appinstalled', () => {
    console.log('TitanCap.OS instalada exitosamente');
    deferredPrompt = null;
    // Eliminar modal si existe
    const modal = document.querySelector('.install-modal-glass');
    if (modal) modal.remove();
  });
}

/**
 * Muestra un modal elegante para invitar a instalar la PWA.
 */
function mostrarModalInstalacion() {
  // Verificar que no exista ya el modal
  if (document.querySelector('.install-modal-glass')) return;

  const modal = document.createElement('div');
  modal.className = 'install-modal-glass';
  modal.innerHTML = `
    <h3>⚡ Instalar TitanCap.OS</h3>
    <p>Accede a tu entrenamiento sin abrir el navegador. Como una app nativa, rápida y siempre disponible.</p>
    <button class="btn-primary" id="btn-install">Instalar Ahora</button>
    <button class="btn-text" id="btn-dismiss">Quizás después</button>
  `;
  document.body.appendChild(modal);

  document.getElementById('btn-install').addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`PWA instalación: ${outcome}`);
      deferredPrompt = null;
    }
    modal.remove();
  });

  document.getElementById('btn-dismiss').addEventListener('click', () => {
    modal.remove();
  });
}
