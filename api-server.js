/**
 * AI Agent Guard REST API Server
 * 提供HTTP接口供外部调用
 */

const http = require('http');
const url = require('url');
const Integrator = require('./integrator/index.js');

// ========== 配置 ==========
const PORT = process.env.PORT || 18791;
const HOST = process.env.HOST || '0.0.0.0';

// ========== 初始化集成器 ==========
const guard = new Integrator({
  evalModel: process.env.EVAL_MODEL || 'local',
  defaultScenario: process.env.DEFAULT_SCENARIO || 'general'
});

// ========== 工具函数 ==========
function jsonResponse(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data, null, 2));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
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

// 输入消毒
function sanitizeInput(input, maxLength = 100000) {
  if (typeof input !== 'string') return '';
  return input
    .slice(0, maxLength)
    .replace(/[<>]/g, '')
    .trim();
}

// ========== 路由处理 ==========

const routes = {
  // 健康检查
  'GET /health': async (req, res) => {
    const status = guard.getStatus();
    jsonResponse(res, 200, {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      modules: status
    });
  },

  // 评估输出
  'POST /evaluate': async (req, res) => {
    try {
      const body = await parseBody(req);
      const { output, task, model } = body;
      
      if (!output) {
        return jsonResponse(res, 400, { error: 'output is required' });
      }
      
      const cleanOutput = sanitizeInput(output);
      const cleanTask = sanitizeInput(task || '', 5000);
      
      // 传递model参数给评估引擎
      const context = model ? { selectedModel: model } : {};
      const result = await guard.evaluate(cleanOutput, cleanTask, context);
      
      jsonResponse(res, 200, {
        success: true,
        data: result
      });
    } catch (e) {
      jsonResponse(res, 500, { error: e.message });
    }
  },

  // 约束检查
  'POST /check': async (req, res) => {
    try {
      const body = await parseBody(req);
      const { content } = body;
      
      if (!content) {
        return jsonResponse(res, 400, { error: 'content is required' });
      }
      
      const cleanContent = sanitizeInput(content);
      const result = guard.checkConstraints(cleanContent);
      
      jsonResponse(res, 200, {
        success: true,
        data: result
      });
    } catch (e) {
      jsonResponse(res, 500, { error: e.message });
    }
  },

  // 收敛检测
  'POST /convergence': async (req, res) => {
    try {
      const body = await parseBody(req);
      const { score, text } = body;
      
      if (typeof score !== 'number') {
        return jsonResponse(res, 400, { error: 'score is required and must be a number' });
      }
      
      const cleanText = sanitizeInput(text || '', 10000);
      const result = guard.recordAndCheck(score, cleanText);
      
      jsonResponse(res, 200, {
        success: true,
        data: result
      });
    } catch (e) {
      jsonResponse(res, 500, { error: e.message });
    }
  },

  // 相似度计算
  'POST /similarity': async (req, res) => {
    try {
      const body = await parseBody(req);
      const { text1, text2 } = body;
      
      if (!text1 || !text2) {
        return jsonResponse(res, 400, { error: 'text1 and text2 are required' });
      }
      
      const cleanText1 = sanitizeInput(text1, 5000);
      const cleanText2 = sanitizeInput(text2, 5000);
      
      const similarity = guard.calculateSimilarity(cleanText1, cleanText2);
      
      jsonResponse(res, 200, {
        success: true,
        data: {
          similarity,
          percentage: Math.round(similarity * 100) + '%'
        }
      });
    } catch (e) {
      jsonResponse(res, 500, { error: e.message });
    }
  },

  // 保存记忆
  'POST /memory': async (req, res) => {
    try {
      const body = await parseBody(req);
      const { taskId, data, scenario } = body;
      
      if (!taskId) {
        return jsonResponse(res, 400, { error: 'taskId is required' });
      }
      
      const cleanTaskId = sanitizeInput(taskId, 200);
      const cleanScenario = sanitizeInput(scenario || 'general', 50);
      
      const result = guard.saveMemory(cleanTaskId, data || {}, cleanScenario);
      
      jsonResponse(res, 200, {
        success: true,
        data: result
      });
    } catch (e) {
      jsonResponse(res, 500, { error: e.message });
    }
  },

  // 获取最佳实践
  'GET /memory/:taskId': async (req, res) => {
    try {
      const taskId = sanitizeInput(req.params.taskId, 200);
      const scenario = sanitizeInput(req.query.scenario || 'general', 50);
      
      const practices = guard.getBestPractices(taskId, scenario);
      
      jsonResponse(res, 200, {
        success: true,
        data: practices
      });
    } catch (e) {
      jsonResponse(res, 500, { error: e.message });
    }
  },

  // 获取配置
  'GET /config': async (req, res) => {
    try {
      const config = {
        evalModel: guard.config.evalModel,
        defaultScenario: guard.config.defaultScenario,
        similarityThreshold: guard.config.similarityThreshold
      };
      
      jsonResponse(res, 200, {
        success: true,
        data: config
      });
    } catch (e) {
      jsonResponse(res, 500, { error: e.message });
    }
  },

  // 更新配置
  'PUT /config': async (req, res) => {
    try {
      const body = await parseBody(req);
      const { evalModel, defaultScenario } = body;
      
      if (evalModel) {
        guard.config.evalModel = sanitizeInput(evalModel, 50);
      }
      if (defaultScenario) {
        guard.config.defaultScenario = sanitizeInput(defaultScenario, 50);
        guard.reloadRules(defaultScenario);
      }
      
      jsonResponse(res, 200, {
        success: true,
        data: guard.config
      });
    } catch (e) {
      jsonResponse(res, 500, { error: e.message });
    }
  },

  // 规则热更新
  'POST /rules/reload': async (req, res) => {
    try {
      const body = await parseBody(req);
      const scenario = sanitizeInput(body.scenario || 'general', 50);
      
      const result = guard.reloadRules(scenario);
      
      jsonResponse(res, 200, {
        success: true,
        data: result
      });
    } catch (e) {
      jsonResponse(res, 500, { error: e.message });
    }
  },

  // 系统状态
  'GET /status': async (req, res) => {
    try {
      const status = guard.getStatus();
      const memory = guard.memoryStore?.getStats ? guard.memoryStore.getStats() : null;
      
      jsonResponse(res, 200, {
        success: true,
        data: {
          modules: status,
          memory: memory,
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage()
        }
      });
    } catch (e) {
      jsonResponse(res, 500, { error: e.message });
    }
  },

  // Prometheus 指标 (公开端点)
  'GET /metrics': async (req, res) => {
    try {
      const memUsage = process.memoryUsage();
      const uptime = process.uptime();
      
      // Prometheus 格式指标
      const metrics = `# HELP agent_guard_uptime_seconds Server uptime in seconds
# TYPE agent_guard_uptime_seconds gauge
agent_guard_uptime_seconds ${uptime}

# HELP agent_guard_memory_heap_used_bytes Memory heap used in bytes
# TYPE agent_guard_memory_heap_used_bytes gauge
agent_guard_memory_heap_used_bytes ${memUsage.heapUsed}

# HELP agent_guard_memory_heap_total_bytes Memory heap total in bytes
# TYPE agent_guard_memory_heap_total_bytes gauge
agent_guard_memory_heap_total_bytes ${memUsage.heapTotal}

# HELP agent_guard_memory_rss_bytes Memory RSS in bytes
# TYPE agent_guard_memory_rss_bytes gauge
agent_guard_memory_rss_bytes ${memUsage.rss}

# HELP agent_guard_info Server info
# TYPE agent_guard_info gauge
agent_guard_info{version="2.4.0"} 1
`;
      
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(metrics);
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(`error: ${e.message}`);
    }
  }
};

