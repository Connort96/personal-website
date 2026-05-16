import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { tracker_name, ai_prompt } = await req.json();

    if (!tracker_name || !ai_prompt) {
      return new Response(
        JSON.stringify({ error: 'tracker_name and ai_prompt are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'GEMINI_API_KEY not set in environment' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Bulk Ingest AI] Generating tracker "${tracker_name}" with prompt: "${ai_prompt}"`);

    // Step A: Call Gemini API
    const systemInstruction = "You are a library metadata generator. Based on the user prompt, return a pure JSON array of objects containing only title (string) and author (string). Do not use markdown formatting. Maximum 50 items.";
    const fullPrompt = `${systemInstruction}\n\nUser Prompt: ${ai_prompt}`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    const geminiBody = {
      contents: [{ parts: [{ text: fullPrompt }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
      }
    };

    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiBody),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      throw new Error(`Gemini API Error: ${errText}`);
    }

    const geminiData = await geminiRes.json();
    let textResult = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textResult) {
      throw new Error('Gemini returned empty response');
    }

    textResult = textResult.replace(/```json/g, '').replace(/```/g, '').trim();
    const books = JSON.parse(textResult);

    if (!Array.isArray(books)) {
      throw new Error('Gemini did not return a valid JSON array');
    }

    console.log(`[Bulk Ingest AI] Gemini returned ${books.length} books. Starting database upsert loop...`);

    // Step B: Database Upsert Loop
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? Deno.env.get('VITE_SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('VITE_SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase credentials not configured in Deno environment');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    let successCount = 0;
    let errorCount = 0;

    for (const book of books) {
      if (!book.title) continue;

      const cleanTitle = book.title.trim();
      const cleanAuthor = (book.author || 'Unknown Author').trim();

      try {
        // Upsert work
        const { data: workData, error: workErr } = await supabase
          .from('works')
          .upsert(
            { title: cleanTitle, author: cleanAuthor },
            { onConflict: 'title, author' }
          )
          .select('id')
          .single();

        if (workErr) {
          console.error(`[Work Upsert Error] "${cleanTitle}":`, workErr.message);
          errorCount++;
          continue;
        }

        const work_id = workData.id;

        // Check if edition already exists in this tracker
        const { data: existingEd } = await supabase
          .from('editions')
          .select('id')
          .eq('work_id', work_id)
          .eq('collection_imprint', tracker_name)
          .maybeSingle();

        if (!existingEd) {
          const { error: insertErr } = await supabase
            .from('editions')
            .insert({
              work_id: work_id,
              collection_imprint: tracker_name,
              status: 'Wanted',
              publisher: 'Unknown Publisher'
            });

          if (insertErr) {
            console.error(`[Edition Insert Error] "${cleanTitle}":`, insertErr.message);
            errorCount++;
          } else {
            successCount++;
          }
        } else {
          successCount++; // Already exists, consider it a success
        }
      } catch (err) {
        console.error(`[Loop Error] "${cleanTitle}":`, err.message);
        errorCount++;
      }
    }

    console.log(`[Bulk Ingest AI] Completed ingest for "${tracker_name}". Success: ${successCount}, Errors: ${errorCount}`);

    return new Response(
      JSON.stringify({ success: true, count: successCount, errors: errorCount }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error("[Bulk Ingest AI] Fatal Error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
