/**
 * ════════════════════════════════════════════════════════════════
 * KAAPAV WhatsApp API - Production Worker (FIXED)
 * ════════════════════════════════════════════════════════════════
 */
// ❌ REMOVED: import { createSession, validateSession } from './auth-fix.js';

import { AutoResponder } from './services/autoresponder.js';
import { WhatsAppService } from './services/whatsapp.js';

// ════════════════════════════════════════════════════════════════
// CORS CONFIGURATION
// ════════════════════════════════════════════════════════════════
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

// ════════════════════════════════════════════════════════════════
// SIMPLE ROUTER CLASS
// ════════════════════════════════════════════════════════════════
class Router {
  constructor() {
    this.routes = [];
  }

  add(method, pattern, handler) {
    const regex = new RegExp('^' + pattern.replace(/:\w+/g, '([^/]+)') + '$');
    const params = (pattern.match(/:\w+/g) || []).map(p => p.slice(1));
    this.routes.push({ method, regex, params, handler });
  }

  get(p, h) { this.add('GET', p, h); }
  post(p, h) { this.add('POST', p, h); }
  put(p, h) { this.add('PUT', p, h); }
  patch(p, h) { this.add('PATCH', p, h); }
  delete(p, h) { this.add('DELETE', p, h); }

  match(method, path) {
    for (const route of this.routes) {
      if (route.method !== method) continue;
      const match = path.match(route.regex);
      if (match) {
        const params = {};
        route.params.forEach((name, i) => params[name] = match[i + 1]);
        return { handler: route.handler, params };
      }
    }
    return null;
  }
}

// ════════════════════════════════════════════════════════════════
// CONTEXT HELPER CLASS
// ════════════════════════════════════════════════════════════════
class Context {
  constructor(request, env, ctx, params = {}) {
    this.request = request;
    this.env = env;
    this.ctx = ctx;
    this.params = params;
    this.user = null;
  }

  async body() {
    try {
      return await this.request.json();
    } catch {
      return {};
    }
  }

  query(key) {
    return new URL(this.request.url).searchParams.get(key);
  }

  json(data, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });
  }

  error(msg, status = 400) {
    return this.json({ error: msg, success: false }, status);
  }

  async waitUntil(promise) {
    this.ctx.waitUntil(promise);
  }
}

// ════════════════════════════════════════════════════════════════
// JWT HELPER
// ════════════════════════════════════════════════════════════════
async function verifyJWT(token, secret) {
  try {
    const [headerB64, payloadB64, signature] = token.split('.');
    const payload = JSON.parse(atob(payloadB64));
    
    // Check expiration
    if (payload.exp && payload.exp < Date.now() / 1000) {
      return null;
    }
    
    return payload;
  } catch (err) {
    console.error('[JWT] Verification failed:', err);
    return null;
  }
}

async function signJWT(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerB64 = btoa(JSON.stringify(header));
  const payloadB64 = btoa(JSON.stringify(payload));
  
  // Simple signature (for production, use proper crypto)
  const signature = btoa(headerB64 + '.' + payloadB64 + secret).slice(0, 43);
  
  return `${headerB64}.${payloadB64}.${signature}`;
}

// ════════════════════════════════════════════════════════════════
// WEBHOOK HANDLERS
// ════════════════════════════════════════════════════════════════
const WebhookHandlers = {
  // GET - Webhook verification
  verify: async (ctx) => {
    const mode = ctx.query('hub.mode');
    const token = ctx.query('hub.verify_token');
    const challenge = ctx.query('hub.challenge');

    console.log('[Webhook] Verification:', { mode, token: token?.slice(0, 10) + '***' });

    const verifyToken = ctx.env.WEBHOOK_VERIFY_TOKEN || ctx.env.WHATSAPP_VERIFY_TOKEN || 'kaapav_verify_2024';

    if (mode === 'subscribe' && token === verifyToken) {
      console.log('[Webhook] ✅ Verified');
      return new Response(challenge, { status: 200 });
    }

    console.log('[Webhook] ❌ Verification failed');
    return new Response('Forbidden', { status: 403 });
  },

  // POST - Handle incoming messages
  handle: async (ctx) => {
    try {
      const body = await ctx.body();
      console.log('[Webhook] Received:', JSON.stringify(body).slice(0, 300));

      // Process webhook
      const entries = body.entry || [];
      
      for (const entry of entries) {
        const changes = entry.changes || [];
        
        for (const change of changes) {
          if (change.field !== 'messages') continue;
          
          const value = change.value;
          
          // Handle status updates
          if (value.statuses) {
            await handleStatusUpdates(ctx.env, value.statuses);
          }
          
          // Handle incoming messages
          if (value.messages) {
            for (const message of value.messages) {
              await handleIncomingMessage(ctx.env, message, value.contacts?.[0]);
            }
          }
        }
      }

      return ctx.json({ status: 'ok', received: true });

    } catch (err) {
      console.error('[Webhook] Error:', err);
      return ctx.error('Webhook processing failed', 500);
    }
  }
};

