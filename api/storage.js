const { createClient } = require('@supabase/supabase-js');
const pool = require('./db');

let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
  try {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY,
      { auth: { persistSession: false } }
    );
  } catch (e) {
    console.warn('Supabase storage client initialization warning:', e.message);
  }
}

const BUCKET = 'fyp-files';

async function uploadToSupabase(fileName, fileData) {
  if (!supabase) return null;
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
  const safe = String(name).replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${ts}_${safe}`;
}

async function deleteFromSupabase(fileUrl) {
  if (!supabase || !process.env.SUPABASE_URL) return;
  const pathPrefix = `${process.env.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;
  if (!fileUrl || !fileUrl.startsWith(pathPrefix)) return;

  const fileName = fileUrl.slice(pathPrefix.length).split('?')[0];
  if (!fileName) return;

  try {
    await supabase.storage
      .from(BUCKET)
      .remove([fileName]);
  } catch (err) {
    console.warn('Supabase storage delete warning:', err.message);
  }
}

module.exports = { uploadToSupabase, sanitizeFileName, deleteFromSupabase };