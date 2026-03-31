/**
 * Redis 适配器
 * 支持分布式限流、记忆存储、会话管理
 */

const fs = require('fs');
const path = require('path');

class RedisAdapter {
  constructor(config = {}) {
    this.config = {
      host: config.host || 'localhost',
      port: config.port || 6379,
      password: config.password || null,
      db: config.db || 0,
      keyPrefix: config.keyPrefix || 'agent-guard:',
      ...config
    };
    
    this.client = null;
    this.connected = false;
    this.fallbackToMemory = config.fallbackToMemory !== false;
    this.memoryStore = new Map();
  }

  /**
   * 连接到 Redis
   */
  async connect() {
    try {
      // 尝试使用 ioredis
      let Redis;
      try {
        Redis = require('ioredis');
      } catch (e) {
        // 如果没有 ioredis，使用内置兼容模式
        console.log('[RedisAdapter] ioredis not found, using memory fallback');
        return;
      }
      
      this.client = new Redis({
        host: this.config.host,
        port: this.config.port,
        password: this.config.password,
        db: this.config.db,
        retryStrategy: (times) => {
          if (times > 3) {
            console.log('[RedisAdapter] Max retries reached, using memory fallback');
            return null;
          }
          return Math.min(times * 100, 3000);
        },
        lazyConnect: true
      });

      await this.client.connect();
      this.connected = true;
      console.log(`[RedisAdapter] Connected to ${this.config.host}:${this.config.port}`);
    } catch (e) {
      console.log(`[RedisAdapter] Connection failed: ${e.message}, using memory fallback`);
      this.connected = false;
    }
  }

