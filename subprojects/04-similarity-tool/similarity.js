/**
 * 中文语义相似度计算工具 v9
 * 
 * 算法：Dice系数 + 语义相似词扩展
 * - 无停用词过滤
 * - 双向bigram匹配
 * - 语义相似词加权（直接匹配2x，同源词1.5x）
 * - 结果上限100%
 */

const fs = require('fs');
const http = require('http');
const path = require('path');

let pinyin;
try { pinyin = require('pinyin'); } catch (e) { pinyin = null; }

const TTS_PATTERN = /\[\d{2}:\d{2}:\d{2}(?:\.\d+)?\]/g;

// ========== 语义相似词数据库（懒加载）==========
let synonymMap = null;

function loadSynonymDB() {
  if (synonymMap) return;
  
  const dbPath = path.join(__dirname, 'synonym-db.json');
  try {
    const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    synonymMap = new Map();
    
    for (const category of Object.values(db)) {
      if (typeof category !== 'object') continue;
      for (const [word, synonyms] of Object.entries(category)) {
        if (!Array.isArray(synonyms)) continue;
        
        if (!synonymMap.has(word)) synonymMap.set(word, new Set());
        for (const syn of synonyms) {
          synonymMap.get(word).add(syn);
          if (!synonymMap.has(syn)) synonymMap.set(syn, new Set());
          synonymMap.get(syn).add(word);
        }
      }
    }
    console.log('[Similarity] 相似词库: ' + synonymMap.size + ' 词条');
  } catch (e) {
    console.log('[Similarity] 相似词库加载失败:', e.message);
  }
}

class SimilarityTool {
  constructor(config = {}) {
    this.config = {
      semanticThreshold: config.semanticThreshold || 80,
      enableSynonymDB: config.enableSynonymDB !== false,
      enableSemanticEnhancement: config.enableSemanticEnhancement !== false,
      enablePinyinCheck: config.enablePinyinCheck !== false,
    };
    this.browserModel = config.browserModel || 'zhipu';
    this.browserPort = config.browserPort || 18790;
    
    if (this.config.enableSynonymDB) loadSynonymDB();
  }

  calculate(text1, text2) {
    return this.semanticSimilarity(text1, text2);
  }

  calculateForTTS(tts1, tts2) {
    const c1 = this.cleanTTS(tts1);
    const c2 = this.cleanTTS(tts2);
    return this.semanticSimilarity(c1, c2);
  }

  cleanTTS(script) {
    return script.replace(TTS_PATTERN, '').replace(/\s+/g, '').trim();
  }

  semanticSimilarity(text1, text2) {
    if (!text1 && !text2) return 1;
    if (!text1 || !text2) return 0;
    
    const words1 = this.tokenize(text1);
    const words2 = this.tokenize(text2);
    
    if (words1.length === 0 && words2.length === 0) return 1;
    if (words1.length === 0 || words2.length === 0) return 0;
    
    let matches = 0;
    const used1 = new Set();
    const used2 = new Set();
    
    // Pass 1: 直接bigram匹配 (2x权重)
    for (let i = 0; i < words1.length; i++) {
      if (used1.has(i)) continue;
      for (let j = 0; j < words2.length; j++) {
        if (used2.has(j)) continue;
        if (words1[i] === words2[j]) {
          matches += 2;
          used1.add(i);
          used2.add(j);
          break;
        }
      }
    }
    
    // Pass 2: 语义相似词匹配 (1.5x权重)
    if (this.config.enableSynonymDB && synonymMap) {
      for (let i = 0; i < words1.length; i++) {
        if (used1.has(i)) continue;
        const syns = synonymMap.get(words1[i]) || new Set([words1[i]]);
        
        for (let j = 0; j < words2.length; j++) {
          if (used2.has(j)) continue;
          if (syns.has(words2[j]) && words1[i] !== words2[j]) {
            matches += 1.5;
            used1.add(i);
            used2.add(j);
            break;
          }
        }
      }
    }
    
    // Dice系数
    const dice = (2 * matches) / (words1.length + words2.length);
    return Math.min(1, dice);
  }

  tokenize(text) {
    const chars = text.split('').filter(c => /[\u4e00-\u9fa5]/.test(c));
    const words = [];
    for (let i = 0; i < chars.length - 1; i++) {
      words.push(chars[i] + chars[i + 1]);
    }
    return words;
  }

