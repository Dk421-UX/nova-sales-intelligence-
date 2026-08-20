import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const url = process.env.SUPABASE_URL || '';
const anon = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';
const service = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

console.log('[Supabase Test] URL:', url);
console.log('[Supabase Test] Anon key defined:', Boolean(anon));
console.log('[Supabase Test] Service key defined:', Boolean(service));

async function run() {
  if (!url || (!anon && !service)) {
    console.log('[Supabase Test] Supabase is NOT configured with URL/Keys in .env');
    return;
  }

  try {
    const supabase = createClient(url, service || anon, {
      auth: { persistSession: false },
    });
    console.log('[Supabase Test] Pinging Supabase...');
    const { data, error, status } = await supabase.from('projects').select('*').limit(5);
    if (error) {
      console.log('[Supabase Test] Query Response status:', status, 'Error code:', error.code, 'Message:', error.message);
    } else {
      console.log('[Supabase Test] Success! Found projects in Supabase:', data?.length);
    }
  } catch (err: any) {
    console.error('[Supabase Test] Exception:', err.message);
  }
}

run();