// Handle incoming message
async function handleIncomingMessage(env, message, contact) {
  const phone = message.from;
  const messageId = message.id;
  const messageType = message.type;

  console.log(`📩 Message from ${phone}: ${messageType}`);

  try {
    // Get or create customer
    let customer = await getOrCreateCustomer(env, phone, contact);
    
    // Check if first message
    const isFirstMessage = !customer.first_message_at;
    
    // Extract content
    const content = extractContent(message);
    
    // Save to database
    await saveMessageToDB(env, {
      phone,
      messageId,
      messageType,
      content,
      direction: 'inbound'
    });
    
    // Process with autoresponder
    const autoResponder = new AutoResponder(env);
    await autoResponder.process({
      phone,
      message,
      content,
      customer,
      isFirstMessage
    });

  } catch (err) {
    console.error('[Message] Processing error:', err);
  }
}

// Handle status updates
async function handleStatusUpdates(env, statuses) {
  for (const status of statuses) {
    console.log(`📊 Status: ${status.id} → ${status.status}`);
    // Update in database if needed
  }
}

// Extract content from message
// Extract content from message
function extractContent(message) {
  const type = message.type;
  
  switch (type) {
    case 'text':
      return { text: message.text?.body || '' };
    
    case 'image':
    case 'video':
    case 'audio':
    case 'document':
    case 'sticker':
      return {
        text: message[type]?.caption || `[${type}]`,
        media_id: message[type]?.id,
        caption: message[type]?.caption,
        mime_type: message[type]?.mime_type
      };
    
    // ✅ FIXED: Extract text from interactive messages
    case 'interactive':
      const interactive = message.interactive;
      
      if (interactive?.type === 'button_reply') {
        return {
          text: interactive.button_reply?.title || interactive.button_reply?.id || '[Button]',
          button_id: interactive.button_reply?.id,
          button_text: interactive.button_reply?.title,
        };
      }
      
      if (interactive?.type === 'list_reply') {
        return {
          text: interactive.list_reply?.title || interactive.list_reply?.id || '[Selection]',
          button_id: interactive.list_reply?.id,
          button_text: interactive.list_reply?.title,
        };
      }
      
      return { text: '[Interactive]' };
    
    case 'button':
      return {
        text: message.button?.text || '[Button]',
        button_text: message.button?.text,
        button_id: message.button?.payload,
      };
    
    case 'location':
      return {
        text: `📍 Location: ${message.location?.name || 'Shared location'}`,
        latitude: message.location?.latitude,
        longitude: message.location?.longitude,
      };
    
    case 'contacts':
      const contactName = message.contacts?.[0]?.name?.formatted_name || 'Contact';
      return {
        text: `👤 ${contactName}`,
        contacts: message.contacts,
      };
    
    case 'order':
      return {
        text: '🛒 Order Received',
        order: message.order,
      };
    
    case 'reaction':
      return {
        text: message.reaction?.emoji || '👍',
        emoji: message.reaction?.emoji,
      };
    
    default:
      return { text: `[${type || 'message'}]` };
  }
}

