/**
 * selfCheck.js — 我很冤 · 反复自查核心
 *
 * 提供：
 *  - selfCheckLoop：对单次任务产物执行多轮次、递进式自查
 *  - formatReport：把自查结果格式化为可读报告
 *
 * 设计原则：
 *  - 每轮自查应聚焦一个粒度（粗 -> 中 -> 细）
 *  - 任何一轮未通过都应重置并从第 1 轮重新开始
 *  - 至少连续 3 轮通过才允许声明"完完全全完成"
 */

'use strict';

const { isNonEmptyString, deepMerge, ellipsis, uid } = require('./utils');
const syntax = require('./syntaxChecker');
const content = require('./contentChecker');
const style = require('./styleChecker');
const task = require('./taskVerifier');
const optimizer = require('./programOptimizer');
const intentLock = require('./intentLock');

/**
 * 把一堆 findings 汇总成结构化报告。
 *  - severity=== 'blocker' 才算 fail
 *  - 'warning' 不阻断 pass，但会统计
 *  - 'info' 只是提示
 *
 * @param {Array<{label:string, ok:boolean, summary:string, severity?:string, details?:object}>} findings
 */
function summarize(findings) {
  const total = findings.length;
  let blockers = 0;
  let warnings = 0;
  let passed = 0;
  for (const f of findings) {
    if (f.ok) { passed++; continue; }
    if (f.severity === 'blocker') blockers++;
    else if (f.severity === 'warning' || f.severity === 'warn') warnings++;
    else passed++; // info 级 fail 不算失败（向后兼容）
  }
  return { allOk: blockers === 0, total, passed, failed: blockers, blockers, warnings, findings };
}

/**
 * 粗粒度自查：任务完成度 + 是否对齐最初目标。
 *
 * 优先使用 lock.target；没传 lock 时退回到 input.requirement（向后兼容）。
 *
 * @param {{ lock?:object, requirement?:string, deliverable?:string, files?:Array<{name:string, content:string}> }} input
 */
function checkCoarse(input) {
  const files = input.files || [];
  const deliverable = input.deliverable || '';
  const target = (input.lock && input.lock.target) || input.requirement || '';
  const totalLen = files.reduce((s, f) => s + (f.content || '').length, 0) + deliverable.length;
  const merged = files.map((f) => f.content).join('\n\n') + '\n\n' + deliverable;
  const r = task.verify(target, merged);
  const compare = task.compareToGoal(target, merged);

  const findings = [];
  findings.push({
    label: '任务对账',
    ok: r.ratio === 1,
    summary: r.total === 0
      ? '未提供原始需求，跳过对账'
      : `${r.done}/${r.total} 项命中关键词 (${(r.ratio * 100).toFixed(0)}%)`,
    severity: r.ratio === 1 ? undefined : 'blocker',
    details: r,
  });
  findings.push({
    label: '目标对齐',
    ok: compare.ratio === 1,
    summary: compare.total === 0
      ? '未提供目标，跳过对齐检查'
      : `原始目标关键词 ${compare.covered}/${compare.total} 已被覆盖 (${(compare.ratio * 100).toFixed(0)}%)`,
    severity: compare.ratio === 1 ? undefined : 'warn',
    details: compare,
  });
  findings.push({
    label: '交付物非空',
    ok: totalLen > 0,
    summary: totalLen > 0 ? `总长度 ${totalLen} 字符` : '交付物为空',
    severity: totalLen > 0 ? undefined : 'blocker',
  });
  if (input.lock && intentLock.isStale(input.lock)) {
    findings.push({
      label: '任务锁已过期',
      ok: false,
      severity: 'warn',
      summary: `锁定已超过 ${Math.round((Date.now() - input.lock.updatedAt) / 60000)} 分钟未更新，建议确认用户是否改了目标`,
    });
  }
  return summarize(findings);
}

