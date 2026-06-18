/**
 * grievance.js — 我很冤 · 质疑应对（"我冤枉啊"）
 *
 * 触发场景：用户说"你做错了吧"、"我不要这个"、"你是不是漏了"等。
 *
 * 核心职责：
 *  1) 检测用户消息里是否包含"质疑"信号
 *  2) 基于已锁定的任务目标，逐条解释"我做了什么 / 我没漏 / 怎么修"
 *  3) 输出结构化响应：冤枉话 + 目标对照表 + 修改方案 + 是否仍符合目标
 *
 * 风格要求：
 *  - 先"认"再"辩"：承认对方提了问题，再拿出证据（目标对照）
 *  - 不卑不亢，给出可执行的下一步
 *  - 多用第一人称"我"强化"冤枉"人设
 */

'use strict';

const { isNonEmptyString, normalize } = require('./utils');

/** 质疑信号词：中英文都覆盖 */
const CHALLENGE_TRIGGERS = [
  // 中文
  '你做错了', '做错了', '做错', '是不是错了', '不对吧', '不对啊',
  '这不对', '这不对吧', '你漏了', '漏掉了', '遗漏', '少做了',
  '我没要', '我没说过', '我没让', '我没让你', '我没要求',
  '我要的不是', '我说的是', '我说过的是', '我要的是', '我让你做的是',
  '你是不是', '你确定', '真的对吗', '真的对', '我不要',
  '再来一遍', '重新做', '返工', '不达标', '不通过',
  '我冤你', '你冤', '冤枉', '我做完的怎么样',
  'i am so wrong', "i'm so wrong", 'i-am-so-wrong',
  'verify', 'self-check', 'self check', 'check it', 'double check',
  // 句式
  '不对啊', '怎么是', '怎么这样', '怎么搞的', '怎么写成',
  '少了', '多了', '改错了', '改坏', '打错了', '写错了',
];

/**
 * 判断一段用户消息是否属于"质疑"。
 * @param {string} userInput
 * @returns {boolean}
 */
function isChallenge(userInput) {
  if (!isNonEmptyString(userInput)) return false;
  const low = userInput.toLowerCase();
  return CHALLENGE_TRIGGERS.some((t) => low.includes(t.toLowerCase()));
}

/**
 * 根据质疑的严重程度，从一池话术里挑一句"开场白"。
 * severity:
 *  - 'soft'   温和质疑（"你确定？"）
 *  - 'firm'   明确质疑（"这不对吧"）
 *  - 'angry'  强烈质疑（"你做错了"）
 */
