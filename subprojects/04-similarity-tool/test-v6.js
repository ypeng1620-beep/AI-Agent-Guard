// Simple standalone test for v6 similarity - word-level comparison

const fs = require('fs');
const path = require('path');

const STOP_WORDS = new Set([
  '的','地','得','了','着','过','啊','呀','吧','呢','吗',
  '哦','嗯','噢','唉','哎','喂','嘿','哈','呵','嘻','哼',
  '这','那','哪','谁','什么','怎么','和','与','在','于',
  '从','到','把','被','让','给','向','对','为','以'
]);

// Load synonym DB
const db = JSON.parse(fs.readFileSync(path.join(__dirname, 'synonym-db.json'), 'utf8'));
const synonymMap = new Map();
const synonymWordSet = new Set(); // All words that appear in synonym relationships

for (const category of Object.values(db)) {
  if (typeof category !== 'object') continue;
  for (const [word, synonyms] of Object.entries(category)) {
    if (!Array.isArray(synonyms)) continue;
    
    synonymWordSet.add(word);
    synonymWordSet.add(word); // add self
    
    for (const syn of synonyms) {
      synonymWordSet.add(syn);
      synonymWordSet.add(word);
    }
  }
}

console.log('Synonym DB loaded:', synonymWordSet.size, 'words');

function tokenize(text) {
  const words = [];
  const chars = text.split('').filter(c => /[\u4e00-\u9fa5]/.test(c));
  const filtered = chars.filter(c => !STOP_WORDS.has(c));
  for (let i = 0; i < filtered.length - 1; i++) {
    words.push(filtered[i] + filtered[i + 1]);
  }
  return words;
}

function getSynonymSet(word) {
  const set = new Set([word]);
  for (const [key, val] of synonymMap) {
    if (key === word || val.has(word)) {
      for (const v of val) set.add(v);
    }
  }
  return set;
}

// Build bidirectional synonym map
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

// Strategy: treat synonym pairs as equivalent when comparing
function computeSimilarity(text1, text2) {
  const words1 = tokenize(text1);
  const words2 = tokenize(text2);
  
  if (words1.length === 0 && words2.length === 0) return 1;
  if (words1.length === 0 || words2.length === 0) return 0;
  
  // Build equivalence classes
  // For each word in text1, find its synonym set
  // For each word in text2, check if any word in its synonym set matches
  
  let matchCount = 0;
  const used2 = new Set();
  
  for (const w1 of words1) {
    const syns1 = synonymMap.get(w1) || new Set([w1]);
    
    for (const w2 of words2) {
      if (used2.has(w2)) continue;
      
      if (syns1.has(w2)) {
        matchCount++;
        used2.add(w2);
        break;
      }
    }
  }
  
  // Similarity = 2 * matches / total words
  const similarity = (2 * matchCount) / (words1.length + words2.length);
  return similarity;
}

// Test cases
const tests = [
  { name: '相同文本', t1: '今天天气很好', t2: '今天天气很好', min: 95 },
  { name: '仅标点', t1: '今天天气很好。', t2: '今天天气很好！', min: 90 },
  { name: '近义词(修改/调整)', t1: '修改文本格式', t2: '调整文本排版', min: 80 },
  { name: '实质修改', t1: '今天天气很好', t2: '明天要下雨了', max: 50 },
  { name: 'TTS时间戳', t1: '[00:00:00]今天天气很好', t2: '[00:00:05]今天天气很好', min: 90 },
  { name: '无内容', t1: '', t2: '', expect: 1 },
  { name: '同义词(部署/布署)', t1: '部署服务器', t2: '布署服务器', min: 80 },
  { name: '约束/限制', t1: '约束条件', t2: '限制条件', min: 80 },
];

console.log('\n=== v6 相似词直接匹配测试 ===\n');

let pass = 0, fail = 0;
for (const t of tests) {
  const sim = computeSimilarity(t.t1, t.t2);
  const pct = Math.round(sim * 100);
  let ok;
  if (t.expect !== undefined) ok = sim === t.expect;
  else if (t.min !== undefined) ok = pct >= t.min;
  else if (t.max !== undefined) ok = pct <= t.max;
  console.log(t.name + ': ' + pct + '% ' + (ok ? '✓' : '✗'));
  ok ? pass++ : fail++;
}
console.log('\n通过: ' + pass + '/' + (pass + fail));
