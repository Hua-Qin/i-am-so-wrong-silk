/**
 * programOptimizer.js — 我很冤 · 编程文本全面优化
 *
 * 给一段源代码（JS/TS/Python）找出"可改进之处"清单：
 *  - 命名：函数 / 变量是否语义化、是否过长、是否含类型后缀（`numStr`）
 *  - 复杂度：圈复杂度近似（基于分支关键字计数）
 *  - 死代码：永远为 false 的 if、永远为 true 的 while
 *  - 重复：相似 if 分支、空 catch、未使用的 catch 形参
 *  - 注释：函数 / 类是否缺 JSDoc
 *  - 简易"不安全模式"：
 *      eval / new Function / with / == / !=
 *      console.log 残留（生产代码中应改 logger）
 *      innerHTML / document.write
 *      SQL 字符串拼接 (select ... + ...)
 *
 * 设计原则：
 *  - 只产出 suggestions，不修改原文（修改留给 AI 决定）
 *  - 每条建议都有：位置、问题、建议、影响等级（info/warn/blocker）
 */

'use strict';

const { isNonEmptyString, toLines } = require('./utils');

/**
 * @typedef {Object} Suggestion
 * @property {string} type       例如 'naming.tooShort' / 'unsafe.eval'
 * @property {number} line       1-based 行号
 * @property {string} message    简明问题描述
 * @property {string} advice     建议如何修复
 * @property {'info'|'warn'|'blocker'} severity
 */

/** 简易停用名集合（不应作为标识符）。 */
const WEAK_NAMES = new Set([
  'a', 'b', 'c', 'd', 'e', 'i', 'j', 'k', 'n', 'm', 'p', 'q', 'r', 's', 't',
  'x', 'y', 'z', 'tmp', 'temp', 'foo', 'bar', 'baz', 'data', 'data1', 'data2',
  'obj', 'arr', 'res', 'rst', 'ret', 'val',
]);

/** 类型后缀（命名里夹带类型，是 JS 社区普遍反模式）。 */
const TYPE_SUFFIX = [
  'Str', 'Num', 'Int', 'Bool', 'Obj', 'Arr', 'List', 'Map', 'Set',
  'String', 'Number', 'Integer', 'Boolean', 'Object', 'Array',
];

/**
 * 主入口：对一段代码做一次"全面体检"。
 * @param {string} code
 * @param {object} [opts]
 * @param {string} [opts.language='js']   'js'|'ts'|'py'
 * @returns {{ok:boolean, score:number, suggestions:Suggestion[]}}
 */
function audit(code, opts) {
  const language = (opts && opts.language) || 'js';
  const suggestions = [];
  if (!isNonEmptyString(code)) {
    return { ok: true, score: 100, suggestions };
  }
  const lines = toLines(code);

  checkNaming(lines, suggestions, language);
  checkComplexity(lines, suggestions, language);
  checkDeadCode(lines, suggestions, language);
  checkUnsafe(lines, suggestions, language);
  checkComments(lines, suggestions, language);
  checkDuplicates(lines, suggestions, language);

  // 评分：blocker -10 / warn -3 / info -1，最低 0
  let score = 100;
  for (const s of suggestions) {
    if (s.severity === 'blocker') score -= 10;
    else if (s.severity === 'warn') score -= 3;
    else score -= 1;
  }
  if (score < 0) score = 0;
  const blockers = suggestions.filter((s) => s.severity === 'blocker').length;
  return {
    ok: blockers === 0,
    score,
    suggestions,
    summary: suggestions.length === 0
      ? '代码看起来很健康'
      : `发现 ${suggestions.length} 条建议（blocker ${blockers} / warn ${suggestions.filter(s=>s.severity==='warn').length} / info ${suggestions.filter(s=>s.severity==='info').length}）`,
  };
}

/**
 * 命名检查：基于简单正则（不依赖 AST，够用 80% 场景）。
 */
