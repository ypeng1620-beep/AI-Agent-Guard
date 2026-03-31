// v9: Dice + synonym, no double counting

const fs = require('fs');
const path = require('path');

const db = JSON.parse(fs.readFileSync(path.join(__dirname, 'synonym-db.json'), 'utf8'));
const synonymMap = new Map();

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

console.log('Synonym DB: ' + synonymMap.size + ' entries');

function tokenize(text) {
  const chars = text.split('').filter(c => /[\u4e00-\u9fa5]/.test(c));
  const words = [];
  for (let i = 0; i < chars.length - 1; i++) words.push(chars[i] + chars[i + 1]);
  return words;
}

function computeSimilarity(text1, text2) {
  const words1 = tokenize(text1);
  const words2 = tokenize(text2);
  
  if (words1.length === 0 && words2.length === 0) return 1;
  if (words1.length === 0 || words2.length === 0) return 0;
  
  let matches = 0;
  const used1 = new Set();
  const used2 = new Set();
  
  // Pass 1: Direct bigram matches
  for (let i = 0; i < words1.length; i++) {
    if (used1.has(i)) continue;
    const w1 = words1[i];
    
    for (let j = 0; j < words2.length; j++) {
      if (used2.has(j)) continue;
      if (w1 === words2[j]) {
        matches += 2;  // 2x for direct
        used1.add(i);
        used2.add(j);
        break;
      }
    }
  }
  
  // Pass 2: Synonym bigram matches (only for unmatched words)
  for (let i = 0; i < words1.length; i++) {
    if (used1.has(i)) continue;
    const w1 = words1[i];
    const syns = synonymMap.get(w1) || new Set([w1]);
    
    for (let j = 0; j < words2.length; j++) {
      if (used2.has(j)) continue;
      const w2 = words2[j];
      if (syns.has(w2) && w1 !== w2) {
        matches += 1.5;  // 1.5x for synonym
        used1.add(i);
        used2.add(j);
        break;
      }
    }
  }
  
  // Dice coefficient
  const dice = (2 * matches) / (words1.length + words2.length);
  return Math.min(1, dice);  // Cap at 100%
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
  { name: '长短文本', t1: '今天天气很好', t2: '今天天气很好适合外出活动明天预计下雨降温', min: 40 },
];

console.log('\n=== v9 Dice+Synonym(无重复) 测试 ===\n');

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
