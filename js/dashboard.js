// =====================================================
// TitanCap.OS - js/dashboard.js (v3.2 - Auditoría final)
// Dashboard con pago, PWA, frases sin repetición,
// skeleton loader y progresión visible.
// =====================================================

import { supabase, checkPaymentStatus, getUserProfile, getWeeklyProgram, trackPhraseUsage } from './supabase-client.js';
import { initPWA, signOut } from './auth.js';
import { showScreen, navigateToDay, showSurvey } from './nav.js';

// ------------------------------------------------------
// Estado global
// ------------------------------------------------------
let currentWeekId = null;
let currentWeekNumber = null;
let pagoAprobado = false;

// ------------------------------------------------------
// Skeleton Loader (Tarea 4)
// ------------------------------------------------------
function showSkeleton() {
  const container = document.getElementById('dashboard-screen');
  if (!container) return;

  // Si no existe el esqueleto, lo insertamos
  if (!document.getElementById('skeleton-loader')) {
    const skeletonHTML = `
      <div id="skeleton-loader" class="skeleton-loader">
        <div class="skeleton-header"></div>
        <div class="skeleton-card"></div>
        <div class="skeleton-card"></div>
        <div class="skeleton-card"></div>
      </div>
    `;
    // Insertar al principio del dashboard
    container.insertAdjacentHTML('afterbegin', skeletonHTML);
  }
  // Mostrar
  const skeleton = document.getElementById('skeleton-loader');
  if (skeleton) skeleton.style.display = 'block';

  // Ocultar el contenido real mientras carga
  const content = document.getElementById('dashboard-content');
  if (content) content.style.display = 'none';
}

function hideSkeleton() {
  const skeleton = document.getElementById('skeleton-loader');
  if (skeleton) skeleton.style.display = 'none';

  const content = document.getElementById('dashboard-content');
  if (content) content.style.display = 'block';
}

// ------------------------------------------------------
// Renderizado principal del dashboard
// ------------------------------------------------------
export async function renderDashboard() {
  // Activar skeleton loader
  showSkeleton();

  // 1. Verificar autenticación
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    showScreen('auth-screen');
    hideSkeleton();
    return;
  }

  // 2. Obtener perfil
  const perfil = await getUserProfile(user.id);
  if (!perfil) {
    // Sin perfil → onboarding
    showScreen('profile-screen'); // o survey-screen, según prefieras
    hideSkeleton();
    return;
  }

  // 3. Verificar estado del pago (Tarea 5)
  pagoAprobado = await checkPaymentStatus(user.email);

  // 4. Obtener la semana activa más reciente
  const { data: activeWeek, error: weekError } = await supabase
    .from('weekly_programs')
    .select('*')
    .eq('user_id', user.id)
    .order('week_number', { ascending: false })
    .limit(1)
    .single();

  if (weekError || !activeWeek) {
    // Si no hay semana, redirigir a creación de perfil/generador
    showScreen('profile-screen');
    hideSkeleton();
    return;
  }

  currentWeekId = activeWeek.id;
  currentWeekNumber = activeWeek.week_number;

  // 5. Mostrar saludo y sistema de progresión actual
  const nombre = perfil.nombre || 'Atleta';
  const sistemaProgresion = activeWeek.progression_system
    ? traducirSistema(activeWeek.progression_system)
    : 'No definido';

  const greetingEl = document.getElementById('saludo-personalizado');
  if (greetingEl) {
    greetingEl.textContent = `Hola ${nombre}, es hora de tu Semana ${currentWeekNumber}`;
  }
  const progressionEl = document.getElementById('progression-label');
  if (progressionEl) {
    progressionEl.textContent = `Sistema: ${sistemaProgresion}`;
  }

  // 6. Banner de pago pendiente (si no ha pagado)
  const bannerPago = document.getElementById('payment-banner');
  if (!pagoAprobado && bannerPago) {
    bannerPago.innerHTML = `<p>⚠️ Acceso limitado. <a href="#/pago" class="payment-link">Activar plan completo</a></p>`;
    bannerPago.style.display = 'block';
  } else if (bannerPago) {
    bannerPago.style.display = 'none';
  }

  // 7. Cargar frase motivacional (evitando repeticiones)
  await cargarFraseMotivacional(user.id, currentWeekNumber);

  // 8. Obtener los días de la semana activa
  const { data: days, error: daysError } = await supabase
    .from('workout_days')
    .select('*')
    .eq('weekly_program_id', activeWeek.id)
    .order('day_number');

  if (daysError) {
    console.error('Error al obtener días:', daysError);
    hideSkeleton();
    return;
  }

  // 9. Renderizar tarjetas de días
  const container = document.getElementById('week-days-container');
  if (container) {
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

    // Botón completar semana / encuesta
    const allCompleted = days.every(d => d.completed);
    const btnCompletar = document.getElementById('btn-completar-semana');
    if (btnCompletar) {
      if (allCompleted) {
        btnCompletar.textContent = '✅ Encuesta de Fatiga';
        btnCompletar.onclick = () => showSurvey(currentWeekId);
      } else {
        btnCompletar.textContent = '⏳ Semana en progreso';
        btnCompletar.onclick = () => alert('Completa todos los días antes de enviar la encuesta.');
      }
    }
  }

  // 10. Botón reiniciar semana (conservado)
  const btnReiniciar = document.getElementById('btn-reiniciar');
  if (btnReiniciar) {
    btnReiniciar.onclick = async () => {
      if (confirm('¿Reiniciar todo? Perderás el progreso de esta semana y empezarás de nuevo.')) {
        await supabase.from('weekly_programs').delete().eq('id', currentWeekId);
        showScreen('profile-screen');
      }
    };
  }

  // 11. Botón cerrar sesión
  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) {
    logoutBtn.onclick = async () => {
      await signOut();
      window.location.reload(); // Redirigir al login
    };
  }

  // 12. Inicializar PWA (capturar beforeinstallprompt)
  initPWA();

  // 13. Si el pago está aprobado, disparar instalación PWA (con retardo)
  if (pagoAprobado) {
    setTimeout(() => {
      // Se dispara un evento personalizado que auth.js escucha para mostrar el modal premium
      window.dispatchEvent(new CustomEvent('triggerPWAInstall', {
        detail: { userName: perfil.nombre }
      }));
    }, 1500);
  }

  // Quitar skeleton y mostrar contenido
  hideSkeleton();
}

