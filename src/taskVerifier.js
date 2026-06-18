/**
 * taskVerifier.js — 我很冤 · 任务对账
 *
 * 帮 AI 把用户的原始需求拆解为可勾选的 checklist，
 * 并对照 AI 的实际产出逐条核验。
 */

'use strict';

const { isNonEmptyString, uid, extractTokens, filterStopwords, normalize } = require('./utils');

/**
 * 把一段自然语言需求拆解为 checklist 项（启发式）。
 *
 * 切分规则（按优先级）：
 *  1) 换行
 *  2) 中文句末标点（。！？；）+ 英文句末（. ! ? ;）
 *  3) "，并且 / 并且 / 并 / 还要 / 以及 / 另外 / 也" 等连接词前的顿号 / 逗号
 *  4) 数字编号（1. 1) 1、 (1) [1] 等）
 *  5) 项目符号（• - * ·）
 *  6) 顿号 / 逗号（在非连接词场景下做最后细分）
 *
 * @param {string} requirement
 * @returns {Array<{id:string, text:string, done:boolean}>}
 */
function parseRequirement(requirement) {
  if (!isNonEmptyString(requirement)) return [];
  const items = [];

  // 1) 粗切：行 / 句末 / 连接词
  const coarse = requirement
    .split(/\r?\n|[。！？;]|[.!?;]|(?:[，、]\s*(?=并且|并|还要|以及|另外|也))/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const line of coarse) {
    // 2) 编号 / 项目符号切
    const numbered = line.split(
      /(?:^|\s)(?:\d+[.、)]\s*|[（(]\d+[)）]\s*|\[\d+\]\s*|[•·\-*]\s+)/
    );
    for (const piece of numbered) {
      // 3) 剥连接词前缀
      const cleaned = piece.replace(/^(并且|并|还要|以及|另外|也)\s*/, '').trim();
      if (!cleaned) continue;
      // 4) 细分顿号 / 逗号（但不要把"实现 A、B、C"拆得过细）
      const sub = cleaned
        .split(/[、，,]/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 2);
      for (const s of sub) {
        items.push({ id: uid('req'), text: s, done: false });
      }
    }
  }

  if (items.length === 0) {
    items.push({ id: uid('req'), text: requirement.trim(), done: false });
  }
  return items;
}

/**
 * 对一组 checklist 项做"完成度"核验（基于关键词命中）。
 *
 * 命中规则：
 *  - 提取需求中的"区分度 token"（剔除停用词、过短词）
 *  - 交付物文本（大小写不敏感）只要出现该 token 即算命中
 *  - 命中率 = hits / tokens；>= HIT_THRESHOLD 视为该条已实现
 *
 * @param {Array<{id:string,text:string,done:boolean}>} items
 * @param {string} deliverable
 * @param {object} [opts]
 * @param {number} [opts.hitThreshold=0.5]
 */
function reconcile(items, deliverable, opts) {
  const hitThreshold = (opts && opts.hitThreshold) || 0.5;
  const out = [];
  const normDeliver = normalize(deliverable || '');
  for (const it of items || []) {
    const evidence = matchEvidence(it.text, normDeliver, hitThreshold);
    const done = Boolean(evidence);
    out.push({ ...it, done, evidence });
  }
  const total = out.length;
  const doneCount = out.filter((x) => x.done).length;
  return {
    total,
    done: doneCount,
    ratio: total === 0 ? 1 : doneCount / total,
    items: out,
  };
}

/**
 * 在已规范化的交付物文本中，找需求里 token 的命中证据。
 * @param {string} requirement
 * @param {string} normDeliverable
 * @param {number} threshold
 * @returns {string|null}
 */
function matchEvidence(requirement, normDeliverable, threshold) {
  if (!isNonEmptyString(requirement) || !isNonEmptyString(normDeliverable)) return null;
  const rawTokens = extractTokens(requirement, 2);
  const tokens = filterStopwords(rawTokens);
  if (tokens.length === 0) return null;
  const hits = tokens.filter((t) => normDeliverable.includes(String(t).toLowerCase()));
  if (hits.length === 0) return null;
  const ratio = hits.length / tokens.length;
  if (ratio < threshold) {
    return `部分命中(未达阈值): ${hits.slice(0, 5).join(', ')} (${hits.length}/${tokens.length} = ${(ratio * 100).toFixed(0)}%)`;
  }
  return `命中: ${hits.slice(0, 5).join(', ')} (${hits.length}/${tokens.length} = ${(ratio * 100).toFixed(0)}%)`;
}

/**
 * 完整流程：解析需求 + 对账产出。
 */
function verify(requirement, deliverable, opts) {
  const items = parseRequirement(requirement);
  return reconcile(items, deliverable, opts);
}

/**
 * 目标对照：把需求里提取出的关键 token 列出来，
 * 并在 deliverable 里逐个查询"是否出现 / 出现在哪"。
 *
 * 这就是"是否还符合刚开始的目标"的硬证据。
 *
 * @param {string} requirement
 * @param {string} deliverable
 * @returns {{
 *   goal: string,
 *   tokens: Array<{token:string, present:boolean, count:number, files:string[]}>,
 *   covered: number, total: number, ratio: number
 * }}
 */
function compareToGoal(requirement, deliverable) {
  const normReq = isNonEmptyString(requirement) ? requirement : '';
  const normDel = isNonEmptyString(deliverable) ? deliverable : '';
  const rawTokens = extractTokens(normReq, 2);
  const tokens = filterStopwords(rawTokens);
  const normLower = normalize(normDel);
  const items = tokens.map((t) => {
    const low = String(t).toLowerCase();
    let count = 0;
    if (normLower.includes(low)) {
      // 统计出现次数（简单次数）
      let idx = 0;
      while ((idx = normLower.indexOf(low, idx)) !== -1) {
        count++;
        idx += low.length;
      }
    }
    return { token: t, present: count > 0, count, files: [] };
  });
  const covered = items.filter((x) => x.present).length;
  return {
    goal: normReq,
    tokens: items,
    covered,
    total: items.length,
    ratio: items.length === 0 ? 1 : covered / items.length,
  };
}

module.exports = {
  parseRequirement,
  reconcile,
  verify,
  matchEvidence,
  compareToGoal,
};