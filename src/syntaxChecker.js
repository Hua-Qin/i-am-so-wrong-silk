/**
 * syntaxChecker.js — 我很冤 · 语法 / 格式检查
 *
 * 不依赖任何外部库，做轻量级语法 / 格式检查：
 *  - JSON 合法性
 *  - JavaScript 括号配对
 *  - Markdown 标题层级跳跃
 *  - 列表符号一致性
 *  - YAML 基础格式
 *
 * 重大问题请交给专业工具（ESLint / Prettier / ajv 等）。
 */

'use strict';

const { isNonEmptyString, toLines, tryParseJSON } = require('./utils');

/**
 * 检查一段 JSON 字符串是否合法。
 * @param {string} text
 * @returns {{ ok: boolean, error?: string }}
 */
function checkJSON(text) {
  if (!isNonEmptyString(text)) {
    return { ok: false, error: 'empty input' };
  }
  const r = tryParseJSON(text);
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

/**
 * 字符级括号配对扫描：跳过字符串、模板字符串、行注释、块注释、JS 正则字面量。
 *
 * 注意：这是"轻量"实现，不保证能解析所有 JS 边界情况（如 regex 出现在
 * expression start 之外的歧义情形）。对于严肃的语法检查请交给 acorn/esprima。
 *
 * @param {string} code
 * @returns {{ ok: boolean, mismatches: Array<{line:number, char:string, expected:string}> }}
 */
function checkBrackets(code) {
  const mismatches = [];
  if (!isNonEmptyString(code)) return { ok: true, mismatches };

  const pairs = { '(': ')', '[': ']', '{': '}' };
  const closers = { ')': '(', ']': '[', '}': '{' };
  const stack = [];
  let line = 1;
  let inStr = null; // '"' | "'"
  let inTpl = false; // template literal `...`
  let inLineComment = false;
  let inBlockComment = false;
  let escape = false;
  const len = code.length;

  for (let i = 0; i < len; i++) {
    const ch = code[i];
    const next = i + 1 < len ? code[i + 1] : '';

    // ---- 换行 ----
    if (ch === '\n') {
      line++;
      inLineComment = false;
      continue;
    }
    if (inLineComment) continue;

    // ---- 块注释 ----
    if (inBlockComment) {
      if (ch === '*' && next === '/') { inBlockComment = false; i++; }
      continue;
    }

    // ---- 字符串 ----
    if (inStr) {
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === inStr) inStr = null;
      continue;
    }

    // ---- 模板字符串 ----
    if (inTpl) {
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === '`') { inTpl = false; continue; }
      continue;
    }

    // ---- 行注释 ----
    if (ch === '/' && next === '/') { inLineComment = true; i++; continue; }
    if (ch === '/' && next === '*') { inBlockComment = true; i++; continue; }

    // ---- JS 正则字面量（启发式：前一个非空字符是 expression-start 字符）----
    if (ch === '/') {
      let j = i - 1;
      while (j >= 0 && code[j] === ' ' || code[j] === '\t') j--;
      const prev = j >= 0 ? code[j] : '';
      const isRegexStart =
        i === 0 ||
        /[=,:;!&|?+\-*/%[({}\n;]/.test(prev) ||
        // 关键字后也被识别为 regex start
        /(return|typeof|in|of|new|delete|void|throw|case|do|else|yield|await)$/.test(
          code.slice(Math.max(0, j - 8), j + 1)
        );
      if (isRegexStart) {
        // 跳过正则体和 flags
        i++;
        while (i < len) {
          if (code[i] === '\\') { i += 2; continue; }
          if (code[i] === '\n') break; // 不应跨行
          if (code[i] === '[') {
            // 字符类：跳到匹配的 ]
            i++;
            while (i < len && code[i] !== ']') {
              if (code[i] === '\\') i++;
              i++;
            }
            continue;
          }
          if (code[i] === '/') {
            i++;
            while (i < len && /[gimsuy]/.test(code[i])) i++;
            i--;
            break;
          }
          i++;
        }
        continue;
      }
    }

    // ---- 进入字符串 / 模板 ----
    if (ch === '"' || ch === "'") { inStr = ch; continue; }
    if (ch === '`') { inTpl = true; continue; }

    // ---- 括号 ----
    if (pairs[ch]) {
      stack.push({ ch, line });
    } else if (closers[ch]) {
      const top = stack.pop();
      if (!top || top.ch !== closers[ch]) {
        mismatches.push({ line, char: ch, expected: top ? pairs[top.ch] : closers[ch] });
      }
    }
  }
  if (stack.length > 0) {
    for (const item of stack) {
      mismatches.push({ line: item.line, char: item.ch, expected: pairs[item.ch] });
    }
  }
  return { ok: mismatches.length === 0, mismatches };
}

/**
 * 检查 Markdown 标题层级是否有跳跃（例如从 H1 直接跳到 H4）。
 * @param {string} text
 * @returns {{ ok: boolean, jumps: Array<{from:number, to:number, line:number}> }}
 */
function checkMarkdownHeadings(text) {
  const lines = toLines(text);
  const jumps = [];
  let prevLevel = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = /^(#{1,6})\s+/.exec(lines[i]);
    if (!m) continue;
    const level = m[1].length;
    if (prevLevel > 0 && level > prevLevel + 1) {
      jumps.push({ from: prevLevel, to: level, line: i + 1 });
    }
    prevLevel = level;
  }
  return { ok: jumps.length === 0, jumps };
}

/**
 * 检查 Markdown 无序列表的符号是否一致（不能混用 - 和 *）。
 * @param {string} text
 * @returns {{ ok: boolean, mixed: boolean, dash:number, star:number, plus:number }}
 */
function checkMarkdownListStyle(text) {
  const lines = toLines(text);
  let dash = 0; let star = 0; let plus = 0;
  for (const l of lines) {
    if (/^\s*-\s+/.test(l)) dash++;
    else if (/^\s*\*\s+/.test(l)) star++;
    else if (/^\s*\+\s+/.test(l)) plus++;
  }
  const used = [dash > 0, star > 0, plus > 0].filter(Boolean).length;
  return { ok: used <= 1, mixed: used > 1, dash, star, plus };
}

/**
 * YAML 基础检查：制表符缩进 + 冒号后空格。
 * @param {string} text
 * @returns {{ ok: boolean, issues: string[] }}
 */
function checkYAMLBasic(text) {
  const issues = [];
  const lines = toLines(text);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/\t/.test(l)) issues.push(`line ${i + 1}: 包含制表符缩进`);
    if (/^[^#\s][^:]*:[^\s]/.test(l)) issues.push(`line ${i + 1}: 冒号后缺少空格`);
  }
  return { ok: issues.length === 0, issues };
}

/**
 * Python 轻量括号配对（不解析字符串内的三引号，但通常够用）。
 * @param {string} code
 */
function checkPythonBrackets(code) {
  const mismatches = [];
  if (!isNonEmptyString(code)) return { ok: true, mismatches };
  const pairs = { '(': ')', '[': ']', '{': '}' };
  const closers = { ')': '(', ']': '[', '}': '{' };
  const stack = [];
  let line = 1;
  let inSingle = false;
  let inDouble = false;
  const len = code.length;
  for (let i = 0; i < len; i++) {
    const ch = code[i];
    if (ch === '\n') { line++; inSingle = false; continue; }
    if (inSingle) { if (ch === "'") inSingle = false; continue; }
    if (inDouble) { if (ch === '"') inDouble = false; continue; }
    // 跳过行注释
    if (ch === '#') { while (i < len && code[i] !== '\n') i++; line++; continue; }
    // 三引号字符串：暂不处理（占绝大多数实际场景）
    if (ch === "'" && code[i + 1] === "'" && code[i + 2] === "'") {
      i += 3;
      while (i < len && !(code[i] === "'" && code[i + 1] === "'" && code[i + 2] === "'")) {
        if (code[i] === '\n') line++;
        i++;
      }
      i += 2;
      continue;
    }
    if (ch === '"' && code[i + 1] === '"' && code[i + 2] === '"') {
      i += 3;
      while (i < len && !(code[i] === '"' && code[i + 1] === '"' && code[i + 2] === '"')) {
        if (code[i] === '\n') line++;
        i++;
      }
      i += 2;
      continue;
    }
    if (ch === "'") { inSingle = true; continue; }
    if (ch === '"') { inDouble = true; continue; }
    if (pairs[ch]) stack.push({ ch, line });
    else if (closers[ch]) {
      const top = stack.pop();
      if (!top || top.ch !== closers[ch]) {
        mismatches.push({ line, char: ch, expected: top ? pairs[top.ch] : closers[ch] });
      }
    }
  }
  if (stack.length > 0) {
    for (const item of stack) mismatches.push({ line: item.line, char: item.ch, expected: pairs[item.ch] });
  }
  return { ok: mismatches.length === 0, mismatches };
}

/**
 * 一站式：根据文件扩展名自动选择检查器。
 * @param {string} filename
 * @param {string} content
 * @returns {{ ok: boolean, findings: object[] }}
 */
function autoCheck(filename, content) {
  const findings = [];
  const lower = String(filename || '').toLowerCase();

  if (lower.endsWith('.json')) {
    const r = checkJSON(content);
    findings.push({ type: 'json', ...r });
  }
  if (/\.(js|ts|jsx|tsx|mjs|cjs)$/.test(lower)) {
    const r = checkBrackets(content);
    findings.push({ type: 'brackets', ...r });
  }
  if (lower.endsWith('.py')) {
    const r = checkPythonBrackets(content);
    findings.push({ type: 'python.brackets', ...r });
  }
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) {
    const h = checkMarkdownHeadings(content);
    if (!h.ok) findings.push({ type: 'markdown.headings', ...h });
    const ls = checkMarkdownListStyle(content);
    if (!ls.ok) findings.push({ type: 'markdown.listStyle', ...ls });
  }
  if (lower.endsWith('.yml') || lower.endsWith('.yaml')) {
    const y = checkYAMLBasic(content);
    if (!y.ok) findings.push({ type: 'yaml', ...y });
  }
  // 没有命中任何检查器但文件非空：视为 ok
  if (findings.length === 0) return { ok: true, findings };
  const ok = findings.every((f) => f.ok !== false);
  return { ok, findings };
}

module.exports = {
  checkJSON,
  checkBrackets,
  checkPythonBrackets,
  checkMarkdownHeadings,
  checkMarkdownListStyle,
  checkYAMLBasic,
  autoCheck,
};