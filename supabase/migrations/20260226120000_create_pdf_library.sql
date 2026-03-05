-- Create the pdf_sections table
CREATE TABLE IF NOT EXISTS public.pdf_sections (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    parent_id UUID REFERENCES public.pdf_sections(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create the pdf_documents table (storing extracted text instead of files)
CREATE TABLE IF NOT EXISTS public.pdf_documents (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    section_id UUID NOT NULL REFERENCES public.pdf_sections(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    size BIGINT NOT NULL,
    type TEXT NOT NULL,
    text_content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.pdf_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdf_documents ENABLE ROW LEVEL SECURITY;

-- Create policies (assuming public access for now, assuming standard setup)
-- In a real production app with auth, these would check auth.uid()
CREATE POLICY "Enable read access for all users" ON public.pdf_sections FOR SELECT USING (true);
CREATE POLICY "Enable insert for all users" ON public.pdf_sections FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update for all users" ON public.pdf_sections FOR UPDATE USING (true);
CREATE POLICY "Enable delete for all users" ON public.pdf_sections FOR DELETE USING (true);

CREATE POLICY "Enable read access for all users" ON public.pdf_documents FOR SELECT USING (true);
CREATE POLICY "Enable insert for all users" ON public.pdf_documents FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update for all users" ON public.pdf_documents FOR UPDATE USING (true);
CREATE POLICY "Enable delete for all users" ON public.pdf_documents FOR DELETE USING (true);
