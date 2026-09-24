-- Accepted data is quarantined, not approved training data. No request metadata.
CREATE TABLE unverified_games (
  game_id TEXT PRIMARY KEY NOT NULL,
  payload_hash TEXT NOT NULL,
  record_hash TEXT NOT NULL UNIQUE,
  payload TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX unverified_games_expiry ON unverified_games(expires_at);
