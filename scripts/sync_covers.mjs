import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Load env vars from .env.local
if (fs.existsSync('.env.local')) {
  const content = fs.readFileSync('.env.local', 'utf8');
  content.split('\n').forEach(line => {
    const match = line.match(/^\s*([^=]+?)\s*=\s*(.*)\s*$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^['"](.*)['"]$/, '$1');
      process.env[key] = value;
    }
  });
}

let supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: VITE_SUPABASE_URL and VITE_SUPABASE_SERVICE_ROLE_KEY must be set in .env.local');
  process.exit(1);
}

// Sanitize URL: Remove trailing slashes and /rest/v1/ if present
supabaseUrl = supabaseUrl.replace(/\/+$/, '').replace(/\/rest\/v1\/?$/, '');

console.log(`Supabase URL: ${supabaseUrl}`);
console.log(`Supabase Key loaded: ${supabaseKey.substring(0, 10)}...`);

const supabase = createClient(supabaseUrl, supabaseKey);

async function syncAllCovers() {
  console.log('--- ARCHIVE COVER SYNC STARTING ---');
  
  // 1. Fetch editions with ISBNs
  const { data: editions, error } = await supabase
    .from('editions')
    .select('id, isbn, format, cover_image_url')
    .not('isbn', 'is', null);

  if (error) {
    console.error('Error fetching editions:', error);
    return;
  }

  console.log(`Found ${editions.length} editions with ISBNs. Checking for missing art...`);

  let updatedCount = 0;

  for (const ed of editions) {
    // Only update if no specific image is set
    if (!ed.cover_image_url) {
      const cleanIsbn = ed.isbn.replace(/[^0-9X]/gi, '');
      if (cleanIsbn.length >= 10) {
        const coverUrl = `https://covers.openlibrary.org/b/isbn/${cleanIsbn}-M.jpg`;
        
        console.log(`Updating [${ed.format}] - ISBN: ${ed.isbn}...`);
        
        const { error: updateErr } = await supabase
          .from('editions')
          .update({ cover_image_url: coverUrl })
          .eq('id', ed.id);

        if (updateErr) {
          console.error(`Failed to update ${ed.id}:`, updateErr);
        } else {
          updatedCount++;
        }
      }
    }
  }

  console.log('\n--- SYNC COMPLETE ---');
  console.log(`Successfully updated ${updatedCount} editions with new artwork URLs.`);
  console.log('Refresh your library to see the changes!');
}

syncAllCovers();
