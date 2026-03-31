// Simple standalone test for v5 similarity

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

for (const category of Object.values(db)) {
  if (typeof category !== 'object') continue;
  for (const [word, synonyms] of Object.entries(category)) {
    if (!Array.isArray(synonyms)) continue;
    
    const synSet = new Set(synonyms);
    synSet.add(word);
    synonymMap.set(word, synSet);
    
    for (const syn of synonyms) {
      if (!synonymMap.has(syn)) synonymMap.set(syn, new Set());
      synonymMap.get(syn).add(word);
      synonymMap.get(syn).add(syn);
    }
  }
}

console.log('Synonym DB loaded:', synonymMap.size, 'entries');
console.log('synonyms for 修改:', synonymMap.get('修改'));
console.log('synonyms for 调整:', synonymMap.get('调整'));
console.log('synonyms for 部署:', synonymMap.get('部署'));
console.log('synonyms for 约束:', synonymMap.get('约束'));

function tokenize(text) {
  const words = [];
  const chars = text.split('').filter(c => /[\u4e00-\u9fa5]/.test(c));
  const filtered = chars.filter(c => !STOP_WORDS.has(c));
  for (let i = 0; i < filtered.length - 1; i++) {
    words.push(filtered[i] + filtered[i + 1]);
  }
  return words;
}

function expandWithSynonyms(words) {
  const expanded = new Set();
  for (const word of words) {
    expanded.add(word);
    const synSet = synonymMap.get(word);
    if (synSet) {
      for (const syn of synSet) {
        expanded.add(syn);
        for (let i = 0; i < syn.length - 1; i++) {
          expanded.add(syn.substring(i, i + 2));
        }
      }
    }
  }
  return expanded;
}

function computeSimilarity(ext1, ext2) {
  if (ext1.size === 0 && ext2.size === 0) return 1;
  if (ext1.size === 0 || ext2.size === 0) return 0;
  
  const intersection = new Set([...ext1].filter(w => ext2.has(w)));
  const union = new Set([...ext1, ...ext2]);
  
  return intersection.size / union.size;
}

// Test cases
const tests = [
  ['修改文本格式', '调整文本排版'],
  ['部署服务器', '布署服务器'],
  ['约束条件', '限制条件'],
  ['今天天气很好', '今天天气很好'],
];

for (const [t1, t2] of tests) {
  const w1 = tokenize(t1);
  const w2 = tokenize(t2);
  const ext1 = expandWithSynonyms(w1);
  const ext2 = expandWithSynonyms(w2);
  const sim = computeSimilarity(ext1, ext2);
  
  console.log('\nTest: "' + t1 + '" vs "' + t2 + '"');
  console.log('  w1:', w1);
  console.log('  w2:', w2);
  console.log('  ext1:', [...ext1].slice(0, 8));
  console.log('  ext2:', [...ext2].slice(0, 8));
  console.log('  similarity:', Math.round(sim * 100) + '%');
}
