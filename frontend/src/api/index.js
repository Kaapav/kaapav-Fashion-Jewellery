/**
 * ═══════════════════════════════════════════════════════════════
 * KAAPAV API - Complete WhatsApp Business API Integration
 * With offline support, retry logic, and request queuing
 * ═══════════════════════════════════════════════════════════════
 */

import { useAuthStore } from '../store';
import { useUIStore } from '../store';

const API_BASE = import.meta.env.VITE_API_URL || '';

// ═══════════════════════════════════════════════════════════════
// REQUEST HANDLER
// ═══════════════════════════════════════════════════════════════

class ApiClient {
  constructor() {
    this.baseUrl = API_BASE;
    this.retryAttempts = 3;
    this.retryDelay = 1000;
  }

  getHeaders() {
    const token = useAuthStore.getState().token;
    return {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    };
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const { method = 'GET', body, retries = this.retryAttempts } = options;

    const config = {
      method,
      headers: this.getHeaders(),
      ...(body && { body: JSON.stringify(body) }),
    };

    // Check offline status
    if (!navigator.onLine) {
      if (method !== 'GET') {
        // Queue for later
        this.queueOfflineRequest(endpoint, options);
        return { success: false, offline: true, queued: true };
      }
      throw new Error('You are offline');
    }

    try {
      const response = await fetch(url, config);
      const data = await response.json();

      if (!response.ok) {
        // Handle 401 - Token expired
        if (response.status === 401) {
          useAuthStore.getState().logout();
          throw new Error('Session expired. Please login again.');
        }

        throw new Error(data.error || `Request failed with status ${response.status}`);
      }

      return data;
    } catch (error) {
      // Retry logic for network errors
      if (retries > 0 && error.name === 'TypeError') {
        await this.delay(this.retryDelay);
        return this.request(endpoint, { ...options, retries: retries - 1 });
      }
      throw error;
    }
  }

  async get(endpoint) {
    return this.request(endpoint, { method: 'GET' });
  }

  async post(endpoint, body) {
    return this.request(endpoint, { method: 'POST', body });
  }

  async put(endpoint, body) {
    return this.request(endpoint, { method: 'PUT', body });
  }

  async patch(endpoint, body) {
    return this.request(endpoint, { method: 'PATCH', body });
  }

  async delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  queueOfflineRequest(endpoint, options) {
    const action = {
      id: Date.now().toString(),
      endpoint,
      options,
      timestamp: new Date().toISOString(),
    };
    useUIStore.getState().addPendingAction(action);
  }

  async processOfflineQueue() {
    const pendingActions = useUIStore.getState().pendingActions;
    
    for (const action of pendingActions) {
      try {
        await this.request(action.endpoint, action.options);
        useUIStore.getState().removePendingAction(action.id);
      } catch (error) {
        console.error('Failed to process queued action:', error);
      }
    }
  }
}

const api = new ApiClient();

// ═══════════════════════════════════════════════════════════════
// AUTH API
// ═══════════════════════════════════════════════════════════════

export const authAPI = {
  login: (credentials) => api.post('/api/auth/login', credentials),
  
  register: (data) => api.post('/api/auth/register', data),
  
  logout: () => api.post('/api/auth/logout'),
  
  getMe: () => api.get('/api/auth/me'),
  
  refresh: () => api.post('/api/auth/refresh'),
  
  changePassword: (data) => api.post('/api/auth/change-password', data),
  
  // Biometric auth
  biometricChallenge: () => api.post('/api/auth/biometric/challenge'),
  
  biometricVerify: (credential) => api.post('/api/auth/biometric/verify', credential),
  
  biometricRegister: (credential) => api.post('/api/auth/biometric/register', credential),
};

// ═══════════════════════════════════════════════════════════════
// CHAT API
// ═══════════════════════════════════════════════════════════════

export const chatAPI = {
  // Get all chats with pagination
  getChats: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return api.get(`/api/chats${query ? `?${query}` : ''}`);
  },
  
  // Get single chat
  getChat: (phone) => api.get(`/api/chats/${phone}`),
  
  // Get customer details
  getCustomer: (phone) => api.get(`/api/customers/${phone}`),
  
  // Update chat (star, labels, etc.)
  updateChat: (phone, data) => api.patch(`/api/chats/${phone}`, data),
  
  // Mark chat as read
  markRead: (phone) => api.post(`/api/chats/${phone}/read`),
  
  // Star/unstar chat
  toggleStar: (phone) => api.post(`/api/chats/${phone}/star`),
  
  // Block/unblock
  toggleBlock: (phone) => api.post(`/api/chats/${phone}/block`),
  
  // Add label
  addLabel: (phone, label) => api.post(`/api/chats/${phone}/labels`, { label }),
  
  // Remove label
  removeLabel: (phone, label) => api.delete(`/api/chats/${phone}/labels/${label}`),
  
  // Add note
  addNote: (phone, note) => api.post(`/api/customers/${phone}/notes`, { note }),
  
  // Get chat statistics
  getStats: () => api.get('/api/chats/stats'),
};

