import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const url = process.env.SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false }
});

async function testStorage() {
  console.log('[Storage Test] Testing Supabase Storage...');
  try {
    const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
    console.log('Existing buckets:', buckets, 'Error:', listErr?.message);

    // Ensure 'layouts' bucket exists and is public
    const hasLayouts = (buckets || []).some(b => b.name === 'layouts');
    if (!hasLayouts) {
      console.log("Creating 'layouts' public bucket...");
      const { data: created, error: createErr } = await supabase.storage.createBucket('layouts', {
        public: true,
        fileSizeLimit: 52428800 // 50MB
      });
      if (createErr) {
        console.error('Bucket creation failed:', createErr.message);
      } else {
        console.log("Created 'layouts' bucket:", created);
      }
    } else {
      console.log("'layouts' bucket already exists.");
    }

    // Try a test upload
    const testBuffer = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><text>Test</text></svg>', 'utf-8');
    const { data: uploadData, error: upErr } = await supabase.storage.from('layouts').upload('test_check.svg', testBuffer, {
      contentType: 'image/svg+xml',
      upsert: true
    });
    if (upErr) {
      console.error('Upload test error:', upErr.message);
    } else {
      console.log('Upload test success:', uploadData);
      const { data: pubUrlData } = supabase.storage.from('layouts').getPublicUrl('test_check.svg');
      console.log('Public URL:', pubUrlData.publicUrl);
    }
  } catch (err: any) {
    console.error('Storage Exception:', err.message);
  }
}

testStorage();
