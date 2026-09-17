CREATE TABLE goal (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(150) NOT NULL,
    description TEXT,
    type VARCHAR(30) NOT NULL CHECK (type IN ('FOCUS_MINUTES', 'FOCUS_SESSIONS', 'TASKS_COMPLETED')),
    target_value INT NOT NULL CHECK (target_value > 0),
    period VARCHAR(20) NOT NULL CHECK (period IN ('DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM')),
    start_date DATE NOT NULL,
    end_date DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'COMPLETED', 'ARCHIVED')),
    project_id BIGINT REFERENCES project (id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT goal_dates_check CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE INDEX idx_goal_status ON goal (status);
CREATE INDEX idx_goal_project ON goal (project_id);
