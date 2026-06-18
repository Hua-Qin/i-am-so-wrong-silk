/**
 * utils.js — 我很冤 · 通用工具函数
 *
 * 设计原则：
 *  - 零依赖、纯函数优先
 *  - 所有函数对 null/undefined 友好（不抛）
 *  - 字符串、数组、对象三类基础工具
 */

'use strict';

/**
 * 简单的唯一 ID 生成器（带前缀 + 时间窗 + 随机段）。
 * @param {string} [prefix='iasw']
 * @returns {string} 形如 "iasw-1a2b3c4d-3f9k"
 */
function uid(prefix = 'iasw') {
  const t = Date.now().toString(36).slice(-4);
  const r = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${t}${r}`;
}

/**
 * 判断值是否为非空字符串（trim 后仍有内容）。
 * @param {*} v
 * @returns {boolean}
 */
function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * 安全地把任意输入转为字符串数组。
 * @param {*} input
 * @returns {string[]}
 */
function toLines(input) {
  if (Array.isArray(input)) return input.map((x) => (x == null ? '' : String(x)));
  if (isNonEmptyString(input)) return input.split(/\r?\n/);
  return [];
}

/**
 * 修剪字符串两端的空白字符。
 * @param {string} s
 * @returns {string}
 */
function trim(s) {
  return isNonEmptyString(s) ? s.trim() : '';
}

/**
 * 深度合并多个对象（后面的覆盖前面的浅层字段；数组整体替换，不做数组合并）。
 * @param {...object} objs
 * @returns {object}
 */
function deepMerge(...objs) {
  const out = {};
  for (const o of objs) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) continue;
    for (const k of Object.keys(o)) {
      const v = o[k];
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        out[k] = deepMerge(out[k] || {}, v);
      } else {
        out[k] = v;
      }
    }
  }
  return out;
}

/**
 * 把对象数组按指定 key 分组。
 * @template T
 * @param {T[]} arr
 * @param {keyof T} key
 * @returns {Record<string, T[]>}
 */
function groupBy(arr, key) {
  const out = Object.create(null);
  if (!Array.isArray(arr)) return out;
  for (const item of arr) {
    if (!item) continue;
    const k = String(item[key]);
    if (!out[k]) out[k] = [];
    out[k].push(item);
  }
  return out;
}

/**
 * 计算两个字符串的相似度（基于字符集合的 Jaccard 系数，0~1）。
 * 仅用于"是否基本一样"的快速判断，不是真正的相似度算法。
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function similarity(a, b) {
  if (a === b) return 1;
  if (!isNonEmptyString(a) || !isNonEmptyString(b)) return 0;
  const sa = new Set(a.replace(/\s+/g, ''));
  const sb = new Set(b.replace(/\s+/g, ''));
  let inter = 0;
  for (const ch of sa) if (sb.has(ch)) inter++;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * 给一段文本追加一段内容，用换行连接。
 * @param {string} base
 * @param {string} add
 * @param {string} [sep='\n\n']
 * @returns {string}
 */
function appendText(base, add, sep = '\n\n') {
  if (!isNonEmptyString(base)) return add || '';
  if (!isNonEmptyString(add)) return base;
  return base + sep + add;
}

/**
 * 限制字符串最大长度（超过则截断并加省略号）。
 * @param {string} s
 * @param {number} max
 * @returns {string}
 */
function ellipsis(s, max = 200) {
  if (!isNonEmptyString(s)) return '';
  if (s.length <= max) return s;
  if (max <= 1) return s.slice(0, max);
  return s.slice(0, max - 1) + '…';
}

/**
 * 取出文本中所有"中文 / 英文单词 / 数字"组成的 token（>=2 字符），按出现顺序去重。
 * 用于粗粒度匹配"需求里的关键词在交付物里出现过没"。
 * @param {string} text
 * @param {number} [min=2]
 * @returns {string[]}
 */
function extractTokens(text, min = 2) {
  if (!isNonEmptyString(text)) return [];
  const seen = new Set();
  const out = [];
  const re = /[A-Za-z0-9]+|[一-鿿]{2,}/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const t = m[0];
    if (t.length < min) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

/**
 * 过滤出"区分度较高的 token"——剔除停用词和常见泛义词。
 * @param {string[]} tokens
 * @param {string[]} [extraStopwords]
 */
function filterStopwords(tokens, extraStopwords) {
  const STOP = new Set(
    (extraStopwords || [
      '实现', '需要', '可以', '能够', '应该', '必须', '要求', '支持', '提供',
      '使用', '用于', '关于', '通过', '进行', '以及', '并且', '一个', '这个',
      '那个', '这些', '那些', '我们', '你们', '他们', '它的',
      '模块', '功能', '函数', '方法', '字段', '属性', '接口', '类',
      'a', 'the', 'and', 'or', 'to', 'of', 'for', 'with', 'in', 'on', 'is', 'are',
    ]).map((s) => String(s).toLowerCase())
  );
  return (tokens || []).filter((t) => !STOP.has(String(t).toLowerCase()));
}

/**
 * 规范化字符串用于比较：去空白、转小写。
 */
function normalize(s) {
  return isNonEmptyString(s) ? s.replace(/\s+/g, '').toLowerCase() : '';
}

/**
 * 安全地尝试 JSON 解析。
 * @param {string} text
 * @returns {{ok:boolean, value?:any, error?:string}}
 */
function tryParseJSON(text) {
  if (!isNonEmptyString(text)) return { ok: false, error: 'empty input' };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

module.exports = {
  uid,
  isNonEmptyString,
  toLines,
  trim,
  deepMerge,
  groupBy,
  similarity,
  appendText,
  ellipsis,
  extractTokens,
  filterStopwords,
  normalize,
  tryParseJSON,
};