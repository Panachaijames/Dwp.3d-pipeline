import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://engssylqqqpfwuawomwk.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const query = `
ALTER TABLE viz_logs ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE viz_logs ADD COLUMN IF NOT EXISTS publish_target TEXT DEFAULT 'none';
`;

async function run() {
    console.log("Adding name and publish_target to viz_logs...");
    // execute_sql is a custom RPC on their backend, seen in init_db.ts
    const { error } = await supabase.rpc('execute_sql', { query });
    if (error) {
        console.error("Error updating schema:", error);
    } else {
        console.log("Schema updated successfully.");
    }
}
run();
