import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://engssylqqqpfwuawomwk.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
    let res = await supabase.from('prompt_library').select('id, is_top10');
    console.log("ALL PROMPTS in DB:", res.data);

    let res2 = await supabase.from('prompt_library').select('id, is_top10').eq('is_top10', true);
    console.log("PINNED PROMPTS in DB:", res2.data);
}
run();