// ═══════════════════════════════════════════════════════════════
// MESSAGE API
// ═══════════════════════════════════════════════════════════════

export const messageAPI = {
  // Get messages for a chat
  getMessages: (phone, params = {}) => {
    const query = new URLSearchParams(params).toString();
    return api.get(`/api/chats/${phone}/messages${query ? `?${query}` : ''}`);
  },
  
  // Send text message
  sendText: (phone, text) => api.post('/api/messages/send', {
    phone,
    type: 'text',
    text,
  }),
  
  // Send message with buttons
  sendButtons: (phone, text, buttons) => api.post('/api/messages/send', {
    phone,
    type: 'buttons',
    text,
    buttons,
  }),
  
  // Send list message
  sendList: (phone, text, list) => api.post('/api/messages/send', {
    phone,
    type: 'list',
    text,
    list,
  }),
  
  // Send image
  sendImage: (phone, mediaUrl, caption) => api.post('/api/messages/send', {
    phone,
    type: 'image',
    mediaUrl,
    mediaCaption: caption,
  }),
  
  // Send document
  sendDocument: (phone, mediaUrl, filename, caption) => api.post('/api/messages/send', {
    phone,
    type: 'document',
    mediaUrl,
    filename,
    mediaCaption: caption,
  }),
  
  // Send template
  sendTemplate: (phone, templateName, params, language = 'en') => api.post('/api/messages/send-template', {
    phone,
    templateName,
    params,
    language,
  }),
  
  // Send product
  sendProduct: (phone, productSku) => api.post('/api/messages/send-product', {
    phone,
    sku: productSku,
  }),
  
  // Send order update
  sendOrderUpdate: (phone, orderId, status) => api.post('/api/messages/send-order-update', {
    phone,
    orderId,
    status,
  }),
  
  // Bulk send (small batches)
  bulkSend: (phones, message) => api.post('/api/messages/bulk-send', {
    phones,
    ...message,
  }),
  
  // Mark as read (WhatsApp)
  markRead: (messageId) => api.post('/api/messages/mark-read', { messageId }),
};

// ═══════════════════════════════════════════════════════════════
// ORDER API
// ═══════════════════════════════════════════════════════════════

export const orderAPI = {
  // Get all orders
  getOrders: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return api.get(`/api/orders${query ? `?${query}` : ''}`);
  },
  
  // Get single order
  getOrder: (orderId) => api.get(`/api/orders/${orderId}`),
  
  // Create order (from chat)
  createOrder: (data) => api.post('/api/orders', data),
  
  // Update order status
  updateStatus: (orderId, status, notes) => api.patch(`/api/orders/${orderId}/status`, {
    status,
    notes,
  }),
  
  // Confirm order
  confirm: (orderId) => api.post(`/api/orders/${orderId}/confirm`),
  
  // Cancel order
  cancel: (orderId, reason) => api.post(`/api/orders/${orderId}/cancel`, { reason }),
  
  // Create payment link
  createPaymentLink: (orderId) => api.post(`/api/orders/${orderId}/payment-link`),
  
  // Ship order (create shipment)
  ship: (orderId, shipmentData) => api.post(`/api/orders/${orderId}/ship`, shipmentData),
  
  // Get tracking info
  getTracking: (orderId) => api.get(`/api/orders/${orderId}/tracking`),
  
  // Add internal note
  addNote: (orderId, note) => api.post(`/api/orders/${orderId}/notes`, { note }),
  
  // Get order stats
  getStats: () => api.get('/api/orders/stats'),
};

// ═══════════════════════════════════════════════════════════════
// PRODUCT API
// ═══════════════════════════════════════════════════════════════

export const productAPI = {
  // Get all products
  getProducts: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return api.get(`/api/products${query ? `?${query}` : ''}`);
  },
  
  // Get single product
  getProduct: (sku) => api.get(`/api/products/${sku}`),
  
  // Create product
  createProduct: (data) => api.post('/api/products', data),
  
  // Update product
  updateProduct: (sku, data) => api.patch(`/api/products/${sku}`, data),
  
  // Update stock
  updateStock: (sku, stock) => api.patch(`/api/products/${sku}/stock`, { stock }),
  
  // Delete product
  deleteProduct: (sku) => api.delete(`/api/products/${sku}`),
  
  // Get categories
  getCategories: () => api.get('/api/products/categories'),
  
  // Search products
  search: (query) => api.get(`/api/products/search?q=${encodeURIComponent(query)}`),
};

// ═══════════════════════════════════════════════════════════════
// DASHBOARD/ANALYTICS API
// ═══════════════════════════════════════════════════════════════

