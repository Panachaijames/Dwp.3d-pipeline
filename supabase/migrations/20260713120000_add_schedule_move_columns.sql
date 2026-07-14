-- Allow rescheduling jobs on the 3D Schedule without touching the submission timestamp,
-- and remember the Google Calendar event so date changes can be synced to it.
alter table public.project_requests
    add column if not exists start_date timestamptz,
    add column if not exists gcal_event_id text;
