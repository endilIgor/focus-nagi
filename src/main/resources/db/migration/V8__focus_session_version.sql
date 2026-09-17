-- Optimistic locking guard against lost updates on concurrent pause/resume/finish/cancel.
ALTER TABLE focus_session ADD COLUMN version INT NOT NULL DEFAULT 0;