export const dashboardAPI = {
  // Get dashboard stats
  getStats: () => api.get('/api/stats'),
  
  // Get detailed analytics
  getAnalytics: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return api.get(`/api/analytics${query ? `?${query}` : ''}`);
  },
  
  // Get recent activities
  getActivities: (limit = 20) => api.get(`/api/analytics/activities?limit=${limit}`),
  
  // Get pending actions
  getPendingActions: () => api.get('/api/analytics/pending'),
};

// ═══════════════════════════════════════════════════════════════
// FASHION VIDEO STUDIO API
// ═══════════════════════════════════════════════════════════════

// This endpoint is deliberately read-only. The local KAAPAV video factory is
// the sole executor; the dashboard must never submit Flow jobs or publish a
// release from the browser.
export const studioAPI = {
  getStatus: () => api.get('/api/studio/status'),
};
 
// ═══════════════════════════════════════════════════════════════
// SETTINGS API
// ═══════════════════════════════════════════════════════════════

export const settingsAPI = {
  get: async () => {
    const res = await fetch(`${API_BASE}/api/settings`, { headers: getHeaders() });
    return res.json();
  },
  update: async (data) => {
    const res = await fetch(`${API_BASE}/api/settings`, {
      method: 'PUT', headers: getHeaders(), body: JSON.stringify(data)
    });
    return res.json();
  },
  testWhatsApp: async (phone) => {
    const res = await fetch(`${API_BASE}/api/settings/test-whatsapp`, {
      method: 'POST', headers: getHeaders(), body: JSON.stringify({ phone })
    });
    return res.json();
  }
};

// ═══════════════════════════════════════════════════════════════
// QUICK REPLIES & TEMPLATES API
// ═══════════════════════════════════════════════════════════════

export const templateAPI = {
  // Quick Replies
  getQuickReplies: () => api.get('/api/quick-replies'),
  createQuickReply: (data) => api.post('/api/quick-replies', data),
  updateQuickReply: (id, data) => api.patch(`/api/quick-replies/${id}`, data),
  deleteQuickReply: (id) => api.delete(`/api/quick-replies/${id}`),
  
  // Templates
  getTemplates: () => api.get('/api/templates'),
  createTemplate: (data) => api.post('/api/templates', data),
  
  // Labels
  getLabels: () => api.get('/api/labels'),
  createLabel: (data) => api.post('/api/labels', data),
  deleteLabel: (id) => api.delete(`/api/labels/${id}`),
};

// ═══════════════════════════════════════════════════════════════
// BROADCAST API
// ═══════════════════════════════════════════════════════════════

export const broadcastAPI = {
  getBroadcasts: () => api.get('/api/broadcasts'),
  
  getBroadcast: (id) => api.get(`/api/broadcasts/${id}`),
  
  createBroadcast: (data) => api.post('/api/broadcasts', data),
  
  startBroadcast: (id) => api.post(`/api/broadcasts/${id}/start`),
  
  cancelBroadcast: (id) => api.post(`/api/broadcasts/${id}/cancel`),
  
  getRecipients: (id) => api.get(`/api/broadcasts/${id}/recipients`),
};


// ═══════════════════════════════════════════════════════════════
// PAYMENT API
// ═══════════════════════════════════════════════════════════════

export const paymentAPI = {
  createLink: (orderId, amount) => api.post('/api/payments/create-link', {
    orderId,
    amount,
  }),
  
  getStatus: (paymentId) => api.get(`/api/payments/${paymentId}`),
  
  refund: (paymentId, amount) => api.post(`/api/payments/${paymentId}/refund`, { amount }),
};

// ═══════════════════════════════════════════════════════════════
// SHIPPING API (Shiprocket)
// ═══════════════════════════════════════════════════════════════

export const shippingAPI = {
  checkServiceability: (pincode) => api.get(`/api/shipping/serviceability/${pincode}`),
  
  createShipment: (orderId, data) => api.post(`/api/shipping/create`, {
    orderId,
    ...data,
  }),
  
  getTracking: (awbNumber) => api.get(`/api/shipping/track/${awbNumber}`),
  
  generateLabel: (shipmentId) => api.get(`/api/shipping/label/${shipmentId}`),
  
  cancelShipment: (shipmentId) => api.post(`/api/shipping/cancel/${shipmentId}`),
};

// ═══════════════════════════════════════════════════════════════
// PUSH NOTIFICATIONS API
// ═══════════════════════════════════════════════════════════════

export const pushAPI = {
  subscribe: (subscription) => api.post('/api/push/subscribe', subscription),
  
  unsubscribe: () => api.post('/api/push/unsubscribe'),
  
  test: () => api.post('/api/push/test'),
};

// ═══════════════════════════════════════════════════════════════
// EXPORT DEFAULT CLIENT FOR ADVANCED USE
// ═══════════════════════════════════════════════════════════════

export default api;

// Process offline queue when back online
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    useUIStore.getState().setOffline(false);
    api.processOfflineQueue();
  });
  
  window.addEventListener('offline', () => {
    useUIStore.getState().setOffline(true);
  });
}
