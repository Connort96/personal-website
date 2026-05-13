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

    const taxonomyInstruction = `
      I have provided arrays of existing_vibes and existing_motifs currently used in the database. 
      EXISTING VIBES: ${JSON.stringify(existing_vibes)}
      EXISTING MOTIFS: ${JSON.stringify(existing_motifs)}
      You MUST prioritize selecting tags from these existing lists to maintain a standardized taxonomy. 
      You may generate a maximum of ONE new vibe and ONE new motif only if the existing lists are insufficient. 
      Keep tags concise (1-3 words max).
    `;

    const provenanceInstruction = provenance_string
      ? `The user has provided these provenance notes about their physical copy: "${provenance_string}". Parse this to extract condition, defects, acquisition source, and acquisition year.`
      : `No provenance notes were provided. Return null for all provenance fields.`;

    const prompt = `You are an expert literary archivist and metadata specialist. Analyze the book "${title}" by "${author}" and return a comprehensive metadata profile.

${taxonomyInstruction}

${provenanceInstruction}

Generate a 2-sentence, objective, spoiler-free literary summary (synopsis) written in a formal, academic archival tone. Do NOT include marketing copy.

Return ONLY a valid JSON object matching this EXACT structure. No markdown, no backticks, no explanation:
{
  "is_series": boolean,
  "series_name": string or null,
  "series_index": number or null,
  "synopsis": "Academic 2-sentence summary",
  "vibes": ["selected from existing list where possible"],
  "motifs": ["selected from existing list where possible"],
  "setting_location": "Primary geographic or fictional location, e.g. 'Arrakis' or 'Victorian London'",
  "setting_era": "Primary time period, e.g. 'Far future' or '1920s'",
  "provenance": {
    "condition": "Mint, Good, Fair, or Poor" or null,
    "defects": ["specific defects like 'cracked spine', 'foxed pages'"] or [],
    "acquisition_source": "extracted store/location name" or null,
    "acquisition_year": number or null
  }
}`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    const geminiBody = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
      }
    };

    let response: Response;
    try {
      response = await callGeminiWithRetry(geminiUrl, geminiBody);
    } catch (retryErr) {
      console.error(`[Enrichment AI] All retries failed: ${retryErr.message}`);
      return new Response(
        JSON.stringify(NULL_RESPONSE),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    let textResult = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textResult) {
      console.warn('[Enrichment AI] Gemini returned no content');
      return new Response(
        JSON.stringify(NULL_RESPONSE),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    textResult = textResult.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(textResult);

    // Ensure the provenance object exists even if the LLM omitted it
    if (!parsed.provenance) {
      parsed.provenance = NULL_RESPONSE.provenance;
    }

    console.log(`[Enrichment AI] Result for "${title}":`, JSON.stringify(parsed).substring(0, 200));

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
