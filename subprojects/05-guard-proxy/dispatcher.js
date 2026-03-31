/**
 * 指令转发模块
 * 将用户指令转发给OpenClaw Agent
 */

const http = require('http');
const https = require('https');

class Dispatcher {
  constructor(openclawUrl = 'http://127.0.0.1:18789') {
    this.openclawUrl = openclawUrl;
    this.timeout = 120000; // 2分钟超时
  }

  /**
   * 转发任务到OpenClaw isolated session
   * @param {Object} task - 任务对象 { instruction, sessionId, context }
   * @returns {Promise<Object>} Agent响应
   */
  async dispatch(task) {
    const { instruction, sessionId, context = {} } = task;

    if (!instruction) {
      throw new Error('Task instruction is required');
    }

    try {
      // 优先使用 sessions_spawn API
      if (context.useSpawn === true) {
        return await this.spawnSession(task);
      }
      
      // 使用 HTTP API 调用
      return await this.httpDispatch(task);
    } catch (error) {
      console.error('[Dispatcher] Dispatch failed:', error.message);
      throw error;
    }
  }

  /**
   * HTTP API 转发
   */
  async httpDispatch(task) {
    return new Promise((resolve, reject) => {
      const url = new URL(this.openclawUrl);
      const isHttps = url.protocol === 'https:';
      const client = isHttps ? https : http;

      const postData = JSON.stringify({
        instruction: task.instruction,
        sessionId: task.sessionId,
        context: {
          ...task.context,
          isolated: true,
          source: 'guard-proxy'
        }
      });

      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: '/api/sessions/send',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          'X-Guard-Proxy': 'true'
        },
        timeout: this.timeout
      };

      const req = client.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            resolve({
              success: true,
              output: response.output || response.message || data,
              sessionId: response.sessionId,
              metadata: {
                statusCode: res.statusCode,
                source: 'http-api'
              }
            });
          } catch {
            resolve({
              success: true,
              output: data,
              metadata: {
                statusCode: res.statusCode,
                source: 'http-api'
              }
            });
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.write(postData);
      req.end();
    });
  }

  /**
   * 使用 sessions_spawn API
   */
  async spawnSession(task) {
    return new Promise((resolve, reject) => {
      const url = new URL(this.openclawUrl);
      const isHttps = url.protocol === 'https:';
      const client = isHttps ? https : http;

      const postData = JSON.stringify({
        instruction: task.instruction,
        isolated: true,
        context: {
          ...task.context,
          source: 'guard-proxy'
        }
      });

      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: '/api/sessions/spawn',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          'X-Guard-Proxy': 'true'
        },
        timeout: this.timeout
      };

      const req = client.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            resolve({
              success: true,
              output: response.output || response.message || data,
              sessionId: response.sessionId,
              metadata: {
                statusCode: res.statusCode,
                spawned: true,
                source: 'sessions-spawn'
              }
            });
          } catch {
            resolve({
              success: true,
              output: data,
              metadata: {
                statusCode: res.statusCode,
                spawned: true,
                source: 'sessions-spawn'
              }
            });
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Spawn request timeout'));
      });

      req.write(postData);
      req.end();
    });
  }

  /**
   * 健康检查 - 检查OpenClaw Agent是否可用
   */
  async healthCheck() {
    return new Promise((resolve) => {
      const url = new URL(this.openclawUrl);
      const isHttps = url.protocol === 'https:';
      const client = isHttps ? https : http;

      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: '/health',
        method: 'GET',
        timeout: 5000
      };

      const req = client.request(options, (res) => {
        resolve({
          healthy: res.statusCode >= 200 && res.statusCode < 300,
          statusCode: res.statusCode
        });
      });

      req.on('error', (err) => {
        resolve({
          healthy: false,
          error: err.message
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({
          healthy: false,
          error: 'Health check timeout'
        });
      });

      req.end();
    });
  }

  /**
   * 获取配置信息
   */
  getConfig() {
    return {
      openclawUrl: this.openclawUrl,
      timeout: this.timeout
    };
  }
}

module.exports = Dispatcher;
