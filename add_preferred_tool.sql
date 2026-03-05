-- Add the missing preferred_tool column to the project_requests table
ALTER TABLE project_requests 
ADD COLUMN IF NOT EXISTS preferred_tool TEXT;

-- Verify the column was added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'project_requests' AND column_name = 'preferred_tool';
