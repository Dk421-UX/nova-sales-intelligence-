import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '');

async function checkTypes() {
  console.log('[Types Check] Checking properties sample record in Supabase:');
  const { data: propData, error: propErr } = await supabase.from('properties').select('*').limit(1);
  if (propData && propData.length > 0) {
    console.log('Sample property row:', propData[0]);
  } else {
    console.log('No properties or error:', propErr?.message);
  }

  console.log('[Types Check] Checking projects sample record in Supabase:');
  const { data: projData, error: projErr } = await supabase.from('projects').select('*').limit(1);
  if (projData && projData.length > 0) {
    console.log('Sample project row:', projData[0]);
  } else {
    console.log('No projects or error:', projErr?.message);
  }
}

checkTypes();
