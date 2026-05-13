import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Load env vars from .env.local
let env = {};
if (fs.existsSync('.env.local')) {
  const content = fs.readFileSync('.env.local', 'utf8');
  content.split('\n').forEach(line => {
    const match = line.match(/^\s*([^=]+?)\s*=\s*(.*)\s*$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^['"](.*)['"]$/, '$1');
      env[key] = value;
    }
  });
}

const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseKey = env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: VITE_SUPABASE_URL and VITE_SUPABASE_SERVICE_ROLE_KEY must be set in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function dedupe() {
  console.log('--- STARTING EDITION DE-DUPLICATION ---');

  // 1. Fetch all editions
  const { data: editions, error: edErr } = await supabase
    .from('editions')
    .select('*');

  if (edErr) {
    console.error('Error fetching editions:', edErr);
    return;
  }

  // Group by work_id
  const workGroups = {};
  editions.forEach(ed => {
    if (!workGroups[ed.work_id]) workGroups[ed.work_id] = [];
    workGroups[ed.work_id].push(ed);
  });

  let mergedCount = 0;

  for (const workId in workGroups) {
    const group = workGroups[workId];
    if (group.length > 1) {
      // Find the "Rich" edition (has ISBN or Publisher)
      const richEd = group.find(e => e.isbn || e.publisher);
      // Find the "Empty" edition (no ISBN and no Publisher)
      const emptyEd = group.find(e => !e.isbn && !e.publisher);

      if (richEd && emptyEd && richEd.id !== emptyEd.id) {
        console.log(`Merging duplicates for Work ID ${workId}...`);
        
        // 1. Transfer shelf metadata from Empty to Rich if Rich is missing it
        const updates = {};
        if (!richEd.genre_id && emptyEd.genre_id) updates.genre_id = emptyEd.genre_id;
        if (!richEd.genre_name && emptyEd.genre_name) updates.genre_name = emptyEd.genre_name;
        if (!richEd.badge && emptyEd.badge) updates.badge = emptyEd.badge;
        if (!richEd.badge_label && emptyEd.badge_label) updates.badge_label = emptyEd.badge_label;
        if (richEd.book_index === null && emptyEd.book_index !== null) updates.book_index = emptyEd.book_index;

        if (Object.keys(updates).length > 0) {
          await supabase.from('editions').update(updates).eq('id', richEd.id);
        }

        // 2. Point all user_books from Empty to Rich
        const { error: ubErr } = await supabase
          .from('user_books')
          .update({ edition_id: richEd.id })
          .eq('edition_id', emptyEd.id);

        if (ubErr) {
          console.error(`Failed to re-link user_books for ${emptyEd.id}:`, ubErr);
          continue;
        }

        // 3. Delete the Empty edition
        const { error: delErr } = await supabase
          .from('editions')
          .delete()
          .eq('id', emptyEd.id);

        if (delErr) {
          console.error(`Failed to delete duplicate ${emptyEd.id}:`, delErr);
        } else {
          mergedCount++;
        }
      }
    }
  }

  console.log('\n--- DE-DUPLICATION COMPLETE ---');
  console.log(`Successfully merged and removed ${mergedCount} duplicate editions.`);
}

dedupe();
