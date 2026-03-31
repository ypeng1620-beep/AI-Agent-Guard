/**
 * AI Agent Guard 配置版本管理系统
 * 支持配置版本号、两阶段提交、原子性生效
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * 配置版本条目
 */
class ConfigVersion {
  constructor(version, config, metadata = {}) {
    this.version = version;
    this.config = config;
    this.metadata = {
      createdAt: Date.now(),
      createdBy: metadata.createdBy || 'system',
      comment: metadata.comment || '',
      checksum: null,
      ...metadata
    };
    this.metadata.checksum = this.calculateChecksum();
  }

  calculateChecksum() {
    const content = JSON.stringify(this.config);
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
  }

  validate() {
    return this.checksum === this.calculateChecksum();
  }
}

/**
 * 配置变更记录
 */
class ConfigChange {
  constructor(type, path, oldValue, newValue) {
    this.id = crypto.randomUUID();
    this.type = type; // 'add', 'update', 'delete'
    this.path = path; // JSON路径, 如 'rules.maxLength'
    this.oldValue = oldValue;
    this.newValue = newValue;
    this.timestamp = Date.now();
    this.status = 'pending'; // 'pending', 'committed', 'rolled_back'
  }
}

/**
 * 配置管理器
 */
class ConfigManager {
  constructor(config = {}) {
    this.configDir = config.configDir || './config';
    this.versionHistorySize = config.versionHistorySize || 50;
    
    // 当前配置
    this.currentConfig = null;
    this.currentVersion = 0;
    
    // 版本历史
    this.versions = [];
    
    // 变更日志
    this.pendingChanges = [];
    
    // 订阅者
    this.subscribers = new Map();
    
    // 两阶段提交状态
    this.twoPhaseState = {
      inProgress: false,
      prepareVersion: null,
      changes: [],
      committedSubscribers: new Set()
    };
    
    // 确保配置目录存在
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }
    
