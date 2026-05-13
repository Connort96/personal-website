import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Exponential Backoff Wrapper ──
// Retries up to MAX_RETRIES on 429/5xx, with exponential delay starting at BASE_DELAY_MS.
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

    // Success — return immediately
    if (response.ok) {
      return response;
    }

    const status = response.status;
    const errorText = await response.text();

    // Only retry on rate-limit (429) or server errors (5xx)
    if (status === 429 || status >= 500) {
      const delay = BASE_DELAY_MS * Math.pow(2, attempt); // 2s, 4s, 8s
      console.warn(`[Saga Scout AI] Attempt ${attempt + 1}/${MAX_RETRIES} failed (${status}). Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      lastError = new Error(`Gemini API ${status}: ${errorText}`);
      continue;
    }

    // Non-retryable error (400, 403, 404, etc.) — fail immediately
    throw new Error(`Gemini API ${status}: ${errorText}`);
  }

  // All retries exhausted
  throw lastError || new Error('All retries exhausted');
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { title, author } = await req.json();

    if (!title || !author) {
      return new Response(
        JSON.stringify({ error: 'Title and author are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      // Graceful failure: return null series data instead of crashing
      console.error('[Saga Scout AI] GEMINI_API_KEY is not set');
      return new Response(
        JSON.stringify({ series_name: null, sequence: null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Saga Scout AI] Analyzing: "${title}" by ${author}`);

    const prompt = `You are a strict library metadata bot. Given the book "${title}" by "${author}", does it belong to a canonical book series? 
If yes, return the canonical name of the series and the integer sequence number of this book in the series. 
Return ONLY valid JSON in this exact format: {"series_name": "The Hunger Games", "sequence": 1}. 
If it does not belong to a series, return {"series_name": null, "sequence": null}. 
Do not include markdown code blocks, backticks, or any other text. Just the raw JSON object.`;

    // Model: gemini-2.5-flash (free-tier friendly)
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    const geminiBody = {
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        temperature: 0.1, // Low temperature for factual metadata
        responseMimeType: "application/json",
      }
    };

    let response: Response;
    try {
      response = await callGeminiWithRetry(geminiUrl, geminiBody);
    } catch (retryErr) {
      // Graceful failure after all retries exhausted — return null, don't crash
      console.error(`[Saga Scout AI] All retries failed: ${retryErr.message}`);
      return new Response(
        JSON.stringify({ series_name: null, sequence: null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    let textResult = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!textResult) {
      // Graceful failure: no content from model
      console.warn('[Saga Scout AI] Gemini returned no content');
      return new Response(
        JSON.stringify({ series_name: null, sequence: null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Clean up potential markdown formatting if the LLM ignored instructions
    textResult = textResult.replace(/```json/g, '').replace(/```/g, '').trim();

    const parsed = JSON.parse(textResult);

    console.log(`[Saga Scout AI] Result:`, parsed);

    return new Response(
      JSON.stringify(parsed),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error("[Saga Scout AI] Uncaught Error:", error.message);
    // Graceful failure: never crash the caller
    return new Response(
      JSON.stringify({ series_name: null, sequence: null }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
