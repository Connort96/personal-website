import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function test() {
  const themes = ["Coming age", "Power struggle"];
  const vibes = ["Political intrigue", "Survival narrative"];
  const currentBookId = 701; // A Clash of Kings

  const themeArr = themes.map(t => `"${t}"`).join(',');
  const vibeArr = vibes.map(v => `"${v}"`).join(',');
  
  const orConditions = [];
  if (themes.length) orConditions.push(`motifs.ov.{${themeArr}}`);
  if (vibes.length) orConditions.push(`vibes.ov.{${vibeArr}}`);
  
  console.log('OR Conditions:', orConditions.join(','));
  
  const { data, error } = await supabase
    .from('works')
    .select('id, title')
    .or(orConditions.join(','))
    .neq('id', currentBookId)
    .limit(4);

  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Results:', data);
  }
}

test();
