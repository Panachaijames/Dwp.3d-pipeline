import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const getSupabase = () => createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');

    if (!projectId) {
        return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }

    const supabase = getSupabase();
    const { data, error } = await supabase
        .from('project_prompts')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ entries: data });
}

export async function POST(request: NextRequest) {
    const supabase = getSupabase();
    const body = await request.json();
    const { project_id, name, prompt, tool, phase, mode, llm, notes, designer, project_name, saved_by, is_snippet } = body;

    if (!project_id) return NextResponse.json({ error: 'project_id is required' }, { status: 400 });
    if (!prompt) return NextResponse.json({ error: 'prompt is required' }, { status: 400 });

    const { data, error } = await supabase
        .from('project_prompts')
        .insert([{ project_id, name, prompt, tool, phase, mode, llm, notes, designer, project_name, saved_by, is_snippet }])
        .select()
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ entry: data });
}

export async function DELETE(request: NextRequest) {
    const supabase = getSupabase();
    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const { error } = await supabase.from('project_prompts').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
}
