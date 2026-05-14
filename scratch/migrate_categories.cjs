
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing Supabase environment variables.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function migrateCategories() {
  console.log("Starting category to themes migration...");

  // 1. Fetch ALL books using pagination
  let allBooks = [];
  let from = 0;
  const limit = 1000;
  
  while (true) {
    const { data, error } = await supabase
      .from('books')
      .select('id, work_id, genre_name')
      .range(from, from + limit - 1);
    
    if (error) {
      console.error("Error fetching books:", error);
      return;
    }
    allBooks = [...allBooks, ...data];
    if (data.length < limit) break;
    from += limit;
  }

  console.log(`Processing ${allBooks.length} entries...`);

  const workUpdates = new Map();

  for (const book of allBooks) {
    if (!book.work_id || !book.genre_name) continue;

    if (!workUpdates.has(book.work_id)) {
      workUpdates.set(book.work_id, new Set());
    }
    workUpdates.get(book.work_id).add(book.genre_name);
  }

  let count = 0;
  for (const [workId, themes] of workUpdates.entries()) {
    // Fetch current themes to append
    const { data: work } = await supabase
      .from('works')
      .select('themes')
      .eq('id', workId)
      .single();

    const currentThemes = work?.themes || [];
    const newThemes = [...new Set([...currentThemes, ...Array.from(themes)])];

    const { error: updateError } = await supabase
      .from('works')
      .update({ themes: newThemes })
      .eq('id', workId);

    if (updateError) {
      console.error(`Failed to update work ${workId}:`, updateError);
    } else {
      count++;
    }
  }

  console.log(`Migration complete. Updated ${count} works.`);
}

migrateCategories();
