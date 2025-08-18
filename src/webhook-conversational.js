const express = require('express');
const TwilioConversationalIntegration = require('./twilio-conversational');
require('dotenv').config();

const router = express.Router();
const conversationalIntegration = new TwilioConversationalIntegration();

/**
 * New conversational AI webhook endpoint
 * This replaces the basic /webhook/call with advanced conversational AI
 */
router.post('/webhook/conversational-call', async (req, res) => {
  try {
    const { From, CallSid, SpeechResult } = req.body;
    console.log(`🤖 Conversational AI call from: ${From}, CallSid: ${CallSid}`);
    
    if (SpeechResult) {
      // User provided speech input - this is handled by the WebSocket connection
      // For now, we'll acknowledge and let the conversation continue
      res.set('Content-Type', 'text/xml');
      res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Thank you, I'm processing your request.</Say>
  <Pause length="1"/>
  <Redirect>/webhook/conversational-call</Redirect>
</Response>`);
    } else {
      // Initial call - start conversational AI
      const twiml = await conversationalIntegration.handleIncomingCall(CallSid, From);
      
      res.set('Content-Type', 'text/xml');
      res.status(200).send(twiml);
    }
  } catch (error) {
    console.error('Error in conversational AI webhook:', error);
    
    // Fallback response
    res.status(500).json({ 
      error: 'Conversational AI temporarily unavailable',
      message: 'Please try again later or call our emergency line if urgent'
    });
  }
});

/**
 * WebSocket endpoint for streaming audio to/from ElevenLabs
 * This endpoint handles the real-time audio streaming
 */
router.ws('/stream/:callSid', (ws, req) => {
  const callSid = req.params.callSid;
  console.log(`🔗 WebSocket connected for call ${callSid}`);

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      switch (data.event) {
        case 'connected':
          console.log(`📞 Media stream connected for call ${callSid}`);
          break;
          
        case 'start':
          console.log(`🎙️ Media stream started for call ${callSid}`);
          // Here you would connect to ElevenLabs WebSocket
          break;
          
        case 'media':
          // Incoming audio from Twilio
          const audioPayload = Buffer.from(data.media.payload, 'base64');
          // Forward this to ElevenLabs conversational AI
          conversationalIntegration.sendAudioToConversation(callSid, audioPayload);
          break;
          
        case 'stop':
          console.log(`⏹️ Media stream stopped for call ${callSid}`);
          break;
      }
    } catch (error) {
      console.error('Error processing WebSocket message:', error);
    }
  });

  ws.on('close', () => {
    console.log(`🔌 WebSocket closed for call ${callSid}`);
  });

  ws.on('error', (error) => {
    console.error(`WebSocket error for call ${callSid}:`, error);
  });
});

/**
 * Test endpoint for conversational AI
 */
router.post('/api/test-conversational', async (req, res) => {
  try {
    const { message, phone } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    const testCallSid = `test-conv-${Date.now()}`;
    const testPhone = phone || '+1234567890';
    
    // Initialize and test the conversational AI
    await conversationalIntegration.initializeAgent();
    
    res.json({
      success: true,
      message: 'Conversational AI agent ready',
      callSid: testCallSid,
      instructions: 'Use the /webhook/conversational-call endpoint for actual calls'
    });
  } catch (error) {
    console.error('Error testing conversational AI:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * Get conversational AI agent status
 */
router.get('/api/conversational-status', async (req, res) => {
  try {
    const status = {
      agentCreated: conversationalIntegration.agentCreated,
      activeConversations: conversationalIntegration.getActiveConversationsCount(),
      elevenlabsConnected: !!process.env.ELEVENLABS_API_KEY,
      agentId: process.env.ELEVENLABS_AGENT_ID || 'Not set'
    };
    
    res.json(status);
  } catch (error) {
    console.error('Error getting conversational AI status:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router; 