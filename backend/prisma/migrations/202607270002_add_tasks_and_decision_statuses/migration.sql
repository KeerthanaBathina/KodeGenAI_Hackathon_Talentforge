-- Add new application statuses for decision outcomes
ALTER TYPE "ApplicationStatus" ADD VALUE IF NOT EXISTS 'pending_approval';
ALTER TYPE "ApplicationStatus" ADD VALUE IF NOT EXISTS 'on_hold';

-- Create tasks table for reminders and follow-ups
CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assigned_to UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    title TEXT NOT NULL,
    description TEXT,
    due_date TIMESTAMP WITH TIME ZONE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
    priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    entity_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    metadata JSONB DEFAULT '{}',
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for tasks table
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to_status ON tasks(assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date) WHERE status IN ('pending', 'in_progress');
CREATE INDEX IF NOT EXISTS idx_tasks_entity ON tasks(entity_type, entity_id);

-- Add comment for tasks table
COMMENT ON TABLE tasks IS 'Task tracking for reminders and follow-up actions';
COMMENT ON COLUMN tasks.entity_type IS 'Type of entity this task relates to (e.g., application, requisition)';
COMMENT ON COLUMN tasks.entity_id IS 'UUID of the related entity';
COMMENT ON COLUMN tasks.metadata IS 'Additional context data stored as JSON';
