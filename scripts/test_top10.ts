import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://engssylqqqpfwuawomwk.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
    console.log("Fetching top 10...");
    const { data, error } = await supabase
        .from('prompt_library')
        .select('*')
        .order('is_top10', { ascending: false, nullsFirst: false })
        .order('usage_count', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(10);

    if (error) {
        console.error("Error:", error);
    } else {
        console.log("Data length:", data.length);
        console.log(data);
    }
}
run();
