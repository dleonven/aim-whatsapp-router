const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(path.join(__dirname, "..", "router.db"));

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS agents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    wa_number TEXT NOT NULL UNIQUE,
    phone_number_id TEXT,
    active INTEGER DEFAULT 1,
    last_assigned_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_phone TEXT NOT NULL,
    lead_name TEXT,
    agent_id INTEGER NOT NULL,
    message_text TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (agent_id) REFERENCES agents(id)
  );

  CREATE INDEX IF NOT EXISTS idx_assignments_lead_phone ON assignments(lead_phone);
  CREATE INDEX IF NOT EXISTS idx_agents_active ON agents(active);
`);

// Migration: add notification tracking columns if missing (e.g. existing DBs)
try {
	db.exec("ALTER TABLE assignments ADD COLUMN notification_sent INTEGER");
} catch (_) {}
try {
	db.exec("ALTER TABLE assignments ADD COLUMN notification_error TEXT");
} catch (_) {}

// Agent functions
function getActiveAgents() {
	return db
		.prepare(
			"SELECT * FROM agents WHERE active = 1 ORDER BY last_assigned_at ASC NULLS FIRST"
		)
		.all();
}

function getAgentById(id) {
	return db.prepare("SELECT * FROM agents WHERE id = ?").get(id);
}

function addAgent(name, waNumber, phoneNumberId = null) {
	const stmt = db.prepare(
		"INSERT INTO agents (name, wa_number, phone_number_id) VALUES (?, ?, ?)"
	);
	return stmt.run(name, waNumber, phoneNumberId);
}

function updateAgentLastAssigned(agentId) {
	const stmt = db.prepare(
		"UPDATE agents SET last_assigned_at = CURRENT_TIMESTAMP WHERE id = ?"
	);
	return stmt.run(agentId);
}

function setAgentActive(agentId, active) {
	const stmt = db.prepare("UPDATE agents SET active = ? WHERE id = ?");
	return stmt.run(active ? 1 : 0, agentId);
}

// Assignment functions
function getAssignmentByLeadPhone(leadPhone) {
	return db
		.prepare(
			"SELECT * FROM assignments WHERE lead_phone = ? ORDER BY created_at DESC LIMIT 1"
		)
		.get(leadPhone);
}

function createAssignment(leadPhone, leadName, agentId, messageText) {
	const stmt = db.prepare(
		"INSERT INTO assignments (lead_phone, lead_name, agent_id, message_text) VALUES (?, ?, ?, ?)"
	);
	return stmt.run(leadPhone, leadName, agentId, messageText);
}

function updateAssignmentNotification(assignmentId, sent, error) {
	const stmt = db.prepare(
		"UPDATE assignments SET notification_sent = ?, notification_error = ? WHERE id = ?"
	);
	return stmt.run(sent ? 1 : 0, error || null, assignmentId);
}

function getAssignmentsWithAgent() {
	return db
		.prepare(
			`
    SELECT a.*, ag.name as agent_name, ag.wa_number as agent_wa_number
    FROM assignments a
    JOIN agents ag ON a.agent_id = ag.id
    ORDER BY a.created_at DESC
    LIMIT 100
  `
		)
		.all();
}

module.exports = {
	db,
	getActiveAgents,
	getAgentById,
	addAgent,
	updateAgentLastAssigned,
	setAgentActive,
	getAssignmentByLeadPhone,
	createAssignment,
	updateAssignmentNotification,
	getAssignmentsWithAgent,
};