  calculatePinyinSimilarity(text1, text2) {
    if (!pinyin) return this.semanticSimilarity(text1, text2);
    try {
      const py1 = this.toPinyin(text1);
      const py2 = this.toPinyin(text2);
      return this.semanticSimilarity(py1, py2);
    } catch (e) {
      return this.semanticSimilarity(text1, text2);
    }
  }

  toPinyin(text) {
    if (!pinyin) return text;
    try {
      const result = pinyin(text, { style: pinyin.STYLE_NORMAL });
      return result.map(r => r[0]).join('');
    } catch (e) {
      return text;
    }
  }

  async semanticEnhancement(text1, text2) {
    if (!this.config.enableSemanticEnhancement) return null;
    if (this.semanticSimilarity(text1, text2) > 0.85) return null;
    try {
      return await this.callSemanticAPI(text1, text2);
    } catch (e) {
      console.log('[Similarity] 语义增强失败:', e.message);
      return null;
    }
  }

  async callSemanticAPI(text1, text2) {
    const prompt = '判断以下两个中文文本是否语义相似：\n文本1: ' + text1.substring(0, 500) + '\n文本2: ' + text2.substring(0, 500) + '\n回答格式（严格JSON）：\n{"similar": true/false}';
    const body = JSON.stringify({ task: '语义相似度判断', output: prompt, model: this.browserModel });
    
    const result = await this.httpRequest({
      hostname: 'localhost', port: this.browserPort, path: '/api/evaluate',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      body, timeout: 15000
    });
    
    const parsed = JSON.parse(result);
    return { semanticSimilar: parsed.similar, enhanced: true };
  }

  httpRequest(options) {
    return new Promise((resolve, reject) => {
      const tid = setTimeout(() => reject(new Error('HTTP超时')), options.timeout || 5000);
      const req = http.request({
        hostname: options.hostname, port: options.port || 80,
        path: options.path, method: options.method, headers: options.headers
      }, res => {
        let d = ''; res.on('data', c => d += c); res.on('end', () => { clearTimeout(tid); resolve(d); });
      });
      req.on('error', e => { clearTimeout(tid); reject(e); });
      if (options.body) req.write(options.body);
      req.end();
    });
  }

  reloadSynonymDB() {
    synonymMap = null;
    loadSynonymDB();
  }

  static getVersion() {
    return {
      version: '9.0.0',
      synonymCount: synonymMap ? synonymMap.size : 0,
      features: ['Dice系数', '语义相似词扩展', 'TTS优化', '语义增强(需Proxy)']
    };
  }
}

module.exports = SimilarityTool;

if (require.main === module) {
  const tool = new SimilarityTool();
  console.log('=== 中文语义相似度 v9 测试 ===\n');
  console.log('版本:', JSON.stringify(SimilarityTool.getVersion()));
  
  const tests = [
    { name: '相同文本', t1: '今天天气很好', t2: '今天天气很好', min: 95 },
    { name: '仅标点', t1: '今天天气很好。', t2: '今天天气很好！', min: 90 },
    { name: '近义词(修改/调整)', t1: '修改文本格式', t2: '调整文本排版', min: 80 },
    { name: '实质修改', t1: '今天天气很好', t2: '明天要下雨了', max: 50 },
    { name: 'TTS时间戳', t1: '[00:00:00]今天天气很好', t2: '[00:00:05]今天天气很好', min: 90 },
    { name: '无内容', t1: '', t2: '', expect: 1 },
    { name: '同义词(部署/布署)', t1: '部署服务器', t2: '布署服务器', min: 80 },
    { name: '约束/限制', t1: '约束条件', t2: '限制条件', min: 80 },
    { name: '长短文本', t1: '今天天气很好', t2: '今天天气很好适合外出活动明天预计下雨降温', min: 40 },
  ];
  
  let pass = 0, fail = 0;
  for (const t of tests) {
    const sim = tool.calculateForTTS(t.t1, t.t2);
    const pct = Math.round(sim * 100);
    let ok;
    if (t.expect !== undefined) ok = sim === t.expect;
    else if (t.min !== undefined) ok = pct >= t.min;
    else if (t.max !== undefined) ok = pct <= t.max;
    console.log(t.name + ': ' + pct + '% ' + (ok ? '✓' : '✗'));
    ok ? pass++ : fail++;
  }
  console.log('\n通过: ' + pass + '/' + (pass + fail));
}
