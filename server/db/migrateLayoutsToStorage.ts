import fs from 'fs';
import path from 'path';
import { getSupabaseAdmin } from './supabaseClient.ts';
import { uploadLayoutToStorage } from '../services/storageService.ts';
import dotenv from 'dotenv';
dotenv.config();

async function migrateLayouts() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    console.error('Supabase not configured');
    return;
  }

  console.log('[Layout Storage Migration] Scanning layouts in Supabase...');
  const { data: layouts, error } = await supabase.from('layouts').select('*');
  if (error) {
    console.error('Failed to fetch layouts:', error.message);
    return;
  }

  const rootDir = path.resolve(process.cwd());
  const searchDirs = [
    path.join(rootDir, 'public', 'layouts'),
    path.join(rootDir, 'uploads', 'layouts')
  ];

  for (const layout of (layouts || [])) {
    if (!layout.image_url) continue;

    // Check if it's already a full Supabase storage or external URL
    if (layout.image_url.startsWith('http://') || layout.image_url.startsWith('https://')) {
      console.log(`[Layout ${layout.id}] Already has absolute URL: ${layout.image_url}`);
      continue;
    }

    const filename = path.basename(layout.image_url);
    let foundPath: string | null = null;

    for (const dir of searchDirs) {
      const candidate = path.join(dir, filename);
      if (fs.existsSync(candidate)) {
        foundPath = candidate;
        break;
      }
    }

    if (foundPath) {
      console.log(`[Layout ${layout.id}] Found local file ${foundPath}. Uploading to Supabase Storage...`);
      const fileBuffer = fs.readFileSync(foundPath);
      const res = await uploadLayoutToStorage(layout.project_id, fileBuffer, filename);
      if (res.success && res.publicUrl) {
        console.log(`[Layout ${layout.id}] Uploaded! Updating image_url in Supabase to: ${res.publicUrl}`);
        const { error: updateErr } = await supabase.from('layouts').update({
          image_url: res.publicUrl,
          updated_at: new Date().toISOString()
        }).eq('id', layout.id);
        if (updateErr) {
          console.error(`[Layout ${layout.id}] Update error:`, updateErr.message);
        } else {
          console.log(`[Layout ${layout.id}] ✓ Updated layout record.`);
        }
      } else {
        console.error(`[Layout ${layout.id}] Upload failed:`, res.error);
      }
    } else {
      console.warn(`[Layout ${layout.id}] Local file not found for ${layout.image_url}`);
    }
  }

  console.log('[Layout Storage Migration] ✓ Migration completed.');
}

migrateLayouts();