/**
 * 中粒度自查：语法 / 内容 / 样式 / 编程优化。
 *
 * severity 划分：
 *  - blocker：JSON 非法 / 括号不配对 / 重复段落 / 安全模式（eval/innerHTML/...）
 *  - warning：typos / punctuation / style / 命名 / 死代码 / 空 catch
 *  - info：缺失 JSDoc / TODO 残留
 *
 * @param {Array<{name:string, content:string}>} files
 */
function checkMedium(files) {
  const findings = [];
  let warnings = 0;
  let blockers = 0;
  for (const f of files) {
    if (!isNonEmptyString(f.content)) continue;

    // ---- 语法 / 格式 ----
    const syntaxRes = syntax.autoCheck(f.name, f.content);
    for (const x of syntaxRes.findings.filter((x) => x.ok === false)) {
      const isBlocker =
        x.type === 'json' || x.type === 'brackets' || x.type === 'python.brackets';
      findings.push({
        label: `[${f.name}] 语法/格式: ${x.type}`,
        ok: false,
        severity: isBlocker ? 'blocker' : 'warning',
        summary: x.error || ellipsis(JSON.stringify(x), 200),
      });
      if (isBlocker) blockers++;
      else warnings++;
    }

    // ---- 内容校对 ----
    const contentRes = content.checkAll(f.content);
    for (const x of contentRes.results.filter((x) => x.ok === false)) {
      const isBlocker = x.type === 'duplicates';
      findings.push({
        label: `[${f.name}] 内容: ${x.type}`,
        ok: false,
        severity: isBlocker ? 'blocker' : 'warning',
        summary: ellipsis(JSON.stringify(x), 200),
      });
      if (isBlocker) blockers++;
      else warnings++;
    }

    // ---- 样式 + 编程优化（仅 JS/TS/Python）----
    const lower = (f.name || '').toLowerCase();
    if (/\.(js|ts|jsx|tsx|mjs|cjs)$/i.test(lower)) {
      const styleRes = style.checkAll(f.content);
      for (const x of styleRes.results.filter((x) => x.ok === false)) {
        findings.push({
          label: `[${f.name}] 样式: ${x.type}`,
          ok: false,
          severity: 'warning',
          summary: ellipsis(JSON.stringify(x), 200),
        });
        warnings++;
      }
      const optRes = optimizer.audit(f.content, { language: lower.endsWith('.ts') || lower.endsWith('.tsx') ? 'ts' : 'js' });
      for (const s of optRes.suggestions) {
        findings.push({
          label: `[${f.name}] 优化: ${s.type} @L${s.line}`,
          ok: false,
          severity: s.severity === 'blocker' ? 'blocker' : (s.severity === 'warn' ? 'warning' : 'info'),
          summary: s.message + (s.advice ? ` → ${s.advice}` : ''),
        });
        if (s.severity === 'blocker') blockers++;
        else if (s.severity === 'warn') warnings++;
      }
    } else if (lower.endsWith('.py')) {
      const optRes = optimizer.audit(f.content, { language: 'py' });
      for (const s of optRes.suggestions) {
        findings.push({
          label: `[${f.name}] 优化: ${s.type} @L${s.line}`,
          ok: false,
          severity: s.severity === 'blocker' ? 'blocker' : (s.severity === 'warn' ? 'warning' : 'info'),
          summary: s.message + (s.advice ? ` → ${s.advice}` : ''),
        });
        if (s.severity === 'blocker') blockers++;
        else if (s.severity === 'warn') warnings++;
      }
    }
  }
  if (blockers === 0) {
    findings.push({
      label: '语法/内容/样式/优化',
      ok: true,
      summary: warnings === 0
        ? '全部通过'
        : `通过（含 ${warnings} 条建议，见明细）`,
    });
  }
  return summarize(findings);
}

/**
 * 细粒度自查：可交付性。
 */