// Get or create customer
async function getOrCreateCustomer(env, phone, contact) {
  try {
    let customer = await env.DB.prepare(
      'SELECT * FROM customers WHERE phone = ?'
    ).bind(phone).first();

    if (!customer) {
      const name = contact?.profile?.name || 'Customer';
      const now = new Date().toISOString();
      
      // FIXED: Use correct column names from schema
      await env.DB.prepare(`
        INSERT INTO customers (
          phone, name, segment, tier, language,
          message_count, order_count, total_spent,
          opted_in, first_seen, last_seen, created_at, updated_at
        )
        VALUES (?, ?, 'new', 'bronze', 'en', 1, 0, 0, 1, ?, ?, ?, ?)
      `).bind(phone, name, now, now, now, now).run();
      
      customer = await env.DB.prepare(
        'SELECT * FROM customers WHERE phone = ?'
      ).bind(phone).first();
      
      console.log(`👤 New customer: ${phone}`);
    } else {
      // Update last_seen
      await env.DB.prepare(
        'UPDATE customers SET last_seen = ?, message_count = message_count + 1 WHERE phone = ?'
      ).bind(new Date().toISOString(), phone).run();
    }

    return customer;
  } catch (err) {
    console.error('[Customer] Get/Create error:', err);
    return { phone, name: 'Customer' };
  }
}

// Save message to database - FIXED VERSION
async function saveMessageToDB(env, data) {
  try {
    const now = new Date().toISOString();
    
    // ✅ Extract the actual text to display (NOT JSON)
    let displayText = '';
    
    if (data.content?.text) {
      displayText = data.content.text;
    } else if (data.content?.button_text) {
      displayText = data.content.button_text;
    } else if (data.content?.caption) {
      displayText = data.content.caption;
    } else if (typeof data.content === 'string') {
      displayText = data.content;
    } else {
      displayText = `[${data.messageType || 'message'}]`;
    }

    await env.DB.prepare(`
      INSERT INTO messages (
        message_id, phone, text, message_type, direction,
        button_id, button_text, media_id, media_caption,
        status, timestamp, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'received', ?, ?)
    `).bind(
      data.messageId,
      data.phone,
      displayText,  // ✅ Save readable text, NOT JSON
      data.messageType,
      data.direction === 'inbound' ? 'incoming' : 'outgoing',
      data.content?.button_id || null,
      data.content?.button_text || null,
      data.content?.media_id || null,
      data.content?.caption || null,
      now,
      now
    ).run();

    // Update or create chat with readable text
    await updateOrCreateChat(
      env, 
      data.phone, 
      displayText, 
      data.messageType, 
      data.direction === 'inbound' ? 'incoming' : 'outgoing'
    );

    console.log(`💾 Message saved: ${displayText.slice(0, 50)}`);
  } catch (err) {
    console.error('[DB] Save message error:', err);
  }
}

async function updateOrCreateChat(env, phone, lastMessage, messageType, direction) {
  const now = new Date().toISOString();
  const existing = await env.DB.prepare('SELECT phone FROM chats WHERE phone = ?').bind(phone).first();
  
  if (existing) {
    await env.DB.prepare(`
      UPDATE chats SET last_message = ?, last_message_type = ?, last_timestamp = ?,
        last_direction = ?, total_messages = total_messages + 1,
        unread_count = CASE WHEN ? = 'incoming' THEN unread_count + 1 ELSE unread_count END,
        updated_at = ?
      WHERE phone = ?
    `).bind(lastMessage?.slice(0, 500), messageType, now, direction, direction, now, phone).run();
  } else {
    const customer = await env.DB.prepare('SELECT name FROM customers WHERE phone = ?').bind(phone).first();
    await env.DB.prepare(`
      INSERT INTO chats (phone, customer_name, last_message, last_message_type, last_timestamp,
        last_direction, total_messages, unread_count, is_starred, is_blocked, is_bot_enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, 0, 0, 1, ?, ?)
    `).bind(phone, customer?.name || 'Customer', lastMessage?.slice(0, 500), messageType, now, direction, 
      direction === 'incoming' ? 1 : 0, now, now).run();
  }
}

