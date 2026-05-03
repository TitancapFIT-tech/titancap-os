// =====================================================
// TitanCap.OS - js/auth.js (CORREGIDO - sin showScreen)
// =====================================================

import { supabase } from './supabase-client.js';

/**
 * Verifica si hay una sesión activa en Supabase Auth.
 * Devuelve un objeto con el usuario y si tiene perfil, o null si no hay sesión.
 */
export async function checkSession() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) {
    console.error('Error al obtener sesión:', error);
    return null;
  }
  if (session?.user) {
    console.log('Sesión encontrada para:', session.user.email);
    // Verificar si el usuario ya completó su perfil
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', session.user.id)
      .single();
    return { user: session.user, hasProfile: !!profile };
  }
  return null;
}

/**
 * Renderiza el formulario de inicio de sesión / registro.
 */
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

  let currentTab = 'login';
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentTab = tab.dataset.tab;
      document.getElementById('auth-submit-btn').textContent =
        currentTab === 'login' ? 'Iniciar Sesión' : 'Crear Cuenta';
    });
  });

  document.getElementById('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const errorEl = document.getElementById('auth-error');
    errorEl.textContent = '';

    if (currentTab === 'login') {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        errorEl.textContent = error.message;
        return;
      }
      // Login exitoso: recargamos la página para que initApp redirija correctamente
      window.location.reload();
    } else {
      // Registro
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        errorEl.textContent = error.message;
        return;
      }
      // Éxito en registro: puede que necesite confirmación de email, informamos
      errorEl.textContent = 'Cuenta creada. Ya puedes iniciar sesión.';
      // Cambiamos a la pestaña de login
      document.querySelector('.auth-tab[data-tab="login"]').click();
    }
  });
}

/**
 * Cierra la sesión actual.
 */
export async function signOut() {
  await supabase.auth.signOut();
}
