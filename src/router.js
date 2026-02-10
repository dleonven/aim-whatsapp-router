const db = require("./db");
const whatsapp = require("./whatsapp");

/**
 * Get the next agent using round robin
 * Picks the agent who was assigned longest ago (or never)
 * @returns {object|null} - Agent object or null if no active agents
 */
function getNextAgent() {
	const agents = db.getActiveAgents();

	if (agents.length === 0) {
		console.warn("⚠️ No active agents available");
		return null;
	}

	// First agent in the list has the oldest last_assigned_at (or null)
	return agents[0];
}

/**
 * Assign a lead to an agent.
 * Returning leads (same phone already has an assignment) go to the same agent.
 * New leads are assigned via round robin.
 * @param {string} leadPhone - Lead's phone number
 * @param {string} leadName - Lead's name (optional)
 * @param {string} messageText - Original message from the lead
 * @returns {object} - Assignment result with agent info
 */
function assignLead(leadPhone, leadName, messageText) {
	// Normalize phone number (remove spaces, dashes, etc.)
	const normalizedPhone = leadPhone.replace(/[\s\-\(\)]/g, "");

	let agent = null;
	const existingAssignment = db.getAssignmentByLeadPhone(normalizedPhone);

	if (existingAssignment) {
		// Returning lead: assign to the same agent as before
		agent = db.getAgentById(existingAssignment.agent_id);
		if (!agent) {
			// Previous agent was removed; treat as new lead and use round robin
			agent = getNextAgent();
		}
	}

	if (!agent) {
		// New lead: get next agent via round robin
		agent = getNextAgent();
	}

	if (!agent) {
		return {
			success: false,
			error: "No active agents available",
		};
	}

	const isReturningLead = !!existingAssignment;

	// Create the assignment (one row per message for history)
	const result = db.createAssignment(
		normalizedPhone,
		leadName,
		agent.id,
		messageText
	);

	// Only update round-robin order for new leads
	if (!isReturningLead) {
		db.updateAgentLastAssigned(agent.id);
	}

	console.log(
		`📋 ${isReturningLead ? "Re-assigned" : "Assigned"} lead ${normalizedPhone} to agent ${agent.name} (${agent.wa_number})`
	);

	return {
		success: true,
		assignment: {
			id: result.lastInsertRowid,
			leadPhone: normalizedPhone,
			leadName,
			messageText,
		},
		agent: {
			id: agent.id,
			name: agent.name,
			waNumber: agent.wa_number,
			phoneNumberId: agent.phone_number_id,
		},
	};
}

/**
 * Format phone number for display (e.g., "56912345678" -> "+56 9 1234 5678")
 */
function formatPhoneForDisplay(phone) {
	// Remove any non-digits
	const digits = phone.replace(/\D/g, "");

	// Chilean format: +56 9 XXXX XXXX
	if (digits.startsWith("56") && digits.length === 11) {
		return `+56 ${digits.slice(2, 3)} ${digits.slice(3, 7)} ${digits.slice(
			7
		)}`;
	}

	// Default: just add + prefix
	return `+${digits}`;
}

/**
 * Handle incoming webhook from GHL/Kirk
 * Assigns the lead and sends notification to the agent only
 * (Client response is handled by GHL automations)
 * @param {object} webhookData - Webhook payload
 * @param {object} config - Configuration with tokens
 * @returns {Promise<object>} - Result of the operation
 */
async function handleIncomingLead(webhookData, config) {
	const { leadPhone, leadName, messageText, source } = webhookData;

	console.log(`\n📥 Incoming lead from ${source || "unknown"}:`);
	console.log(`   Phone: ${leadPhone}`);
	console.log(`   Name: ${leadName || "N/A"}`);
	console.log(`   Message: ${messageText || "N/A"}`);

	// Step 1: Assign the lead to an agent
	const assignment = assignLead(leadPhone, leadName, messageText);

	if (!assignment.success) {
		return assignment;
	}

	const phoneNumberId =
		assignment.agent.phoneNumberId || config.phoneNumberId;
	const leadPhoneFormatted = formatPhoneForDisplay(leadPhone);

	// Step 2: Send notification to AGENT via approved template (works outside 24h window)
	// If you get "Parameter name is missing or empty", create a NEW template in Meta with same body
	// but set "Type of variable" to "Text" (not "Name") for all 3 variables, then set WHATSAPP_TEMPLATE_NAME to that template name.
	const templateName = process.env.WHATSAPP_TEMPLATE_NAME || "nuevo_lead";
	const languageCode = process.env.WHATSAPP_TEMPLATE_LANGUAGE || "es_CL"; // Spanish (Chile) – must match template in Meta
	const paramName = String(leadName || "No proporcionado").trim() || "—";
	const paramPhone = (leadPhoneFormatted || leadPhone || "")
		.toString()
		.trim();
	const paramPhoneNumber = paramPhone
		? "+" + paramPhone.replace(/\D/g, "")
		: "—"; // e.g. +56996096419
	const paramMessage = String(messageText || "Sin mensaje").trim() || "—";
	// Template has 3 Number-type variables: send 1st and 3rd as text, 2nd (phone) with number key
	const components = [
		{
			type: "body",
			parameters: [
				{ type: "text", text: paramName },
				{ type: "text", text: paramPhoneNumber },
				{ type: "text", text: paramMessage },
			],
		},
	];

	const toNumber = (
		String(assignment.agent.waNumber || "").replace(/\D/g, "") ||
		String(assignment.agent.waNumber || "")
	).trim();
	if (!toNumber) {
		console.error("❌ No agent wa_number for template send");
		return {
			success: false,
			assignment: assignment.assignment,
			agent: assignment.agent,
			agentNotificationSent: false,
			agentNotificationError: "No agent wa_number",
		};
	}
	const agentResult = await whatsapp.sendTemplateMessage(
		toNumber,
		templateName,
		languageCode,
		components,
		phoneNumberId,
		config.accessToken
	);

	// Record whether the agent was notified (so you can see it in GET /assignments)
	const errMsg =
		agentResult.error == null
			? null
			: typeof agentResult.error === "string"
			? agentResult.error
			: JSON.stringify(agentResult.error);
	if (assignment.assignment.id != null) {
		db.updateAssignmentNotification(
			assignment.assignment.id,
			agentResult.success,
			errMsg
		);
	}

	return {
		success: agentResult.success,
		assignment: assignment.assignment,
		agent: assignment.agent,
		agentNotificationSent: agentResult.success,
		agentNotificationError: agentResult.error || null,
	};
}

module.exports = {
	getNextAgent,
	assignLead,
	handleIncomingLead,
};
