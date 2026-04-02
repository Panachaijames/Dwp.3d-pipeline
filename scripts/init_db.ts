
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import path from 'path';

// Load env vars
config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://engssylqqqpfwuawomwk.supabase.co'; // Fallback from logs/history if needed, checking file first
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing Supabase URL or Key');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const createTableQuery = `
CREATE TABLE IF NOT EXISTS project_requests (
    id TEXT PRIMARY KEY,
    studio_full_name TEXT,
    project_number TEXT,
    request_name TEXT,
    project_name TEXT,
    department TEXT,
    requester TEXT,
    number_of_renderings INTEGER,
    shared_presentation_link TEXT,
    design_review_booking TEXT,
    provided_files TEXT[],
    description TEXT,
    deadline TEXT,
    areas JSONB,
    status TEXT DEFAULT 'Submitted',
    current_phase TEXT DEFAULT 'queued',
    progress INTEGER DEFAULT 0,
    priority TEXT DEFAULT 'Medium',
    submitted_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE project_requests ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any to avoid errors
DROP POLICY IF EXISTS "Enable read for all" ON project_requests;
DROP POLICY IF EXISTS "Enable insert for all" ON project_requests;
DROP POLICY IF EXISTS "Enable update for all" ON project_requests;

-- Create policies
CREATE POLICY "Enable read for all" ON project_requests FOR SELECT USING (true);
CREATE POLICY "Enable insert for all" ON project_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update for all" ON project_requests FOR UPDATE USING (true);
CREATE POLICY "Enable delete for all" ON project_requests FOR DELETE USING (true);
`;

async function run() {
    const { error } = await supabase.rpc('execute_sql', { query: createTableQuery });

}
// Ignoring this script approach for a moment if I can fix MCP.
