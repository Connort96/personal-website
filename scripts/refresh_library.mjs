import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function refreshLibrary() {
  console.log("🚀 Starting Full Library Metadata Refresh...");

  // 1. Fetch owned IDs first
  console.log("🔍 Identifying owned works...");
  const { data: userBooks, error: userError } = await supabase
    .from('user_books')
    .select('editions(work_id)');
  
  if (userError) {
    console.error("❌ Failed to fetch owned books:", userError);
    return;
  }

  const ownedWorkIds = [...new Set(userBooks.map(ub => ub.editions?.work_id).filter(Boolean))];

  // 2. Reset only owned works
  console.log(`📝 Resetting vibes, motifs, and synopses for ${ownedWorkIds.length} owned works...`);
  const { error: resetError } = await supabase
    .from('works')
    .update({ 
      vibes: [], 
      motifs: [], 
      synopsis: null, 
      ai_enriched: false 
    })
    .in('id', ownedWorkIds);

  if (resetError) {
    console.error("❌ Reset failed:", resetError);
    return;
  }

  // 3. Select works for processing
  const { data: works, error: fetchError } = await supabase
    .from('works')
    .select('id, title, author')
    .in('id', ownedWorkIds)
    .order('title');

  if (fetchError) {
    console.error("❌ Fetch failed:", fetchError);
    return;
  }

  console.log(`📚 Found ${works.length} works to re-enrich.`);

  // 3. Process in batches of 3
  const batchSize = 3;
  const delayMs = 2000;

  for (let i = 0; i < works.length; i += batchSize) {
    const batch = works.slice(i, i + batchSize);
    console.log(`\n📦 Processing batch ${Math.floor(i/batchSize) + 1} of ${Math.ceil(works.length/batchSize)}...`);

    // Fetch current pool for taxonomy pooling
    const { data: tagPool } = await supabase.from('works').select('vibes, motifs');
    const existingVibes = [...new Set(tagPool?.flatMap(w => w.vibes || []) || [])].slice(0, 100);
    const existingMotifs = [...new Set(tagPool?.flatMap(w => w.motifs || []) || [])].slice(0, 100);

    await Promise.all(batch.map(async (work) => {
      try {
        console.log(`   - Analyzing: "${work.title}"`);
        
        // Call the Edge Function using the supabase client (handles auth automatically)
        const { data: aiData, error: aiError } = await supabase.functions.invoke('fetch-enriched-metadata', {
          body: {
            title: work.title,
            author: work.author,
            existing_vibes: existingVibes,
            existing_motifs: existingMotifs
          }
        });

        if (aiError) throw aiError;

        if (aiData) {
          const updates = { 
            ai_enriched: true,
            vibes: aiData.vibes || [],
            motifs: aiData.motifs || [],
            setting_era: aiData.setting_era || null,
            setting_location: aiData.setting_location || null,
            synopsis: aiData.synopsis || null
          };

          await supabase.from('works').update(updates).eq('id', work.id);
          console.log(`   ✅ Success: "${work.title}"`);
        }
      } catch (err) {
        console.error(`   ❌ Failed: "${work.title}" - ${err.message}`);
      }
    }));

    if (i + batchSize < works.length) {
      console.log(`⏳ Waiting ${delayMs/1000}s for rate limits...`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  console.log("\n✨ Library Refresh Complete!");
}

refreshLibrary();
