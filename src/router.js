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
 * Handle incoming webhook from GHL/Kirk
 * Assigns the lead and sends the first message from the agent
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
  
  // Step 2: Send first message from agent to lead
  // For hello world, we use a simple text message
  // In production, you'd use an approved template for business-initiated conversations
  const agentMessage = `Hola${leadName ? ` ${leadName}` : ''}, soy ${assignment.agent.name} del equipo de AIM Global. Te ayudo por aquí.`;
  
  // Use the configured phone number ID (or agent-specific if available)
  const phoneNumberId = assignment.agent.phoneNumberId || config.phoneNumberId;
  
  const sendResult = await whatsapp.sendTextMessage(
    leadPhone,
    agentMessage,
    phoneNumberId,
    config.accessToken
  );
  
  return {
    success: sendResult.success,
    assignment: assignment.assignment,
    agent: assignment.agent,
    messageSent: sendResult.success,
    messageError: sendResult.error || null
  };
}

module.exports = {
  getNextAgent,
  assignLead,
  handleIncomingLead
};


