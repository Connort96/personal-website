import { supabase } from './src/lib/supabase.js';

async function checkTable() {
  const { data, error } = await supabase.from('reading_progress').select('*').limit(1);
  if (error) {
    console.log('reading_progress table does not exist or error:', error.message);
  } else {
    console.log('reading_progress table exists:', data);
  }
}

checkTable();
