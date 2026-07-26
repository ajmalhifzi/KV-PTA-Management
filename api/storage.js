const { createClient } = require('@supabase/supabase-js');
const pool = require('./db');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } }
);

const BUCKET = 'fyp-files';

async function uploadToSupabase(fileName, fileData) {
  const buffer = Buffer.from(fileData, 'base64');

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(fileName, buffer, {
      contentType: 'application/octet-stream',
      upsert: true,
    });

  if (error) {
    await pool.query(
      'INSERT INTO error_logs (level, message, route) VALUES ($1, $2, $3)',
      ['error', `Storage upload failed for ${fileName}: ${error.message}`, 'storage.js']
    ).catch(() => {});
    throw new Error(`Storage upload failed: ${error.message}`);
  }

  const { data: { publicUrl } } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(fileName);

  return publicUrl;
}

function sanitizeFileName(name) {
  const ts = Date.now();
  const safe = name.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${ts}_${safe}`;
}

async function deleteFromSupabase(fileUrl) {
  const pathPrefix = `${process.env.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;
  if (!fileUrl || !fileUrl.startsWith(pathPrefix)) return;

  const fileName = fileUrl.slice(pathPrefix.length).split('?')[0];
  if (!fileName) return;

  const { error } = await supabase.storage
    .from(BUCKET)
    .remove([fileName]);

  if (error) {
    throw new Error(`Storage delete failed: ${error.message}`);
  }
}

module.exports = { uploadToSupabase, sanitizeFileName, deleteFromSupabase };