  /**
   * 断开连接
   */
  async disconnect() {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      this.connected = false;
    }
  }

  /**
   * 获取键名
   */
  key(name) {
    return this.config.keyPrefix + name;
  }

  // ========== String 操作 ==========
  async get(key) {
    const fullKey = this.key(key);
    if (this.connected && this.client) {
      return await this.client.get(fullKey);
    }
    return this.memoryStore.get(fullKey) || null;
  }

  async set(key, value, options = {}) {
    const fullKey = this.key(key);
    if (this.connected && this.client) {
      if (options.ttl) {
        await this.client.setex(fullKey, options.ttl, value);
      } else {
        await this.client.set(fullKey, value);
      }
      return true;
    }
    this.memoryStore.set(fullKey, value);
    return true;
  }

  async del(key) {
    const fullKey = this.key(key);
    if (this.connected && this.client) {
      await this.client.del(fullKey);
      return true;
    }
    this.memoryStore.delete(fullKey);
    return true;
  }

  // ========== Hash 操作 ==========
  async hget(key, field) {
    const fullKey = this.key(key);
    if (this.connected && this.client) {
      return await this.client.hget(fullKey, field);
    }
    const hash = this.memoryStore.get(fullKey) || {};
    return hash[field] || null;
  }

  async hset(key, field, value) {
    const fullKey = this.key(key);
    if (this.connected && this.client) {
      await this.client.hset(fullKey, field, value);
      return true;
    }
    const hash = this.memoryStore.get(fullKey) || {};
    hash[field] = value;
    this.memoryStore.set(fullKey, hash);
    return true;
  }

  async hgetall(key) {
    const fullKey = this.key(key);
    if (this.connected && this.client) {
      return await this.client.hgetall(fullKey);
    }
    return this.memoryStore.get(fullKey) || {};
  }

  async hmset(key, data) {
    const fullKey = this.key(key);
    if (this.connected && this.client) {
      await this.client.hmset(fullKey, data);
      return true;
    }
    const hash = this.memoryStore.get(fullKey) || {};
    this.memoryStore.set(fullKey, { ...hash, ...data });
    return true;
  }

  // ========== List 操作 ==========
  async lpush(key, value) {
    const fullKey = this.key(key);
    if (this.connected && this.client) {
      await this.client.lpush(fullKey, value);
      return true;
    }
    const list = this.memoryStore.get(fullKey) || [];
    list.unshift(value);
    this.memoryStore.set(fullKey, list);
    return true;
  }

  async lrange(key, start, stop) {
    const fullKey = this.key(key);
    if (this.connected && this.client) {
      return await this.client.lrange(fullKey, start, stop);
    }
    const list = this.memoryStore.get(fullKey) || [];
    return list.slice(start, stop === -1 ? undefined : stop + 1);
  }

  async ltrim(key, start, stop) {
    const fullKey = this.key(key);
    if (this.connected && this.client) {
      await this.client.ltrim(fullKey, start, stop);
      return true;
    }
    const list = this.memoryStore.get(fullKey) || [];
    this.memoryStore.set(fullKey, list.slice(start, stop + 1));
    return true;
  }

  // ========== Set 操作 ==========
  async sadd(key, member) {
    const fullKey = this.key(key);
    if (this.connected && this.client) {
      await this.client.sadd(fullKey, member);
      return true;
    }
    const set = new Set(this.memoryStore.get(fullKey) || []);
    set.add(member);
    this.memoryStore.set(fullKey, Array.from(set));
    return true;
  }

  async smembers(key) {
    const fullKey = this.key(key);
    if (this.connected && this.client) {
      return await this.client.smembers(fullKey);
    }
    const set = this.memoryStore.get(fullKey) || [];
    return Array.isArray(set) ? set : Array.from(set);
  }

  // ========== 限流操作 ==========
  async rateLimit(key, maxRequests, windowSeconds) {
    const fullKey = this.key(`ratelimit:${key}`);
    const now = Date.now();
    const windowStart = now - (windowSeconds * 1000);

    if (this.connected && this.client) {
      // 使用 Redis 事务保证原子性
      const multi = this.client.multi();
      multi.zremrangebyscore(fullKey, 0, windowStart);
      multi.zadd(fullKey, now, `${now}-${Math.random()}`);
      multi.zcard(fullKey);
      multi.expire(fullKey, windowSeconds);
      const results = await multi.exec();
      const count = results[2][1];

      return {
        allowed: count <= maxRequests,
        remaining: Math.max(0, maxRequests - count),
        reset: Math.ceil((windowStart + windowSeconds * 1000 - now) / 1000)
      };
    }

    // 内存降级方案
    const requests = this.memoryStore.get(fullKey) || [];
    const validRequests = requests.filter(t => t > windowStart);
    validRequests.push(now);
    this.memoryStore.set(fullKey, validRequests);

    const count = validRequests.length;
    return {
      allowed: count <= maxRequests,
      remaining: Math.max(0, maxRequests - count),
      reset: windowSeconds
    };
  }

  // ========== 会话操作 ==========
  async sessionCreate(token, data, ttl = 1800) {
    const fullKey = this.key(`session:${token}`);
    await this.hmset(fullKey, {
      ...data,
      created: Date.now(),
      lastActivity: Date.now()
    });
    if (this.connected && this.client) {
      await this.client.expire(fullKey, ttl);
    }
    return true;
  }

  async sessionGet(token) {
    const fullKey = this.key(`session:${token}`);
    const session = await this.hgetall(fullKey);
    if (!session || Object.keys(session).length === 0) {
      return null;
    }
    
    // 更新最后活动时间
    if (this.connected && this.client) {
      await this.client.hset(fullKey, 'lastActivity', Date.now());
    }
    
    return session;
  }

  async sessionDelete(token) {
    return await this.del(`session:${token}`);
  }

  // ========== 统计操作 ==========
  async incr(key) {
    const fullKey = this.key(key);
    if (this.connected && this.client) {
      return await this.client.incr(fullKey);
    }
    const val = parseInt(this.memoryStore.get(fullKey) || '0');
    this.memoryStore.set(fullKey, String(val + 1));
    return val + 1;
  }

  async decr(key) {
    const fullKey = this.key(key);
    if (this.connected && this.client) {
      return await this.client.decr(fullKey);
    }
    const val = parseInt(this.memoryStore.get(fullKey) || '0');
    this.memoryStore.set(fullKey, String(val - 1));
    return val - 1;
  }

  /**
   * 获取存储统计
   */
  getStats() {
    return {
      connected: this.connected,
      backend: this.connected ? 'redis' : 'memory',
      memoryStoreSize: this.memoryStore.size,
      config: this.config
    };
  }
}

module.exports = RedisAdapter;