// ========== 请求处理 ==========
function handleRequest(req, res) {
  // 记录请求
  const start = Date.now();
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  
  // CORS预检
  if (req.method === 'OPTIONS') {
    return jsonResponse(res, 200, { ok: true });
  }
  
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname.replace(/\/$/, '');
  const method = req.method;
  const key = `${method} ${pathname}`;
  
  // 查找路由
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

// ========== 启动服务器 ==========
const server = http.createServer(handleRequest);

server.listen(PORT, HOST, () => {
  console.log(`
╔══════════════════════════════════════════════════════╗
║      AI Agent Guard API Server                       ║
╠══════════════════════════════════════════════════════╣
║  HTTP Server: http://${HOST}:${PORT}                    ║
║  Health:     http://${HOST}:${PORT}/health              ║
╠══════════════════════════════════════════════════════╣
║  Endpoints:                                          ║
║    POST /evaluate     - 评估输出                     ║
║    POST /check        - 约束检查                     ║
║    POST /convergence  - 收敛检测                     ║
║    POST /similarity   - 相似度计算                   ║
║    POST /memory       - 保存记忆                     ║
║    GET  /memory/:id   - 获取最佳实践                 ║
║    GET  /config       - 获取配置                     ║
║    PUT  /config       - 更新配置                     ║
║    POST /rules/reload - 热更新规则                   ║
║    GET  /status       - 系统状态                     ║
╚══════════════════════════════════════════════════════╝
  `);
});

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('收到SIGTERM，正在关闭...');
  server.close(() => {
    console.log('服务器已关闭');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('收到SIGINT，正在关闭...');
  server.close(() => {
    console.log('服务器已关闭');
    process.exit(0);
  });
});

module.exports = server;
