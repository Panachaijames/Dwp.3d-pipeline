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

    const { data, error } = await supabase
        .from('prompt_library')
        .update({ is_top10: true })
        .eq('id', firstId)
        .select();

    console.log("ERROR:", error);
    console.log("DATA:", data);
}
run();
