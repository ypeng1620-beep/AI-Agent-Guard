const tool = require('./similarity.js');

// Debug tokenization
const words1 = tool.tokenizeChinese('今天天气很好');
const words2 = tool.tokenizeChinese('明天要下雨了');
console.log('words1:', words1);
console.log('words2:', words2);

// Check stop words filter
const words1Filtered = words1.filter(w => w.length > 1 || !tool.constructor.CHINESE_STOP_WORDS.has(w));
const words2Filtered = words2.filter(w => w.length > 1 || !tool.constructor.CHINESE_STOP_WORDS.has(w));
console.log('words1 filtered:', words1Filtered);
console.log('words2 filtered:', words2Filtered);

// Calculate TF
const tf1 = tool.computeTF(words1Filtered);
const tf2 = tool.computeTF(words2Filtered);
console.log('tf1:', tf1);
console.log('tf2:', tf2);

// Check IDF
const idf = tool.computeIDF([words1Filtered, words2Filtered]);
console.log('idf:', idf);

// Check vector
const vec1 = tool.toTFIDFVector(tf1, idf);
const vec2 = tool.toTFIDFVector(tf2, idf);
console.log('vec1:', vec1);
console.log('vec2:', vec2);

// Final similarity
const sim = tool.cosineSimilarity(vec1, vec2);
console.log('similarity:', sim);