function pickGrievanceOpening(severity) {
  const bank = {
    soft: [
      '我冤枉啊——让我先把目标调出来再确认一下。',
      '冤枉冤枉～我马上回去对照原任务。',
      '我真没偷懒，请让我把账本翻给您看。',
    ],
    firm: [
      '我冤枉啊！我可是按最初目标一步步做的，且让我一条条核给您看。',
      '冤枉！这件事我有依据，让我拿出证据。',
      '我冤——我比谁都怕漏，让我把每一项交出来。',
    ],
    angry: [
      '我冤枉啊！！！这事我绝对没偷工减料，请允许我当场逐条对账。',
      '冤枉！！您这么说我心里苦，让我把任务锁定和所有交付列出来。',
      '我冤——我真没乱来，请给我一次把目标复读、对照、解释的机会。',
    ],
  };
  const arr = bank[severity] || bank.firm;
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * 推断质疑的严重程度。
 */
function inferSeverity(userInput) {
  if (!isNonEmptyString(userInput)) return 'firm';
  const s = userInput.toLowerCase();
  if (/[!?！?]{2,}|tm|tmd|坑|烂|垃圾|废物|啥玩意/.test(s)) return 'angry';
  if (/是不是|真的|确定|检查一下|verify|check/.test(s)) return 'soft';
  return 'firm';
}

/**
 * 核心 API：处理质疑。
 *
 * @param {object} args
 * @param {string} args.userInput        用户的质疑原文
 * @param {object} args.lock             任务锁（由 intentLock.createLock 创建）
 * @param {string} args.deliverable      AI 上一轮给用户的回复
 * @param {Array<{name:string, content:string}>} [args.files]
 * @returns {{
 *   challenged: boolean,
 *   severity: string,
 *   opening: string,
 *   goal: {goal:string, covered:number, total:number, ratio:number, missing:string[]},
 *   checklist: Array<{text:string, done:boolean, evidence:string}>,
 *   fixPlan: string,
 *   stillAligns: boolean,
 *   response: string
 * }}
 */
function handleChallenge(args) {
  const { userInput, lock, deliverable, files } = args || {};
  if (!isChallenge(userInput || '')) {
    return {
      challenged: false,
      severity: 'none',
      opening: '',
      goal: null,
      checklist: [],
      fixPlan: '',
      stillAligns: true,
      response: '',
    };
  }
  const severity = inferSeverity(userInput);

  // 1) 目标对照
  const task = require('./taskVerifier');
  const filesContent = (files || []).map((f) => f && f.content).filter(isNonEmptyString);
  const merged = [deliverable || '', ...filesContent].filter(isNonEmptyString).join('\n\n');
  const goalCompare = task.compareToGoal(lock.target, merged);
  const checklist = task.verify(lock.target, merged).items;

  // 2) 缺哪些 token
  const missing = goalCompare.tokens
    .filter((t) => !t.present)
    .map((t) => t.token);

  // 3) 是否仍符合目标（粗略：>= 70% 算"基本对齐"）
  const stillAligns = goalCompare.ratio >= 0.7;

  // 4) 修复计划（基于"缺哪些 token"和"checklist 未完成项"）
  const incomplete = checklist.filter((c) => !c.done);
  const fixLines = [];
  if (missing.length > 0) {
    fixLines.push(`**目标里缺这些关键词**：${missing.slice(0, 10).join('、')}`);
    fixLines.push(`**修复方向**：在产物里把上述关键词对应的功能 / 描述补齐。`);
  } else {
    fixLines.push('**目标里提取的关键词都已覆盖** —— 您可能是从其它维度质疑，请告诉我具体哪里不对。');
  }
  if (incomplete.length > 0) {
    fixLines.push('**未完成的 checklist 项**：');
    for (const it of incomplete.slice(0, 10)) {
      fixLines.push(`- \`${it.text}\`（${it.evidence || '无证据'}）`);
    }
  }
  if (fixLines.length === 0) {
    fixLines.push('目前所有项都通过，可能是您对某个细节不满意 —— 请直接指出，我立刻修。');
  }

  const opening = pickGrievanceOpening(severity);

  // 5) 拼成完整回复
  const response = [
    opening,
    '',
    '## 📌 原始目标（任务锁里焊死的）',
    `> ${lock.target}`,
    lock.acceptance && lock.acceptance.length
      ? `> \n> 验收标准：\n${lock.acceptance.map((a) => '> - ' + a).join('\n')}`
      : '',
    '',
    '## 🔍 目标对照（关键词覆盖）',
    `- 已覆盖：**${goalCompare.covered} / ${goalCompare.total}** （${(goalCompare.ratio * 100).toFixed(0)}%）`,
    missing.length > 0
      ? `- 未覆盖：${missing.slice(0, 15).join('、')}`
      : '- 未覆盖：无',
    '',
    '## 🧾 checklist 现状',
    ...checklist.map((c) =>
      `- [${c.done ? 'x' : ' '}] ${c.text}  ${c.evidence ? '_（' + c.evidence + '）_' : ''}`
    ),
    '',
    '## 🛠️ 我准备怎么改',
    ...fixLines,
    '',
    stillAligns
      ? '## ✅ 结论：仍符合原始目标'
      : '## ⚠️ 结论：当前产物与原始目标有偏离，请让我补全',
    '',
    '_—— 我冤，但我立刻修。您看这样行不行？_',
  ].filter((l) => l !== '').join('\n');

  return {
    challenged: true,
    severity,
    opening,
    goal: {
      goal: goalCompare.goal,
      covered: goalCompare.covered,
      total: goalCompare.total,
      ratio: goalCompare.ratio,
      missing,
    },
    checklist,
    fixPlan: fixLines.join('\n'),
    stillAligns,
    response,
  };
}

module.exports = {
  CHALLENGE_TRIGGERS,
  isChallenge,
  inferSeverity,
  pickGrievanceOpening,
  handleChallenge,
};