// ════════════════════════════════════════════════════════════════
// AUTH HANDLERS
// ════════════════════════════════════════════════════════════════
const AuthHandlers = {
  login: async (ctx) => {
    const { email, password } = await ctx.body();

    if (!email || !password) {
      return ctx.error('Email and password required', 400);
    }

    try {
      const user = await ctx.env.DB.prepare(
        'SELECT * FROM users WHERE email = ? AND is_active = 1'
      ).bind(email.toLowerCase()).first();

      if (!user) {
        console.log('[Auth] User not found:', email);
        return ctx.error('Invalid credentials', 401);
      }

      // Simple password check (matches plain text for now)
      if (user.password_hash !== password) {
        console.log('[Auth] Wrong password for:', email);
        return ctx.error('Invalid credentials', 401);
      }

      // Use fallback secret if not set
      const secret = ctx.env.JWT_SECRET || 'kaapav-default-secret-2024';
      
      const token = await signJWT({
        userId: user.user_id,
        email: user.email,
        name: user.name,
        role: user.role,
        exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60)
      }, secret);

      console.log('[Auth] ✅ Login success:', email);

      return ctx.json({
        success: true,
        token,
        user: {
          id: user.user_id,
          userId: user.user_id,
          email: user.email,
          name: user.name,
          role: user.role
        }
      });

    } catch (err) {
      console.error('[Auth] Login error:', err);
      return ctx.error('Login failed', 500);
    }
  },

  register: async (ctx) => {
    const { email, password, name } = await ctx.body();

    if (!email || !password || !name) {
      return ctx.error('Email, password, and name required', 400);
    }

    try {
      // Check if user exists
      const existing = await ctx.env.DB.prepare(
        'SELECT * FROM users WHERE email = ?'
      ).bind(email).first();

      if (existing) {
        return ctx.error('User already exists', 409);
      }

      // Create user
      const userId = 'user_' + Date.now();
      
      // TODO: Hash password with bcrypt
      const passwordHash = password; // TEMPORARY - implement proper hashing

      await ctx.env.DB.prepare(`
        INSERT INTO users (user_id, email, password_hash, name, role, created_at)
        VALUES (?, ?, ?, ?, 'agent', ?)
      `).bind(userId, email, passwordHash, name, new Date().toISOString()).run();

      return ctx.json({
        success: true,
        message: 'User created successfully',
        userId
      });

    } catch (err) {
      console.error('[Auth] Register error:', err);
      return ctx.error('Registration failed', 500);
    }
  },

  me: async (ctx) => {
    if (!ctx.user) {
      return ctx.error('Unauthorized', 401);
    }

    return ctx.json({
      user: ctx.user
    });
  }
};

// ════════════════════════════════════════════════════════════════
// API HANDLERS (Simplified versions)
// ════════════════════════════════════════════════════════════════
const ChatHandlers = {
  list: async (ctx) => {
    try {
      const { results } = await ctx.env.DB.prepare(`
        SELECT c.*, cu.segment, cu.tier, cu.order_count, cu.total_spent
        FROM chats c
        LEFT JOIN customers cu ON c.phone = cu.phone
        WHERE c.is_blocked = 0
        ORDER BY c.is_starred DESC, c.last_timestamp DESC
        LIMIT 50
      `).all();

      // Get online count (active in last 5 min)
      const { count: onlineCount } = await ctx.env.DB.prepare(`
        SELECT COUNT(*) as count FROM chats 
        WHERE last_timestamp > datetime('now', '-5 minutes')
      `).first() || { count: 0 };

      return ctx.json({ 
        chats: results || [], 
        total: results?.length || 0,
        online_count: onlineCount || 0
      });
    } catch (err) {
      console.error('[Chats] List error:', err);
      return ctx.error('Failed to fetch chats: ' + err.message, 500);
    }
  },

  get: async (ctx) => {
    const { phone } = ctx.params;

    try {
      const chat = await ctx.env.DB.prepare(`
        SELECT c.*, cu.name, cu.email, cu.segment, cu.tier, 
               cu.order_count, cu.total_spent, cu.labels as customer_labels
        FROM chats c
        LEFT JOIN customers cu ON c.phone = cu.phone
        WHERE c.phone = ?
      `).bind(phone).first();

      if (!chat) {
        return ctx.error('Chat not found', 404);
      }

      return ctx.json({ chat });
    } catch (err) {
      console.error('[Chats] Get error:', err);
      return ctx.error('Failed to fetch chat', 500);
    }
  }
};

