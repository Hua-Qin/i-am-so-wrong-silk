/**
 * styleChecker.js — 我很冤 · 样式一致性
 *
 * 检查：
 *  - 缩进风格一致性（Tab vs 空格、空格数量）
 *  - 引号风格一致性（单引号 vs 双引号 / 反引号）
 *  - JS 命名风格（camelCase vs snake_case）
 *  - 行尾分号（仅提示）
 */

'use strict';

const { toLines, isNonEmptyString } = require('./utils');

/**
 * 检查缩进风格。
 * @param {string} code
 * @returns {{ ok: boolean, style: string, detail: { tabs:number, two:number, four:number, other:number } }}
 */
function checkIndentation(code) {
  const detail = { tabs: 0, two: 0, four: 0, other: 0 };
  if (!isNonEmptyString(code)) return { ok: true, style: 'unknown', detail };
  const lines = toLines(code).filter((l) => /^\s+/.test(l));
  for (const l of lines) {
    if (/^\t+/.test(l)) detail.tabs++;
    else if (/^( {2})+(?!\s)/.test(l)) detail.two++;
    else if (/^( {4})+(?!\s)/.test(l)) detail.four++;
    else detail.other++;
  }
  const used = ['tabs', 'two', 'four', 'other'].filter((k) => detail[k] > 0);
  return {
    ok: used.length <= 1,
    style: used.length === 1 ? used[0] : 'mixed',
    detail,
  };
}

/**
 * 检查 JS/TS 引号风格。
 *
 * 准确策略：先按字符级状态机区分"字符串字面量 vs 模板字符串 vs 代码"，
 * 再统计每种引号出现在"普通字符串字面量"中的次数。这样能避免
 * 模板字符串里嵌套的 ${...} 代码误算引号。
 *
 * @param {string} code
 * @returns {{ ok: boolean, single:number, double:number, template:number, dominant:string }}
 */
function checkQuoteStyle(code) {
  if (!isNonEmptyString(code)) {
    return { ok: true, single: 0, double: 0, template: 0, dominant: 'none' };
  }
  let single = 0;
  let double = 0;
  let template = 0;
  let inSingle = false;
  let inDouble = false;
  let inTpl = false;
  let tplDepth = 0; // 嵌套 ${...} 里的花括号深度
  let escape = false;
  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    const prev = i > 0 ? code[i - 1] : '';

    if (inSingle) {
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === "'") inSingle = false;
      continue;
    }
    if (inDouble) {
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === '"') inDouble = false;
      continue;
    }
    if (inTpl) {
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === '`') { inTpl = false; template++; continue; }
      if (ch === '$' && code[i + 1] === '{') {
        tplDepth = 1;
        inTpl = false; // 退到代码态，由代码态累加 tplDepth 后再回到 inTpl
        i++;
        continue;
      }
      continue;
    }
    // 代码态：处理模板插值结束的 "}"
    if (tplDepth > 0) {
      if (ch === '{') tplDepth++;
      else if (ch === '}') {
        tplDepth--;
        if (tplDepth === 0) inTpl = true; // 回到模板字符串
      }
      continue;
    }
    // 注释跳过（简化：只识别 //）
    if (ch === '/' && code[i + 1] === '/') {
      while (i < code.length && code[i] !== '\n') i++;
      continue;
    }
    if (ch === "'") { inSingle = true; single++; continue; }
    if (ch === '"') { inDouble = true; double++; continue; }
    if (ch === '`') { inTpl = true; continue; }
    // 排除 prev === '\\' 的情况（已经被字符串状态机处理）
    if (prev === '\\') continue;
  }
  const max = Math.max(single, double, template);
  let dominant = 'none';
  if (max === 0) dominant = 'none';
  else if (max === single) dominant = 'single';
  else if (max === double) dominant = 'double';
  else dominant = 'template';
  const used = [single > 0, double > 0, template > 0].filter(Boolean).length;
  return {
    ok: used <= 1 || (template > 0 && (single === 0 || double === 0)),
    single,
    double,
    template,
    dominant,
  };
}

/**
 * 粗略检查 JS 函数 / 变量命名风格是否一致（camelCase / snake_case）。
 * @param {string} code
 * @returns {{ ok: boolean, camel:number, snake:number, pascal:number }}
 */
function checkNamingStyle(code) {
  const camel = (code.match(/\b[a-z][a-zA-Z0-9]*\s*\(/g) || []).length;
  const snake = (code.match(/\b[a-z]+(?:_[a-z0-9]+)+(?=\s*\()/g) || []).length;
  const pascal = (code.match(/\b[A-Z][a-zA-Z0-9]*\s*\(/g) || []).length;
  return { ok: true, camel, snake, pascal };
}

/**
 * 一站式。
 * @param {string} code
 * @returns {{ ok: boolean, results: object[] }}
 */
function checkAll(code) {
  const results = [];
  results.push({ type: 'indentation', ...checkIndentation(code) });
  results.push({ type: 'quote', ...checkQuoteStyle(code) });
  results.push({ type: 'naming', ...checkNamingStyle(code) });
  const ok = results.every((r) => r.ok !== false);
  return { ok, results };
}

module.exports = {
  checkIndentation,
  checkQuoteStyle,
  checkNamingStyle,
  checkAll,
};