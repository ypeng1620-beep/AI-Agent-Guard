// v7: Simple 2-gram Jaccard WITHOUT stop word filtering

const fs = require('fs');
const path = require('path');

// Load synonym DB
const db = JSON.parse(fs.readFileSync(path.join(__dirname, 'synonym-db.json'), 'utf8'));
const synonymMap = new Map();

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

console.log('Synonym DB loaded:', synonymMap.size, 'entries');

function tokenize(text) {
  const chars = text.split('').filter(c => /[\u4e00-\u9fa5]/.test(c));
  const words = [];
  for (let i = 0; i < chars.length - 1; i++) {
    words.push(chars[i] + chars[i + 1]);
  }
  return words;
}

function computeSimilarity(text1, text2) {
  const words1 = tokenize(text1);
  const words2 = tokenize(text2);
  
  if (words1.length === 0 && words2.length === 0) return 1;
  if (words1.length === 0 || words2.length === 0) return 0;
  
  // Build synonym-expanded sets
  const set1 = new Set();
  const set2 = new Set();
  
  for (const w of words1) {
    set1.add(w);
    const syns = synonymMap.get(w);
    if (syns) {
      for (const s of syns) set1.add(s);
    }
  }
  
  for (const w of words2) {
    set2.add(w);
    const syns = synonymMap.get(w);
    if (syns) {
      for (const s of syns) set2.add(s);
    }
  }
  
  const intersection = new Set([...set1].filter(w => set2.has(w)));
  const union = new Set([...set1, ...set2]);
  
  return intersection.size / union.size;
}

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

console.log('\n=== v7 无停用词过滤测试 ===\n');

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