const MessageHandlers = {
  list: async (ctx) => {
    const { phone } = ctx.params;
    
    try {
      // FIXED: Use correct column name 'timestamp' instead of 'sent_at'
      const { results } = await ctx.env.DB.prepare(
        'SELECT * FROM messages WHERE phone = ? ORDER BY timestamp DESC LIMIT 100'
      ).bind(phone).all();
      
      return ctx.json({ 
        messages: (results || []).reverse(),  // Reverse for chronological order
        hasMore: false 
      });
    } catch (err) {
      console.error('[Messages] List error:', err);
      return ctx.error('Failed to fetch messages', 500);
    }
  },

  send: async (ctx) => {
    const body = await ctx.body();
    const phone = body.to || body.phone;
    const text = body.text;
    
    if (!phone || !text) {
      return ctx.error('Phone and text required', 400);
    }
    
    try {
      const wa = new WhatsAppService(ctx.env);
      const result = await wa.sendText(phone, text);
      const messageId = result.messages?.[0]?.id;
      
      // Save outgoing message
      if (messageId) {
        await saveMessageToDB(ctx.env, {
          phone,
          messageId,
          messageType: 'text',
          content: { text },
          direction: 'outbound'
        });
      }
      
      return ctx.json({
        success: true,
        messageId
      });
    } catch (err) {
      console.error('[Message] Send error:', err);
      return ctx.error('Failed to send message', 500);
    }
  }
};


const OrderHandlers = {
  list: async (ctx) => {
    try {
      const { results } = await ctx.env.DB.prepare(
        'SELECT * FROM orders ORDER BY created_at DESC LIMIT 50'
      ).all();
      
      return ctx.json({ orders: results || [], total: results?.length || 0 });
    } catch (err) {
      return ctx.error('Failed to fetch orders', 500);
    }
  }
};

const ProductHandlers = {
  list: async (ctx) => {
    try {
      const { results } = await ctx.env.DB.prepare(
        'SELECT * FROM products WHERE is_active = 1 LIMIT 100'
      ).all();
      
      return ctx.json({ products: results || [], total: results?.length || 0 });
    } catch (err) {
      return ctx.error('Failed to fetch products', 500);
    }
  },

  // ADD THIS
  categories: async (ctx) => {
    try {
      const { results } = await ctx.env.DB.prepare(
        'SELECT DISTINCT category FROM products WHERE is_active = 1 AND category IS NOT NULL'
      ).all();
      
      const categories = results?.map(r => r.category) || [];
      
      return ctx.json({ categories });
    } catch (err) {
      return ctx.error('Failed to fetch categories', 500);
    }
  }
};

const CustomerHandlers = {
  list: async (ctx) => {
    try {
      const { results } = await ctx.env.DB.prepare(
        'SELECT * FROM customers ORDER BY created_at DESC LIMIT 50'
      ).all();
      
      return ctx.json({ customers: results || [], total: results?.length || 0 });
    } catch (err) {
      return ctx.error('Failed to fetch customers', 500);
    }
  },

  // ADD THIS NEW FUNCTION
  get: async (ctx) => {
    const { phone } = ctx.params;
    
    try {
      const customer = await ctx.env.DB.prepare(
        'SELECT * FROM customers WHERE phone = ?'
      ).bind(phone).first();
      
      if (!customer) {
        return ctx.error('Customer not found', 404);
      }
      
      // Get order history
      const { results: orders } = await ctx.env.DB.prepare(
        'SELECT * FROM orders WHERE phone = ? ORDER BY created_at DESC LIMIT 10'
      ).bind(phone).all();
      
      return ctx.json({ 
        customer,
        orders: orders || []
      });
    } catch (err) {
      return ctx.error('Failed to fetch customer', 500);
    }
  }
};

// ════════════════════════════════════════════════════════════════
// SETTINGS HANDLERS
// ════════════════════════════════════════════════════════════════

