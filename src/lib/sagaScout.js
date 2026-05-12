/**
 * Robust Saga Scout
 * Searches OpenLibrary to find and map missing volumes for a given series.
 */

export async function runSagaScout(supabase, seriesId, seriesName, knownSequence, defaultAuthor = 'Unknown Author') {
  try {
    console.log(`[Saga Scout] Initiating deep scout for series: ${seriesName}`);
    const uniqueVolumes = new Map();

    // 1. Phase 1: HIDDEN SERIES API (The Triple-Threat)
    console.log(`[Saga Scout] Phase 1: Checking hidden Series API for ${seriesName}`);
    try {
      const searchRes = await fetch(`https://openlibrary.org/search.json?title=${encodeURIComponent(seriesName)}&limit=3`);
      const searchData = await searchRes.json();
      
      let seriesKey = null;
      for (const doc of (searchData.docs || [])) {
        if (doc.key) {
          const workRes = await fetch(`https://openlibrary.org${doc.key}.json`);
          const workData = await workRes.json();
          if (workData.series?.[0]?.series?.key) {
            seriesKey = workData.series[0].series.key;
            break;
          }
        }
      }

      if (seriesKey) {
        console.log(`[Saga Scout] Found canonical series key: ${seriesKey}`);
        const seedsRes = await fetch(`https://openlibrary.org${seriesKey}/seeds.json`);
        const seedsData = await seedsRes.json();
        
        let seqTracker = 1;
        seedsData.entries?.forEach(entry => {
          const titleMatch = entry.title?.match(/Vol\.?\s*(\d+)|Book\s*(\d+)/i);
          const seq = titleMatch ? parseInt(titleMatch[1] || titleMatch[2]) : seqTracker;
          
          if (seq !== knownSequence && !uniqueVolumes.has(seq)) {
            uniqueVolumes.set(seq, {
              title: entry.title,
              author: defaultAuthor // Seeds API doesn't return author, fallback to known author
            });
          }
          seqTracker++;
        });
      }
    } catch (phase1Err) {
      console.warn(`[Saga Scout] Phase 1 Series API failed:`, phase1Err);
    }

    // 2. Phase 2: Fallback Search (by title)
    if (uniqueVolumes.size === 0) {
      console.log(`[Saga Scout] Phase 2: Series API yielded nothing. Attempting title fallback for: ${seriesName}`);
      const fallbackRes = await fetch(`https://openlibrary.org/search.json?title=${encodeURIComponent(seriesName)}&limit=50`);
      const fallbackData = await fallbackRes.json();
      fallbackData.docs?.forEach(doc => {
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
    }

    // 3. Phase 3: Primary Search (by series keyword)
    if (uniqueVolumes.size === 0) {
      console.log(`[Saga Scout] Phase 3: Title fallback yielded nothing. Attempting broad series query for: ${seriesName}`);
      const primaryRes = await fetch(`https://openlibrary.org/search.json?q=series:("${encodeURIComponent(seriesName)}")`);
      const primaryData = await primaryRes.json();
      primaryData.docs?.forEach(doc => {
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
        const { data: newW, error: wErr } = await supabase
          .from('works')
          .insert({ title: data.title, author: data.author })
          .select('id')
          .single();
        
        if (wErr) {
          console.error("[Saga Scout] Failed to create sibling work:", wErr);
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