    // 加载现有配置
    this.load();
  }

  /**
   * 加载配置
   */
  load() {
    const configFile = path.join(this.configDir, 'config.json');
    const versionFile = path.join(this.configDir, 'version.json');
    
    try {
      if (fs.existsSync(configFile)) {
        this.currentConfig = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      } else {
        this.currentConfig = this.getDefaultConfig();
        this.save();
      }
      
      if (fs.existsSync(versionFile)) {
        const versionData = JSON.parse(fs.readFileSync(versionFile, 'utf8'));
        this.versions = versionData.versions || [];
        this.currentVersion = versionData.currentVersion || 0;
      }
    } catch (e) {
      console.error('[ConfigManager] Load error:', e.message);
      this.currentConfig = this.getDefaultConfig();
    }
  }

  /**
   * 保存配置
   */
  save() {
    const configFile = path.join(this.configDir, 'config.json');
    const versionFile = path.join(this.configDir, 'version.json');
    
    fs.writeFileSync(configFile, JSON.stringify(this.currentConfig, null, 2));
    
    fs.writeFileSync(versionFile, JSON.stringify({
      currentVersion: this.currentVersion,
      versions: this.versions.slice(-this.versionHistorySize)
    }, null, 2));
  }

  /**
   * 获取默认配置
   */
  getDefaultConfig() {
    return {
      version: 1,
      evalModel: 'local',
      defaultScenario: 'general',
      similarityThreshold: 0.85,
      scoreThreshold: 70,
      consecutiveRounds: 3,
      forbiddenWords: {
        core: [],
        extended: [],
        contextual: []
      },
      maxLength: 10000,
      maxTurns: 50,
      rules: {
        general: {},
        tts: {},
        code: {}
      },
      plugins: {
        enabled: [],
        config: {}
      },
      security: {
        rateLimit: {
          windowMs: 60000,
          maxRequests: 100
        },
        cors: {
          origin: '*'
        },
        apiKey: {
          required: false,
          rotationDays: 90
        }
      },
      logging: {
        level: 'info',
        maxFileSize: 10485760,
        maxFiles: 7
      }
    };
  }

  /**
   * 获取配置
   */
  get(path = null) {
    if (!path) return { ...this.currentConfig };
    
    const keys = path.split('.');
    let value = this.currentConfig;
    
    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return undefined;
      }
    }
    
    return value;
  }

  /**
   * 设置配置 (单条变更)
   */
  set(path, value, options = {}) {
    const { skipTwoPhase = false, comment = '' } = options;
    
    const keys = path.split('.');
    const lastKey = keys.pop();
    let target = this.currentConfig;
    
    for (const key of keys) {
      if (!(key in target)) {
        target[key] = {};
      }
      target = target[key];
    }
    
    const oldValue = target[lastKey];
    const change = new ConfigChange(
      oldValue === undefined ? 'add' : (value === undefined ? 'delete' : 'update'),
      path,
      oldValue,
      value
    );
    change.comment = comment;
    
    if (skipTwoPhase || !this.twoPhaseState.inProgress) {
      // 直接应用变更
      this.applyChange(change);
      return change;
    } else {
      // 暂存变更
      this.twoPhaseState.changes.push(change);
      return change;
    }
  }

  /**
   * 应用变更
   */
  applyChange(change) {
    if (change.newValue === undefined) {
      // 删除
      this.deletePath(change.path);
    } else {
      // 添加或更新
      const keys = change.path.split('.');
      const lastKey = keys.pop();
      let target = this.currentConfig;
      
      for (const key of keys) {
        if (!(key in target)) target[key] = {};
        target = target[key];
      }
      
      target[lastKey] = change.newValue;
    }
    
    change.status = 'committed';
    this.pendingChanges.push(change);
  }

  /**
   * 删除路径
   */
  deletePath(path) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    let target = this.currentConfig;
    
    for (const key of keys) {
      if (!(key in target)) return;
      target = target[key];
    }
    
    delete target[lastKey];
  }

  // ========== 两阶段提交 ==========

  /**
   * 开始两阶段提交
   */
  beginTwoPhaseCommit() {
    if (this.twoPhaseState.inProgress) {
      throw new Error('Two-phase commit already in progress');
    }
    
    this.twoPhaseState = {
      inProgress: true,
      prepareVersion: this.currentVersion + 1,
      changes: [],
      committedSubscribers: new Set()
    };
    
    console.log(`[ConfigManager] Two-phase commit started (version ${this.twoPhaseState.prepareVersion})`);
    return this.twoPhaseState.prepareVersion;
  }

  /**
   * 提交变更 (第一阶段：准备)
   */
  prepare() {
    if (!this.twoPhaseState.inProgress) {
      throw new Error('No two-phase commit in progress');
    }
    
    // 创建新版本配置
    const newConfig = JSON.parse(JSON.stringify(this.currentConfig));
    
    // 应用所有变更到新配置
    for (const change of this.twoPhaseState.changes) {
      this.applyChangeToConfig(newConfig, change);
    }
    
    // 创建版本
    const version = new ConfigVersion(
      this.twoPhaseState.prepareVersion,
      newConfig,
      { comment: `Two-phase commit v${this.twoPhaseState.prepareVersion}` }
    );
    
    // 保存准备阶段版本
    const prepareFile = path.join(this.configDir, `config.prepare.${version.version}.json`);
    fs.writeFileSync(prepareFile, JSON.stringify(version, null, 2));
    
    console.log(`[ConfigManager] Prepared version ${version.version} (checksum: ${version.checksum})`);
    return version;
  }

  /**
   * 应用变更到指定配置
   */
  applyChangeToConfig(config, change) {
    const keys = change.path.split('.');
    const lastKey = keys.pop();
    let target = config;
    
    for (const key of keys) {
      if (!(key in target)) target[key] = {};
      target = target[key];
    }
    
    if (change.newValue === undefined) {
      delete target[lastKey];
    } else {
      target[lastKey] = change.newValue;
    }
  }

  /**
   * 确认提交 (第二阶段)
   */
  commit() {
    if (!this.twoPhaseState.inProgress) {
      throw new Error('No two-phase commit in progress');
    }
    
    // 应用到当前配置
    for (const change of this.twoPhaseState.changes) {
      this.applyChange(change);
    }
    
    // 更新版本号
    this.currentVersion = this.twoPhaseState.prepareVersion;
    
    // 添加到版本历史
    const version = new ConfigVersion(
      this.currentVersion,
      JSON.parse(JSON.stringify(this.currentConfig))
    );
    this.versions.push(version);
    
    // 限制历史大小
    if (this.versions.length > this.versionHistorySize) {
      this.versions = this.versions.slice(-this.versionHistorySize);
    }
    
    // 保存
    this.save();
    
    // 通知订阅者
    this.notifySubscribers();
    
    // 清理
    this.cleanupPrepareFiles();
    this.twoPhaseState = {
      inProgress: false,
      prepareVersion: null,
      changes: [],
      committedSubscribers: new Set()
    };
    
    console.log(`[ConfigManager] Committed version ${this.currentVersion}`);
    return this.currentVersion;
  }

  /**
   * 回滚
   */
  rollback() {
    if (!this.twoPhaseState.inProgress) {
      throw new Error('No two-phase commit in progress');
    }
    
    // 清理准备文件
    this.cleanupPrepareFiles();
    
    console.log(`[ConfigManager] Rolled back two-phase commit (${this.twoPhaseState.changes.length} changes discarded)`);
    
    this.twoPhaseState = {
      inProgress: false,
      prepareVersion: null,
      changes: [],
      committedSubscribers: new Set()
    };
  }

  /**
   * 清理准备文件
   */
  cleanupPrepareFiles() {
    try {
      const files = fs.readdirSync(this.configDir);
      for (const file of files) {
        if (file.startsWith('config.prepare.')) {
          fs.unlinkSync(path.join(this.configDir, file));
        }
      }
    } catch (e) {
      // 忽略
    }
  }

  // ========== 版本管理 ==========

  /**
   * 获取版本
   */
  getVersion(versionNumber) {
    if (versionNumber === this.currentVersion) {
      return new ConfigVersion(versionNumber, this.currentConfig);
    }
    
    const version = this.versions.find(v => v.version === versionNumber);
    if (version) return version;
    
    // 尝试从文件加载
    const versionFile = path.join(this.configDir, `config.prepare.${versionNumber}.json`);
    if (fs.existsSync(versionFile)) {
      return JSON.parse(fs.readFileSync(versionFile, 'utf8'));
    }
    
    return null;
  }

  /**
   * 回滚到指定版本
   */
  rollbackToVersion(versionNumber) {
    const version = this.getVersion(versionNumber);
    if (!version) {
      throw new Error(`Version ${versionNumber} not found`);
    }
    
    this.currentConfig = JSON.parse(JSON.stringify(version.config));
    this.currentVersion = versionNumber;
    this.save();
    
    console.log(`[ConfigManager] Rolled back to version ${versionNumber}`);
    return this.currentVersion;
  }

  /**
   * 获取版本历史
   */
  getVersionHistory() {
    return this.versions.map(v => ({
      version: v.version,
      createdAt: v.metadata.createdAt,
      createdBy: v.metadata.createdBy,
      comment: v.metadata.comment,
      checksum: v.metadata.checksum
    }));
  }

  // ========== 订阅 ==========

  /**
   * 订阅配置变更
   */
  subscribe(id, callback) {
    this.subscribers.set(id, callback);
    return () => this.subscribers.delete(id);
  }

  /**
   * 通知订阅者
   */
  notifySubscribers() {
    const payload = {
      version: this.currentVersion,
      config: this.currentConfig,
      changes: this.pendingChanges.slice()
    };
    
    for (const [id, callback] of this.subscribers) {
      try {
        callback(payload);
      } catch (e) {
        console.error(`[ConfigManager] Subscriber ${id} error:`, e.message);
      }
    }
    
    this.pendingChanges = [];
  }

  /**
   * 获取状态
   */
  getStatus() {
    return {
      currentVersion: this.currentVersion,
      totalVersions: this.versions.length,
      pendingChanges: this.twoPhaseState.inProgress ? this.twoPhaseState.changes.length : 0,
      subscribers: this.subscribers.size,
      twoPhaseCommit: this.twoPhaseState.inProgress ? {
        prepareVersion: this.twoPhaseState.prepareVersion,
        changesCount: this.twoPhaseState.changes.length
      } : null
    };
  }
}

module.exports = {
  ConfigManager,
  ConfigVersion,
  ConfigChange
};
