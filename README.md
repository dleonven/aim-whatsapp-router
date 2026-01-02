# AIM WhatsApp Router

Routes incoming leads from the main WhatsApp number to individual agents using round robin assignment.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create `.env` file with your credentials:
   ```env
   WHATSAPP_PHONE_NUMBER_ID=971571259364819
   WHATSAPP_WABA_ID=746826601254906
   WHATSAPP_ACCESS_TOKEN=your_access_token_here
   PORT=3000
   ```

3. Start the server:
   ```bash
   npm start
   # or for development with auto-reload:
   npm run dev
   ```

## API Endpoints

### Webhook (for GHL/Kirk)

**POST /webhook/main-whatsapp**

Receives incoming lead info and assigns to an agent.

```json
{
  "lead_phone": "573119999999",
  "lead_name": "Juan Pérez",
  "message_text": "Hola, quiero información",
  "source": "ghl"
}
```

### Agent Management

**GET /agents** - List all active agents

**POST /agents** - Add a new agent
```json
{
  "name": "Carla",
  "wa_number": "+56912345678",
  "phone_number_id": "optional_phone_number_id"
}
```

**PATCH /agents/:id/active** - Toggle agent active status
```json
{
  "active": true
}
```

### Assignments

**GET /assignments** - List recent assignments

### Testing

**POST /test/send-message** - Send a test message
```json
{
  "to": "573119999999",
  "message": "Hola, esto es una prueba"
}
```

**GET /health** - Health check

## How It Works

1. Lead writes to main WhatsApp number
2. GHL/Kirk triggers webhook to `/webhook/main-whatsapp`
3. Router assigns lead to next available agent (round robin)
4. Router sends first message from agent's number to lead
5. Agent continues conversation in their native WhatsApp app

## Database

Uses SQLite (`router.db`) with two tables:
- `agents`: Agent info (name, WhatsApp number, active status)
- `assignments`: Lead-to-agent assignments history


