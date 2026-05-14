const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function fixSeriesDuplicates() {
  console.log('--- Fixing Duplicate Series Positions ---');

  const { data: allSeriesWorks, error } = await supabase
    .from('series_works')
    .select('series_id, work_id, sequence_order, works(title, author)');

  if (error) {
    console.error('Error fetching series works:', error);
    return;
  }

  const seenPositions = {};
  const toDelete = [];

  allSeriesWorks.forEach(sw => {
    const key = `${sw.series_id}|${sw.sequence_order}`;
    if (!seenPositions[key]) {
      seenPositions[key] = sw;
    } else {
      // Duplicate position found!
      const existing = seenPositions[key];
      console.log(`Duplicate found at Vol ${sw.sequence_order} in series ${sw.series_id}`);
      console.log(`  Existing: "${existing.works?.title}" (Work: ${existing.work_id})`);
      console.log(`  New:      "${sw.works?.title}" (Work: ${sw.work_id})`);

      // Strategy: If titles are similar, delete the duplicate
      // For now, let's just log them and delete the newest one
      toDelete.push({ series_id: sw.series_id, work_id: sw.work_id });
    }
  });

  if (toDelete.length > 0) {
    console.log(`Deleting ${toDelete.length} duplicate series mappings...`);
    for (const item of toDelete) {
      await supabase.from('series_works').delete().match(item);
    }
  }

  console.log('--- Complete ---');
}

fixSeriesDuplicates().catch(console.error);
