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
    throw new Error(`Storage upload failed: ${errText}`);
  }

  return `${supabaseUrl}/storage/v1/object/public/fyp-files/${fileName}`;
}

function sanitizeFileName(name) {
  const ts = Date.now();
  const safe = name.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${ts}_${safe}`;
}

module.exports = { uploadToSupabase, sanitizeFileName };
