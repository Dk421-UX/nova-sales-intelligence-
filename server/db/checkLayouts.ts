import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '');

async function check() {
  const { data: layouts, error } = await supabase.from('layouts').select('*');
  console.log('Supabase Layouts:', layouts?.map(l => ({ id: l.id, project_id: l.project_id, image_url: l.image_url, name: l.name })));
}

check();
