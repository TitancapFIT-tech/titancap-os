// =====================================================
// TitanCap.OS - js/supabase-client.js
// Inicialización del SDK de Supabase
// =====================================================

// ⚠️ REEMPLAZA ESTOS VALORES CON LOS DE TU PROYECTO EN SUPABASE
const SUPABASE_URL = 'https://xxxxxxxxxxxx.supabase.co'; // ← Tu URL
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xxxxxx'; // ← Tu anon key

// Import dinámico desde CDN (módulo ES)
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