function checkFine(files) {
  const findings = [];
  for (const f of files) {
    if (!isNonEmptyString(f.content)) {
      findings.push({ label: `[${f.name}] 空文件`, ok: false, summary: '文件内容为空', severity: 'blocker' });
      continue;
    }
    if (f.content.length < 10) {
      findings.push({
        label: `[${f.name}] 内容过短`,
        ok: false,
        summary: `仅 ${f.content.length} 字符，可能不完整`,
        severity: 'warn',
      });
    }
    if (/\.(md|markdown)$/i.test(f.name)) {
      if (!/^#\s+/m.test(f.content)) {
        findings.push({
          label: `[${f.name}] 缺少 H1 标题`,
          ok: false,
          summary: 'Markdown 文档应有一个顶级标题',
          severity: 'warn',
        });
      }
    }
  }
  if (findings.length === 0) {
    findings.push({ label: '细粒度交付检查', ok: true, summary: '通过' });
  }
  return summarize(findings);
}

/**
 * 把多轮 finding 汇总成可执行的"修复指令"（给 AI 看）。
 *  - 集中所有 blocker / warning / info
 *  - 按文件分组
 *  - 每条带"建议怎么改"
 *
 * @param {object} report selfCheckLoop 的返回值
 * @returns {string} Markdown
 */
function buildFixPlan(report) {
  if (!report || !report.rounds) return '';
  // 收集所有"未通过"的 finding（取最新一轮）
  const lastRound = report.rounds[report.rounds.length - 1];
  if (!lastRound) return '';
  const all = [];
  for (const key of ['coarse', 'medium', 'fine']) {
    const s = lastRound[key];
    if (!s || !s.findings) continue;
    for (const f of s.findings) {
      if (!f.ok) all.push({ phase: key, ...f });
    }
  }
  if (all.length === 0) return '_未发现问题，无需修复。_';
  // 按文件聚合
  const byFile = all.reduce((acc, f) => {
    const m = /\[([^\]]+)\]/.exec(f.label);
    const file = m ? m[1] : '(全局)';
    (acc[file] = acc[file] || []).push(f);
    return acc;
  }, {});
  const lines = ['## 🛠️ 修复计划 (按文件聚合)'];
  for (const file of Object.keys(byFile)) {
    lines.push(`\n### 📄 ${file}`);
    for (const f of byFile[file]) {
      const sev = f.severity === 'blocker' ? '🔴' : f.severity === 'warning' || f.severity === 'warn' ? '🟡' : '🔵';
      lines.push(`- ${sev} **${f.label.replace(/^\[[^\]]+\]\s*/, '')}**：${f.summary}`);
    }
  }
  return lines.join('\n');
}

/**
 * 多轮次、递进式自查（v2.1 防无限循环版）。
 *
 * 状态机：
 *  - 第 1 轮：跑 coarse / medium / fine
 *    - 全通过 → 进入"稳定性验证"模式（最多再跑 maxRounds-1 轮确认结果一致）
 *    - 有 blocker → **立刻**产出 fixPlan 并退出（不傻跑剩余轮次）
 *  - 稳定性验证：如果后续轮次结果和第 1 轮一致（都 PASS），才算最终通过
 *  - 如果验证轮次出现新问题，则产出 fixPlan 退出
 *
 * 关键改进（v2.1）：
 *  - **failFast**：第 1 轮有 blocker 就退出，不再原地重复跑 N 轮一模一样的失败
 *  - **info/warn 不阻断**：只有 severity==='blocker' 才算 fail
 *  - **maxRounds 含义变更**：从"至少连续 N 轮通过"改为"最多验证 N 轮稳定性"
 *    - maxRounds=1 → 只跑 1 轮，通过就算通过
 *    - maxRounds=3 → 第 1 轮通过后再验证 2 轮（共 3 轮）
 *
 * @param {object} input
 * @param {string} [input.requirement]   用户原始需求（向后兼容）
 * @param {object} [input.lock]          任务锁（推荐）
 * @param {string} [input.deliverable]   AI 给用户的回复
 * @param {Array<{name:string,content:string}>} [input.files]
 * @param {number} [input.maxRounds=3]   验证轮次上限
 * @param {object} [input.hooks]         onRound / onFix
 */
