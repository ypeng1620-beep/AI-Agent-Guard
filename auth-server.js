/**
 * AI Agent Guard WebSocket + 认证 + 限流服务器
 * 基于 api-server.js 扩展
 */

const http = require('http');
const url = require('url');
const crypto = require('crypto');
const Integrator = require('./integrator/index.js');

// ========== 配置 ==========
const PORT = process.env.PORT || 18791;
const HOST = process.env.HOST || '0.0.0.0';

// 限流配置
const RATE_LIMIT = {
  windowMs: 60 * 1000, // 1分钟窗口
  maxRequests: 100, // 每窗口最大请求数
  maxBodySize: 1024 * 1024 // 1MB
};

// ========== 初始化 ==========
const guard = new Integrator({
  evalModel: process.env.EVAL_MODEL || 'local',
  defaultScenario: process.env.DEFAULT_SCENARIO || 'general'
});

// ========== 限流器 ==========
class RateLimiter {
  constructor() {
    this.requests = new Map();
    this.cleanup();
  }

  cleanup() {
    setInterval(() => {
      const now = Date.now();
      for (const [key, data] of this.requests.entries()) {
        if (now - data.windowStart > RATE_LIMIT.windowMs) {
          this.requests.delete(key);
        }
      }
    }, RATE_LIMIT.windowMs);
  }

  check(ip) {
    const now = Date.now();
    let data = this.requests.get(ip);
    
    if (!data || now - data.windowStart > RATE_LIMIT.windowMs) {
      data = { count: 0, windowStart: now };
      this.requests.set(ip, data);
    }
    
    data.count++;
    
    if (data.count > RATE_LIMIT.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        reset: Math.ceil((data.windowStart + RATE_LIMIT.windowMs - now) / 1000)
      };
    }
    
    return {
      allowed: true,
      remaining: RATE_LIMIT.maxRequests - data.count,
      reset: Math.ceil((data.windowStart + RATE_LIMIT.windowMs - now) / 1000)
    };
  }
}

const rateLimiter = new RateLimiter();

// ========== 认证 ==========
class Auth {
  constructor() {
    // 简单API Key认证，生产环境应使用数据库存储
    this.apiKeys = new Map();
    this.sessions = new Map();
    
    // 默认API Key (生产环境应通过环境变量设置)
    const defaultKey = process.env.API_KEY || 'guard-' + crypto.randomBytes(16).toString('hex');
    this.apiKeys.set(defaultKey, {
      name: 'default',
      created: Date.now(),
      rateLimit: 1000 // 每分钟1000请求
    });
    
    if (!process.env.API_KEY) {
      console.log(`\n🔑 Default API Key: ${defaultKey}\n`);
    }
  }

  generateKey() {
    const key = 'guard-' + crypto.randomBytes(16).toString('hex');
    this.apiKeys.set(key, {
      name: 'user',
      created: Date.now(),
      rateLimit: RATE_LIMIT.maxRequests
    });
    return key;
  }

  validateKey(key) {
    return this.apiKeys.has(key);
  }

  createToken(key) {
    const token = crypto.randomBytes(32).toString('hex');
    this.sessions.set(token, {
      apiKey: key,
      created: Date.now(),
      lastActivity: Date.now()
    });
    return token;
  }

  validateToken(token) {
    const session = this.sessions.get(token);
    if (!session) return false;
    
    // 30分钟超时
    if (Date.now() - session.lastActivity > 30 * 60 * 1000) {
      this.sessions.delete(token);
      return false;
    }
    
    session.lastActivity = Date.now();
    return true;
  }

  revokeToken(token) {
    this.sessions.delete(token);
  }
}

const auth = new Auth();

// ========== WebSocket 支持 ==========
const WebSocket = (() => {
  try {
    return require('ws');
  } catch (e) {
    return null;
  }
})();

let wss = null;
const wsClients = new Set();

function initWebSocket(server) {
  if (!WebSocket) {
    console.log('⚠️ ws module not found, WebSocket disabled');
    return;
  }
  
  wss = new WebSocket.Server({ server });
  
  wss.on('connection', (ws, req) => {
    const ip = req.socket.remoteAddress;
    wsClients.add(ws);
    console.log(`[WS] Client connected: ${ip}, total: ${wsClients.size}`);
    
    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message);
        const response = await handleWebSocketMessage(data);
        ws.send(JSON.stringify(response));
      } catch (e) {
        ws.send(JSON.stringify({ error: e.message }));
      }
    });
    
    ws.on('close', () => {
      wsClients.delete(ws);
      console.log(`[WS] Client disconnected, total: ${wsClients.size}`);
    });
    
    ws.on('error', (e) => {
      console.error('[WS] Error:', e.message);
      wsClients.delete(ws);
    });
  });
  
  console.log('[WS] WebSocket server initialized');
}

