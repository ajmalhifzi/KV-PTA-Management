const pool = require('./db');

async function uploadToSupabase(fileName, fileData) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;

  const res = await fetch(`${supabaseUrl}/storage/v1/object/fyp-files/${fileName}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/octet-stream',
    },
    body: Buffer.from(fileData, 'base64'),
  });

  if (!res.ok) {
    const errText = await res.text();
    await pool.query(
      'INSERT INTO error_logs (level, message, route) VALUES ($1, $2, $3)',
      ['error', `Storage upload failed for ${fileName}: ${errText}`, 'storage.js']
    ).catch(() => {});
    throw new Error(`Storage upload failed: ${errText}`);
  }

  return `${supabaseUrl}/storage/v1/object/public/fyp-files/${fileName}`;
}

function sanitizeFileName(name) {
  const ts = Date.now();
  const safe = name.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${ts}_${safe}`;
}

async function deleteFromSupabase(fileUrl) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;

  const pathPrefix = `${supabaseUrl}/storage/v1/object/public/fyp-files/`;
  if (!fileUrl || !fileUrl.startsWith(pathPrefix)) return;

  const fileName = fileUrl.slice(pathPrefix.length).split('?')[0];
  if (!fileName) return;

  const res = await fetch(`${supabaseUrl}/storage/v1/object/fyp-files/${fileName}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${serviceKey}` },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Storage delete failed: ${errText}`);
  }
}

module.exports = { uploadToSupabase, sanitizeFileName, deleteFromSupabase };
