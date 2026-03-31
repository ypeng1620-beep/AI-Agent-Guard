/**
 * AI Agent Guard 混合记忆系统 v2.7
 * 支持关键词+向量混合检索，自动归档与冷热分离
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 简单的向量相似度计算（基于词嵌入）
class VectorStore {
  constructor(config = {}) {
    this.dimension = config.dimension || 128;
    this.vectors = new Map();
    this.metadata = new Map();
  }

  // 生成文本向量（简化版：基于词哈希）
  generateVector(text) {
    const words = text.split(/\s+/);
    const vector = new Array(this.dimension).fill(0);
    
    words.forEach((word, i) => {
      const hash = this.hashString(word);
      const idx1 = hash % this.dimension;
      const idx2 = (hash >> 8) % this.dimension;
      vector[idx1] += 1;
      vector[idx2] += 0.5;
    });
    
    // 归一化
    const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    if (magnitude > 0) {
      for (let i = 0; i < this.dimension; i++) {
        vector[i] /= magnitude;
      }
    }
    
    return vector;
  }

  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  // 计算余弦相似度
  cosineSimilarity(vec1, vec2) {
    if (vec1.length !== vec2.length) return 0;
    
    let dotProduct = 0;
    let magnitude1 = 0;
    let magnitude2 = 0;
    
    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      magnitude1 += vec1[i] * vec1[i];
      magnitude2 += vec2[i] * vec2[i];
    }
    
    const denom = Math.sqrt(magnitude1) * Math.sqrt(magnitude2);
    return denom === 0 ? 0 : dotProduct / denom;
  }

  add(id, text, metadata = {}) {
    const vector = this.generateVector(text);
    this.vectors.set(id, vector);
    this.metadata.set(id, { text, ...metadata, createdAt: Date.now() });
    return id;
  }

  search(query, topK = 10) {
    const queryVector = this.generateVector(query);
    const results = [];
    
    for (const [id, vector] of this.vectors) {
      const similarity = this.cosineSimilarity(queryVector, vector);
      results.push({
        id,
        similarity,
        metadata: this.metadata.get(id)
      });
    }
    
    // 按相似度排序
    results.sort((a, b) => b.similarity - a.similarity);
    
    return results.slice(0, topK);
  }

  delete(id) {
    this.vectors.delete(id);
    this.metadata.delete(id);
  }

  size() {
    return this.vectors.size;
  }
}

// 关键词索引（倒排索引）
class KeywordIndex {
  constructor() {
    this.invertedIndex = new Map(); // word -> Set of ids
    this.documents = new Map();
  }

  add(id, text, metadata = {}) {
    this.documents.set(id, { text, ...metadata, createdAt: Date.now() });
    
    const words = this.extractKeywords(text);
    words.forEach(word => {
      if (!this.invertedIndex.has(word)) {
        this.invertedIndex.set(word, new Set());
      }
      this.invertedIndex.get(word).add(id);
    });
    
    return id;
  }

  extractKeywords(text) {
    // 简单分词 + 停用词过滤
    const stopWords = new Set(['的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这']);
    const words = text.split(/\s+/).filter(w => w.length > 1 && !stopWords.has(w));
    return words;
  }

  search(query, topK = 10) {
    const words = this.extractKeywords(query);
    const scores = new Map();
    
    words.forEach(word => {
      if (this.invertedIndex.has(word)) {
        const matchingIds = this.invertedIndex.get(word);
        matchingIds.forEach(id => {
          scores.set(id, (scores.get(id) || 0) + 1);
        });
      }
    });
    
    // 转换为结果格式
    const results = Array.from(scores.entries())
      .map(([id, score]) => ({
        id,
        keywordScore: score / words.length,
        metadata: this.documents.get(id)
      }))
      .sort((a, b) => b.keywordScore - a.keywordScore)
      .slice(0, topK);
    
    return results;
  }

  delete(id) {
    const doc = this.documents.get(id);
    if (doc) {
      const words = this.extractKeywords(doc.text);
      words.forEach(word => {
        const ids = this.invertedIndex.get(word);
        if (ids) {
          ids.delete(id);
          if (ids.size === 0) {
            this.invertedIndex.delete(word);
          }
        }
      });
      this.documents.delete(id);
    }
  }

  size() {
    return this.documents.size;
  }
}

// 归档管理器（冷热分离）
class ArchiveManager {
  constructor(config = {}) {
    this.hotThreshold = config.hotThreshold || 7 * 24 * 60 * 60 * 1000; // 7天
    this.archivePath = config.archivePath || './memory_archive';
    
    if (!fs.existsSync(this.archivePath)) {
      fs.mkdirSync(this.archivePath, { recursive: true });
    }
    
    this.hotStore = new Map(); // 热数据: id -> data
    this.coldIndex = new Map(); // 冷数据索引: id -> archiveFile
  }

  save(id, data) {
    const now = Date.now();
    const item = { ...data, id, lastAccess: now, createdAt: now };
    
    if (now - data.createdAt < this.hotThreshold) {
      this.hotStore.set(id, item);
    } else {
      this.archiveToCold(id, item);
    }
  }

  get(id) {
    // 先查热数据
    if (this.hotStore.has(id)) {
      const item = this.hotStore.get(id);
      item.lastAccess = Date.now();
      return item;
    }
    
    // 查冷数据
    if (this.coldIndex.has(id)) {
      const archiveFile = this.coldIndex.get(id);
      try {
        const content = fs.readFileSync(archiveFile, 'utf8');
        const item = JSON.parse(content);
        // 访问后移回热数据
        item.lastAccess = Date.now();
        this.hotStore.set(id, item);
        return item;
      } catch (e) {
        return null;
      }
    }
    
    return null;
  }

  archiveToCold(id, data) {
    const date = new Date().toISOString().split('T')[0];
    const archiveFile = path.join(this.archivePath, `archive_${date}.json`);
    
    try {
      let archive = {};
      if (fs.existsSync(archiveFile)) {
        archive = JSON.parse(fs.readFileSync(archiveFile, 'utf8'));
      }
      
      archive[id] = data;
      fs.writeFileSync(archiveFile, JSON.stringify(archive, null, 2));
      this.coldIndex.set(id, archiveFile);
    } catch (e) {
      console.error('[ArchiveManager] Failed to archive:', e.message);
    }
  }

  // 手动归档（定时任务调用）
  archiveOldData() {
    const now = Date.now();
    const toArchive = [];
    
    for (const [id, data] of this.hotStore) {
      if (now - data.lastAccess > this.hotThreshold * 2) {
        toArchive.push(id);
      }
    }
    
    toArchive.forEach(id => {
      const data = this.hotStore.get(id);
      this.archiveToCold(id, data);
      this.hotStore.delete(id);
    });
    
    console.log(`[ArchiveManager] Archived ${toArchive.length} items`);
    return toArchive.length;
  }

  getStats() {
    return {
      hotCount: this.hotStore.size,
      coldCount: this.coldIndex.size,
      archivePath: this.archivePath
    };
  }
}

// 混合记忆系统
class HybridMemorySystem {
  constructor(config = {}) {
    this.vectorStore = new VectorStore({ dimension: config.vectorDimension || 128 });
    this.keywordIndex = new KeywordIndex();
    this.archiveManager = new ArchiveManager({
      hotThreshold: config.hotThreshold || 7 * 24 * 60 * 60 * 1000,
      archivePath: config.archivePath
    });
    
    this.config = {
      vectorWeight: config.vectorWeight || 0.4,
      keywordWeight: config.keywordWeight || 0.4,
      recencyWeight: config.recencyWeight || 0.2,
      ...config
    };
    
    // 启动归档任务
    setInterval(() => {
      this.archiveManager.archiveOldData();
    }, 24 * 60 * 60 * 1000); // 每24小时检查一次
  }

  add(id, text, metadata = {}) {
    this.vectorStore.add(id, text, metadata);
    this.keywordIndex.add(id, text, metadata);
    this.archiveManager.save(id, { text, ...metadata });
    return id;
  }

  search(query, options = {}) {
    const { topK = 10, includeRecency = true } = options;
    
    // 并行搜索
    const [vectorResults, keywordResults] = [
      this.vectorStore.search(query, topK * 2),
      this.keywordIndex.search(query, topK * 2)
    ];
    
    // 合并分数
    const scoreMap = new Map();
    
    vectorResults.forEach(result => {
      const baseScore = result.similarity * this.config.vectorWeight;
      const recencyBonus = includeRecency ? this.calculateRecencyBonus(result.metadata) : 0;
      scoreMap.set(result.id, {
        id: result.id,
        vectorScore: result.similarity,
        baseScore: baseScore + recencyBonus * this.config.recencyWeight,
        metadata: result.metadata
      });
    });
    
    keywordResults.forEach(result => {
      const baseScore = result.keywordScore * this.config.keywordWeight;
      if (scoreMap.has(result.id)) {
        scoreMap.get(result.id).keywordScore = result.keywordScore;
        scoreMap.get(result.id).baseScore += baseScore;
      } else {
        const recencyBonus = includeRecency ? this.calculateRecencyBonus(result.metadata) : 0;
        scoreMap.set(result.id, {
          id: result.id,
          keywordScore: result.keywordScore,
          baseScore: baseScore + recencyBonus * this.config.recencyWeight,
          metadata: result.metadata
        });
      }
    });
    
    // 排序并返回
    const results = Array.from(scoreMap.values())
      .sort((a, b) => b.baseScore - a.baseScore)
      .slice(0, topK);
    
    return {
      results,
      query,
      stats: {
        vectorMatches: vectorResults.length,
        keywordMatches: keywordResults.length,
        totalReturned: results.length
      }
    };
  }

  calculateRecencyBonus(metadata) {
    if (!metadata?.createdAt) return 0;
    
    const age = Date.now() - metadata.createdAt;
    const maxAge = 30 * 24 * 60 * 60 * 1000; // 30天
    return Math.max(0, 1 - age / maxAge);
  }

  delete(id) {
    this.vectorStore.delete(id);
    this.keywordIndex.delete(id);
    this.archiveManager.hotStore.delete(id);
    // 冷数据保留归档文件
  }

  getStats() {
    return {
      vectorStore: {
        count: this.vectorStore.size()
      },
      keywordIndex: {
        count: this.keywordIndex.size()
      },
      archive: this.archiveManager.getStats(),
      config: this.config
    };
  }
}

module.exports = {
  HybridMemorySystem,
  VectorStore,
  KeywordIndex,
  ArchiveManager
};