function selfCheckLoop(input) {
  const maxRounds = Math.max(1, input.maxRounds || 3);
  const hooks = input.hooks || {};
  const rounds = [];
  const history = [];

  function runOneRound(r) {
    const coarse = checkCoarse(input);
    const medium = checkMedium(input.files || []);
    const fine = checkFine(input.files || []);
    const allOk = coarse.allOk && medium.allOk && fine.allOk;
    return { round: r, id: uid('sc'), coarse, medium, fine, allOk };
  }

  // === 第 1 轮 ===
  const first = runOneRound(1);
  rounds.push(first);
  if (hooks.onRound) hooks.onRound(first);

  if (first.allOk) {
    history.push('round 1: PASS');
    // 进入稳定性验证：第 2..maxRounds 轮，确认结果一致
    let stable = true;
    for (let r = 2; r <= maxRounds; r++) {
      const round = runOneRound(r);
      rounds.push(round);
      if (hooks.onRound) hooks.onRound(round);
      if (!round.allOk) {
        // 验证轮次出现了新问题
        stable = false;
        history.push(`round ${r}: FAIL (验证轮次发现新问题)`);
        round.fixPlan = buildFixPlan({ rounds: [round] });
        if (hooks.onFix) hooks.onFix(round);
        break;
      }
      history.push(`round ${r}: PASS (验证稳定)`);
    }
    const target = (input.lock && input.lock.target) || input.requirement || '';
    return {
      rounds,
      passed: stable,
      allOk: stable,
      target,
      history,
      fixPlan: stable ? '' : buildFixPlan({ rounds }),
      summary: stable
        ? `第 1 轮通过，后续 ${maxRounds - 1} 轮稳定性验证全部通过 ✅ → "完完全全完成" 🟢`
        : `第 1 轮通过但验证轮次发现新问题：${history.join(' / ')} 🟡`,
    };
  }

  // === 第 1 轮就有 blocker：failFast，立刻退出 ===
  history.push('round 1: FAIL (有 blocker，failFast)');
  first.fixPlan = buildFixPlan({ rounds: [first] });
  if (hooks.onFix) hooks.onFix(first);

  const target = (input.lock && input.lock.target) || input.requirement || '';
  return {
    rounds,
    passed: false,
    allOk: false,
    target,
    history,
    fixPlan: first.fixPlan,
    summary: `第 1 轮发现 blocker，已 failFast 并产出修复计划（不再重复跑剩余轮次） 🔴`,
  };
}

/**
 * 把自查报告格式化为可读字符串（带修复计划）。
 */
function formatReport(report) {
  const lines = ['【自查报告】'];
  if (report.target) {
    lines.push(`🎯 锁定目标：${report.target}`);
  }
  for (const r of report.rounds) {
    lines.push(`\n— 第 ${r.round} 轮 ${r.allOk ? '✅' : '❌'} —`);
    for (const key of ['coarse', 'medium', 'fine']) {
      const s = r[key];
      lines.push(`  · ${key}: ${s.allOk ? '✅' : '❌'} (通过 ${s.passed} / 共 ${s.total}, 阻断 ${s.blockers}, 建议 ${s.warnings})`);
      for (const f of s.findings) {
        const sev = f.severity === 'blocker' ? '🔴' : f.severity === 'warning' || f.severity === 'warn' ? '🟡' : f.severity === 'info' ? '🔵' : '';
        lines.push(`      - [${f.ok ? '✓' : '✗'}] ${sev} ${f.label}: ${f.summary}`);
      }
    }
    if (r.fixPlan) {
      lines.push('\n' + r.fixPlan);
    }
  }
  if (report.fixPlan) {
    lines.push('\n=== 总修复计划 ===');
    lines.push(report.fixPlan);
  }
  lines.push(`\n结论：${report.summary}`);
  return lines.join('\n');
}

module.exports = {
  selfCheckLoop,
  formatReport,
  buildFixPlan,
  summarize,
  // 单阶段
  checkCoarse,
  checkMedium,
  checkFine,
};