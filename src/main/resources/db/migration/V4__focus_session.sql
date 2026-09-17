CREATE TABLE focus_session (
    id BIGSERIAL PRIMARY KEY,
    task_id BIGINT REFERENCES task (id),
    project_id BIGINT REFERENCES project (id),
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ,
    planned_focus_minutes INT NOT NULL CHECK (planned_focus_minutes BETWEEN 1 AND 1440),
    planned_break_minutes INT CHECK (planned_break_minutes IS NULL OR planned_break_minutes BETWEEN 0 AND 1440),
    paused_seconds_accum BIGINT NOT NULL DEFAULT 0 CHECK (paused_seconds_accum >= 0),
    last_paused_at TIMESTAMPTZ,
    actual_focus_seconds BIGINT CHECK (actual_focus_seconds IS NULL OR actual_focus_seconds >= 0),
    status VARCHAR(20) NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING', 'PAUSED', 'COMPLETED', 'CANCELLED')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT focus_session_pause_state_check CHECK (status <> 'PAUSED' OR last_paused_at IS NOT NULL)
);

-- Single-user app: at most one RUNNING/PAUSED session, enforced by the database.
CREATE UNIQUE INDEX ux_focus_session_single_active ON focus_session ((TRUE)) WHERE status IN ('RUNNING', 'PAUSED');

CREATE INDEX idx_focus_session_status ON focus_session (status);
CREATE INDEX idx_focus_session_started_at ON focus_session (started_at);
CREATE INDEX idx_focus_session_task ON focus_session (task_id);
CREATE INDEX idx_focus_session_project ON focus_session (project_id);
