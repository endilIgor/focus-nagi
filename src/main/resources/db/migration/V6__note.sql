CREATE TABLE note (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(150) NOT NULL,
    content TEXT,
    pinned BOOLEAN NOT NULL DEFAULT FALSE,
    project_id BIGINT REFERENCES project (id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_note_pinned ON note (pinned);
CREATE INDEX idx_note_project ON note (project_id);
