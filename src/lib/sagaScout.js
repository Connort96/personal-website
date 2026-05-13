/**
 * Robust Saga Scout
 * Searches OpenLibrary to find and map missing volumes for a given series.
 */
import { KNOWN_SAGAS } from './knownSagas.js';

export async function runSagaScout(supabase, seriesId, seriesName, knownSequence, defaultAuthor = 'Unknown Author') {
  try {
    console.log(`[Saga Scout] Initiating deep scout for series: ${seriesName}`);
    const uniqueVolumes = new Map();

    // 0. Phase 0: The Local Mega-Registry
    console.log(`[Saga Scout] Phase 0: Checking Local Mega-Registry for ${seriesName}`);
    const knownMatch = KNOWN_SAGAS.find(s => 
      s.name.toLowerCase() === seriesName.toLowerCase() ||
      seriesName.toLowerCase().includes(s.name.toLowerCase()) ||
      s.name.toLowerCase().includes(seriesName.toLowerCase())
    );
    if (knownMatch) {
      console.log(`[Saga Scout] Mega-Registry hit! Found perfect mapping for ${seriesName}`);
      knownMatch.books.forEach(b => {
        if (b.sequence !== knownSequence) {
          uniqueVolumes.set(b.sequence, {
            title: b.title,
            author: defaultAuthor
          });
        }
      });
    }

    // NEW: Phase 0.5: Gemini AI Deep Scan (The canonical source)
    console.log(`[Saga Scout] Phase 0.5: Initiating Gemini AI Deep Scan for ${seriesName}`);
    try {
      const { data: aiData, error: aiError } = await supabase.functions.invoke('sync-series-volumes', {
        body: { series_name: seriesName }
      });
      
      if (!aiError && Array.isArray(aiData)) {
        console.log(`[Saga Scout] Gemini found ${aiData.length} canonical volumes.`);
        aiData.forEach(b => {
          if (b.series_index !== knownSequence && !uniqueVolumes.has(b.series_index)) {
            uniqueVolumes.set(b.series_index, {
              title: b.title,
              author: defaultAuthor
            });
          }
        });
      }
    } catch (aiErr) {
      console.warn(`[Saga Scout] Gemini AI Scan failed:`, aiErr);
    }

    // Phase 1: OpenLibrary Fallback (only if we still have gaps)
    if (uniqueVolumes.size === 0) {
      console.log(`[Saga Scout] Phase 1: Gemini yielded nothing. Checking OpenLibrary for ${seriesName}`);
      try {
        const searchRes = await fetch(`https://openlibrary.org/search.json?q=series:("${encodeURIComponent(seriesName)}")&limit=50`);
        const searchData = await searchRes.json();
        searchData.docs?.forEach(doc => {
          if (doc.series_name?.some(n => n.toLowerCase().includes(seriesName.toLowerCase())) && doc.series_position?.[0]) {
            const pos = parseInt(doc.series_position[0]);
            if (pos !== knownSequence && !uniqueVolumes.has(pos)) {
              uniqueVolumes.set(pos, {
                title: doc.title,
                author: doc.author_name?.[0] || defaultAuthor
              });
            }
          }
        });
      } catch (phase1Err) {
        console.warn(`[Saga Scout] Phase 1 fallback failed:`, phase1Err);
      }
    }

    if (uniqueVolumes.size === 0) {
      console.log(`[Saga Scout] No missing siblings found for ${seriesName}.`);
      return { found: 0, newWorks: 0 };
    }

    console.log(`[Saga Scout] Found ${uniqueVolumes.size} candidate siblings for ${seriesName}`);
    
    let newlyMapped = 0;
    
    for (const [seq, data] of uniqueVolumes) {
      // Check if already mapped in series_works
      const { data: existingLink } = await supabase
        .from('series_works')
        .select('work_id')
        .eq('series_id', seriesId)
        .eq('sequence_order', seq)
        .maybeSingle();
      
      if (existingLink) continue;

      // Check if work already exists by title and author
      let { data: siblingWork } = await supabase
        .from('works')
        .select('id')
        .ilike('title', data.title)
        .ilike('author', data.author)
        .maybeSingle();
      
      if (!siblingWork) {
        // Create "Ghost Entry" since it's missing from the physical collection
        const { data: newW, error: wErr } = await supabase
          .from('works')
          .insert({ 
            title: data.title, 
            author: data.author,
            in_collection: false // It's a ghost entry
          })
          .select('id')
          .single();
        
        if (wErr) {
          console.error("[Saga Scout] Failed to create ghost sibling work:", wErr);
          continue;
        }
        siblingWork = newW;
      }

      // Link sibling work to series
      const { error: swErr } = await supabase.from('series_works').upsert({
        series_id: seriesId,
        work_id: siblingWork.id,
        sequence_order: seq
      }, { onConflict: 'series_id, work_id' });

      if (!swErr) newlyMapped++;
    }

    return { found: uniqueVolumes.size, newWorks: newlyMapped };
  } catch (err) {
    console.error(`[Saga Scout] Critical failure during scout for ${seriesName}`, err);
    throw err;
  }
}
