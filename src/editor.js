/**
 * editor.js — 我很冤 · 增强编辑能力
 *
 * 提供"精准编辑"工具：
 *  - 局部替换（先定位后改写，避免误伤上下文）
 *  - 改写 / 润色（保留语义，调整措辞与结构）
 *  - 扩写 / 缩写
 *  - 中英互译占位
 *
 * 真正的"生成"由 AI 完成，本模块只提供结构化的入口与提示词骨架。
 */

'use strict';

const { isNonEmptyString, ellipsis, trim, appendText } = require('./utils');

/**
 * 在文本中查找某段字符串的精确位置（行号 + 列号）。
 * @param {string} text
 * @param {string} needle
 * @returns {Array<{line:number, col:number, context:string}>}
 */
function findOccurrences(text, needle) {
  if (!isNonEmptyString(text) || !isNonEmptyString(needle)) return [];
  const lines = text.split(/\r?\n/);
  const result = [];
  for (let i = 0; i < lines.length; i++) {
    let from = 0;
    while (true) {
      const idx = lines[i].indexOf(needle, from);
      if (idx === -1) break;
      result.push({
        line: i + 1,
        col: idx + 1,
        context: ellipsis(lines[i], 120),
      });
      from = idx + needle.length;
    }
  }
  return result;
}

/**
 * 构造"局部替换"的操作指令（AI 端据此改写）。
 * @param {string} file
 * @param {string} oldSnippet
 * @param {string} newSnippet
 */
function makeReplaceOp(file, oldSnippet, newSnippet) {
  return {
    op: 'replace',
    file: trim(file),
    old: oldSnippet,
    new: newSnippet,
    note: '精准替换：请勿改动 old/new 之外的内容',
  };
}

/**
 * 构造"重写"操作指令。
 * @param {string} file
 * @param {string} scope
 * @param {string} instruction
 */
function makeRewriteOp(file, scope, instruction) {
  return {
    op: 'rewrite',
    file: trim(file),
    scope: trim(scope),
    instruction: trim(instruction),
    note: '重写：仅改动 scope 标注的段落，保持其余部分不变',
  };
}

/**
 * 构造"扩写 / 缩写"指令。
 * @param {string} file
 * @param {string} scope
 * @param {'expand'|'shrink'} mode
 * @param {number} factor
 */
function makeLengthOp(file, scope, mode, factor) {
  const f = Number.isFinite(factor) && factor > 0 ? factor : (mode === 'expand' ? 1.5 : 0.7);
  return {
    op: mode,
    file: trim(file),
    scope: trim(scope),
    factor: f,
    note: mode === 'expand'
      ? `扩写：目标长度约为原 ${f} 倍，补充细节 / 例子 / 背景`
      : `缩写：目标长度约为原 ${f} 倍，保留关键信息，删减修饰`,
  };
}

/**
 * 把多个编辑操作拼成一个 patch 计划。
 * @param {...object} ops
 * @returns {string}
 */
function plan(...ops) {
  const out = ['# 编辑计划 (i-am-so-wrong-silk editor)', ''];
  for (const op of ops) {
    if (!op) continue;
    out.push(`## 操作：${op.op}`);
    if (op.file) out.push(`- 文件：\`${op.file}\``);
    if (op.scope) out.push(`- 范围：${op.scope}`);
    if (op.instruction) out.push(`- 指令：${op.instruction}`);
    if (op.factor) out.push(`- 系数：${op.factor}`);
    if (op.old != null) {
      out.push('- 旧内容：');
      out.push('```');
      out.push(String(op.old));
      out.push('```');
    }
    if (op.new != null) {
      out.push('- 新内容：');
      out.push('```');
      out.push(String(op.new));
      out.push('```');
    }
    if (op.note) out.push(`- 备注：${op.note}`);
    out.push('');
  }
  return out.join('\n');
}

/**
 * 简单的润色规则（仅做可机器化的最低限度润色，不替代 AI 重写）。
 *  - 合并连续空行
 *  - 去除行尾空白
 *  - 修正中文 / 英文之间的多余空格
 * @param {string} text
 * @returns {string}
 */
function lightPolish(text) {
  if (!isNonEmptyString(text)) return '';
  return text
    .replace(/[ \t]+$/gm, '')                  // 行尾空白
    .replace(/\n{3,}/g, '\n\n')                // 多余空行
    .replace(/([一-鿿])\s+([A-Za-z0-9])/g, '$1$2')
    .replace(/([A-Za-z0-9])\s+([一-鿿])/g, '$1$2');
}

/**
 * 把 N 个文本片段拼成一个章节（自动空行连接）。
 * @param {...string} parts
 */
function joinSections(...parts) {
  return parts.filter((p) => isNonEmptyString(p)).join('\n\n');
}

/**
 * 拼接两段文本的便捷函数。
 * @param {string} base
 * @param {string} add
 */
function append(base, add) {
  return appendText(base, add);
}

/**
 * 基于"质疑场景"构造一组精准修复操作：
 *  - 优先用 findOccurrences 找位置
 *  - 自动给出 replace 操作（old → 修复建议）
 *
 * @param {string} file
 * @param {string} content
 * @param {Array<{type:string, line:number, message:string, advice:string}>} findings
 */
function challengePatch(file, content, findings) {
  const ops = [];
  if (!Array.isArray(findings)) return ops;
  for (const f of findings) {
    // 只为带行号的 finding 产出 replace 骨架
    if (typeof f.line !== 'number' || !content) continue;
    const lines = content.split(/\r?\n/);
    const oldLine = lines[f.line - 1] || '';
    if (!oldLine) continue;
    ops.push(makeReplaceOp(file, oldLine, oldLine + '  /* FIXME: ' + f.message + ' */'));
  }
  return ops;
}

module.exports = {
  findOccurrences,
  makeReplaceOp,
  makeRewriteOp,
  makeLengthOp,
  plan,
  lightPolish,
  joinSections,
  append,
  challengePatch,
};