const SettingsHandlers = {
  get: async (ctx) => {
    try {
      const { results } = await ctx.env.DB.prepare('SELECT * FROM settings').all();
      const settings = {};
      for (const row of (results || [])) {
        try { settings[row.key] = JSON.parse(row.value); } 
        catch { settings[row.key] = row.value; }
      }
      settings._env = {
        hasWhatsApp: !!ctx.env.WHATSAPP_TOKEN,
        hasRazorpay: !!ctx.env.RAZORPAY_KEY_ID,
        hasShiprocket: !!ctx.env.SHIPROCKET_EMAIL,
      };
      return ctx.json({ settings });
    } catch (err) {
      return ctx.json({ settings: {} });
    }
  },

  update: async (ctx) => {
    const data = await ctx.body();
    const now = new Date().toISOString();
    for (const [key, value] of Object.entries(data)) {
      if (key.startsWith('_')) continue;
      const valueStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
      await ctx.env.DB.prepare(`
        INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?
      `).bind(key, valueStr, now, valueStr, now).run();
    }
    return ctx.json({ success: true });
  },

  testWhatsApp: async (ctx) => {
    const { phone } = await ctx.body();
    if (!phone) return ctx.error('Phone required', 400);
    const wa = new WhatsAppService(ctx.env);
    await wa.sendText(phone, '✅ KAAPAV WhatsApp test successful!');
    return ctx.json({ success: true });
  }
};

// ════════════════════════════════════════════════════════════════
// ANALYTICS HANDLERS
// ════════════════════════════════════════════════════════════════

const AnalyticsHandlers = {
  overview: async (ctx) => {
    try {
      const messages = await ctx.env.DB.prepare(
        'SELECT COUNT(*) as count FROM messages'
      ).first();
      
      const orders = await ctx.env.DB.prepare(
        'SELECT COUNT(*) as count FROM orders'
      ).first();
      
      const customers = await ctx.env.DB.prepare(
        'SELECT COUNT(*) as count FROM customers'
      ).first();
      
      return ctx.json({
        messages: messages?.count || 0,
        orders: orders?.count || 0,
        customers: customers?.count || 0
      });
    } catch (err) {
      return ctx.error('Failed to fetch analytics', 500);
    }
  },

  stats: async (ctx) => {
    try {
      const messages = await ctx.env.DB.prepare(
        'SELECT COUNT(*) as count FROM messages'
      ).first();
      
      const orders = await ctx.env.DB.prepare(
        'SELECT COUNT(*) as count FROM orders'
      ).first();
      
      const customers = await ctx.env.DB.prepare(
        'SELECT COUNT(*) as count FROM customers'
      ).first();
      
      const chats = await ctx.env.DB.prepare(
        'SELECT COUNT(*) as count FROM chats WHERE unread_count > 0'
      ).first();

      const revenue = await ctx.env.DB.prepare(
        'SELECT SUM(total) as total FROM orders WHERE payment_status = ?'
      ).bind('paid').first();

      return ctx.json({
        totalMessages: messages?.count || 0,
        totalOrders: orders?.count || 0,
        totalCustomers: customers?.count || 0,
        unreadChats: chats?.count || 0,
        totalRevenue: revenue?.total || 0
      });
    } catch (err) {
      console.error('[Stats] Error:', err);
      return ctx.error('Failed to fetch stats', 500);
    }
  },

  activities: async (ctx) => {
    try {
      const limit = parseInt(ctx.query('limit') || '10');
      
      const { results } = await ctx.env.DB.prepare(`
        SELECT 
          'message' as type,
          phone,
          text as description,
          timestamp as created_at
        FROM messages
        ORDER BY timestamp DESC
        LIMIT ?
      `).bind(limit).all();
      
      return ctx.json({ activities: results || [] });
    } catch (err) {
      return ctx.error('Failed to fetch activities', 500);
    }
  },

  pending: async (ctx) => {
    try {
      const pendingOrders = await ctx.env.DB.prepare(
        'SELECT COUNT(*) as count FROM orders WHERE status = ?'
      ).bind('pending').first();
      
      const unreadChats = await ctx.env.DB.prepare(
        'SELECT COUNT(*) as count FROM chats WHERE unread_count > 0'
      ).first();
      
      return ctx.json({
        pendingOrders: pendingOrders?.count || 0,
        unreadChats: unreadChats?.count || 0
      });
    } catch (err) {
      return ctx.error('Failed to fetch pending', 500);
    }
  }
};

   
const TriggerHandlers = {
  action: async (ctx) => {
    const { phone, action } = await ctx.body();
    
    if (!phone || !action) {
      return ctx.error('Phone and action required', 400);
    }

    try {
      // Import and use AutoResponder
      const { AutoResponder } = await import('./services/autoresponder.js');
      const autoResponder = new AutoResponder(ctx.env);
      
      // Get customer info
      const customer = await ctx.env.DB.prepare(
        'SELECT * FROM customers WHERE phone = ?'
      ).bind(phone).first();

      // Trigger the action
      await autoResponder.routeAction(action, phone, customer?.language || 'en');

      return ctx.json({
        success: true,
        message: `Action ${action} triggered for ${phone}`,
      });
    } catch (error) {
      console.error('[Trigger] Error:', error);
      return ctx.error('Failed to trigger action', 500);
    }
  }
};

