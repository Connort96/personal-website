import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

// Read .env.local
const envFile = fs.readFileSync('.env.local', 'utf8');
const url = envFile.split('\n').find(l => l.startsWith('VITE_SUPABASE_URL')).split('=')[1].trim();
const key = envFile.split('\n').find(l => l.startsWith('VITE_SUPABASE_ANON_KEY')).split('=')[1].trim();

const supabase = createClient(url, key);

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  console.log("Authenticating as Admin...");
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'theconison96@gmail.com',
    password: 'Mister2022!'
  });
  
  if (authError) {
    console.error("Auth failed:", authError);
    return;
  }
  
  console.log("Fetching books without covers...");
  let allMissing = [];
  let hasMore = true;
  let from = 0;
  const limit = 1000;
  
  while (hasMore) {
    const { data, error } = await supabase
      .from('books')
      .select('id, title, author')
      .is('cover_url', null)
      .range(from, from + limit - 1);
      
    if (error) {
      console.error("Fetch error:", error);
      return;
    }
    
    allMissing = [...allMissing, ...data];
    if (data.length < limit) hasMore = false;
    else from += limit;
  }
  
  console.log(`Found ${allMissing.length} books missing covers. Starting backfill...`);
  
  let successCount = 0;
  let notFoundCount = 0;
  
  for (let i = 0; i < allMissing.length; i++) {
    const book = allMissing[i];
    console.log(`[${i+1}/${allMissing.length}] Processing: "${book.title}" by ${book.author}`);
    
    try {
      const query = encodeURIComponent(`intitle:${book.title} ${book.author ? `inauthor:${book.author}` : ''}`);
      const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${query}&maxResults=1`);
      const apiData = await res.json();
      
      if (apiData.items && apiData.items.length > 0 && apiData.items[0].volumeInfo.imageLinks) {
        let coverUrl = apiData.items[0].volumeInfo.imageLinks.thumbnail;
        coverUrl = coverUrl.replace('http:', 'https:').replace('&edge=curl', '');
        
        const { error: updateError } = await supabase
          .from('books')
          .update({ cover_url: coverUrl })
          .eq('id', book.id);
          
        if (updateError) {
          console.error(`  -> Failed to save to Supabase:`, updateError);
        } else {
          console.log(`  -> Success! Found cover.`);
          successCount++;
        }
      } else {
        console.log(`  -> No cover found on Google Books.`);
        notFoundCount++;
      }
    } catch (err) {
      console.error(`  -> API Error:`, err.message);
    }
    
    // Safety delay
    await delay(500);
  }
  
  console.log("-----------------------------------------");
  console.log("BACKFILL COMPLETE");
  console.log(`Successfully added: ${successCount}`);
  console.log(`No cover found for: ${notFoundCount}`);
  console.log("-----------------------------------------");
}

run();