async function handleWebSocketMessage(data) {
  const { type, action, payload, token } = data;
  
  // 验证认证
  if (action !== 'auth' && !auth.validateToken(token)) {
    return { error: 'Unauthorized', code: 401 };
  }
  
  switch (action) {
    case 'auth':
      if (auth.validateKey(payload.apiKey)) {
        const token = auth.createToken(payload.apiKey);
        return { success: true, token };
      }
      return { error: 'Invalid API Key', code: 401 };
    
    case 'evaluate':
      const evalResult = await guard.evaluate(payload.output, payload.task);
      return { success: true, data: evalResult };
    
    case 'check':
      const checkResult = guard.checkConstraints(payload.content);
      return { success: true, data: checkResult };
    
    case 'convergence':
      const convResult = guard.recordAndCheck(payload.score, payload.text);
      return { success: true, data: convResult };
    
    case 'similarity':
      const simResult = guard.calculateSimilarity(payload.text1, payload.text2);
      return { success: true, data: { similarity: simResult } };
    
    case 'subscribe':
      return { success: true, subscribed: true };
    
    default:
      return { error: 'Unknown action', code: 400 };
  }
}

function broadcastToClients(message) {
  if (!wss) return;
  
  const data = JSON.stringify(message);
  for (const client of wsClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

// ========== 工具函数 ==========
function jsonResponse(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key'
  });
  res.end(JSON.stringify(data, null, 2));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      if (body.length > RATE_LIMIT.maxBodySize) {
        reject(new Error('Request body too large'));
        return;
      }
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function sanitizeInput(input, maxLength = 100000) {
  if (typeof input !== 'string') return '';
  
  return input
    .slice(0, maxLength)
    // 移除null字节和其他控制字符
    .replace(/[\x00-\x1F\x7F]/g, '')
    // 移除HTML标签（更全面的匹配）
    .replace(/<[^>]*>/gi, '')
    // 移除HTML实体编码
    .replace(/&[#\w]+;/gi, '')
    // 移除数据URL协议
    .replace(/data:[^,;]*,/gi, '')
    .trim();
}

function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() 
    || req.socket.remoteAddress;
}

// ========== 中间件 ==========
function rateLimitMiddleware(req, res, next) {
  const ip = getClientIP(req);
  const result = rateLimiter.check(ip);
  
  res.setHeader('X-RateLimit-Limit', RATE_LIMIT.maxRequests);
  res.setHeader('X-RateLimit-Remaining', result.remaining);
  res.setHeader('X-RateLimit-Reset', result.reset);
  
  if (!result.allowed) {
    return jsonResponse(res, 429, {
      error: 'Too Many Requests',
      retryAfter: result.reset
    });
  }
  
  next();
}

function authMiddleware(req, res, next) {
  // 公开端点不需要认证
  const publicPaths = ['/health', '/api-key', '/ws'];
  if (publicPaths.some(p => req.path.startsWith(p))) {
    return next();
  }
  
  const apiKey = req.headers['x-api-key'];
  const authHeader = req.headers['authorization'];
  
  if (apiKey && auth.validateKey(apiKey)) {
    req.apiKey = apiKey;
    return next();
  }
  
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    if (auth.validateToken(token)) {
      req.token = token;
      return next();
    }
  }
  
  // 开发环境允许匿名访问
  if (process.env.NODE_ENV !== 'production') {
    return next();
  }
  
  return jsonResponse(res, 401, { error: 'Unauthorized' });
}

// ========== 路由处理 ==========
const routes = {
  'GET /health': async (req, res) => {
    const status = guard.getStatus();
    jsonResponse(res, 200, {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      wsClients: wsClients.size,
      rateLimit: {
        activeIPs: rateLimiter.requests.size
      },
      modules: status
    });
  },

  'POST /api-key': async (req, res) => {
    const body = await parseBody(req);
    const action = body.action;
    
    if (action === 'generate') {
      const key = auth.generateKey();
      jsonResponse(res, 200, { success: true, apiKey: key });
    } else if (action === 'validate') {
      const { apiKey } = body;
      const valid = auth.validateKey(apiKey);
      jsonResponse(res, 200, { valid });
    } else {
      jsonResponse(res, 400, { error: 'Invalid action' });
    }
  },

  'POST /evaluate': async (req, res) => {
    const body = await parseBody(req);
    const { output, task } = body;
    
    if (!output) {
      return jsonResponse(res, 400, { error: 'output is required' });
    }
    
    const cleanOutput = sanitizeInput(output);
    const cleanTask = sanitizeInput(task || '', 5000);
    
    const result = await guard.evaluate(cleanOutput, cleanTask);
    
    // WebSocket广播
    broadcastToClients({ type: 'eval', data: result });
    
    jsonResponse(res, 200, { success: true, data: result });
  },

  'POST /check': async (req, res) => {
    const body = await parseBody(req);
    const { content } = body;
    
    if (!content) {
      return jsonResponse(res, 400, { error: 'content is required' });
    }
    
    const cleanContent = sanitizeInput(content);
    const result = guard.checkConstraints(cleanContent);
    
    jsonResponse(res, 200, { success: true, data: result });
  },

  'POST /convergence': async (req, res) => {
    const body = await parseBody(req);
    const { score, text } = body;
    
    if (typeof score !== 'number') {
      return jsonResponse(res, 400, { error: 'score is required' });
    }
    
    const cleanText = sanitizeInput(text || '', 10000);
    const result = guard.recordAndCheck(score, cleanText);
    
    jsonResponse(res, 200, { success: true, data: result });
  },

  'POST /similarity': async (req, res) => {
    const body = await parseBody(req);
    const { text1, text2 } = body;
    
    if (!text1 || !text2) {
      return jsonResponse(res, 400, { error: 'text1 and text2 are required' });
    }
    
    const similarity = guard.calculateSimilarity(text1, text2);
    
    jsonResponse(res, 200, {
      success: true,
      data: { similarity, percentage: Math.round(similarity * 100) + '%' }
    });
  },

  'POST /memory': async (req, res) => {
    const body = await parseBody(req);
    const { taskId, data, scenario } = body;
    
    if (!taskId) {
      return jsonResponse(res, 400, { error: 'taskId is required' });
    }
    
    const cleanTaskId = sanitizeInput(taskId, 200);
    const result = guard.saveMemory(cleanTaskId, data || {});
    
    jsonResponse(res, 200, { success: true, data: result });
  },

  'GET /memory/:taskId': async (req, res) => {
    const taskId = sanitizeInput(req.params.taskId, 200);
    const scenario = sanitizeInput(req.query.scenario || 'general', 50);
    
    const practices = guard.getBestPractices(taskId, scenario);
    
    jsonResponse(res, 200, { success: true, data: practices });
  },

  'GET /status': async (req, res) => {
    const status = guard.getStatus();
    const memory = guard.memoryStore?.getStats ? guard.memoryStore.getStats() : null;
    
    jsonResponse(res, 200, {
      success: true,
      data: {
        modules: status,
        memory,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        ws: { clients: wsClients.size },
        rateLimit: { activeIPs: rateLimiter.requests.size }
      }
    });
  },

  'POST /rules/reload': async (req, res) => {
    const body = await parseBody(req);
    const scenario = sanitizeInput(body.scenario || 'general', 50);
    
    const result = guard.reloadRules(scenario);
    
    jsonResponse(res, 200, { success: true, data: result });
  }
};

// ========== 请求处理 ==========
function handleRequest(req, res) {
  const start = Date.now();
  const ip = getClientIP(req);
  
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} (${ip})`);
  
  if (req.method === 'OPTIONS') {
    return jsonResponse(res, 200, { ok: true });
  }
  
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname.replace(/\/$/, '');
  const method = req.method;
  const key = `${method} ${pathname}`;
  
  const handler = routes[key];
  
  if (handler) {
    req.params = {};
    req.query = parsed.query;
    handler(req, res).catch(e => {
      console.error('Handler error:', e);
      jsonResponse(res, 500, { error: 'Internal server error' });
    });
  } else {
    jsonResponse(res, 404, { error: 'Not found' });
  }
}

// ========== 启动 ==========
const server = http.createServer((req, res) => {
  rateLimitMiddleware(req, res, () => {
    authMiddleware(req, res, () => {
      handleRequest(req, res);
    });
  });
});

server.listen(PORT, HOST, () => {
  initWebSocket(server);
  
  console.log(`
╔══════════════════════════════════════════════════════╗
║     AI Agent Guard API Server v2.1                  ║
╠══════════════════════════════════════════════════════╣
║  HTTP:    http://${HOST}:${PORT}                       ║
║  WebSocket: ws://${HOST}:${PORT}                       ║
║  Health:  http://${HOST}:${PORT}/health                 ║
╠══════════════════════════════════════════════════════╣
║  Features:                                          ║
║    ✓ REST API (11 endpoints)                        ║
║    ✓ WebSocket real-time                           ║
║    ✓ API Key authentication                         ║
║    ✓ Rate limiting (100 req/min)                    ║
║    ✓ Input sanitization                            ║
╚══════════════════════════════════════════════════════╝
  `);
});

process.on('SIGTERM', () => {
  console.log('正在关闭...');
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('正在关闭...');
  server.close(() => process.exit(0));
});

module.exports = server;
