const db = require('./db');
const whatsapp = require('./whatsapp');

/**
 * Get the next agent using round robin
 * Picks the agent who was assigned longest ago (or never)
 * @returns {object|null} - Agent object or null if no active agents
 */
function getNextAgent() {
  const agents = db.getActiveAgents();
  
  if (agents.length === 0) {
    console.warn('⚠️ No active agents available');
    return null;
  }
  
  // First agent in the list has the oldest last_assigned_at (or null)
  return agents[0];
}

/**
 * Assign a lead to an agent
 * @param {string} leadPhone - Lead's phone number
 * @param {string} leadName - Lead's name (optional)
 * @param {string} messageText - Original message from the lead
 * @returns {object} - Assignment result with agent info
 */
function assignLead(leadPhone, leadName, messageText) {
  // Normalize phone number (remove spaces, dashes, etc.)
  const normalizedPhone = leadPhone.replace(/[\s\-\(\)]/g, '');
  
  // Check if lead already has an assignment (for future continuity feature)
  // For now, we always create a new assignment (hello world version)
  
  // Get next agent via round robin
  const agent = getNextAgent();
  
  if (!agent) {
    return { 
      success: false, 
      error: 'No active agents available' 
    };
  }
  
  // Create the assignment
  const result = db.createAssignment(normalizedPhone, leadName, agent.id, messageText);
  
  // Update agent's last assigned timestamp
  db.updateAgentLastAssigned(agent.id);
  
  console.log(`📋 Assigned lead ${normalizedPhone} to agent ${agent.name} (${agent.wa_number})`);
  
  return {
    success: true,
    assignment: {
      id: result.lastInsertRowid,
      leadPhone: normalizedPhone,
      leadName,
      messageText
    },
    agent: {
      id: agent.id,
      name: agent.name,
      waNumber: agent.wa_number,
      phoneNumberId: agent.phone_number_id
    }
  };
}

/**
 * Format phone number for display (e.g., "56912345678" -> "+56 9 1234 5678")
 */
function formatPhoneForDisplay(phone) {
  // Remove any non-digits
  const digits = phone.replace(/\D/g, '');
  
  // Chilean format: +56 9 XXXX XXXX
  if (digits.startsWith('56') && digits.length === 11) {
    return `+56 ${digits.slice(2, 3)} ${digits.slice(3, 7)} ${digits.slice(7)}`;
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
  
  console.log(`\n📥 Incoming lead from ${source || 'unknown'}:`);
  console.log(`   Phone: ${leadPhone}`);
  console.log(`   Name: ${leadName || 'N/A'}`);
  console.log(`   Message: ${messageText || 'N/A'}`);
  
  // Step 1: Assign the lead to an agent
  const assignment = assignLead(leadPhone, leadName, messageText);
  
  if (!assignment.success) {
    return assignment;
  }
  
  const phoneNumberId = assignment.agent.phoneNumberId || config.phoneNumberId;
  const leadPhoneFormatted = formatPhoneForDisplay(leadPhone);
  
  // Step 2: Send notification to AGENT with lead's info
  // (No message to client - GHL handles that)
  const agentNotification = `🔔 *Nuevo lead asignado*\n\n👤 *Nombre:* ${leadName || 'No proporcionado'}\n📱 *Teléfono:* ${leadPhoneFormatted}\n💬 *Mensaje:* "${messageText || 'Sin mensaje'}"\n\n_Contacta al cliente desde tu WhatsApp personal._`;
  
  const agentResult = await whatsapp.sendTextMessage(
    assignment.agent.waNumber,
    agentNotification,
    phoneNumberId,
    config.accessToken
  );
  
  return {
    success: agentResult.success,
    assignment: assignment.assignment,
    agent: assignment.agent,
    agentNotificationSent: agentResult.success,
    agentNotificationError: agentResult.error || null
  };
}

module.exports = {
  getNextAgent,
  assignLead,
  handleIncomingLead
};


