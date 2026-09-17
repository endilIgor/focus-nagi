CREATE TABLE task (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT REFERENCES project (id),
    title VARCHAR(200) NOT NULL,
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'TODO' CHECK (status IN ('TODO', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
    priority VARCHAR(10) NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH')),
    estimated_minutes INT CHECK (estimated_minutes IS NULL OR estimated_minutes BETWEEN 1 AND 10080),
    due_date DATE,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_task_status ON task (status);
CREATE INDEX idx_task_project ON task (project_id);
CREATE INDEX idx_task_priority ON task (priority);
CREATE INDEX idx_task_due_date ON task (due_date);

CREATE TABLE subtask (
    id BIGSERIAL PRIMARY KEY,
    task_id BIGINT NOT NULL REFERENCES task (id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_subtask_task ON subtask (task_id);
