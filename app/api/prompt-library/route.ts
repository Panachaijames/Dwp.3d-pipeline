import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const getSupabase = () => createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export async function GET() {
    const supabase = getSupabase();
    const { data, error } = await supabase
        .from('prompt_library')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ entries: data });
}

export async function POST(request: NextRequest) {
    const supabase = getSupabase();
    const body = await request.json();
    const { prompt, tool, phase, mode, llm, notes, designer, project_name, saved_by, name, is_snippet } = body;

    if (!prompt) return NextResponse.json({ error: 'prompt is required' }, { status: 400 });

    const { data, error } = await supabase
        .from('prompt_library')
        .insert([{ prompt, tool, phase, mode, llm, notes, designer, project_name, saved_by, name, is_snippet }])
        .select()
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ entry: data });
}

export async function DELETE(request: NextRequest) {
    const supabase = getSupabase();
    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const { error } = await supabase.from('prompt_library').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
}

export async function PATCH(request: NextRequest) {
    const supabase = getSupabase();
    const body = await request.json();
    const { id, is_top10, name } = body;

    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const updatePayload: any = {};
    if (is_top10 !== undefined) updatePayload.is_top10 = is_top10;
    if (name !== undefined) updatePayload.name = name;

    if (Object.keys(updatePayload).length === 0) {
        return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { data, error } = await supabase
        .from('prompt_library')
        .update(updatePayload)
        .eq('id', id)
        .select()
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ entry: data });
}
