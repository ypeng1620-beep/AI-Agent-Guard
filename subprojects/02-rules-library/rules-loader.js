/**
 * 规则库加载器
 * 用于加载和管理多维度评分规则
 */

const fs = require('fs');
const path = require('path');

class RulesLoader {
  /**
   * @param {string} rulesDir - 规则库目录路径
   */
  constructor(rulesDir) {
    this.rulesDir = rulesDir;
    this.cache = {};
    this.watchers = new Map();
  }

  /**
   * 加载指定场景的规则
   * @param {string} scene - 场景名称 (general, tts, code)
   * @returns {Object} 规则对象
   */
  load(scene = 'general') {
    // 检查缓存
    if (this.cache[scene]) {
      return this.cache[scene];
    }

    const filePath = path.join(this.rulesDir, `rules.${scene}.json`);
    
    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
      throw new Error(`规则文件不存在: ${filePath}`);
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const rules = JSON.parse(content);
      
      // 验证规则格式
      this._validateRules(rules, scene);
      
      // 缓存
      this.cache[scene] = rules;
      
      return rules;
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`规则文件不存在: ${filePath}`);
      }
      throw new Error(`加载规则失败: ${error.message}`);
    }
  }

  /**
   * 获取指定维度
   * @param {string} dimensionName - 维度名称
   * @param {string} scene - 场景名称
   * @returns {Object|null} 维度对象
   */
  getDimension(dimensionName, scene = 'general') {
    const rules = this.load(scene);
    
    if (!rules.dimensions || !rules.dimensions[dimensionName]) {
      return null;
    }
    
    return rules.dimensions[dimensionName];
  }

  /**
   * 获取所有维度列表
   * @param {string} scene - 场景名称
   * @returns {Array} 维度列表
   */
  getAllDimensions(scene = 'general') {
    const rules = this.load(scene);
    return Object.entries(rules.dimensions).map(([key, value]) => ({
      key,
      ...value
    }));
  }

  /**
   * 重新加载所有规则（热更新）
   * @returns {void}
   */
  reload() {
    // 清除缓存
    this.cache = {};
    
    // 重新加载所有场景
    const scenes = ['general', 'tts', 'code'];
    scenes.forEach(scene => {
      try {
        this.load(scene);
      } catch (error) {
        console.error(`重新加载 ${scene} 规则失败:`, error.message);
      }
    });
  }

  /**
   * 计算加权分数
   * @param {string} scene - 场景名称
   * @param {Object} dimensionScores - 各维度得分 { dimensionName: score }
   * @returns {Object} 计算结果 { totalScore, dimensionResults, passed, details }
   */
  calculateScore(scene, dimensionScores) {
    const rules = this.load(scene);
    let totalScore = 0;
    let totalWeight = 0;
    const dimensionResults = [];
    const details = [];

    for (const [dimensionName, score] of Object.entries(dimensionScores)) {
      const dimension = rules.dimensions[dimensionName];
      if (!dimension) {
        console.warn(`维度 ${dimensionName} 不存在`);
        continue;
      }

      const weightedScore = score * dimension.weight;
      totalScore += weightedScore;
      totalWeight += dimension.weight;

      const passed = score >= dimension.threshold;
      
      dimensionResults.push({
        name: dimension.name,
        score,
        weight: dimension.weight,
        weightedScore,
        threshold: dimension.threshold,
        passed
      });

      details.push({
        dimension: dimensionName,
        score,
        threshold: dimension.threshold,
        passed
      });
    }

    // 归一化
    const normalizedScore = totalWeight > 0 ? totalScore / totalWeight : 0;
    
    // 检查是否所有维度都通过
    const allPassed = dimensionResults.every(r => r.passed);

    return {
      totalScore: Math.round(normalizedScore * 100) / 100,
      dimensionResults,
      passed: allPassed,
      details
    };
  }

  /**
   * 获取评分建议
   * @param {string} dimensionName - 维度名称
   * @param {number} score - 当前得分
   * @param {string} scene - 场景名称
   * @returns {string} 评分建议
   */
  getSuggestion(dimensionName, score, scene = 'general') {
    const dimension = this.getDimension(dimensionName, scene);
    if (!dimension) return '未知维度';

    // 找到最匹配的评分标准
    const matched = dimension.criteria.find(c => score >= c.score) || dimension.criteria[dimension.criteria.length - 1];
    return matched.description;
  }

  /**
   * 验证规则格式
   * @private
   */
  _validateRules(rules, scene) {
    if (!rules.version) {
      throw new Error('规则缺少 version 字段');
    }
    if (!rules.dimensions || typeof rules.dimensions !== 'object') {
      throw new Error('规则缺少 dimensions 字段');
    }

    // 验证权重总和
    const weightSum = Object.values(rules.dimensions).reduce(
      (sum, d) => sum + (d.weight || 0), 0
    );
    
    if (Math.abs(weightSum - 1.0) > 0.001) {
      console.warn(`警告: ${scene} 场景权重总和为 ${weightSum}，建议为 1.0`);
    }

    // 验证每个维度
    for (const [name, dimension] of Object.entries(rules.dimensions)) {
      if (!dimension.name) throw new Error(`维度 ${name} 缺少 name`);
      if (typeof dimension.weight !== 'number') throw new Error(`维度 ${name} 缺少 weight`);
      if (!Array.isArray(dimension.criteria)) throw new Error(`维度 ${name} 缺少 criteria`);
      if (typeof dimension.threshold !== 'number') throw new Error(`维度 ${name} 缺少 threshold`);
    }
  }

  /**
   * 获取所有可用的场景
   * @returns {Array} 场景列表
   */
  getAvailableScenes() {
    return ['general', 'tts', 'code'];
  }

  /**
   * 检查场景是否存在
   * @param {string} scene - 场景名称
   * @returns {boolean}
   */
  hasScene(scene) {
    const filePath = path.join(this.rulesDir, `rules.${scene}.json`);
    return fs.existsSync(filePath);
  }
}

module.exports = RulesLoader;
