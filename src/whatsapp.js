const axios = require('axios');

const GRAPH_API_VERSION = process.env.GRAPH_API_VERSION || 'v21.0';
const GRAPH_API_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

/**
 * Send a text message via WhatsApp Cloud API
 * @param {string} to - Recipient phone number in E.164 format (e.g., "573119999999")
 * @param {string} message - Message text to send
 * @param {string} phoneNumberId - The sender's Phone Number ID
 * @param {string} accessToken - Access token for the API
 * @returns {Promise<object>} - API response
 */
async function sendTextMessage(to, message, phoneNumberId, accessToken) {
  const url = `${GRAPH_API_URL}/${phoneNumberId}/messages`;
  
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: to,
    type: 'text',
    text: {
      preview_url: false,
      body: message
    }
  };

  try {
    const response = await axios.post(url, payload, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`✅ Message sent to ${to}:`, response.data);
    return { success: true, data: response.data };
  } catch (error) {
    console.error(`❌ Failed to send message to ${to}:`, error.response?.data || error.message);
    return { 
      success: false, 
      error: error.response?.data || error.message 
    };
  }
}

/**
 * Send a template message via WhatsApp Cloud API
 * (Required for initiating conversations outside 24h window)
 * @param {string} to - Recipient phone number
 * @param {string} templateName - Approved template name
 * @param {string} languageCode - Template language (e.g., "es", "en_US")
 * @param {Array} components - Template components (header, body, buttons variables)
 * @param {string} phoneNumberId - The sender's Phone Number ID
 * @param {string} accessToken - Access token for the API
 * @returns {Promise<object>} - API response
 */
async function sendTemplateMessage(to, templateName, languageCode, components, phoneNumberId, accessToken) {
  const url = `${GRAPH_API_URL}/${phoneNumberId}/messages`;
  const name = String(templateName || '').trim() || 'nuevo_lead';
  const code = String(languageCode || '').trim() || 'es_CL';
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: String(to || '').trim(),
    type: 'template',
    template: {
      name,
      language: { code }
    }
  };

  if (components && components.length > 0) {
    // Meta rejects empty or non-string parameter values; normalize each body parameter
    payload.template.components = components.map((c) => {
      if (c.type !== 'body' || !Array.isArray(c.parameters)) return c;
      return {
        type: 'body',
        parameters: c.parameters.map((p) => ({
          type: 'text',
          text: String(p && p.text != null ? p.text : '').trim().slice(0, 1024) || '—'
        }))
      };
    });
  }

  // Debug: log payload (no secrets) to trace "Parameter name is missing or empty"
  console.log('Template request payload:', JSON.stringify(payload, null, 2));

  try {
    const response = await axios.post(url, payload, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`✅ Template message sent to ${to}:`, response.data);
    return { success: true, data: response.data };
  } catch (error) {
    console.error(`❌ Failed to send template to ${to}:`, error.response?.data || error.message);
    return { 
      success: false, 
      error: error.response?.data || error.message 
    };
  }
}

/**
 * Get phone numbers associated with a WABA
 * @param {string} wabaId - WhatsApp Business Account ID
 * @param {string} accessToken - Access token for the API
 * @returns {Promise<object>} - API response with phone numbers
 */
async function getPhoneNumbers(wabaId, accessToken) {
  const url = `${GRAPH_API_URL}/${wabaId}/phone_numbers`;

  try {
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    return { success: true, data: response.data };
  } catch (error) {
    console.error('❌ Failed to get phone numbers:', error.response?.data || error.message);
    return { 
      success: false, 
      error: error.response?.data || error.message 
    };
  }
}

module.exports = {
  sendTextMessage,
  sendTemplateMessage,
  getPhoneNumbers
};


