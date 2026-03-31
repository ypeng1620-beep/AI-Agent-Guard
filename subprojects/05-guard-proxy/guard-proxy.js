/**
 * Agent Guard Proxy - 护卫代理
 * 所有指令和输出经过Proxy过滤
 * 
 * 核心功能：
 * 1. 接收用户指令
 * 2. 转发给OpenClaw Agent
 * 3. 对Agent输出执行5层约束检查
 * 4. 违规→阻断+重试机制
 * 5. 熔断保护
 * 6. 合规→返回用户
 */

const http = require('http');
const url = require('url');

// 导入各模块
const ConstraintChecker = require('./constraint-checker');
const Dispatcher = require('./dispatcher');
const Blocker = require('./blocker');
const RetryController = require('./retry-controller');
const Fuse = require('./fuse');

class GuardProxy {
  constructor(config = {}) {
    this.port = config.port || 18790;
    this.openclawUrl = config.openclawUrl || 'http://127.0.0.1:18789';
    
    // 初始化各模块
    this.checker = new ConstraintChecker(config.rules);
    this.dispatcher = new Dispatcher(this.openclawUrl);
    this.blocker = new Blocker(config.blockerLogPath);
    this.retryController = new RetryController(config.maxRetries || 3);
    this.fuse = new Fuse(config.fuseThreshold || 3);
    
    // 配置
    this.config = {
      maxRetries: config.maxRetries || 3,
      fuseThreshold: config.fuseThreshold || 3,
      enableFuse: config.enableFuse !== false,
      ...config
    };
    
    // 状态
    this.isRunning = false;
    this.server = null;
    this.requestCount = 0;
    this.blockedCount = 0;
    
    // 会话追踪
    this.sessions = new Map();
  }

