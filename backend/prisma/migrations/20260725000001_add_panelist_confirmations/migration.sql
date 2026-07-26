-- Add panelist confirmation tracking table
CREATE TABLE IF NOT EXISTS panelist_confirmations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    interview_stage_id UUID NOT NULL REFERENCES interview_stages(id) ON DELETE CASCADE,
    panelist_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'declined')) DEFAULT 'pending',
    token_hash TEXT UNIQUE,
    confirmation_sent_at TIMESTAMP WITH TIME ZONE,
    responded_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE(interview_stage_id, panelist_id)
);

CREATE INDEX idx_panelist_confirmations_interview ON panelist_confirmations(interview_stage_id);
CREATE INDEX idx_panelist_confirmations_panelist ON panelist_confirmations(panelist_id, status);
CREATE INDEX idx_panelist_confirmations_token ON panelist_confirmations(token_hash) WHERE token_hash IS NOT NULL;
