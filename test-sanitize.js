const sanitizeInput = (input, maxLength = 100000) => {
  if (typeof input !== 'string') return '';
  return input
    .slice(0, maxLength)
    .replace(/[\x00-\x1F\x7F]/g, '')
    .replace(/<[^>]*>/gi, '')
    .replace(/&[#\w]+;/gi, '')
    .replace(/data:[^,;]*,/gi, '')
    .trim();
};

console.log('onerror test:', JSON.stringify(sanitizeInput('<img src=x onerror="alert(1)">')));
console.log('javascript test:', JSON.stringify(sanitizeInput('<a href="javascript:alert(1)">click</a>')));
console.log('null byte test:', JSON.stringify(sanitizeInput('test\x00value')));
