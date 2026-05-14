const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function sweepHarryPotter() {
  console.log('--- Deep Sweep: Harry Potter Series ---');

  // 1. Find the series
  const { data: series } = await supabase.from('series').select('*').ilike('name', 'Harry Potter').maybeSingle();
  if (!series) {
    console.error('Series "Harry Potter" not found!');
    return;
  }
  const sId = series.id;
  console.log(`Found Series: ${series.name} (${sId})`);

  // 2. Find all works that might be Philosopher's Stone
  const { data: works } = await supabase.from('works').select('id, title').ilike('title', 'Harry Potter and the Philosopher%');
  console.log(`Found ${works.length} candidate works for Vol 1.`);
  works.forEach(w => console.log(`  Work ID: ${w.id} - "${w.title}"`));

  // 3. Find all series_works entries for this series
  const { data: swEntries } = await supabase.from('series_works').select('*').eq('series_id', sId);
  console.log(`Found ${swEntries.length} entries in series_works for this series.`);

  // 4. Identify duplicates at Vol 1
  const vol1Entries = swEntries.filter(e => e.sequence_order === 1);
  console.log(`Found ${vol1Entries.length} entries at Vol 1.`);

  // 5. Fix logic:
  // We want ID 1869 to be the ONLY Vol 1.
  const masterWorkId = 1869;

  // Delete all existing Vol 1 entries
  if (vol1Entries.length > 0) {
    console.log('Deleting existing Vol 1 entries...');
    await supabase.from('series_works').delete().eq('series_id', sId).eq('sequence_order', 1);
  }

  // Ensure master work is in there as Vol 1
  console.log(`Linking Master Work ${masterWorkId} as Vol 1...`);
  const { error: insError } = await supabase.from('series_works').upsert({
    series_id: sId,
    work_id: masterWorkId,
    sequence_order: 1
  }, { onConflict: 'series_id, work_id' });

  if (insError) console.error('Error linking master work:', insError.message);
  else console.log('Successfully linked Master Work as Vol 1.');

  // 6. Check for other duplicates in the whole series
  const seenOrders = {};
  for (const entry of swEntries) {
    if (entry.sequence_order === 1) continue; // Already handled
    if (seenOrders[entry.sequence_order]) {
      console.log(`Duplicate found at Vol ${entry.sequence_order}. Deleting duplicate mapping for work ${entry.work_id}.`);
      await supabase.from('series_works').delete().match({ series_id: sId, work_id: entry.work_id });
    } else {
      seenOrders[entry.sequence_order] = entry.work_id;
    }
  }

  console.log('--- Sweep Complete ---');
}

sweepHarryPotter().catch(console.error);
