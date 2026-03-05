import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://engssylqqqpfwuawomwk.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
    let res = await supabase.from('prompt_library').select('id, is_top10').limit(2);
    let firstId = res.data![0].id;
    console.log("Updating ID:", firstId);

    // Call API patch
    const patchRes = await fetch('http://localhost:3000/api/prompt-library', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: firstId, is_top10: true })
    });
    console.log("PATCH status:", patchRes.status);
    console.log("PATCH body:", await patchRes.text());

    let resAfter = await supabase.from('prompt_library').select('id, is_top10');
    console.log("ALL PROMPTS in DB:", resAfter.data);
}
run();
