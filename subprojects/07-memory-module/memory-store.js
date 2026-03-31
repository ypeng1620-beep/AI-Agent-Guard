/**
 * 跨轮记忆存储模块
 * 存储Agent历史评估分数、违规操作、收敛数据
 * 
 * 存储结构:
 * storage/
 * ├── eval_history/
 * │   ├── general/
 * │   ├── tts/
 * │   └── code/
 * ├── violations/
 * │   ├── general/
 * │   ├── tts/
 * │   └── code/
 * └── convergence/
 *     ├── general/
 *     ├── tts/
 *     └── code/
 */

const fs = require('fs');
const path = require('path');

class MemoryStore {
  constructor(storageDir) {
    this.storageDir = storageDir;
    this.evalDir = path.join(storageDir, 'eval_history');
    this.violationsDir = path.join(storageDir, 'violations');
    this.convergenceDir = path.join(storageDir, 'convergence');
    
    // 确保所有目录存在
    this._ensureDirs();
  }

  /**
   * 确保所有存储目录存在
   */
  _ensureDirs() {
    const dirs = [
      this.evalDir,
      this.violationsDir,
      this.convergenceDir,
      path.join(this.evalDir, 'general'),
      path.join(this.evalDir, 'tts'),
      path.join(this.evalDir, 'code'),
      path.join(this.violationsDir, 'general'),
      path.join(this.violationsDir, 'tts'),
      path.join(this.violationsDir, 'code'),
      path.join(this.convergenceDir, 'general'),
      path.join(this.convergenceDir, 'tts'),
      path.join(this.convergenceDir, 'code'),
    ];
    
    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  /**
   * 获取任务类型对应的子目录名
   */
  _getTypeDir(baseDir, taskType) {
    const type = taskType || 'general';
    const validTypes = ['general', 'tts', 'code'];
    const normalizedType = validTypes.includes(type) ? type : 'general';
    return path.join(baseDir, normalizedType);
  }

  /**
   * 生成带时间戳的文件路径
   */
  _getFilePath(baseDir, taskType, prefix) {
    const typeDir = this._getTypeDir(baseDir, taskType);
    const timestamp = Date.now();
    const filename = `${prefix}_${timestamp}.json`;
    return path.join(typeDir, filename);
  }

  /**
   * 获取任务类型的索引文件路径（记录所有记录列表）
   */
  _getIndexPath(baseDir, taskType) {
    const typeDir = this._getTypeDir(baseDir, taskType);
    return path.join(typeDir, '_index.json');
  }

  /**
   * 读取或创建索引
   */
  _readIndex(baseDir, taskType) {
    const indexPath = this._getIndexPath(baseDir, taskType);
    try {
      if (fs.existsSync(indexPath)) {
        const data = fs.readFileSync(indexPath, 'utf-8');
        return JSON.parse(data);
      }
    } catch (err) {
      console.error(`[MemoryStore] Failed to read index: ${err.message}`);
    }
    return [];
  }

  /**
   * 保存索引
   */
  _writeIndex(baseDir, taskType, index) {
    const indexPath = this._getIndexPath(baseDir, taskType);
    try {
      fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');
    } catch (err) {
      console.error(`[MemoryStore] Failed to write index: ${err.message}`);
    }
  }

  /**
   * 添加记录到索引
   */
  _addToIndex(baseDir, taskType, recordMeta) {
    const index = this._readIndex(baseDir, taskType);
    index.unshift(recordMeta); // 添加到开头（最新优先）
    // 保持索引在合理大小（最近100条）
    if (index.length > 100) {
      index.length = 100;
    }
    this._writeIndex(baseDir, taskType, index);
  }

  /**
   * 保存评估结果
   * @param {string} taskId - 任务ID
   * @param {object} evalResult - 评估结果对象
   * @param {string} taskType - 任务类型 (general/tts/code)
   */
  saveEval(taskId, evalResult, taskType = 'general') {
    const record = {
      taskId,
      taskType,
      timestamp: new Date().toISOString(),
      data: evalResult
    };

    const filePath = this._getFilePath(this.evalDir, taskType, 'eval');
    
    try {
      fs.writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf-8');
      
      // 更新索引
      this._addToIndex(this.evalDir, taskType, {
        taskId,
        file: path.basename(filePath),
        timestamp: record.timestamp,
        score: evalResult.score || evalResult.totalScore || null
      });
      
      console.log(`[MemoryStore] Saved eval for task ${taskId} at ${filePath}`);
      return true;
    } catch (err) {
      console.error(`[MemoryStore] Failed to save eval: ${err.message}`);
      return false;
    }
  }

  /**
   * 保存违规记录
   * @param {string} taskId - 任务ID
   * @param {object} violation - 违规记录对象
   * @param {string} taskType - 任务类型 (general/tts/code)
   */
  saveViolation(taskId, violation, taskType = 'general') {
    const record = {
      taskId,
      taskType,
      timestamp: new Date().toISOString(),
      data: violation
    };

    const filePath = this._getFilePath(this.violationsDir, taskType, 'violation');
    
    try {
      fs.writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf-8');
      
      // 更新索引
      this._addToIndex(this.violationsDir, taskType, {
        taskId,
        file: path.basename(filePath),
        timestamp: record.timestamp,
        violationType: violation.type || violation.violationType || 'unknown',
        severity: violation.severity || 'unknown'
      });
      
      console.log(`[MemoryStore] Saved violation for task ${taskId} at ${filePath}`);
      return true;
    } catch (err) {
      console.error(`[MemoryStore] Failed to save violation: ${err.message}`);
      return false;
    }
  }

  /**
   * 存储收敛数据
   * @param {string} taskId - 任务ID
   * @param {object} convergenceData - 收敛数据（包含convergenceTime, loopCount等）
   * @param {string} taskType - 任务类型 (general/tts/code)
   */
  saveConvergence(taskId, convergenceData, taskType = 'general') {
    const record = {
      taskId,
      taskType,
      timestamp: new Date().toISOString(),
      data: convergenceData
    };

    const filePath = this._getFilePath(this.convergenceDir, taskType, 'convergence');
    
    try {
      fs.writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf-8');
      
      // 更新索引
      this._addToIndex(this.convergenceDir, taskType, {
        taskId,
        file: path.basename(filePath),
        timestamp: record.timestamp,
        loopCount: convergenceData.loopCount || convergenceData.loops || 0,
        convergenceTime: convergenceData.convergenceTime || convergenceData.time || null,
        converged: convergenceData.converged !== undefined ? convergenceData.converged : true
      });
      
      console.log(`[MemoryStore] Saved convergence for task ${taskId} at ${filePath}`);
      return true;
    } catch (err) {
      console.error(`[MemoryStore] Failed to save convergence: ${err.message}`);
      return false;
    }
  }

  /**
   * 获取同类任务的历史记忆
   * @param {string} taskType - 任务类型 (general/tts/code)
   * @param {number} limit - 返回记录数量限制
   * @returns {array} 历史记录数组
   */
  getHistory(taskType = 'general', limit = 10) {
    const index = this._readIndex(this.evalDir, taskType);
    const limitedIndex = index.slice(0, limit);
    
    const records = [];
    for (const meta of limitedIndex) {
      const filePath = path.join(this._getTypeDir(this.evalDir, taskType), meta.file);
      try {
        if (fs.existsSync(filePath)) {
          const data = fs.readFileSync(filePath, 'utf-8');
          records.push(JSON.parse(data));
        }
      } catch (err) {
        console.error(`[MemoryStore] Failed to read eval file: ${err.message}`);
      }
    }
    
    return records;
  }

  /**
   * 获取违规历史
   * @param {string} taskType - 任务类型 (general/tts/code)
   * @param {number} limit - 返回记录数量限制
   * @returns {array} 违规记录数组
   */
  getViolations(taskType = 'general', limit = 10) {
    const index = this._readIndex(this.violationsDir, taskType);
    const limitedIndex = index.slice(0, limit);
    
    const records = [];
    for (const meta of limitedIndex) {
      const filePath = path.join(this._getTypeDir(this.violationsDir, taskType), meta.file);
      try {
        if (fs.existsSync(filePath)) {
          const data = fs.readFileSync(filePath, 'utf-8');
          records.push(JSON.parse(data));
        }
      } catch (err) {
        console.error(`[MemoryStore] Failed to read violation file: ${err.message}`);
      }
    }
    
    return records;
  }

  /**
   * 获取收敛历史数据
   * @param {string} taskType - 任务类型 (general/tts/code)
   * @param {number} limit - 返回记录数量限制
   * @returns {array} 收敛记录数组
   */
  getConvergenceHistory(taskType = 'general', limit = 10) {
    const index = this._readIndex(this.convergenceDir, taskType);
    const limitedIndex = index.slice(0, limit);
    
    const records = [];
    for (const meta of limitedIndex) {
      const filePath = path.join(this._getTypeDir(this.convergenceDir, taskType), meta.file);
      try {
        if (fs.existsSync(filePath)) {
          const data = fs.readFileSync(filePath, 'utf-8');
          records.push(JSON.parse(data));
        }
      } catch (err) {
        console.error(`[MemoryStore] Failed to read convergence file: ${err.message}`);
      }
    }
    
    return records;
  }

  /**
   * 获取所有任务类型的统计摘要
   * @returns {object} 各类型的记录统计
   */
  getStats() {
    const types = ['general', 'tts', 'code'];
    const stats = {
      evalHistory: {},
      violations: {},
      convergence: {}
    };

    for (const type of types) {
      const evalIndex = this._readIndex(this.evalDir, type);
      const violIndex = this._readIndex(this.violationsDir, type);
      const convIndex = this._readIndex(this.convergenceDir, type);

      stats.evalHistory[type] = evalIndex.length;
      stats.violations[type] = violIndex.length;
      stats.convergence[type] = convIndex.length;
    }

    return stats;
  }

  /**
   * 清理旧记录（保留最近N条）
   * @param {number} keepCount - 每种类型保留的记录数
   */
  cleanup(keepCount = 50) {
    const types = ['general', 'tts', 'code'];
    const dirs = [this.evalDir, this.violationsDir, this.convergenceDir];
    const dirNames = ['eval_history', 'violations', 'convergence'];

    for (let i = 0; i < types.length; i++) {
      const type = types[i];
      const dir = dirs[i];
      const index = this._readIndex(dir, type);

      if (index.length > keepCount) {
        // 删除超出部分的旧记录
        const toRemove = index.slice(keepCount);
        for (const meta of toRemove) {
          const filePath = path.join(this._getTypeDir(dir, type), meta.file);
          try {
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
              console.log(`[MemoryStore] Cleaned up old record: ${filePath}`);
            }
          } catch (err) {
            console.error(`[MemoryStore] Failed to cleanup file: ${err.message}`);
          }
        }

        // 更新索引
        this._writeIndex(dir, type, index.slice(0, keepCount));
      }
    }
  }
}

module.exports = MemoryStore;
