const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');
const sharp = require('sharp');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

// Formalized name mapping
const FORMAL_MAP = {
  'penguin': 'Penguin Classics',
  'folio': 'Folio Society',
  'vintage': 'Vintage Classics',
  'everyman': "Everyman's Library",
  'oxford': 'Oxford World Classics',
  'modern': 'Modern Library'
};

async function processAndUploadCoverNode(url, isbn) {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Fetch failed: ${res.statusText}`);
    const buffer = await res.buffer();

    // Compress using sharp
    const compressed = await sharp(buffer)
      .resize(800, null, { withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();

    const fileName = `covers/${isbn}-${Date.now()}.jpg`;
    const { error: uploadError } = await supabase.storage
      .from('book-covers')
      .upload(fileName, compressed, {
        contentType: 'image/jpeg',
        upsert: true
      });

    if (uploadError) throw uploadError;

    const { data: publicUrlData } = supabase.storage
      .from('book-covers')
      .getPublicUrl(fileName);

    return publicUrlData.publicUrl;
  } catch (err) {
    console.error(`  [Storage] Failed to process cover for ${isbn}:`, err.message);
    return url;
  }
}

async function runMatcher() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.log("Usage: node retroactive_imprint_matcher.cjs <publisher_search_term> <work_id1,work_id2,...>");
    return;
  }

  const searchTerm = args[0].toLowerCase();
  const workIds = args[1].split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
  
  const formalName = FORMAL_MAP[searchTerm] || args[0];
  
  console.log(`🚀 Starting Retroactive Imprint Matcher`);
  console.log(`🎯 Target Publisher: "${searchTerm}" (Formalizing to: "${formalName}")`);
  console.log(`📚 Processing ${workIds.length} works...\n`);

  for (const workId of workIds) {
    try {
      // 1. Fetch work info
      const { data: work, error: workErr } = await supabase
        .from('works')
        .select('title, author')
        .eq('id', workId)
        .single();

      if (workErr || !work) {
        console.error(`❌ Work ${workId} not found. Skipping.`);
        continue;
      }

      console.log(`🔎 Searching for: "${work.title}" by ${work.author}...`);

      // 2. Query Open Library
      const queryUrl = `https://openlibrary.org/search.json?title=${encodeURIComponent(work.title)}&author=${encodeURIComponent(work.author)}&publisher=${encodeURIComponent(searchTerm)}&limit=1`;
      
      const res = await fetch(queryUrl);
      const data = await res.json();

      if (!data.docs || data.docs.length === 0) {
        console.log(`  ⚠️  No matching edition found for "${searchTerm}".`);
      } else {
        const result = data.docs[0];
        const isbn = result.isbn ? result.isbn[0] : null;

        if (!isbn) {
          console.log(`  ⚠️  Found edition but no ISBN available. Skipping.`);
        } else {
          console.log(`  ✅ Found Match! ISBN: ${isbn}. Linking edition...`);

          // 3. Trigger Cover Art Pipeline
          const coverUrl = `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;
          const storageUrl = await processAndUploadCoverNode(coverUrl, isbn);

          // 4. Create Edition Record
          const { data: newEdition, error: edErr } = await supabase
            .from('editions')
            .insert({
              work_id: workId,
              isbn: isbn,
              collection_imprint: formalName,
              publisher: result.publisher?.[0] || formalName,
              cover_url: storageUrl,
              cover_image_url: storageUrl,
              format: 'Hardcover', // Default assumption for specific imprints
              genre_name: 'Classic' // Default
            })
            .select()
            .single();

          if (edErr) {
            console.error(`  ❌ Failed to create edition:`, edErr.message);
          } else {
            console.log(`  ✨ Created Edition ID: ${newEdition.id}`);
          }
        }
      }
    } catch (err) {
      console.error(`  ❌ Error processing work ${workId}:`, err.message);
    }

    // 5. Rate Limiting
    await new Promise(resolve => setTimeout(resolve, 1500));
  }

  console.log(`\n🎉 Retroactive Matching Complete.`);
}

runMatcher();
