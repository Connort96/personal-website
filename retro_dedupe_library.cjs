const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

function normalize(str) {
  if (!str) return '';
  return str.toLowerCase()
    .replace(/&/g, 'and')      // Expand ampersands
    // Strip common edition suffixes that prevent matching
    .replace(/\s*(-|:)\s*(gryffindor|slytherin|hufflepuff|ravenclaw|anniversary|special|limited|collector|deluxe|illustrated|large print).*/i, '')
    .replace(/\s*\((gryffindor|slytherin|hufflepuff|ravenclaw|anniversary|special|limited|collector|deluxe|illustrated|large print).*\)/i, '')
    .replace(/[^a-z0-9]/g, '') // Strip EVERYTHING except alphanumeric
    .trim();
}

async function deduplicateWorks() {
  console.log('--- Retroactive Work Deduplication & Fuzzy Consolidation ---');

  // 1. Fetch all works with pagination
  let allWorks = [];
  let from = 0;
  const range = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data: works, error: worksError } = await supabase
      .from('works')
      .select('id, title, author')
      .order('id', { ascending: true })
      .range(from, from + range - 1);

    if (worksError) {
      console.error('Error fetching works:', worksError);
      return;
    }

    allWorks = [...allWorks, ...works];
    console.log(`Fetched ${allWorks.length} works...`);
    
    if (works.length < range) {
      hasMore = false;
    } else {
      from += range;
    }
  }

  console.log(`Total works to process: ${allWorks.length}`);

  // 2. Group by normalized Title (+ Author, but handle 'Unknown Author' specially)
  const groups = {};
  allWorks.forEach(work => {
    const normTitle = normalize(work.title);
    const normAuthor = normalize(work.author);
    const isUnknownAuthor = normAuthor === 'unknownauthor';
    
    // If author is unknown, we group by title only, but we'll prioritize groups with known authors
    const key = isUnknownAuthor ? `TITLEONLY|${normTitle}` : `FULL|${normTitle}|${normAuthor}`;
    
    if (!groups[key]) groups[key] = [];
    groups[key].push(work);
  });

  // Second pass: merge TITLEONLY groups into FULL groups if the title matches
  const finalizedGroups = {};
  Object.keys(groups).forEach(key => {
    if (key.startsWith('FULL|')) {
      const title = key.split('|')[1];
      const titleOnlyKey = `TITLEONLY|${title}`;
      const group = [...groups[key]];
      if (groups[titleOnlyKey]) {
        console.log(`  Found potential matches for "${title}" with Unknown Author. Merging...`);
        group.push(...groups[titleOnlyKey]);
        delete groups[titleOnlyKey];
      }
      finalizedGroups[key] = group;
    }
  });
  // Add remaining TITLEONLY groups (ones that didn't have a FULL match)
  Object.keys(groups).forEach(key => {
    if (key.startsWith('TITLEONLY|')) {
      finalizedGroups[key] = groups[key];
    }
  });

  const duplicateGroups = Object.values(finalizedGroups).filter(g => g.length > 1);
  console.log(`Found ${duplicateGroups.length} sets of duplicate works.`);
  
  if (duplicateGroups.length === 0) {
    console.log("Sample Keys:", Object.keys(groups).slice(0, 10));
  }

  for (const group of duplicateGroups) {
    const master = group[0];
    const slaves = group.slice(1);
    const slaveIds = slaves.map(s => s.id);

    console.log(`\nMerging ${slaves.length} duplicates into Master: "${master.title}" by ${master.author} (ID: ${master.id})`);
    console.log(`Slaves to be purged: ${slaveIds.join(', ')}`);

    // A. Point all editions to Master
    const { error: edError } = await supabase
      .from('editions')
      .update({ work_id: master.id })
      .in('work_id', slaveIds);
    
    if (edError) console.error('  Error updating editions:', edError.message);
    else console.log(`  Updated editions to Master Work.`);

    // B. Point all checklist books to Master
    const { error: bookError } = await supabase
      .from('books')
      .update({ work_id: master.id })
      .in('work_id', slaveIds);

    if (bookError) console.error('  Error updating checklist books:', bookError.message);
    else console.log(`  Updated checklist references.`);

    // B2. Point all series_works to Master
    const { error: seriesError } = await supabase
      .from('series_works')
      .update({ work_id: master.id })
      .in('work_id', slaveIds);
    
    if (seriesError) {
      if (seriesError.code === '23505') {
        // Unique violation: Master already has this series entry
        await supabase.from('series_works').delete().in('work_id', slaveIds);
        console.log(`  Cleaned up duplicate series entries.`);
      } else {
        console.error('  Error updating series_works:', seriesError.message);
      }
    } else {
      console.log(`  Updated series references.`);
    }

    // C. Consolidate user_books
    // This is tricky because user_books might have unique constraints
    // We fetch all slave user_books and try to move them to Master book_id
    const { data: slaveUserBooks } = await supabase
      .from('user_books')
      .select('*')
      .in('book_id', slaveIds);

    if (slaveUserBooks && slaveUserBooks.length > 0) {
      for (const row of slaveUserBooks) {
        // Find the legacy book row for the master work
        const { data: masterBook } = await supabase
          .from('books')
          .select('id')
          .eq('work_id', master.id)
          .limit(1)
          .maybeSingle();

        if (masterBook) {
          const { error: ubError } = await supabase
            .from('user_books')
            .update({ book_id: masterBook.id })
            .match({ user_id: row.user_id, edition_id: row.edition_id });
          
          if (ubError) console.error(`  Error updating user_book row:`, ubError.message);
        }
      }
      console.log(`  Consolidated ${slaveUserBooks.length} ownership records.`);
    }

    // E. Deduplicate Checklist (books table)
    // Sometimes multiple checklist entries point to the same work
    const { data: checklistItems } = await supabase
      .from('books')
      .select('id, isbn')
      .eq('work_id', master.id);
    
    if (checklistItems && checklistItems.length > 1) {
      console.log(`  Deduplicating checklist entries for Master Work ${master.id}...`);
      // Keep the one with an ISBN if possible, or just the first one
      const sorted = checklistItems.sort((a, b) => (b.isbn ? 1 : 0) - (a.isbn ? 1 : 0));
      const keepId = sorted[0].id;
      const discardIds = sorted.slice(1).map(i => i.id);
      
      const { error: delErr } = await supabase.from('books').delete().in('id', discardIds);
      if (delErr) console.error('  Error purging duplicate checklist items:', delErr.message);
      else console.log(`  Purged ${discardIds.length} redundant checklist entries.`);
    }

    // F. Successfully purged duplicate work records
    const { error: purgeError } = await supabase
      .from('works')
      .delete()
      .in('id', slaveIds);

    if (purgeError) {
      console.error(`  Failed to delete slave works:`, purgeError.message);
    } else {
      console.log(`  Successfully purged duplicate work records.`);
    }
  }

  console.log('\n--- Cleanup Complete ---');
}

deduplicateWorks().catch(console.error);
