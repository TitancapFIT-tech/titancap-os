// =====================================================
// TitanCap.OS - js/auth.js (v3.2 - Auditoría final)
// Autenticación + verificación de pago + PWA install
// =====================================================

import { supabase, checkPaymentStatus } from './supabase-client.js';

// ------------------------------------------------------
// Variables a nivel de módulo para PWA
// ------------------------------------------------------
let deferredPrompt = null;
let pwaInstallInitialized = false;

// ------------------------------------------------------
// NUEVO: Inicializar listener de instalación PWA
// Se debe llamar una vez al cargar la app (en index.html o dashboard)
// ------------------------------------------------------
export function initPWA() {
    if (pwaInstallInitialized) return;
    pwaInstallInitialized = true;

    // Capturar el evento beforeinstallprompt (Android Chrome)
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e; // Guardar para usarlo después del login
        console.log('[PWA] beforeinstallprompt capturado y almacenado.');
    });

    // Detectar cuando la app ya fue instalada
    window.addEventListener('appinstalled', () => {
        console.log('[PWA] Aplicación instalada exitosamente.');
        deferredPrompt = null;
    });
}

// ------------------------------------------------------
// NUEVO: Disparar el flujo de instalación PWA
// Muestra un modal premium con el nombre del usuario
// ------------------------------------------------------
function showInstallPrompt(userName) {
    // Si no hay deferredPrompt, el navegador no soporta instalación
    if (!deferredPrompt) {
        console.log('[PWA] Instalación no disponible (navegador no compatible o ya instalada).');
        return;
    }

    const nombre = userName || 'Atleta';

    // Crear modal de instalación
    const overlay = document.createElement('div');
    overlay.className = 'pwa-install-overlay';
    overlay.innerHTML = `
        <div class="pwa-install-card">
            <div class="pwa-install-icon">
                <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect width="64" height="64" rx="16" fill="#1A1A1A" stroke="#C0C0C0" stroke-width="2"/>
                    <path d="M20 44L32 52L44 44" stroke="#00E676" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M32 52V28" stroke="#00E676" stroke-width="3" stroke-linecap="round"/>
                    <path d="M20 28L32 20L44 28" stroke="#C0C0C0" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </div>
            <h2 class="pwa-install-title">${nombre}, te recomendamos instalar la app</h2>
            <p class="pwa-install-subtitle">Accede más rápido a tu entrenamiento desde la pantalla de inicio.</p>
            <div class="pwa-install-actions">
                <button class="pwa-install-btn" id="pwa-install-now">
                    <span>Instalar ahora</span>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <path d="M5 12H19M19 12L13 6M19 12L13 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                </button>
                <button class="pwa-install-skip" id="pwa-install-skip">Omitir</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    // Sonido sutil al aparecer (Web Audio API - tono profesional)
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, audioCtx.currentTime); // La4
        gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
        osc.start(audioCtx.currentTime);
        osc.stop(audioCtx.currentTime + 0.3);
    } catch (e) {
        // Silencioso si el navegador bloquea audio
    }

    // Animación de entrada (CSS agrega clase después de un frame)
    requestAnimationFrame(() => {
        overlay.classList.add('active');
    });

    // Cerrar al hacer clic en "Omitir"
    document.getElementById('pwa-install-skip').addEventListener('click', () => {
        overlay.classList.remove('active');
        setTimeout(() => overlay.remove(), 300);
    });

    // Instalar al hacer clic en "Instalar ahora"
    document.getElementById('pwa-install-now').addEventListener('click', async () => {
        try {
            await deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            console.log(`[PWA] Resultado de instalación: ${outcome}`);
            deferredPrompt = null;
        } catch (err) {
            console.warn('[PWA] Error al mostrar prompt de instalación:', err);
        }
        overlay.classList.remove('active');
        setTimeout(() => overlay.remove(), 300);
    });
}

// ------------------------------------------------------
// Flujo post-login
// Verifica pago, obtiene perfil y dispara instalación PWA
// ------------------------------------------------------
async function handlePostLogin(user) {
    const email = user.email;

    // Verificar si el usuario ya pagó (placeholder Mercado Pago)
    const pagoAprobado = await checkPaymentStatus(email);

    if (pagoAprobado) {
        console.log('[PostLogin] Pago confirmado. Preparando instalación PWA...');

        // Obtener nombre del perfil para personalizar el mensaje
        let userName = '';
        try {
            const { data: profile } = await supabase
                .from('profiles')
                .select('nombre')
                .eq('id', user.id)
                .single();
            userName = profile?.nombre || '';
        } catch (e) {
            // Si no hay perfil aún, usar email como fallback
        }

        // Disparar instalación PWA
        showInstallPrompt(userName);
    } else {
        console.log('[PostLogin] Usuario sin pago registrado. Acceso limitado.');
        // Aquí podría redirigir a una Landing de pago si se desea
    }
}

// ------------------------------------------------------
// EXISTENTE (mejorado): Verifica sesión activa
// Ahora también devuelve el estado del pago
// ------------------------------------------------------
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

        // Verificar estado del pago
        const pagoAprobado = await checkPaymentStatus(session.user.email);

        return {
            user: session.user,
            hasProfile: !!profile,
            pagoAprobado: pagoAprobado
        };
    }
    return null;
}

// ------------------------------------------------------
// EXISTENTE (mejorado): Formulario de autenticación
// Ahora con loader, feedback visual y flujo PWA post-login
// ------------------------------------------------------
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
                    <input type="email" id="auth-email" placeholder="tu@email.com" required autocomplete="email">
                </div>
                <div class="input-group">
                    <label>Contraseña</label>
                    <input type="password" id="auth-password" placeholder="••••••••" required autocomplete="current-password">
                </div>
                <button type="submit" class="btn-primary" id="auth-submit-btn">
                    <span id="auth-btn-text">Iniciar Sesión</span>
                    <span id="auth-btn-loader" class="auth-loader" style="display:none;">
                        <span class="spinner"></span> Conectando...
                    </span>
                </button>
            </form>

            <p id="auth-error" class="auth-error"></p>
            <p id="auth-success" class="auth-success"></p>
        </div>
    `;

    let currentTab = 'login';

    // Toggle entre Login y Registro
    document.querySelectorAll('.auth-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentTab = tab.dataset.tab;
            document.getElementById('auth-btn-text').textContent =
                currentTab === 'login' ? 'Iniciar Sesión' : 'Crear Cuenta';
            document.getElementById('auth-error').textContent = '';
            document.getElementById('auth-success').textContent = '';
        });
    });

    // Envío del formulario
    document.getElementById('auth-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('auth-email').value.trim();
        const password = document.getElementById('auth-password').value;
        const errorEl = document.getElementById('auth-error');
        const successEl = document.getElementById('auth-success');
        const btnText = document.getElementById('auth-btn-text');
        const btnLoader = document.getElementById('auth-btn-loader');
        const submitBtn = document.getElementById('auth-submit-btn');

        errorEl.textContent = '';
        successEl.textContent = '';

        // Activar loader
        submitBtn.disabled = true;
        btnText.style.display = 'none';
        btnLoader.style.display = 'inline-flex';

        if (currentTab === 'login') {
            const { data, error } = await supabase.auth.signInWithPassword({ email, password });

            if (error) {
                errorEl.textContent = error.message;
                submitBtn.disabled = false;
                btnText.style.display = 'inline';
                btnLoader.style.display = 'none';
                return;
            }

            // Login exitoso: mostrar feedback y ejecutar flujo post-login
            successEl.textContent = 'Accediendo a TitanCap.OS...';

            // Flujo post-login: verificar pago y disparar PWA
            if (data?.user) {
                await handlePostLogin(data.user);
            }

            // Recargar para que initApp redirija correctamente
            setTimeout(() => {
                window.location.reload();
            }, 500);

        } else {
            // Registro
            const { data, error } = await supabase.auth.signUp({ email, password });

            if (error) {
                errorEl.textContent = error.message;
                submitBtn.disabled = false;
                btnText.style.display = 'inline';
                btnLoader.style.display = 'none';
                return;
            }

            // Éxito en registro
            successEl.textContent = 'Cuenta creada. Ya puedes iniciar sesión.';

            // Restaurar botón
            submitBtn.disabled = false;
            btnText.style.display = 'inline';
            btnLoader.style.display = 'none';

            // Cambiar a la pestaña de login automáticamente
            setTimeout(() => {
                document.querySelector('.auth-tab[data-tab="login"]').click();
            }, 800);
        }
    });
}

// ------------------------------------------------------
// EXISTENTE (sin cambios): Cerrar sesión
// ------------------------------------------------------
export async function signOut() {
    await supabase.auth.signOut();
}
