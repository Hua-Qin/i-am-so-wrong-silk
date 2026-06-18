/**
 * intentLock.js — 我很冤 · 任务锁定（intent lock）
 *
 * 核心职责：
 *  1) 在 AI 开工**之前**，把用户的原始需求"焊死"成一个不可篡改的目标描述。
 *  2) 在 AI 完工**之后**，把"刚才那个目标"调出来，重新对账。
 *  3) 在用户**质疑**时，把目标原样回放，确保 AI 的回答始终围绕同一个目标。
 *
 * 设计原则：
 *  - 任务一旦锁定，所有自检 / 修复 / 优化都基于 lock.target 而不是最新的用户消息
 *  - 锁定信息包含：原始需求 / 验收标准（acceptance） / 时间戳 / 锁定者
 *  - 提供 staleness 判断：超过 STALE_THRESHOLD_MS 的 lock 会被标记为"可能过期"
 */

'use strict';

const { isNonEmptyString, uid, normalize } = require('./utils');

const DEFAULT_STALE_MS = 30 * 60 * 1000; // 30 分钟无更新视为可能过期

/**
 * 创建一把任务锁。
 * @param {object} input
 * @param {string} input.requirement   用户的原始需求
 * @param {string[]} [input.acceptance] 可选：用户给出的验收标准列表
 * @param {string} [input.lockedBy]   锁定者（一般是 AI 的标识）
 * @returns {{
 *   id: string,
 *   target: string,
 *   requirement: string,
 *   acceptance: string[],
 *   createdAt: number,
 *   updatedAt: number,
 *   lockedBy: string,
 *   state: 'locked'|'done'|'challenged'
 * }}
 */
function createLock(input) {
  const requirement = isNonEmptyString(input && input.requirement)
    ? String(input.requirement).trim()
    : '';
  if (!requirement) {
    throw new Error('intentLock: requirement is required');
  }
  const now = Date.now();
  return {
    id: uid('lock'),
    target: requirement, // 别名：target 即 requirement 的不可篡改副本
    requirement,
    acceptance: Array.isArray(input.acceptance)
      ? input.acceptance.filter(isNonEmptyString).map((s) => String(s).trim())
      : [],
    createdAt: now,
    updatedAt: now,
    lockedBy: isNonEmptyString(input.lockedBy) ? String(input.lockedBy) : 'silk',
    state: 'locked',
  };
}

/**
 * 更新已有 lock 的状态。
 * @param {object} lock
 * @param {string} newState
 */
function setState(lock, newState) {
  if (!lock) throw new Error('intentLock: lock is required');
  const allowed = ['locked', 'done', 'challenged'];
  if (!allowed.includes(newState)) {
    throw new Error(`intentLock: invalid state "${newState}"`);
  }
  return Object.assign({}, lock, { state: newState, updatedAt: Date.now() });
}

/**
 * 判断 lock 是否已过期（用户可能已经改主意）。
 */
function isStale(lock, thresholdMs) {
  if (!lock || typeof lock.updatedAt !== 'number') return true;
  const t = thresholdMs || DEFAULT_STALE_MS;
  return Date.now() - lock.updatedAt > t;
}

/**
 * 把 lock 渲染成可读的"目标陈述"，供 AI 在每一轮对话开头复读。
 */
function render(lock) {
  if (!lock) return '';
  const lines = [
    '🎯 任务锁定 (intent lock)',
    `   id: ${lock.id}`,
    `   state: ${lock.state}`,
    `   目标: ${lock.target}`,
  ];
  if (lock.acceptance && lock.acceptance.length) {
    lines.push('   验收标准:');
    for (const a of lock.acceptance) lines.push(`     - ${a}`);
  }
  if (isStale(lock)) {
    lines.push(`   ⚠️  锁已超过 ${Math.round((Date.now() - lock.updatedAt) / 60000)} 分钟未更新，建议确认用户是否变更了目标`);
  }
  return lines.join('\n');
}

/**
 * 目标对照：拿 lock.target 当原始需求，去 verify deliverable。
 * 复用 taskVerifier.compareToGoal 的能力。
 *
 * @param {object} lock
 * @param {string} deliverable   AI 这一轮给用户的回复
 * @param {string[]} [filesContent]  其它交付物文件内容
 */
function verifyAgainst(lock, deliverable, filesContent) {
  if (!lock) throw new Error('intentLock: lock is required');
  const task = require('./taskVerifier');
  const extra = (filesContent || []).filter(isNonEmptyString).join('\n\n');
  const merged = isNonEmptyString(deliverable) ? deliverable + '\n\n' + extra : extra;
  const compare = task.compareToGoal(lock.target, merged);
  const checklist = task.verify(lock.target, merged);
  const aligned = compare.ratio === 1;
  return {
    lock,
    compare,
    checklist,
    alignedWithGoal: aligned,
    completionRatio: checklist.ratio,
    summary: aligned
      ? `✅ 当前产物与原始目标完全对齐 (${compare.covered}/${compare.total} 关键词覆盖)`
      : `⚠️  当前产物与原始目标有偏离（已覆盖 ${compare.covered}/${compare.total}，${(compare.ratio * 100).toFixed(0)}%）`,
  };
}

/**
 * 把 lock 序列化成可嵌入 prompt 的字符串。
 */
function toPromptBlock(lock) {
  if (!lock) return '';
  const lines = [
    '【你当前的任务（已锁定，请勿擅自变更）】',
    lock.target,
  ];
  if (lock.acceptance && lock.acceptance.length) {
    lines.push('');
    lines.push('验收标准：');
    for (const a of lock.acceptance) lines.push(`- ${a}`);
  }
  return lines.join('\n');
}

/**
 * 内部：用于比较两个目标是否实质上一致（用于质疑场景：用户说"我没要这个"，但 lock 里有）。
 */
function targetsEqual(a, b) {
  return normalize(a) === normalize(b);
}

module.exports = {
  createLock,
  setState,
  isStale,
  render,
  verifyAgainst,
  toPromptBlock,
  targetsEqual,
  DEFAULT_STALE_MS,
};