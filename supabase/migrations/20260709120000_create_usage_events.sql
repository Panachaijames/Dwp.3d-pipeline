-- Usage / activity log for the 3D Pipeline site.
-- Captures "who came in" (login/logout), "what functions they opened"
-- (page_view of a tab/tool) and "what they ran" (api_call to /api/*).
-- Append-only: no update/delete policies are granted.
CREATE TABLE IF NOT EXISTS public.threed_usage_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email TEXT,                       -- actor email (null before login)
    name TEXT,                        -- actor display name
    role TEXT,                        -- actor role at the time of the event
    event_type TEXT NOT NULL,         -- 'login' | 'logout' | 'page_view' | 'api_call'
    feature TEXT,                     -- e.g. 'objectExtractor', 'promptgen', 'api:gemini'
    detail JSONB,                     -- freeform context: { provider, method, status, ms, ... }
    path TEXT,                        -- window.location.pathname at event time
    user_agent TEXT,                  -- truncated navigator.userAgent
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_threed_usage_events_created_at ON public.threed_usage_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_threed_usage_events_email ON public.threed_usage_events (email);
CREATE INDEX IF NOT EXISTS idx_threed_usage_events_type ON public.threed_usage_events (event_type);
CREATE INDEX IF NOT EXISTS idx_threed_usage_events_feature ON public.threed_usage_events (feature);

-- Enable RLS. Matches the existing app pattern (anon key + permissive policies);
-- read access is gated to the two admin emails in the UI, not at the DB layer.
ALTER TABLE public.threed_usage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable insert for all users" ON public.threed_usage_events FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable read access for all users" ON public.threed_usage_events FOR SELECT USING (true);

-- Enable Supabase Realtime for the usage feed so the dashboard can live-update.
-- Idempotent: only adds the table if the publication exists and it isn't already a member.
-- (The dashboard also falls back to a 30s poll, so this is best-effort.)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
       AND NOT EXISTS (
           SELECT 1 FROM pg_publication_tables
           WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'threed_usage_events'
       )
    THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.threed_usage_events;
    END IF;
END $$;