// ════════════════════════════════════════════════════════════════
// ROUTE DEFINITIONS
// ════════════════════════════════════════════════════════════════
const STUDIO_SNAPSHOT_KEY = 'fashion-video-studio:status:v1';
const STUDIO_FORBIDDEN_KEYS = new Set([
  'access_token', 'token', 'refresh_token', 'client_secret', 'secret',
  'password', 'credential', 'credentials', 'oauth', 'authorization',
  'local_path', 'source_path', 'raw_media_url', 'supplier_secret'
]);

function hasForbiddenStudioField(value) {
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, child]) => (
    STUDIO_FORBIDDEN_KEYS.has(String(key).toLowerCase()) || hasForbiddenStudioField(child)
  ));
}

const StudioHandlers = {
  // The factory alone may write this sanitized status mirror. Browser clients
  // can only read it through the normal authenticated dashboard route.
  async ingest(ctx) {
    const configuredToken = ctx.env.STUDIO_BRIDGE_TOKEN;
    const suppliedToken = ctx.request.headers.get('X-Studio-Bridge-Token');
    if (!configuredToken || !suppliedToken || suppliedToken !== configuredToken) {
      return ctx.error('Studio bridge authentication failed', 401);
    }

    const payload = await ctx.body();
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return ctx.error('Studio bridge payload must be an object');
    }
    if (!payload.generated_at || hasForbiddenStudioField(payload)) {
      return ctx.error('Studio bridge payload is invalid or contains a prohibited field');
    }

    const serialized = JSON.stringify(payload);
    if (serialized.length > 180000) return ctx.error('Studio bridge payload exceeds the safe size limit');
    await ctx.env.KV.put(STUDIO_SNAPSHOT_KEY, serialized, { expirationTtl: 420 });
    return ctx.json({ status: 'accepted', generated_at: payload.generated_at });
  },

  async status(ctx) {
    const stored = await ctx.env.KV.get(STUDIO_SNAPSHOT_KEY, 'json');
    if (!stored || typeof stored !== 'object' || hasForbiddenStudioField(stored)) {
      return ctx.json({
        status: 'unavailable',
        generated_at: null,
        autopilot: { state: 'not_connected', reason: 'No current sanitized snapshot has been received from the factory.' },
        pipeline_lock: { state: 'unknown' },
        platforms: {}, schedules: {}, analytics: {}, learning: {}
      });
    }
    return ctx.json(stored);
  }
};

const router = new Router();

// Health check
router.get('/health', (ctx) => ctx.json({
  status: 'ok',
  service: 'KAAPAV API',
  version: '1.0.0',
  timestamp: new Date().toISOString()
}));

// Webhook
router.get('/webhook', WebhookHandlers.verify);
router.post('/webhook', WebhookHandlers.handle);

// Auth
router.post('/api/auth/login', AuthHandlers.login);
router.post('/api/auth/register', AuthHandlers.register);
router.get('/api/auth/me', AuthHandlers.me);

// Chats
router.get('/api/chats', ChatHandlers.list);
router.get('/api/chats/:phone', ChatHandlers.get);

// Messages
router.get('/api/chats/:phone/messages', MessageHandlers.list);
router.post('/api/messages/send', MessageHandlers.send);

