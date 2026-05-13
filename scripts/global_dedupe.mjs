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

async function globalDedupe() {
  console.log('--- STARTING GLOBAL ARCHIVE REPAIR ---');

  // 1. DEDUPE WORKS
  console.log('Phase 1: Merging duplicate Works...');
  const { data: works } = await supabase.from('works').select('*');
  const workGroups = {};
  works.forEach(w => {
    const key = `${w.title?.toLowerCase()}|${w.author?.toLowerCase()}`;
    if (!workGroups[key]) workGroups[key] = [];
    workGroups[key].push(w);
  });

  for (const key in workGroups) {
    const group = workGroups[key];
    if (group.length > 1) {
      const master = group.sort((a, b) => a.id - b.id)[0];
      const dupes = group.filter(w => w.id !== master.id);
      
      console.log(`Merging ${dupes.length} duplicates for "${master.title}"...`);
      for (const dupe of dupes) {
        // Move editions to master
        await supabase.from('editions').update({ work_id: master.id }).eq('work_id', dupe.id);
        // Move user_books to master (if book_id is used)
        await supabase.from('user_books').update({ book_id: master.id }).eq('book_id', dupe.id);
        // Delete dupe work
        await supabase.from('works').delete().eq('id', dupe.id);
      }
    }
  }

  // 2. DEDUPE EDITIONS
  console.log('\nPhase 2: Merging duplicate Editions...');
  const { data: editions } = await supabase.from('editions').select('*');
  const edGroups = {};
  editions.forEach(ed => {
    const key = `${ed.work_id}|${ed.isbn || ed.publisher || 'empty'}|${ed.format}`;
    if (!edGroups[key]) edGroups[key] = [];
    edGroups[key].push(ed);
  });

  let edMerged = 0;
  for (const key in edGroups) {
    const group = edGroups[key];
    if (group.length > 1) {
      // Prioritize one with most metadata
      const master = group.sort((a, b) => {
        const aScore = (a.isbn ? 2 : 0) + (a.publisher ? 1 : 0) + (a.genre_id ? 1 : 0);
        const bScore = (b.isbn ? 2 : 0) + (b.publisher ? 1 : 0) + (b.genre_id ? 1 : 0);
        return bScore - aScore;
      })[0];

      const dupes = group.filter(e => e.id !== master.id);
      for (const dupe of dupes) {
        // Merge metadata to master
        const updates = {};
        if (!master.isbn && dupe.isbn) updates.isbn = dupe.isbn;
        if (!master.publisher && dupe.publisher) updates.publisher = dupe.publisher;
        if (!master.genre_id && dupe.genre_id) updates.genre_id = dupe.genre_id;
        if (!master.genre_name && dupe.genre_name) updates.genre_name = dupe.genre_name;
        if (!master.badge && dupe.badge) updates.badge = dupe.badge;
        if (Object.keys(updates).length > 0) {
          await supabase.from('editions').update(updates).eq('id', master.id);
        }

        // Re-link user_books
        await supabase.from('user_books').update({ edition_id: master.id }).eq('edition_id', dupe.id);
        // Delete dupe edition
        await supabase.from('editions').delete().eq('id', dupe.id);
        edMerged++;
      }
    }
  }

  console.log(`\n--- REPAIR COMPLETE ---`);
  console.log(`Merged ${edMerged} duplicate editions into their master works.`);
}

globalDedupe();
