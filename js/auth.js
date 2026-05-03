// =====================================================
// TitanCap.OS - js/auth.js
// Gestión de autenticación (registro, inicio de sesión, cierre de sesión)
// =====================================================

import { supabase } from './supabase-client.js';

// Escucha cambios de estado de autenticación
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN') {
    console.log('Usuario autenticado:', session.user.email);
    // Redirigir a la pantalla correspondiente
    checkProfileAndRoute(session.user.id);
  }
  if (event === 'SIGNED_OUT') {
    showScreen('auth-screen');
  }
});

// Verificar si hay sesión activa al cargar
export async function checkSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    await checkProfileAndRoute(session.user.id);
  } else {
    showScreen('auth-screen');
  }
}

// Renderizar formulario de login/registro
export function renderAuthForm() {
  const container = document.getElementById('auth-container');
  container.innerHTML = `
    <div class="auth-box">
      <h1 class="titan-logo">TITANCAP<span>.</span>OS</h1>
      <p class="auth-subtitle">Accede a tu entrenamiento personalizado</p>
      
      <div id="auth-tabs" class="auth-tabs">
        <button class="auth-tab active" data-tab="login">Iniciar Sesión</button>
        <button class="auth-tab" data-tab="register">Crear Cuenta</button>
      </div>

      <form id="auth-form" class="auth-form">
        <div class="input-group">
          <label>Email</label>
          <input type="email" id="auth-email" placeholder="tu@email.com" required>
        </div>
        <div class="input-group">
          <label>Contraseña</label>
          <input type="password" id="auth-password" placeholder="••••••••" required>
        </div>
        <button type="submit" class="btn-primary" id="auth-submit-btn">Iniciar Sesión</button>
      </form>

      <p id="auth-error" class="auth-error"></p>
    </div>
  `;

  // Listeners para tabs
  let currentTab = 'login';
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentTab = tab.dataset.tab;
      const btn = document.getElementById('auth-submit-btn');
      btn.textContent = currentTab === 'login' ? 'Iniciar Sesión' : 'Crear Cuenta';
    });
  });

  // Submit del formulario
  document.getElementById('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const errorEl = document.getElementById('auth-error');

    if (currentTab === 'login') {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        errorEl.textContent = error.message;
      }
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        errorEl.textContent = error.message;
      } else {
        errorEl.textContent = 'Cuenta creada. Revisa tu email para confirmar (si está habilitado).';
        // En Supabase puedes desactivar la confirmación de email en Settings > Auth
      }
    }
  });
}

// Comprobar si el usuario ya tiene perfil, y redirigir
async function checkProfileAndRoute(userId) {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .single();

  if (profile) {
    showScreen('dashboard-screen');
  } else {
    showScreen('profile-screen');
  }
}

// Cerrar sesión
export async function signOut() {
  await supabase.auth.signOut();
}
