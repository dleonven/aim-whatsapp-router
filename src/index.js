require('dotenv').config();
const express = require('express');
const db = require('./db');
const router = require('./router');
const whatsapp = require('./whatsapp');

const app = express();
app.use(express.json());

// Configuration from environment
const config = {
  phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
  wabaId: process.env.WHATSAPP_WABA_ID,
  accessToken: process.env.WHATSAPP_ACCESS_TOKEN
};

// Validate config
if (!config.phoneNumberId || !config.accessToken) {
  console.error('❌ Missing required environment variables. Check your .env file.');
  console.error('   Required: WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN');
  process.exit(1);
}

// ============================================
// WEBHOOK ENDPOINTS
// ============================================

/**
 * Main webhook endpoint for GHL/Kirk
 * Receives incoming lead info and routes to an agent
 */
app.post('/webhook/main-whatsapp', async (req, res) => {
  try {
    const { lead_phone, lead_name, message_text, source } = req.body;
    
    if (!lead_phone) {
      return res.status(400).json({ 
        success: false, 
        error: 'lead_phone is required' 
      });
    }
    
    const result = await router.handleIncomingLead({
      leadPhone: lead_phone,
      leadName: lead_name,
      messageText: message_text,
      source: source || 'ghl'
    }, config);
    
    res.json(result);
  } catch (error) {
    console.error('❌ Webhook error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ============================================
// META WEBHOOK (Direct from WhatsApp Cloud API)
// ============================================

const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'aim-router-verify-2026';

/**
 * Meta webhook verification (GET)
 * Meta sends a challenge to verify the webhook URL
 */
app.get('/webhook/meta', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ Meta webhook verified');
    res.status(200).send(challenge);
  } else {
    console.log('❌ Meta webhook verification failed');
    res.sendStatus(403);
  }
});

/**
 * Meta webhook receiver (POST)
 * Receives incoming WhatsApp messages from Meta Cloud API
 */
app.post('/webhook/meta', async (req, res) => {
  try {
    // Always respond 200 quickly to Meta
    res.sendStatus(200);
    
    const body = req.body;
    
    // Check if this is a WhatsApp message
    if (body.object !== 'whatsapp_business_account') {
      return;
    }
    
    // Extract message data
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    
    // Only process incoming messages (not status updates)
    if (!value?.messages || value.messages.length === 0) {
      return;
    }
    
    const message = value.messages[0];
    const contact = value.contacts?.[0];
    
    // Extract lead info
    const leadPhone = message.from; // Sender's phone number
    const leadName = contact?.profile?.name || null;
    const messageText = message.text?.body || message.type || '';
    
    console.log(`\n📱 Meta webhook received:`);
    console.log(`   From: ${leadPhone}`);
    console.log(`   Name: ${leadName}`);
    console.log(`   Message: ${messageText}`);
    
    // Route the lead
    await router.handleIncomingLead({
      leadPhone,
      leadName,
      messageText,
      source: 'meta'
    }, config);
    
  } catch (error) {
    console.error('❌ Meta webhook error:', error);
  }
});

// ============================================
// AGENT MANAGEMENT ENDPOINTS
// ============================================

/**
 * List all agents
 */
app.get('/agents', (req, res) => {
  try {
    const agents = db.getActiveAgents();
    res.json({ success: true, agents });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Add a new agent
 */
app.post('/agents', (req, res) => {
  try {
    const { name, wa_number, phone_number_id } = req.body;
    
    if (!name || !wa_number) {
      return res.status(400).json({ 
        success: false, 
        error: 'name and wa_number are required' 
      });
    }
    
    const result = db.addAgent(name, wa_number, phone_number_id);
    res.json({ 
      success: true, 
      agent: { 
        id: result.lastInsertRowid, 
        name, 
        wa_number,
        phone_number_id 
      } 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Toggle agent active status
 */
app.patch('/agents/:id/active', (req, res) => {
  try {
    const { id } = req.params;
    const { active } = req.body;
    
    db.setAgentActive(id, active);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ASSIGNMENT ENDPOINTS
// ============================================

/**
 * List recent assignments
 */
app.get('/assignments', (req, res) => {
  try {
    const assignments = db.getAssignmentsWithAgent();
    res.json({ success: true, assignments });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// TEST ENDPOINTS
// ============================================

/**
 * Send a test message (for debugging)
 */
app.post('/test/send-message', async (req, res) => {
  try {
    const { to, message } = req.body;
    
    if (!to || !message) {
      return res.status(400).json({ 
        success: false, 
        error: 'to and message are required' 
      });
    }
    
    const result = await whatsapp.sendTextMessage(
      to,
      message,
      config.phoneNumberId,
      config.accessToken
    );
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Health check
 */
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    config: {
      phoneNumberId: config.phoneNumberId ? '✓ set' : '✗ missing',
      wabaId: config.wabaId ? '✓ set' : '✗ missing',
      accessToken: config.accessToken ? '✓ set' : '✗ missing'
    }
  });
});

// ============================================
// START SERVER
// ============================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════╗
║     AIM WhatsApp Router - Hello World          ║
╠════════════════════════════════════════════════╣
║  Server running on http://localhost:${PORT}        ║
╠════════════════════════════════════════════════╣
║  Endpoints:                                    ║
║    POST /webhook/main-whatsapp  (GHL webhook)  ║
║    GET  /agents                 (list agents)  ║
║    POST /agents                 (add agent)    ║
║    GET  /assignments            (list assigns) ║
║    POST /test/send-message      (test send)    ║
║    GET  /health                 (health check) ║
╚════════════════════════════════════════════════╝
  `);
});


