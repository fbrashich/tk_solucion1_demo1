ALTER TABLE devices ADD COLUMN IF NOT EXISTS security_pin VARCHAR(100);
ALTER TABLE device_states ADD COLUMN IF NOT EXISTS immobilizer_status VARCHAR(20) DEFAULT 'NORMAL';
ALTER TABLE device_states ADD COLUMN IF NOT EXISTS pending_command_id INTEGER;
ALTER TABLE device_states ADD COLUMN IF NOT EXISTS last_command_at TIMESTAMP WITH TIME ZONE;

CREATE TABLE IF NOT EXISTS command_audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    device_id VARCHAR NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
    command_type VARCHAR(50) NOT NULL,
    action VARCHAR(20) NOT NULL,
    status VARCHAR(30) DEFAULT 'EXECUTED' NOT NULL,
    speed_at_request_kmh FLOAT,
    speed_at_execution_kmh FLOAT,
    ip_address VARCHAR(50),
    traccar_command_id INTEGER,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    executed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_cmd_audit_device ON command_audit_logs(device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cmd_audit_status ON command_audit_logs(device_id, status);