  /**
   * 启动HTTP服务器
   */
  start() {
    if (this.isRunning) {
      console.log('[GuardProxy] Already running');
      return;
    }

    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res);
    });

    this.server.on('error', (err) => {
      console.error('[GuardProxy] Server error:', err.message);
      if (err.code === 'EADDRINUSE') {
        console.error(`[GuardProxy] Port ${this.port} is already in use`);
      }
    });

    this.server.listen(this.port, () => {
      this.isRunning = true;
      console.log(`[GuardProxy] Guard Proxy started on port ${this.port}`);
      console.log(`[GuardProxy] Forwarding to OpenClaw at ${this.openclawUrl}`);
      console.log(`[GuardProxy] Max retries: ${this.config.maxRetries}`);
      console.log(`[GuardProxy] Fuse threshold: ${this.config.fuseThreshold}`);
    });
  }

  /**
   * 停止服务
   */
  stop() {
    if (this.server) {
      this.server.close();
      this.isRunning = false;
      console.log('[GuardProxy] Guard Proxy stopped');
    }
  }

  /**
   * 处理HTTP请求
   */
  async handleRequest(req, res) {
    const parsedUrl = url.parse(req.url, true);
    
    // 设置CORS头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Guard-Proxy');
    
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // 健康检查端点
    if (parsedUrl.pathname === '/health') {
      const health = await this.getHealth();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(health));
      return;
    }

    // 统计端点
    if (parsedUrl.pathname === '/stats') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(this.getStats()));
      return;
    }

    // 主请求处理
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const task = JSON.parse(body);
          const result = await this.processTask(task);
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (err) {
          console.error('[GuardProxy] Request error:', err.message);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            error: true, 
            message: err.message 
          }));
        }
      });
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  }

  /**
   * 核心处理流程
   * @param {Object} task - 任务对象 { instruction, sessionId, context }
   * @returns {Object} 处理结果
   */
  async processTask(task) {
    this.requestCount++;
    const startTime = Date.now();
    
    const { instruction, sessionId, context = {} } = task;
    
    // 创建会话追踪
    const session = this.getOrCreateSession(sessionId);
    const currentRound = session.round;
    
    console.log(`[GuardProxy] Processing task (round ${currentRound})`);
    
    // 检查熔断
    if (this.config.enableFuse && this.fuse.isBlown()) {
      console.log('[GuardProxy] Fuse blown, rejecting request');
      return {
        error: true,
        message: '服务暂时不可用（熔断保护）',
        fuseState: this.fuse.getState(),
        retryAfter: 30
      };
    }

    // 转发给OpenClaw Agent
    let agentOutput;
    try {
      const response = await this.dispatcher.dispatch({
        instruction,
        sessionId,
        context: {
          ...context,
          currentRound,
          source: 'guard-proxy'
        }
      });
      agentOutput = response.output;
    } catch (err) {
      console.error('[GuardProxy] Dispatch error:', err.message);
      return {
        error: true,
        message: `Agent调用失败: ${err.message}`
      };
    }

    // 执行约束检查
    const checkResult = this.checker.check(agentOutput, { currentRound });

    if (checkResult.passed) {
      // 检查通过，重置熔断计数
      if (this.config.enableFuse) {
        this.fuse.reset();
      }
      session.round++;
      
      return {
        success: true,
        output: agentOutput,
        passed: true,
        stats: {
          round: currentRound,
          checkDuration: Date.now() - startTime,
          scores: checkResult.scores
        }
      };
    }

    // 违规处理
    console.log(`[GuardProxy] Violations found: ${checkResult.violations.length}`);
    this.blockedCount++;
    
    // 记录违规
    if (this.config.enableFuse) {
      this.fuse.recordViolation();
      console.log(`[GuardProxy] Fuse count: ${this.fuse.violationCount}/${this.fuse.threshold}`);
    }

    // 记录被阻断的内容
    this.blocker.block(agentOutput, checkResult.violations, {
      sessionId,
      round: currentRound,
      scores: checkResult.scores
    });

    // 检查是否可重试
    const retryCount = session.retryCount || 0;
    
    if (this.retryController.canRetry(retryCount)) {
      // 生成修正指令并重试
      session.retryCount = retryCount + 1;
      
      const retryInstruction = this.retryController.generateRetryInstruction(
        instruction,
        checkResult.violations,
        retryCount
      );

      console.log(`[GuardProxy] Retrying (${retryCount + 1}/${this.config.maxRetries})`);
      
      // 递归处理重试（限制深度防止无限循环）
      if (retryCount < this.config.maxRetries - 1) {
        return await this.processRetry({
          ...task,
          instruction: retryInstruction.instruction,
          context: {
            ...task.context,
            ...retryInstruction.context,
            isRetry: true,
            retryCount: retryCount + 1
          }
        }, session);
      }
    }

    // 重试次数用尽，熔断并返回错误
    if (this.config.enableFuse && this.fuse.isBlown()) {
      console.log('[GuardProxy] Fuse blown after max retries');
    }

    return {
      error: true,
      message: '内容不合规，已达到最大重试次数',
      violations: checkResult.violations,
      fuseState: this.config.enableFuse ? this.fuse.getState() : null,
      blocked: true,
      stats: {
        totalRetries: retryCount + 1,
        totalDuration: Date.now() - startTime
      }
    };
  }

  /**
   * 处理重试
   */
  async processRetry(task, session) {
    const retryTask = {
      instruction: task.instruction,
      sessionId: task.sessionId,
      context: {
        ...task.context,
        currentRound: session.round,
        isRetry: true
      }
    };
    
    const result = await this.processTask(retryTask);
    
    // 如果重试成功，返回原始任务的上下文
    if (result.success) {
      return result;
    }
    
    // 重试也失败
    return {
      ...result,
      originalRound: session.round,
      retryFailed: true
    };
  }

  /**
   * 获取或创建会话
   */
  getOrCreateSession(sessionId) {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        round: 0,
        retryCount: 0,
        createdAt: Date.now(),
        lastActivity: Date.now()
      });
    }
    
    const session = this.sessions.get(sessionId);
    session.lastActivity = Date.now();
    
    // 清理过期的会话（1小时无活动）
    if (Date.now() - session.lastActivity > 3600000) {
      session.round = 0;
      session.retryCount = 0;
    }
    
    return session;
  }

  /**
   * 获取健康状态
   */
  async getHealth() {
    const agentHealth = await this.dispatcher.healthCheck();
    
    return {
      status: this.isRunning ? 'running' : 'stopped',
      port: this.port,
      agent: agentHealth,
      fuse: this.config.enableFuse ? this.fuse.getStats() : null,
      uptime: process.uptime()
    };
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      requestCount: this.requestCount,
      blockedCount: this.blockedCount,
      blockRate: this.requestCount > 0 
        ? (this.blockedCount / this.requestCount * 100).toFixed(2) + '%' 
        : '0%',
      activeSessions: this.sessions.size,
      fuse: this.config.enableFuse ? this.fuse.getStats() : null,
      config: {
        maxRetries: this.config.maxRetries,
        fuseThreshold: this.config.fuseThreshold
      }
    };
  }

  /**
   * 更新配置
   */
  updateConfig(newConfig) {
    Object.assign(this.config, newConfig);
    
    if (newConfig.rules) {
      this.checker.updateRules(newConfig.rules);
    }
    
    if (newConfig.maxRetries !== undefined) {
      this.retryController.maxRetries = newConfig.maxRetries;
    }
    
    if (newConfig.fuseThreshold !== undefined) {
      this.fuse.threshold = newConfig.fuseThreshold;
    }
    
    console.log('[GuardProxy] Configuration updated');
  }
}

// 如果直接运行此文件
if (require.main === module) {
  const fs = require('fs');
  const path = require('path');
  
  // 尝试加载配置
  const configPath = path.join(__dirname, 'config.json');
  let config = {};
  
  if (fs.existsSync(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      console.log('[GuardProxy] Loaded config from config.json');
    } catch (err) {
      console.error('[GuardProxy] Failed to load config:', err.message);
    }
  }
  
  // 启动服务
  const guardProxy = new GuardProxy(config);
  guardProxy.start();
  
  // 优雅退出
  process.on('SIGINT', () => {
    console.log('\n[GuardProxy] Shutting down...');
    guardProxy.stop();
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    console.log('\n[GuardProxy] Shutting down...');
    guardProxy.stop();
    process.exit(0);
  });
}

module.exports = GuardProxy;
