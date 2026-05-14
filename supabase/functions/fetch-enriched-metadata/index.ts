import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Exponential Backoff ──
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000;

async function callGeminiWithRetry(url: string, body: object): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (response.ok) return response;

    const status = response.status;
    const errorText = await response.text();

    if (status === 429 || status >= 500) {
      const delay = BASE_DELAY_MS * Math.pow(2, attempt);
      console.warn(`[Enrichment AI] Attempt ${attempt + 1}/${MAX_RETRIES} failed (${status}). Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      lastError = new Error(`Gemini API ${status}: ${errorText}`);
      continue;
    }

    throw new Error(`Gemini API ${status}: ${errorText}`);
  }

  throw lastError || new Error('All retries exhausted');
}

// ── Null-safe response shape ──
const NULL_RESPONSE = {
  is_series: false,
  series_name: null,
  series_index: null,
  synopsis: null,
  vibes: [],
  motifs: [],
  setting_location: null,
  setting_era: null,
  provenance: {
    condition: null,
    defects: [],
    acquisition_source: null,
    acquisition_year: null,
  }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { title, author, provenance_string, existing_vibes = [], existing_motifs = [] } = await req.json();

    if (!title || !author) {
      return new Response(
        JSON.stringify({ error: 'Title and author are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      console.error('[Enrichment AI] GEMINI_API_KEY not set');
      return new Response(
        JSON.stringify(NULL_RESPONSE),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Enrichment AI] Analyzing: "${title}" by ${author}`);

    const prompt = `Categorize this book: "${title}" by "${author}". 
      Use these Top 40 Themes/Vibes to standardize your selection where possible:
      Themes: ${JSON.stringify(existing_motifs)}
      Vibes: ${JSON.stringify(existing_vibes)}
      
      RULES: Max 2 words per tag. Output pure JSON without markdown. Include a 2-sentence academic synopsis.
      
      {
        "is_series": boolean,
        "series_name": string or null,
        "series_index": number or null,
        "synopsis": string,
        "vibes": string[],
        "motifs": string[],
        "setting_location": string or null,
        "setting_era": string or null
      }`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    const geminiBody = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
      }
    };

    const response = await callGeminiWithRetry(geminiUrl, geminiBody);
    const data = await response.json();
    console.log(`[Enrichment AI] Gemini API Response Status: ${response.status}`);

    let textResult = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textResult) {
      console.warn('[Enrichment AI] Gemini returned no content');
      return new Response(
        JSON.stringify(NULL_RESPONSE),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    textResult = textResult.replace(/```json/g, '').replace(/```/g, '').trim();
    console.log(`[Enrichment AI] Raw Text Result: ${textResult.substring(0, 100)}...`);
    
    const parsed = JSON.parse(textResult);

    // Programmatic 2-word enforcement for taxonomy
    if (Array.isArray(parsed.vibes)) {
      parsed.vibes = parsed.vibes.map(v => v.split(' ').slice(0, 2).join(' '));
    }
    if (Array.isArray(parsed.motifs)) {
      parsed.motifs = parsed.motifs.map(m => m.split(' ').slice(0, 2).join(' '));
    }

    // Ensure backward compatibility for provenance if any UI expects it
    if (!parsed.provenance) {
      parsed.provenance = NULL_RESPONSE.provenance;
    }

    console.log(`[Enrichment AI] Successfully parsed for "${title}"`);

    return new Response(
      JSON.stringify(parsed),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error("[Enrichment AI] Uncaught Error:", error.message);
    return new Response(
      JSON.stringify(NULL_RESPONSE),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