// ------------------------------------------------------
// Frase motivacional sin repeticiones
// ------------------------------------------------------
async function cargarFraseMotivacional(userId, weekNumber) {
  const fraseEl = document.getElementById('frase-motivacional');
  if (!fraseEl) return;

  try {
    // 1. Obtener todas las frases
    const { data: allPhrases, error: errPhrases } = await supabase
      .from('motivational_phrases')
      .select('*');

    if (errPhrases || !allPhrases?.length) {
      throw new Error('No hay frases disponibles');
    }

    // 2. Obtener las frases ya mostradas a este usuario
    const { data: usedPhrases, error: errUsed } = await supabase
      .from('user_phrase_history')
      .select('phrase_id')
      .eq('user_id', userId);

    if (errUsed) {
      console.warn('No se pudo consultar historial de frases', errUsed);
    }

    // 3. Filtrar las no usadas
    const usedIds = usedPhrases ? usedPhrases.map(u => u.phrase_id) : [];
    const unusedPhrases = allPhrases.filter(p => !usedIds.includes(p.id));

    // 4. Si todas se han usado, reiniciamos el historial (se permite repetir)
    let phrase;
    if (unusedPhrases.length === 0) {
      // Opcional: eliminar historial para empezar de nuevo
      await supabase.from('user_phrase_history').delete().eq('user_id', userId);
      phrase = allPhrases[Math.floor(Math.random() * allPhrases.length)];
    } else {
      phrase = unusedPhrases[Math.floor(Math.random() * unusedPhrases.length)];
    }

    // 5. Registrar la frase usada
    const inserted = await trackPhraseUsage(userId, phrase.id, weekNumber);
    if (!inserted) {
      console.warn('No se pudo registrar la frase, pero continuamos');
    }

    // 6. Mostrar
    fraseEl.textContent = `"${phrase.phrase}" — ${phrase.author}`;
    fraseEl.style.display = 'block';
  } catch (err) {
    console.warn('Error cargando frase motivacional:', err.message);
    fraseEl.textContent = '"La disciplina es el puente entre las metas y los logros." — Jim Rohn';
    fraseEl.style.display = 'block';
  }
}

// ------------------------------------------------------
// Traducción visual del sistema de progresión
// ------------------------------------------------------
function traducirSistema(sistema) {
  const map = {
    lineal: 'Lineal Sesión a Sesión',
    doble: 'Doble Progresión',
    triple: 'Triple Progresión',
    dup: 'Ondulación Diaria (DUP)',
    wup: 'Ondulación Semanal (WUP)'
  };
  return map[sistema] || sistema;
}
