import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
      throw new Error('GEMINI_API_KEY is not set in environment variables');
    }

    console.log(`[Saga Scout AI] Analyzing: "${title}" by ${author}`);

    const prompt = `You are a strict library metadata bot. Given the book "${title}" by "${author}", does it belong to a canonical book series? 
If yes, return the canonical name of the series and the integer sequence number of this book in the series. 
Return ONLY valid JSON in this exact format: {"series_name": "The Hunger Games", "sequence": 1}. 
If it does not belong to a series, return {"series_name": null, "sequence": null}. 
Do not include markdown code blocks, backticks, or any other text. Just the raw JSON object.`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature: 0.1, // Low temperature for factual metadata
          responseMimeType: "application/json",
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error("[Saga Scout AI] Gemini API Error:", errorData);
      throw new Error(`Gemini API Error: ${response.status}`);
    }

    const data = await response.json();
    let textResult = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!textResult) {
      throw new Error('No content returned from Gemini');
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
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
