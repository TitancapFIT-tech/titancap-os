// =====================================================
// TitanCap.OS - js/supabase-client.js
// Inicialización del SDK de Supabase
// =====================================================

const SUPABASE_URL = 'https://htfslnteeqxryssauxmy.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_qWAlzldXvkEOK4jc541F_A_mnZG2Dgl';

// Import dinámico desde CDN (módulo ES)
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});
