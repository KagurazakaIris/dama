import type { OcrResult, SensitiveMatch } from '../shared/types';

interface PatternDef {
  name: string;
  key: string;
  regex: RegExp;
  priority: number;
}

const PATTERNS: PatternDef[] = [
  {
    name: '身份证号',
    key: 'idCard',
    regex: /\d{6}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]/g,
    priority: 20,
  },
  {
    name: '银行卡号',
    key: 'bankCard',
    regex: /(?:62|4\d|5[1-5])\d{2}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}(?:[\s-]?\d{1,4})?/g,
    priority: 18,
  },
  {
    name: '手机号',
    key: 'phone',
    regex: /1[3-9]\d{9}/g,
    priority: 15,
  },
  {
    name: '邮箱',
    key: 'email',
    regex: /[\w.+-]+@[\w.-]+\.\w{2,}/g,
    priority: 12,
  },
  {
    name: '护照号',
    key: 'passport',
    regex: /[EeGg]\d{8}/g,
    priority: 10,
  },
  {
    name: 'IP地址',
    key: 'ipAddress',
    regex: /(?:\d{1,3}\.){3}\d{1,3}/g,
    priority: 8,
  },
  {
    name: '车牌号',
    key: 'licensePlate',
    regex: /[\u4e00-\u9fa5][A-Z][A-Z0-9]{5,6}/g,
    priority: 7,
  },
];

export function detectSensitive(
  ocrResults: OcrResult[],
  enabledPatterns?: Record<string, boolean>,
): SensitiveMatch[] {
  const matches: SensitiveMatch[] = [];

  for (const ocrResult of ocrResults) {
    const text = ocrResult.text;

    for (const pattern of PATTERNS) {
      if (enabledPatterns && enabledPatterns[pattern.key] === false) continue;

      pattern.regex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.regex.exec(text)) !== null) {
        matches.push({
          patternName: pattern.name,
          matchedText: match[0],
          ocrResult,
        });
      }
    }
  }

  // Sort by priority (higher first)
  matches.sort((a, b) => {
    const pa = PATTERNS.find(p => p.name === a.patternName)?.priority || 0;
    const pb = PATTERNS.find(p => p.name === b.patternName)?.priority || 0;
    return pb - pa;
  });

  return matches;
}

export { PATTERNS };
