// =====================================================
// TitanCap.OS - js/auth.js (v3.3 - Limpio)
// Autenticacion + verificacion de pago + PWA install
// =====================================================

import { supabase, checkPaymentStatus } from './supabase-client.js';

let deferredPrompt = null;
let pwaInstallInitialized = false;

export function initPWA() {
    if (pwaInstallInitialized) return;
    pwaInstallInitialized = true;

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        console.log('[PWA] beforeinstallprompt capturado y almacenado.');
    });

    window.addEventListener('appinstalled', () => {
        console.log('[PWA] Aplicacion instalada exitosamente.');
        deferredPrompt = null;
    });

    window.addEventListener('triggerPWAInstall', (event) => {
        const userName = event.detail?.userName || 'Atleta';
        setTimeout(() => {
            showInstallPrompt(userName);
        }, 2000);
    });
}

function showInstallPrompt(userName) {
    const nombre = userName || 'Atleta';

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
            <p class="pwa-install-subtitle">Accede mas rapido a tu entrenamiento desde la pantalla de inicio.</p>
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

    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.3);
    } catch (e) {}

    requestAnimationFrame(() => {
        overlay.classList.add('active');
    });

    document.getElementById('pwa-install-skip').addEventListener('click', () => {
        overlay.classList.remove('active');
        setTimeout(() => overlay.remove(), 300);
    });

    document.getElementById('pwa-install-now').addEventListener('click', async () => {
        if (deferredPrompt) {
            try {
                await deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                console.log(`[PWA] Resultado de instalacion: ${outcome}`);
                deferredPrompt = null;
            } catch (err) {
                console.warn('[PWA] Error al mostrar prompt:', err);
            }
            overlay.classList.remove('active');
            setTimeout(() => overlay.remove(), 300);
        } else {
            alert('Para instalar: usa el menu del navegador -> "Anadir a pantalla de inicio".');
        }
    });
}

async function handlePostLogin(user) {
    const email = user.email;
    const pagoAprobado = await checkPaymentStatus(email);

    if (pagoAprobado) {
        console.log('[PostLogin] Pago confirmado. Preparando instalacion PWA...');

        let userName = '';
        try {
            const { data: profile } = await supabase
                .from('profiles')
                .select('nombre')
                .eq('id', user.id)
                .single();
            userName = profile?.nombre || '';
        } catch (e) {}

        showInstallPrompt(userName);
    } else {
        console.log('[PostLogin] Usuario sin pago registrado. Acceso limitado.');
    }
}

export async function checkSession() {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) {
        console.error('Error al obtener sesion:', error);
        return null;
    }
    if (session?.user) {
        console.log('Sesion encontrada para:', session.user.email);

        const { data: profile } = await supabase
            .from('profiles')
            .select('id')
            .eq('id', session.user.id)
            .single();

        let pagoAprobado = false;
        try {
            pagoAprobado = await checkPaymentStatus(session.user.email);
        } catch (payError) {
            console.warn('Error verificando pago, se asume acceso limitado:', payError);
            pagoAprobado = false;
        }

        return {
            user: session.user,
            hasProfile: !!profile,
            pagoAprobado: pagoAprobado
        };
    }
    return null;
}

export function renderAuthForm() {
    const container = document.getElementById('auth-container');
    container.innerHTML = `
        <div class="auth-box">
            <h1 class="titan-logo">TITANCAP<span>.</span>OS</h1>
            <p class="auth-subtitle">Accede a tu entrenamiento personalizado</p>
            
            <div id="auth-tabs" class="auth-tabs">
                <button class="auth-tab active" data-tab="login">Iniciar Sesion</button>
                <button class="auth-tab" data-tab="register">Crear Cuenta</button>
            </div>

            <form id="auth-form" class="auth-form">
                <div class="input-group">
                    <label>Email</label>
                    <input type="email" id="auth-email" placeholder="tu@email.com" required autocomplete="email">
                </div>
                <div class="input-group">
                    <label>Contrasena</label>
                    <input type="password" id="auth-password" placeholder="********" required autocomplete="current-password">
                </div>
                <button type="submit" class="btn-primary" id="auth-submit-btn">
                    <span id="auth-btn-text">Iniciar Sesion</span>
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

    document.querySelectorAll('.auth-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentTab = tab.dataset.tab;
            document.getElementById('auth-btn-text').textContent =
                currentTab === 'login' ? 'Iniciar Sesion' : 'Crear Cuenta';
            document.getElementById('auth-error').textContent = '';
            document.getElementById('auth-success').textContent = '';
        });
    });

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

            successEl.textContent = 'Accediendo a TitanCap.OS...';

            if (data?.user) {
                await handlePostLogin(data.user);
            }

            setTimeout(() => {
                window.location.reload();
            }, 500);

        } else {
            const { data, error } = await supabase.auth.signUp({ email, password });

            if (error) {
                errorEl.textContent = error.message;
                submitBtn.disabled = false;
                btnText.style.display = 'inline';
                btnLoader.style.display = 'none';
                return;
            }

            successEl.textContent = 'Cuenta creada. Ya puedes iniciar sesion.';

            submitBtn.disabled = false;
            btnText.style.display = 'inline';
            btnLoader.style.display = 'none';

            setTimeout(() => {
                document.querySelector('.auth-tab[data-tab="login"]').click();
            }, 800);
        }
    });
}

export async function signOut() {
    await supabase.auth.signOut();
}
