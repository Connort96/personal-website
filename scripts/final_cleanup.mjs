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

async function finalCleanup() {
  console.log('--- STARTING FINAL SURGICAL ARCHIVE CLEANUP ---');

  // 1. DEDUPE WORKS
  console.log('Phase 1: Merging all duplicate Works...');
  const { data: works } = await supabase.from('works').select('*');
  const workGroups = {};
  works.forEach(w => {
    // Fuzzy key: lowercase alphanumeric only
    const key = `${w.title?.toLowerCase().replace(/[^a-z0-9]/g, '')}|${w.author?.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    if (!workGroups[key]) workGroups[key] = [];
    workGroups[key].push(w);
  });

  for (const key in workGroups) {
    const group = workGroups[key];
    if (group.length > 1) {
      const master = group.sort((a, b) => a.id - b.id)[0];
      const dupes = group.filter(w => w.id !== master.id);
      
      for (const dupe of dupes) {
        // Move editions to master
        await supabase.from('editions').update({ work_id: master.id }).eq('work_id', dupe.id);
        // Move user_books to master
        await supabase.from('user_books').update({ book_id: master.id }).eq('book_id', dupe.id);
        // Delete dupe work
        await supabase.from('works').delete().eq('id', dupe.id);
      }
    }
  }

  // 2. DEDUPE EDITIONS
  console.log('Phase 2: Merging all duplicate Editions...');
  // Re-fetch to get updated work_ids after Phase 1
  const { data: editions } = await supabase.from('editions').select('*');
  const edGroups = {};
  editions.forEach(ed => {
    // Fuzzy key for edition: work_id + publisher + format + isbn
    let pubKey = ed.publisher?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'none';
    if (pubKey === 'unknownpublisher') pubKey = 'none'; // Normalize "Unknown Publisher"
    
    const isbnKey = ed.isbn?.replace(/[^0-9x]/gi, '') || 'none';
    const key = `${ed.work_id}|${pubKey}|${ed.format}|${isbnKey}`;
    if (!edGroups[key]) edGroups[key] = [];
    edGroups[key].push(ed);
  });

  let removedCount = 0;
  for (const key in edGroups) {
    const group = edGroups[key];
    if (group.length > 1) {
      // Pick master (one with cover or more metadata)
      const master = group.sort((a, b) => {
        const aScore = (a.cover_image_url ? 5 : 0) + (a.isbn ? 2 : 0) + (a.publisher ? 1 : 0);
        const bScore = (b.cover_image_url ? 5 : 0) + (b.isbn ? 2 : 0) + (b.publisher ? 1 : 0);
        return bScore - aScore;
      })[0];

      const dupes = group.filter(e => e.id !== master.id);
      for (const dupe of dupes) {
        // Transfer progress from Dupe to Master safely
        const { data: dupeUbs } = await supabase.from('user_books').select('*').eq('edition_id', dupe.id);
        for (const ub of dupeUbs) {
          const { data: masterUb } = await supabase.from('user_books').select('*').eq('user_id', ub.user_id).eq('edition_id', master.id).single();
          
          if (masterUb) {
            // Merge progress: take highest
            const maxPage = Math.max(ub.current_page || 0, masterUb.current_page || 0);
            const maxRating = Math.max(ub.rating || 0, masterUb.rating || 0);
            await supabase.from('user_books').update({ 
              current_page: maxPage, 
              rating: maxRating,
              review: masterUb.review || ub.review
            }).eq('id', masterUb.id);
            // Delete dupe progress record
            await supabase.from('user_books').delete().eq('id', ub.id);
          } else {
            // Re-link dupe progress to master
            await supabase.from('user_books').update({ edition_id: master.id }).eq('id', ub.id);
          }
        }

        // Transfer shelf metadata if missing
        const updates = {};
        if (!master.genre_id && dupe.genre_id) updates.genre_id = dupe.genre_id;
        if (!master.genre_name && dupe.genre_name) updates.genre_name = dupe.genre_name;
        if (!master.badge && dupe.badge) updates.badge = dupe.badge;
        if (Object.keys(updates).length > 0) {
          await supabase.from('editions').update(updates).eq('id', master.id);
        }

        // Delete dupe edition
        await supabase.from('editions').delete().eq('id', dupe.id);
        removedCount++;
      }
    }
  }

  console.log(`\n--- ARCHIVE CLEANUP COMPLETE ---`);
  console.log(`Merged ${removedCount} more duplicate records.`);
}

finalCleanup();
