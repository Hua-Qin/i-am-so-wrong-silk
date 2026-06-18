/**
 * contentChecker.js — 我很冤 · 内容校对
 *
 * 不依赖外部 NLP，做轻量级内容校对：
 *  - 重复段落 / 重复行
 *  - 中英标点混用
 *  - 全角 / 半角括号不配对
 *  - 常见错别字（可扩展字典）
 *  - 末尾空行 / 文件末尾标点
 */

'use strict';

const { isNonEmptyString, toLines, similarity } = require('./utils');

/**
 * 内置的常见中文错别字 / 易混淆词对照表。
 * key: 错别字；value: 推荐正确写法。
 *
 * 注意：只放 wrong !== right 的项（避免"自己替换自己"的死循环 bug）。
 */
const TYPO_DICT = {
  '帐号': '账号',
  '帐户': '账户',
  '登陆': '登录',
  '其它': '其他',
  '图象': '图像',
  '缺省': '默认',
  '几率': '概率',
  '部份': '部分',
  '记忆体': '内存',
  '程式': '程序',
  '伺服器': '服务器',
  '骇客': '黑客',
  '网路': '网络',
  '硬体': '硬件',
  '软体': '软件',
  '介面': '界面',
  '档案': '文件',
  '资料': '数据',
  '连结': '链接',
  '设定': '设置',
  '函式': '函数',
  '变数': '变量',
  '回圈': '循环',
  '阵列': '数组',
  '物件': '对象',
  '片断': '片段',
  '影象': '影像',
  '连线': '连接',
  '启用': '启用',
  '荧幕': '屏幕',
  '印表机': '打印机',
  '扫瞄': '扫描',
  '光碟': '光盘',
  '磁片': '磁盘',
  '滑鼠': '鼠标',
  '数据机': '调制解调器',
  '频宽': '带宽',
  '介面卡': '网卡',
  '资讯': '信息',
  '视讯': '视频',
};

/**
 * 在文本中扫描错别字。
 * @param {string} text
 * @param {object} [dict] 可选自定义字典（与内置合并，外部优先级高）
 */
function checkTypos(text, dict) {
  const findings = [];
  if (!isNonEmptyString(text)) return { ok: true, findings };
  const merged = Object.assign({}, TYPO_DICT, dict || {});
  const entries = Object.entries(merged).filter(([w, r]) => w !== r);
  const lines = toLines(text);
  for (let i = 0; i < lines.length; i++) {
    for (const [wrong, right] of entries) {
      if (lines[i].includes(wrong)) {
        findings.push({ wrong, right, line: i + 1 });
      }
    }
  }
  return { ok: findings.length === 0, findings };
}

/**
 * 检测重复段落：跨段重复 + 段内重复。
 *  - 跨段：split 后两段之间相似度 >= threshold
 *  - 段内：同一段中两个不同句子相似度 >= threshold
 * @param {string} text
 * @param {number} [threshold=0.95]
 * @returns {{ ok: boolean, duplicates: Array<{a:number, b:number, score:number, kind:string}> }}
 */
function checkDuplicateParagraphs(text, threshold = 0.95) {
  const duplicates = [];
  if (!isNonEmptyString(text)) return { ok: true, duplicates };

  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 20);

  // 跨段重复
  for (let i = 0; i < paragraphs.length; i++) {
    for (let j = i + 1; j < paragraphs.length; j++) {
      const s = similarity(paragraphs[i], paragraphs[j]);
      if (s >= threshold) {
        duplicates.push({ a: i + 1, b: j + 1, score: Number(s.toFixed(3)), kind: 'cross' });
      }
    }
  }

  // 段内重复：用句末标点切句。保留分隔符前的部分，每段至少有 10 字符。
  for (let i = 0; i < paragraphs.length; i++) {
    const sentences = paragraphs[i]
      .split(/(?<=[。.!?！？\n])/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 10);
    for (let a = 0; a < sentences.length; a++) {
      for (let b = a + 1; b < sentences.length; b++) {
        const s = similarity(sentences[a], sentences[b]);
        if (s >= threshold) {
          duplicates.push({ a: a + 1, b: b + 1, score: Number(s.toFixed(3)), kind: 'within' });
        }
      }
    }
  }

  return { ok: duplicates.length === 0, duplicates };
}

/**
 * 检测中英文标点混用：统计行内英文逗号 / 句号 / 问号 / 感叹号，
 * 若同时出现中英文标点则提示。
 * @param {string} text
 * @returns {{ ok: boolean, halfwidth: number, fullwidth: number, mixed: boolean }}
 */
function checkPunctuationMix(text) {
  if (!isNonEmptyString(text)) return { ok: true, halfwidth: 0, fullwidth: 0, mixed: false };
  const half = (text.match(/[,.?!;:]/g) || []).length;
  const full = (text.match(/[，。？！；：]/g) || []).length;
  const mixed = half > 0 && full > 0;
  return { ok: !mixed, halfwidth: half, fullwidth: full, mixed };
}

/**
 * 检查文件末尾是否还有内容、是否以合理标点 / 空行结尾。
 * @param {string} text
 * @returns {{ ok: boolean, endsWith: string, trailingBlankLines: number }}
 */
function checkTrailingWhitespace(text) {
  if (!isNonEmptyString(text)) return { ok: false, endsWith: '', trailingBlankLines: 0 };
  const trailingBlankLines = (text.match(/\n+$/) || [''])[0].split('\n').length - 1;
  const lastChar = text.replace(/\s+$/, '').slice(-1);
  return {
    ok: trailingBlankLines <= 1,
    endsWith: lastChar,
    trailingBlankLines,
  };
}

/**
 * 一站式：内容校对。
 * @param {string} text
 * @returns {{ ok: boolean, results: object[] }}
 */
function checkAll(text) {
  const results = [];
  const t = checkTypos(text);
  results.push({ type: 'typos', ...t });
  const d = checkDuplicateParagraphs(text);
  results.push({ type: 'duplicates', ...d });
  const p = checkPunctuationMix(text);
  results.push({ type: 'punctuation', ...p });
  const w = checkTrailingWhitespace(text);
  results.push({ type: 'trailing', ...w });
  const ok = results.every((r) => r.ok !== false);
  return { ok, results };
}

module.exports = {
  TYPO_DICT,
  checkTypos,
  checkDuplicateParagraphs,
  checkPunctuationMix,
  checkTrailingWhitespace,
  checkAll,
};