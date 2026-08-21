import { getSupabaseAdmin, isSupabaseConfigured } from '../db/supabaseClient.ts';
import path from 'path';

const LAYOUTS_BUCKET = 'layouts';

/**
 * Ensures the 'layouts' public storage bucket exists in Supabase.
 */
export async function ensureLayoutsBucketExists(): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;

  try {
    const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
    if (listErr) {
      console.warn('[StorageService] Error listing buckets:', listErr.message);
      return false;
    }

    const bucketExists = (buckets || []).some(b => b.name === LAYOUTS_BUCKET);
    if (!bucketExists) {
      console.log(`[StorageService] Creating public storage bucket '${LAYOUTS_BUCKET}'...`);
      const { error: createErr } = await supabase.storage.createBucket(LAYOUTS_BUCKET, {
        public: true,
        fileSizeLimit: 52428800 // 50MB limit
      });
      if (createErr) {
        console.error('[StorageService] Failed to create bucket:', createErr.message);
        return false;
      }
      console.log(`[StorageService] ✓ Created public storage bucket '${LAYOUTS_BUCKET}'.`);
    }
    return true;
  } catch (err: any) {
    console.error('[StorageService] Exception verifying bucket:', err.message);
    return false;
  }
}

/**
 * Uploads a layout file (PNG, JPG, SVG, PDF) to Supabase Storage and returns its permanent public URL.
 */
export async function uploadLayoutToStorage(
  projectId: string,
  fileBuffer: Buffer,
  originalFilename: string,
  mimeType?: string
): Promise<{ success: boolean; publicUrl: string; storagePath: string; error?: string }> {
  if (!isSupabaseConfigured()) {
    return { success: false, publicUrl: '', storagePath: '', error: 'Supabase is not configured.' };
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { success: false, publicUrl: '', storagePath: '', error: 'Supabase admin client unavailable.' };
  }

  try {
    await ensureLayoutsBucketExists();

    const ext = path.extname(originalFilename).toLowerCase();
    const sanitizedProject = projectId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const timestamp = Date.now();
    const storagePath = `${sanitizedProject}/${sanitizedProject}_layout_${timestamp}${ext}`;

    let contentType = mimeType;
    if (!contentType) {
      if (ext === '.svg') contentType = 'image/svg+xml';
      else if (ext === '.png') contentType = 'image/png';
      else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
      else if (ext === '.pdf') contentType = 'application/pdf';
      else contentType = 'application/octet-stream';
    }

    const { data, error: uploadErr } = await supabase.storage
      .from(LAYOUTS_BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType,
        cacheControl: '3600',
        upsert: true
      });

    if (uploadErr) {
      console.error('[StorageService] Upload failed:', uploadErr.message);
      return { success: false, publicUrl: '', storagePath: '', error: uploadErr.message };
    }

    const { data: pubUrlData } = supabase.storage
      .from(LAYOUTS_BUCKET)
      .getPublicUrl(storagePath);

    const publicUrl = pubUrlData.publicUrl;
    console.log(`[StorageService] ✓ Uploaded layout to Supabase Storage: ${publicUrl}`);

    return {
      success: true,
      publicUrl,
      storagePath,
    };
  } catch (err: any) {
    console.error('[StorageService] Exception uploading layout:', err.message);
    return { success: false, publicUrl: '', storagePath: '', error: err.message };
  }
}

/**
 * Checks the operational health of Supabase Storage.
 */
export async function checkStorageHealth(): Promise<{ configured: boolean; healthy: boolean; bucket: string; error?: string }> {
  if (!isSupabaseConfigured()) {
    return { configured: false, healthy: false, bucket: LAYOUTS_BUCKET, error: 'Not configured' };
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { configured: true, healthy: false, bucket: LAYOUTS_BUCKET, error: 'Admin client unavailable' };
  }

  try {
    const { data: buckets, error } = await supabase.storage.listBuckets();
    if (error) {
      return { configured: true, healthy: false, bucket: LAYOUTS_BUCKET, error: error.message };
    }
    const hasBucket = (buckets || []).some(b => b.name === LAYOUTS_BUCKET);
    return {
      configured: true,
      healthy: true,
      bucket: LAYOUTS_BUCKET
    };
  } catch (err: any) {
    return { configured: true, healthy: false, bucket: LAYOUTS_BUCKET, error: err.message };
  }
}
