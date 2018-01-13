-- users table
CREATE TABLE users (
  id bigserial PRIMARY KEY,
  username text NOT NULL,
  password text NOT NULL,
  email text NULL,
  email_verified boolean NOT NULL DEFAULT false,
  mfa_key text NULL,
  affiliate_id bigint NULL,
  app_id int NOT NULL DEFAULT 0,
  date_joined timestamp with time zone NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX unique_username ON users USING btree (lower(username) text_pattern_ops);
CREATE INDEX users_lower_email_idx ON users USING btree(lower(email));

-- sessions table
CREATE TABLE sessions (
  id uuid PRIMARY KEY,
  user_id bigint REFERENCES users(id),
  logged_out_at  timestamp with time zone  NULL,
  expired_at timestamp with time zone  NOT NULL DEFAULT NOW() + INTERVAL '15 minutes',
  created_at timestamp with time zone  NOT NULL DEFAULT NOW()
);

-- login_attempts table
CREATE TABLE login_attempts (
  id uuid PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users(id),
  is_success boolean NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT NOW()
);

CREATE INDEX login_attempts_user_id_idx ON login_attempts USING btree(user_id);

-- active_sessions view
CREATE VIEW active_sessions AS
  SELECT *
  FROM sessions
  WHERE expired_at >= NOW()
  AND logged_out_at IS NULL;

-- reset_tokens table
CREATE TABLE reset_tokens (
  id   uuid NOT NULL PRIMARY KEY,
  user_id bigint  NOT NULL  REFERENCES users(id),
  used    boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL  DEFAULT NOW(),
  expired_at timestamp with time zone NOT NULL  DEFAULT NOW() + INTERVAL '15 minutes'
);

CREATE INDEX reset_tokens_user_id_idx ON reset_tokens(user_id, expired_at);

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO bk;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO bk;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO bk;
