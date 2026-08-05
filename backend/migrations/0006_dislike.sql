-- Dislike (downvote): mirrors `likes`. Subtracted in the popularity score.
ALTER TABLE posts ADD COLUMN dislikes_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS dislikes (
  user_id   TEXT NOT NULL REFERENCES users(id),
  post_id   TEXT NOT NULL REFERENCES posts(id),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, post_id)
);

-- All content is auto-approved on create now; promote any legacy pending rows.
UPDATE posts SET status = 'approved' WHERE status = 'pending';
