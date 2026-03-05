import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://engssylqqqpfwuawomwk.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const query = `
ALTER TABLE prompt_library ADD COLUMN IF NOT EXISTS is_top10 BOOLEAN DEFAULT false;
`;

async function run() {
    console.log("Adding is_top10 flag to prompt_library...");
    const { error } = await supabase.rpc('execute_sql', { query });
    if (error) {
        console.error("Error updating schema:", error);
    } else {
        console.log("Schema updated successfully. is_top10 added.");
    }
}
run();
