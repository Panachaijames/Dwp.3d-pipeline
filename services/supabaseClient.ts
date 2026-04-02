import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const projectCatalogUrl = process.env.NEXT_PUBLIC_SUPABASE_PROJECT_ALL_URL
    || process.env.NEXT_PUBLIC_PROJECT_ALL_SUPABASE_URL
    || supabaseUrl;
const projectCatalogAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PROJECT_ALL_ANON
    || process.env.NEXT_PUBLIC_PROJECT_ALL_SUPABASE_ANON_KEY
    || supabaseAnonKey;
const projectCatalogSchema = process.env.NEXT_PUBLIC_SUPABASE_PROJECT_ALL_SCHEMA
    || process.env.NEXT_PUBLIC_PROJECT_ALL_SUPABASE_SCHEMA
    || 'public';

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('Missing Supabase URL or Anon Key in environment variables');
}

if (
    (
        (process.env.NEXT_PUBLIC_SUPABASE_PROJECT_ALL_URL || process.env.NEXT_PUBLIC_PROJECT_ALL_SUPABASE_URL)
        && !(process.env.NEXT_PUBLIC_SUPABASE_PROJECT_ALL_ANON || process.env.NEXT_PUBLIC_PROJECT_ALL_SUPABASE_ANON_KEY)
    )
    || (
        !(process.env.NEXT_PUBLIC_SUPABASE_PROJECT_ALL_URL || process.env.NEXT_PUBLIC_PROJECT_ALL_SUPABASE_URL)
        && (process.env.NEXT_PUBLIC_SUPABASE_PROJECT_ALL_ANON || process.env.NEXT_PUBLIC_PROJECT_ALL_SUPABASE_ANON_KEY)
    )
) {
    console.warn('Project catalog Supabase URL and anon key must both be set to use a dedicated connection');
}

// Safe initialization for build time
const url = supabaseUrl || 'https://placeholder.supabase.co';
const key = supabaseAnonKey || 'placeholder';
const catalogUrl = projectCatalogUrl || url;
const catalogKey = projectCatalogAnonKey || key;

export const supabase = createClient(url, key);
export const projectCatalogSupabase = createClient(catalogUrl, catalogKey, {
    db: { schema: projectCatalogSchema }
});
export const hasDedicatedProjectCatalogClient = Boolean(
    (process.env.NEXT_PUBLIC_SUPABASE_PROJECT_ALL_URL || process.env.NEXT_PUBLIC_PROJECT_ALL_SUPABASE_URL)
    && (process.env.NEXT_PUBLIC_SUPABASE_PROJECT_ALL_ANON || process.env.NEXT_PUBLIC_PROJECT_ALL_SUPABASE_ANON_KEY)
);
export const projectCatalogSupabaseSchema = projectCatalogSchema;