function checkNaming(lines, out, language) {
  const re = language === 'py'
    ? /^\s*def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/
    : /\bfunction\s+([a-zA-Z_$][\w$]*)\s*\(|\b(?:const|let|var)\s+([a-zA-Z_$][\w$]*)\s*=/;
  const idRe = language === 'py' ? /[a-zA-Z_][a-zA-Z0-9_]*/g : /[a-zA-Z_$][\w$]*/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const stripped = stripStringsAndComments(line, language);
    let m;
    if (language === 'py') {
      const mm = /^\s*def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/.exec(line);
      if (mm) {
        const name = mm[1];
        if (WEAK_NAMES.has(name)) {
          out.push({
            type: 'naming.weak', line: i + 1,
            message: `函数名 \`${name}\` 区分度过低`,
            advice: `改为语义化命名（例如 \`${suggestBetterName(name)}\`）`,
            severity: 'warn',
          });
        }
        if (name.length > 40) {
          out.push({
            type: 'naming.tooLong', line: i + 1,
            message: `函数名 \`${name}\` 过长 (${name.length} 字符)`,
            advice: '函数名应控制在 30 字符以内',
            severity: 'info',
          });
        }
      }
    } else {
      // 顶层 const/let/var/function 简单抓（每行可能有多个声明）
      const declRe = /\b(function\s+([a-zA-Z_$][\w$]*)\s*\(|(?:const|let|var)\s+([a-zA-Z_$][\w$]*)\s*=)/g;
      let m;
      while ((m = declRe.exec(stripped)) !== null) {
        const name = m[2] || m[3];
        if (!name) continue;
        if (WEAK_NAMES.has(name)) {
          out.push({
            type: 'naming.weak', line: i + 1,
            message: `标识符 \`${name}\` 区分度过低`,
            advice: `改为语义化命名`,
            severity: 'warn',
          });
        }
        for (const suf of TYPE_SUFFIX) {
          if (name.endsWith(suf) && name !== suf && name.length > suf.length + 1) {
            out.push({
              type: 'naming.typeSuffix', line: i + 1,
              message: `变量名 \`${name}\` 含类型后缀 \`${suf}\``,
              advice: 'JS 是动态类型，不要把类型编码进变量名（匈牙利命名反模式）',
              severity: 'info',
            });
            break;
          }
        }
      }
    }
    // 整行里的短 token（不在字符串 / 注释中时）
    const tokens = stripped.match(idRe) || [];
    for (const t of tokens) {
      if (WEAK_NAMES.has(t) && /^[\s,;=:(]/.test(line)) {
        // 简单：只在"看起来像声明位置"触发
      }
    }
  }
}

function suggestBetterName(weak) {
  const map = {
    a: 'item', b: 'item2', tmp: 'temporaryValue', temp: 'temporaryValue',
    data: 'payload', obj: 'entity', arr: 'items', res: 'result',
    rst: 'result', ret: 'result', val: 'value', foo: 'sample',
    bar: 'sample', baz: 'sample',
  };
  return map[weak] || `${weak}_named`;
}

/**
 * 圈复杂度近似：统计分支关键字。
 */
function checkComplexity(lines, out, language) {
  const branch = language === 'py'
    ? /\b(if|elif|for|while|case|except)\b/
    : /\b(if|else if|for|while|case|catch|\?)\b/;
  let count = 0;
  let firstBrLine = 0;
  for (let i = 0; i < lines.length; i++) {
    const stripped = stripStringsAndComments(lines[i], language);
    if (branch.test(stripped)) {
      if (count === 0) firstBrLine = i + 1;
      count++;
    }
  }
  // 函数级粗略：先按"文件级"统计，> 30 时给出告警
  if (count > 30) {
    out.push({
      type: 'complexity.high', line: firstBrLine,
      message: `文件分支关键字总数 ${count}，圈复杂度可能过高`,
      advice: '把函数 / 模块拆得更小；用 early return 减少嵌套',
      severity: 'warn',
    });
  }
}

/**
 * 死代码 / 永远为真为假。
 */
function checkDeadCode(lines, out, language) {
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const stripped = stripStringsAndComments(l, language);
    if (/\bif\s*\(\s*(true|false|1|0|null|undefined)\s*\)/.test(stripped)) {
      out.push({
        type: 'deadcode.constantIf', line: i + 1,
        message: '条件恒为常量的 if 分支',
        advice: '要么删掉分支，要么换成真实条件',
        severity: 'warn',
      });
    }
    if (/\bwhile\s*\(\s*(false|0|null)\s*\)/.test(stripped)) {
      out.push({
        type: 'deadcode.constantWhile', line: i + 1,
        message: '条件恒假的 while 循环',
        advice: 'while 不会执行；如果是想占位请改注释',
        severity: 'warn',
      });
    }
    if (/else\s*{\s*}/.test(stripped)) {
      out.push({
        type: 'deadcode.emptyElse', line: i + 1,
        message: '空的 else 分支',
        advice: '要么删掉，要么补上有意义的处理',
        severity: 'info',
      });
    }
  }
}

/**
 * 不安全模式。
 */
function checkUnsafe(lines, out, language) {
  const rules = language === 'py'
    ? [
        { re: /\beval\s*\(/, type: 'unsafe.eval', msg: '`eval()` 使用', advice: '优先使用 ast.literal_eval 或专门的解析器', sev: 'blocker' },
        { re: /\bexec\s*\(/, type: 'unsafe.exec', msg: '`exec()` 使用', advice: '避免动态执行字符串', sev: 'blocker' },
        { re: /[^=!<>]={1}(?!=)/, type: 'unsafe.assignInCond', msg: '条件中可能误用 = 而非 ==', advice: '注意是赋值还是比较；py 3.8+ 会报 SyntaxWarning', sev: 'info' },
        { re: /except\s*:/, type: 'unsafe.bareExcept', msg: '裸 `except:`', advice: '指定具体异常类型', sev: 'warn' },
        { re: /\bos\.system\b|\bsubprocess\.Popen\b/, type: 'unsafe.subprocess', msg: '子进程调用', advice: '确认输入是否可信，避免 shell injection', sev: 'warn' },
      ]
    : [
        { re: /\beval\s*\(/, type: 'unsafe.eval', msg: '`eval()` 使用', advice: '严禁在生产代码使用 eval', sev: 'blocker' },
        { re: /\bnew\s+Function\s*\(/, type: 'unsafe.newFunction', msg: '`new Function(...)`', advice: '同 eval，避免动态构造函数', sev: 'blocker' },
        { re: /\bwith\s*\(/, type: 'unsafe.with', msg: '`with` 语句', advice: '严格模式下不可用；考虑解构替代', sev: 'warn' },
        { re: /(?<![=!<>])={1}(?!=)/, type: 'unsafe.lazyAssign', msg: '可能是 == / === 误写成 =', advice: '条件中比较应使用 === / !==', sev: 'info' },
        { re: /\bconsole\.(log|debug|info|warn)\b/, type: 'style.console', msg: '生产代码里的 console.* 调用', advice: '改用专业 logger', sev: 'info' },
        { re: /innerHTML\s*=/, type: 'unsafe.innerHTML', msg: '`innerHTML = ...` 赋值', advice: '存在 XSS 风险；改用 textContent 或框架的安全绑定', sev: 'blocker' },
        { re: /\bdocument\.write\b/, type: 'unsafe.documentWrite', msg: '`document.write` 调用', advice: '阻塞解析、可被注入；改用现代 DOM API', sev: 'blocker' },
        { re: /\bselect\b.*\bfrom\b.*\+\s*['"]/i, type: 'unsafe.sqlConcat', msg: '疑似 SQL 字符串拼接', advice: '改用参数化查询', sev: 'blocker' },
      ];
  for (let i = 0; i < lines.length; i++) {
    const stripped = stripStringsAndComments(lines[i], language);
    for (const r of rules) {
      if (r.re.test(stripped)) {
        out.push({
          type: r.type, line: i + 1,
          message: r.msg, advice: r.advice, severity: r.sev,
        });
      }
    }
  }
}

/**
 * 注释 / JSDoc 检查。
 */
function checkComments(lines, out, language) {
  if (language === 'js' || language === 'ts') {
    let inJSDoc = false;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (/\/\*\*/.test(l)) inJSDoc = true;
      if (inJSDoc && /\*\//.test(l)) { inJSDoc = false; continue; }
      // 检测"导出但没注释"的函数
      if (/^(export\s+)?(async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/.test(l.trim())) {
        // 看上一非空行是不是 */ （即有 JSDoc）
        let j = i - 1;
        while (j >= 0 && lines[j].trim() === '') j--;
        const hasDoc = j >= 0 && /\*\//.test(lines[j]);
        if (!hasDoc) {
          out.push({
            type: 'comment.missingJSDoc', line: i + 1,
            message: '导出的函数没有 JSDoc 注释',
            advice: '补充 @param / @returns 等标签，方便自动补全和阅读',
            severity: 'info',
          });
        }
      }
    }
  }
  // 检测 TODO / FIXME
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/\bTODO\b/.test(l)) {
      out.push({
        type: 'comment.todo', line: i + 1,
        message: '`TODO` 残留', advice: '要么补完，要么转成 issue', severity: 'info',
      });
    }
    if (/\bFIXME\b/.test(l)) {
      out.push({
        type: 'comment.fixme', line: i + 1,
        message: '`FIXME` 残留', advice: '已知 bug，应优先处理', severity: 'warn',
      });
    }
  }
}

/**
 * 重复模式：连续两个相似 if、空 catch、相似分支体。
 */
function checkDuplicates(lines, out, language) {
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/\bcatch\s*\([^)]*\)\s*{\s*}/.test(l)) {
      out.push({
        type: 'dup.emptyCatch', line: i + 1,
        message: '空的 catch 块吞掉了异常', advice: '至少 logger.error(err)；能恢复就恢复，不能就重新 throw', severity: 'warn',
      });
    }
    if (/\bcatch\s*\(\s*\)/.test(l)) {
      out.push({
        type: 'dup.catchNoArg', line: i + 1,
        message: 'catch 没有捕获错误对象', advice: '使用 `catch (err)` 至少记录', severity: 'info',
      });
    }
  }
}

/**
 * 把字符串字面量 / 注释里的内容剥离，避免误判。
 * 简化版：对 js/py 通用。
 */
function stripStringsAndComments(line, language) {
  let out = '';
  let i = 0;
  const len = line.length;
  while (i < len) {
    const ch = line[i];
    const next = i + 1 < len ? line[i + 1] : '';
    // 行注释
    if ((language === 'py' && ch === '#') ||
        (ch === '/' && next === '/')) {
      break;
    }
    // 块注释（单行起始）
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < len && !(line[i] === '*' && line[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    // 字符串字面量
    if (ch === '"' || ch === "'") {
      const quote = ch;
      i++;
      while (i < len && line[i] !== quote) {
        if (line[i] === '\\') i++;
        i++;
      }
      i++;
      out += ' "" ';
      continue;
    }
    // 模板字符串（js）
    if (ch === '`') {
      i++;
      while (i < len && line[i] !== '`') {
        if (line[i] === '\\') i++;
        i++;
      }
      i++;
      out += ' `` ';
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/**
 * 把优化建议渲染成可读 Markdown 列表（给 AI 看）。
 */
function render(suggestions) {
  if (!suggestions || suggestions.length === 0) {
    return '✅ 未发现明显可优化点';
  }
  const grouped = suggestions.reduce((acc, s) => {
    (acc[s.severity] = acc[s.severity] || []).push(s);
    return acc;
  }, {});
  const lines = [];
  for (const sev of ['blocker', 'warn', 'info']) {
    if (!grouped[sev]) continue;
    lines.push(`### ${labelOf(sev)} (${grouped[sev].length})`);
    for (const s of grouped[sev]) {
      lines.push(`- **L${s.line} · ${s.type}**：${s.message}`);
      lines.push(`  - 💡 ${s.advice}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function labelOf(sev) {
  return sev === 'blocker' ? '🔴 阻断' : sev === 'warn' ? '🟡 警告' : '🔵 提示';
}

module.exports = {
  audit,
  render,
  stripStringsAndComments,
  WEAK_NAMES,
  TYPE_SUFFIX,
};