// Orders
router.get('/api/orders', OrderHandlers.list);

// Products
router.get('/api/products', ProductHandlers.list);

// Customers
router.get('/api/customers', CustomerHandlers.list);
router.get('/api/customers/:phone', CustomerHandlers.get);  // ADD THIS

// Analytics
router.get('/api/analytics', AnalyticsHandlers.overview);
router.get('/api/stats', AnalyticsHandlers.stats);  // ADD THIS
router.get('/api/analytics/activities', AnalyticsHandlers.activities);  // ADD THIS
router.get('/api/analytics/pending', AnalyticsHandlers.pending);  // ADD THIS

// Fashion Video Studio: browser is read-only; factory bridge uses a separate
// secret header and cannot access any other dashboard endpoint.
router.get('/api/studio/status', StudioHandlers.status);
router.post('/api/studio/ingest', StudioHandlers.ingest);

// Products
router.get('/api/products/categories', ProductHandlers.categories);

// Settings 
router.get('/api/settings', SettingsHandlers.get);
router.put('/api/settings', SettingsHandlers.update);
router.post('/api/settings/test-whatsapp', SettingsHandlers.testWhatsApp);

router.post('/api/trigger-action', TriggerHandlers.action);
 

// ════════════════════════════════════════════════════════════════
// MAIN EXPORT (🔥 FIXED AUTH!)
// ════════════════════════════════════════════════════════════════
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    console.log(`[Request] ${method} ${path}`);

    // CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS
      });
    }

    // Match route
    const matched = router.match(method, path);
    
    if (!matched) {
      console.log(`[404] Route not found: ${method} ${path}`);
      return new Response(
        JSON.stringify({
          error: 'Not found',
          path,
          method,
          available: 'Check /health, /webhook, /api/*'
        }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
        }
      );
    }

    const context = new Context(request, env, ctx, matched.params);

    try {
      // ════════════════════════════════════════════════════════
      // 🔥 FIXED: Auth check using JWT (NOT database sessions!)
      // ════════════════════════════════════════════════════════
      if (path.startsWith('/api/') &&
          !path.startsWith('/api/auth/') &&
          path !== '/api/studio/ingest' &&
          !path.includes('/webhook')) {
        
        const auth = request.headers.get('Authorization');
        if (!auth?.startsWith('Bearer ')) {
          console.log('[Auth] No bearer token');
          return context.error('Unauthorized - Token required', 401);
        }
        
        const token = auth.slice(7);
        console.log('[Auth] Validating JWT:', token.slice(0, 15) + '...');
        
        // ✅ DECODE JWT DIRECTLY - NO DATABASE LOOKUP!
        try {
          const parts = token.split('.');
          if (parts.length !== 3) {
            throw new Error('Invalid token format');
          }
          
          const payload = JSON.parse(atob(parts[1]));
          
          // Check expiration
          if (payload.exp && payload.exp < Date.now() / 1000) {
            console.log('[Auth] Token expired');
            return context.error('Token expired', 401);
          }
          
          // Set user in context
          context.user = {
            userId: payload.userId,
            email: payload.email,
            name: payload.name,
            role: payload.role
          };
          
          console.log('[Auth] ✅ Authenticated:', payload.email);
          
        } catch (jwtError) {
          console.log('[Auth] JWT decode error:', jwtError.message);
          return context.error('Invalid token', 401);
        }
      }

      // Execute handler
      return await matched.handler(context);

    } catch (err) {
      console.error('[Error]', err);
      return context.error(err.message || 'Internal server error', 500);
    }
  },

  // Scheduled tasks (cron)
  async scheduled(event, env, ctx) {
    console.log('[Cron] Triggered:', event.cron);
    
    try {
      // Process broadcast queue every 5 minutes
      if (event.cron === '*/5 * * * *') {
        console.log('[Cron] Processing broadcast queue...');
        // Add broadcast processing logic here
      }
      
      // Cart recovery every hour
      if (event.cron === '0 * * * *') {
        console.log('[Cron] Processing cart recovery...');
        // Add cart recovery logic here
      }
      
    } catch (err) {
      console.error('[Cron] Error:', err);
    }
  }
};
