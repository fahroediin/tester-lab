-- Email configuration (single row, id=1), same pattern as app_config.
CREATE TABLE IF NOT EXISTS email_config (
  id INT PRIMARY KEY DEFAULT 1,
  smtp_host TEXT NOT NULL DEFAULT '',
  smtp_port INT NOT NULL DEFAULT 587,
  smtp_user TEXT NOT NULL DEFAULT '',
  smtp_pass_enc TEXT,
  smtp_from_name TEXT NOT NULL DEFAULT 'Tester Lab',
  approve_subject TEXT NOT NULL DEFAULT 'Your Tester Lab Account Has Been Created',
  approve_body TEXT NOT NULL DEFAULT 'Hello {{name}},

Your Tester Lab account has been created with the following details:

Email: {{email}}
Password: {{password}}

You can log in at: {{url}}

Please change your password after your first login.

Regards,
Tester Lab Admin',
  reject_subject TEXT NOT NULL DEFAULT 'Update on Your Tester Lab Access Request',
  reject_body TEXT NOT NULL DEFAULT 'Hello {{name}},

We are sorry, but your access request to Tester Lab could not be approved at this time.

{{notes}}

If you believe this is a mistake, please contact the team.

Regards,
Tester Lab Admin',
  reset_subject TEXT NOT NULL DEFAULT 'Reset Your Tester Lab Password',
  reset_body TEXT NOT NULL DEFAULT 'Hello {{name}},

We received a request to reset your Tester Lab password.

Click the link below to set a new password (valid for 60 minutes):
{{url}}

If you did not request this, you can safely ignore this email.

Regards,
Tester Lab Admin',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT email_config_singleton CHECK (id = 1)
);

ALTER TABLE email_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS email_config_service_role ON email_config;
CREATE POLICY email_config_service_role ON email_config FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Password reset token fields on users (hash only; the raw token lives in the email link).
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_used BOOLEAN NOT NULL DEFAULT false;
