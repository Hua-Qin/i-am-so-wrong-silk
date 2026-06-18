/**
 * index.js — 我很冤 · Silk 库主入口（v2.0）
 *
 * 暴露给 AI Agent / Silk Runner 的能力集合。
 *
 * v2.0 新增：
 *  - lockTask()    锁定任务目标（intent lock）
 *  - challenge()   应对用户质疑（"我冤枉啊"）
 *  - optimizeProgram() 编程文本全面优化
 *  - runOnce()     单次自检（不需要多轮时使用）
 *
 * 工作流推荐：
 *   1) const lock = silk.lockTask(requirement)
 *   2) ... AI 干活，产出 deliverable + files ...
 *   3) silk.run({ lock, deliverable, files })          // 反复自检
 *   4) 用户质疑？silk.challenge({ userInput, lock, deliverable, files })
 */

'use strict';

const utils = require('./src/utils');
const syntaxChecker = require('./src/syntaxChecker');
const contentChecker = require('./src/contentChecker');
const styleChecker = require('./src/styleChecker');
const taskVerifier = require('./src/taskVerifier');
const editor = require('./src/editor');
const selfCheck = require('./src/selfCheck');
const intentLock = require('./src/intentLock');
const grievance = require('./src/grievance');
const programOptimizer = require('./src/programOptimizer');

/**
 * Silk 元数据（与 SILK.md / manifest.json 保持一致）。
 */
const meta = {
  name: 'i-am-so-wrong-silk',
  displayName: '我很冤',
  version: '2.0.0',
  description: '一个让 AI 反复自查、确保任务完完全全完成的 Silk 库（v2：任务锁定 + 质疑应对 + 编程文本全面优化）。',
  capabilities: [
    'lockTask',         // 任务锁定
    'selfCheckLoop',    // 多轮自查
    'runOnce',          // 单次自检
    'taskReconcile',    // 任务对账
    'goalCompare',      // 目标对照
    'syntaxCheck',      // 语法 / 格式
    'contentProofread', // 内容校对
    'styleCheck',       // 样式一致性
    'programOptimize',  // 编程文本全面优化（命名/复杂度/死代码/不安全模式）
    'challengeHandle',  // 质疑应对（"我冤枉啊"）
    'enhanceEdit',      // 增强编辑
  ],
};

/**
 * 触发词命中检查：用户的输入是否需要激活本库。
 * 同时覆盖"自查"和"质疑"两类信号。
 *
 * @param {string} userInput
 * @returns {boolean}
 */
function shouldTrigger(userInput) {
  const triggers = [
    '自查', '检查一下', '做完没', '有没有遗漏',
    '我做完的怎么样', '我冤', '冤枉',
    'i-am-so-wrong', 'i am so wrong', "i'm so wrong",
    'verify', 'self-check', 'self check',
    // 质疑信号也合并进来：用户说"你做错了"等也算触发
    '你做错了', '不对吧', '不对啊', '你漏了', '我没要',
    '再检查一遍', '重新做', '返工',
  ];
  const lower = String(userInput || '').toLowerCase();
  return triggers.some((t) => lower.includes(t.toLowerCase()));
}

/**
 * v2 推荐工作流：先锁定目标，再自检。
 *
 * @param {string} requirement   用户的原始需求
 * @param {string[]} [acceptance] 用户给的可选验收标准
 * @returns {object} lock        任务锁
 */
function lockTask(requirement, acceptance) {
  return intentLock.createLock({ requirement, acceptance });
}

/**
 * 一站式工作流：锁定 + 自检 + 格式化输出。
 *
 * @param {object} input
 * @param {string} input.requirement    用户原始需求（可与 lock 互斥，但 lock 优先）
 * @param {object} [input.lock]          任务锁（推荐）
 * @param {string} input.deliverable     AI 给用户的回复
 * @param {Array<{name:string, content:string}>} [input.files]
 * @param {number} [input.maxRounds=3]
 * @returns {string} 人类可读报告
 */
function run(input) {
  const opts = input || {};
  // 如果给了 requirement 但没给 lock，自动 lock
  const lock = opts.lock || (opts.requirement ? intentLock.createLock({ requirement: opts.requirement }) : null);
  const report = selfCheck.selfCheckLoop(Object.assign({}, opts, { lock }));
  return selfCheck.formatReport(report);
}

/**
 * 单次自检（粗 + 中 + 细各跑一次，不循环）。
 */
function runOnce(input) {
  const opts = input || {};
  const lock = opts.lock || (opts.requirement ? intentLock.createLock({ requirement: opts.requirement }) : null);
  const coarse = selfCheck.checkCoarse(Object.assign({}, opts, { lock }));
  const medium = selfCheck.checkMedium(opts.files || []);
  const fine = selfCheck.checkFine(opts.files || []);
  const allOk = coarse.allOk && medium.allOk && fine.allOk;
  return selfCheck.formatReport({
    rounds: [{ round: 1, id: 'once', coarse, medium, fine, allOk }],
    passed: allOk,
    allOk,
    target: (lock && lock.target) || opts.requirement || '',
    history: [allOk ? 'once: PASS' : 'once: FAIL'],
    fixPlan: allOk ? '' : selfCheck.buildFixPlan({ rounds: [{ round: 1, coarse, medium, fine, allOk }] }),
    summary: allOk ? '单次自检通过 🟢' : '单次自检未通过 🔴',
  });
}

/**
 * 应对用户质疑：返回带"我冤枉啊"人设的结构化响应。
 *
 * @param {object} args
 * @param {string} args.userInput
 * @param {object} args.lock
 * @param {string} args.deliverable
 * @param {Array<{name:string, content:string}>} [args.files]
 */
function challenge(args) {
  return grievance.handleChallenge(args || {});
}

/**
 * 编程文本全面优化：对一组代码文件给出改进建议清单。
 *
 * @param {Array<{name:string, content:string}>|string} filesOrCode
 * @param {object} [opts]  { language?: 'js'|'ts'|'py' }
 */
function optimizeProgram(filesOrCode, opts) {
  if (typeof filesOrCode === 'string') {
    const r = programOptimizer.audit(filesOrCode, opts);
    return Object.assign({ file: opts && opts.file }, r);
  }
  if (Array.isArray(filesOrCode)) {
    const all = [];
    let totalScore = 0;
    let count = 0;
    for (const f of filesOrCode) {
      const lang = (opts && opts.language) || guessLanguage(f.name);
      const r = programOptimizer.audit(f.content, { language: lang });
      all.push(Object.assign({ file: f.name }, r));
      totalScore += r.score;
      count++;
    }
    return {
      averageScore: count === 0 ? 100 : Math.round(totalScore / count),
      files: all,
      totalSuggestions: all.reduce((s, x) => s + x.suggestions.length, 0),
    };
  }
  return { files: [], totalSuggestions: 0, averageScore: 100 };
}

function guessLanguage(name) {
  const n = String(name || '').toLowerCase();
  if (n.endsWith('.ts') || n.endsWith('.tsx')) return 'ts';
  if (n.endsWith('.py')) return 'py';
  if (/\.(js|jsx|mjs|cjs)$/.test(n)) return 'js';
  return 'js';
}

module.exports = {
  meta,
  shouldTrigger,
  // 核心工作流
  lockTask,
  run,
  runOnce,
  challenge,
  optimizeProgram,
  // 子模块
  utils,
  syntax: syntaxChecker,
  content: contentChecker,
  style: styleChecker,
  task: taskVerifier,
  editor,
  selfCheck,
  intentLock,
  grievance,
  programOptimizer,
};