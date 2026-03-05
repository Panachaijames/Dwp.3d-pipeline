import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const getSupabase = () => createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export async function GET() {
    const supabase = getSupabase();
    // Retrieve the top 10 most used prompts
    const { data, error } = await supabase
        .from('prompt_library')
        .select('*')
        .eq('is_top10', true)
        .order('usage_count', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(10);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ entries: data });
}
