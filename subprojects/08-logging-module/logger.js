/**
 * Logger - 生产级日志模块
 * 支持多级别日志、文件输出、日志轮转、告警
 */

const fs = require('fs');
const path = require('path');

class Logger {
  constructor(options = {}) {
    this.level = options.level || 'info';
    this.logPath = options.logPath || './logs';
    this.maxFileSize = options.maxFileSize || 10 * 1024 * 1024; // 10MB
    this.maxFiles = options.maxFiles || 7;
    this.enableConsole = options.enableConsole !== false;
    this.enableFile = options.enableFile !== false;
    
    this.levels = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3,
      critical: 4
    };
    
    this.stats = {
      debug: 0,
      info: 0,
      warn: 0,
      error: 0,
      critical: 0
    };
    
    if (this.enableFile) {
      this.ensureLogDir();
    }
  }
  
  ensureLogDir() {
    if (!fs.existsSync(this.logPath)) {
      fs.mkdirSync(this.logPath, { recursive: true });
    }
  }
  
  formatMessage(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`;
  }
  
  write(level, message, meta = {}) {
    if (this.levels[level] < this.levels[this.level]) return;
    
    const formatted = this.formatMessage(level, message, meta);
    
    if (this.enableConsole) {
      const colors = {
        debug: '\x1b[37m',
        info: '\x1b[36m',
        warn: '\x1b[33m',
        error: '\x1b[31m',
        critical: '\x1b[35m'
      };
      console.log(`${colors[level] || ''}${formatted}\x1b[0m`);
    }
    
    if (this.enableFile) {
      this.writeToFile(formatted);
    }
    
    this.stats[level]++;
    
    // Critical级别触发告警
    if (level === 'critical') {
      this.alert(message, meta);
    }
  }
  
  writeToFile(message) {
    const date = new Date().toISOString().split('T')[0];
    const logFile = path.join(this.logPath, `agent-guard-${date}.log`);
    
    // 检查文件大小
    try {
      const stats = fs.statSync(logFile);
      if (stats.size >= this.maxFileSize) {
        this.rotateLog(logFile);
      }
    } catch (e) {
      // 文件不存在，正常
    }
    
    fs.appendFileSync(logFile, message + '\n', 'utf8');
  }
  
  rotateLog(logFile) {
    const ext = path.extname(logFile);
    const base = path.basename(logFile, ext);
    const dir = path.dirname(logFile);
    
    // 删除最旧的轮转文件
    for (let i = this.maxFiles - 1; i >= 1; i--) {
      const oldFile = path.join(dir, `${base}-${i}${ext}`);
      const newFile = path.join(dir, `${base}-${i + 1}${ext}`);
      if (fs.existsSync(oldFile)) {
        if (i === this.maxFiles - 1) {
          fs.unlinkSync(oldFile);
        } else {
          fs.renameSync(oldFile, newFile);
        }
      }
    }
    
    // 当前的变成 -1
    if (fs.existsSync(logFile)) {
      fs.renameSync(logFile, path.join(dir, `${base}-1${ext}`));
    }
  }
  
  alert(message, meta = {}) {
    // 告警处理 - 可扩展到邮件、钉钉、飞书等
    console.error(`🚨 [ALERT] ${message}`, meta);
    
    // 写入告警日志
    const alertFile = path.join(this.logPath, 'alerts.log');
    const timestamp = new Date().toISOString();
    fs.appendFileSync(alertFile, `[${timestamp}] ${message} ${JSON.stringify(meta)}\n`, 'utf8');
  }
  
  debug(message, meta) { this.write('debug', message, meta); }
  info(message, meta) { this.write('info', message, meta); }
  warn(message, meta) { this.write('warn', message, meta); }
  error(message, meta) { this.write('error', message, meta); }
  critical(message, meta) { this.write('critical', message, meta); }
  
  getStats() {
    return { ...this.stats };
  }
  
  resetStats() {
    this.stats = { debug: 0, info: 0, warn: 0, error: 0, critical: 0 };
  }
}

module.exports = Logger;
