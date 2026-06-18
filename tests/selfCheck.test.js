/**
 * tests/selfCheck.test.js — 我很冤 v2.0 · 自测用例
 *
 * 纯 Node 断言，不依赖任何测试框架。
 * 运行：node tests/selfCheck.test.js
 */

'use strict';

const assert = require('assert');

const silk = require('../index.js');
const utils = require('../src/utils');
const syntax = require('../src/syntaxChecker');
const content = require('../src/contentChecker');
const style = require('../src/styleChecker');
const task = require('../src/taskVerifier');
const editor = require('../src/editor');
const selfCheck = require('../src/selfCheck');
const intentLock = require('../src/intentLock');
const programOptimizer = require('../src/programOptimizer');
const grievance = require('../src/grievance');

let pass = 0;
let fail = 0;

function test(name, fn) {
  try {
    fn();
    pass++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    fail++;
    console.log(`  ✗ ${name}`);
    console.log(`      ${e && e.message}`);
  }
}

console.log('\n== utils ==');
test('isNonEmptyString', () => {
  assert.strictEqual(utils.isNonEmptyString('  x  '), true);
  assert.strictEqual(utils.isNonEmptyString(''), false);
  assert.strictEqual(utils.isNonEmptyString(null), false);
});
test('toLines', () => {
  assert.deepStrictEqual(utils.toLines('a\nb\nc'), ['a', 'b', 'c']);
  assert.deepStrictEqual(utils.toLines(['x', 'y']), ['x', 'y']);
  assert.deepStrictEqual(utils.toLines(null), []);
});
test('similarity', () => {
  assert.strictEqual(utils.similarity('abc', 'abc'), 1);
  assert.ok(utils.similarity('abc', 'xyz') < 0.5);
});
test('ellipsis', () => {
  assert.strictEqual(utils.ellipsis('short'), 'short');
  assert.strictEqual(utils.ellipsis('a'.repeat(300), 10).endsWith('…'), true);
});
test('deepMerge', () => {
  const r = utils.deepMerge({ a: 1, b: { c: 1 } }, { b: { d: 2 }, e: 3 });
  assert.deepStrictEqual(r, { a: 1, b: { c: 1, d: 2 }, e: 3 });
});
test('groupBy', () => {
  const r = utils.groupBy([{ k: 'a', v: 1 }, { k: 'a', v: 2 }, { k: 'b', v: 3 }], 'k');
  assert.strictEqual(r.a.length, 2);
  assert.strictEqual(r.b.length, 1);
});

console.log('\n== syntax ==');
test('checkJSON OK', () => {
  assert.strictEqual(syntax.checkJSON('{"a":1}').ok, true);
});
test('checkJSON FAIL', () => {
  assert.strictEqual(syntax.checkJSON('{a:1}').ok, false);
});
test('checkBrackets OK', () => {
  const code = 'function f(a, b) { return [a, { b: b }]; }';
  assert.strictEqual(syntax.checkBrackets(code).ok, true);
});
test('checkBrackets FAIL', () => {
  const code = 'function f(a, b { return [a, b; }';
  assert.strictEqual(syntax.checkBrackets(code).ok, false);
});
test('checkBrackets ignores strings', () => {
  const code = "const s = '}}}'; if (s) { return; }";
  assert.strictEqual(syntax.checkBrackets(code).ok, true);
});
test('checkMarkdownHeadings OK', () => {
  const md = '# H1\n## H2\n### H3';
  assert.strictEqual(syntax.checkMarkdownHeadings(md).ok, true);
});
test('checkMarkdownHeadings JUMP', () => {
  const md = '# H1\n#### H4';
  assert.strictEqual(syntax.checkMarkdownHeadings(md).ok, false);
});
test('checkMarkdownListStyle mixed', () => {
  const md = '- a\n- b\n* c';
  assert.strictEqual(syntax.checkMarkdownListStyle(md).mixed, true);
});
test('checkYAMLBasic no space', () => {
  const y = 'a:1\nb: 2';
  assert.strictEqual(checkYAMLOk(y), false);
});
function checkYAMLOk(t) { return syntax.checkYAMLBasic(t).ok; }
test('autoCheck JSON', () => {
  const r = syntax.autoCheck('a.json', '{"x":1}');
  assert.strictEqual(r.ok, true);
});

console.log('\n== content ==');
test('checkTypos finds 登陆', () => {
  const r = content.checkTypos('请先登陆系统。');
  assert.strictEqual(r.ok, false);
  assert.ok(r.findings.some((f) => f.wrong === '登陆'));
});
test('checkDuplicateParagraphs within', () => {
  // 段内重复：两句话高度相似
  const p = '这是一个用于测试段内重复检测的句子，内容比较长方便触发。' +
            '这是一个用于测试段内重复检测的句子，内容比较长方便触发。';
  const r = content.checkDuplicateParagraphs(p);
  assert.strictEqual(r.ok, false);
  assert.ok(r.duplicates.some((d) => d.kind === 'within'));
});
test('checkDuplicateParagraphs cross', () => {
  // 跨段重复：两段高度相似
  const p =
    '这是一个用于测试跨段重复检测的段落A，内容丰富，描述详细。\n\n' +
    '这是一个用于测试跨段重复检测的段落A，内容丰富，描述详细。';
  const r = content.checkDuplicateParagraphs(p);
  assert.strictEqual(r.ok, false);
  assert.ok(r.duplicates.some((d) => d.kind === 'cross'));
});
test('checkPunctuationMix mixed', () => {
  const r = content.checkPunctuationMix('你好,world。');
  assert.strictEqual(r.mixed, true);
});
test('checkTrailingWhitespace', () => {
  const r = content.checkTrailingWhitespace('hello\n');
  assert.strictEqual(r.trailingBlankLines, 1);
});

console.log('\n== style ==');
test('checkIndentation tabs', () => {
  const r = style.checkIndentation('\tif (x) {\n\t\treturn 1;\n\t}');
  assert.strictEqual(r.style, 'tabs');
});
test('checkIndentation mixed', () => {
  const r = style.checkIndentation('  a\n\tb');
  assert.strictEqual(r.style, 'mixed');
});
test('checkQuoteStyle single dominant', () => {
  const r = style.checkQuoteStyle("const a = 'x'; const b = 'y';");
  assert.strictEqual(r.dominant, 'single');
});

console.log('\n== task ==');
test('parseRequirement number list', () => {
  const r = task.parseRequirement('1. 写一个函数\n2. 写一个测试');
  assert.strictEqual(r.length, 2);
});
test('verify hits keywords', () => {
  const req = '写一个 hello world 函数';
  const del = '这是 hello world 函数的实现';
  const r = task.verify(req, del);
  assert.strictEqual(r.ratio, 1);
});
test('verify misses some', () => {
  // 使用独立关键词，确保不会被"通用词"误命中
  const req = '实现 alpha 模块、还要实现 beta 模块';
  const del = '我实现了 alpha 模块。';
  const r = task.verify(req, del);
  assert.strictEqual(r.total, 2);
  assert.strictEqual(r.done, 1);
  assert.ok(r.ratio < 1);
});
test('verify all hit', () => {
  const req = '实现 alpha 模块、还要实现 beta 模块';
  const del = '我已经实现了 alpha 模块和 beta 模块。';
  const r = task.verify(req, del);
  assert.strictEqual(r.total, 2);
  assert.strictEqual(r.done, 2);
  assert.strictEqual(r.ratio, 1);
});

console.log('\n== editor ==');
test('findOccurrences', () => {
  const r = editor.findOccurrences('a\nb\na', 'a');
  assert.strictEqual(r.length, 2);
});
test('makeReplaceOp', () => {
  const op = editor.makeReplaceOp('a.js', 'old', 'new');
  assert.strictEqual(op.op, 'replace');
});
test('lightPolish merges blank lines', () => {
  const r = editor.lightPolish('a\n\n\n\nb');
  assert.strictEqual(r, 'a\n\nb');
});
test('lightPolish removes trailing spaces', () => {
  const r = editor.lightPolish('a   \nb\t\n');
  assert.strictEqual(r, 'a\nb\n');
});
test('plan renders', () => {
  const p = editor.plan(editor.makeReplaceOp('a.js', 'old', 'new'));
  assert.ok(p.includes('操作：replace'));
});

console.log('\n== selfCheck ==');
test('checkCoarse skips when no requirement', () => {
  const r = selfCheck.checkCoarse({});
  assert.ok(r.findings.length >= 1);
});
test('checkFine flags empty', () => {
  const r = selfCheck.checkFine([{ name: 'a.js', content: '' }]);
  assert.strictEqual(r.allOk, false);
});
test('selfCheckLoop 3 rounds', () => {
  const r = selfCheck.selfCheckLoop({
    requirement: '',
    deliverable: '一些交付内容',
    files: [{ name: 'a.js', content: 'const x = 1;\n' }],
    maxRounds: 3,
  });
  // 全通过时：第 1 轮 + 2 轮验证 = 3 轮
  assert.strictEqual(r.rounds.length, 3);
});
test('selfCheckLoop failFast on bad json', () => {
  const r = selfCheck.selfCheckLoop({
    requirement: '',
    deliverable: '',
    files: [{ name: 'p.json', content: '{ bad json' }],
    maxRounds: 3,
  });
  // v2.1: 第 1 轮 fail 就退出，不再傻跑 3 轮
  assert.strictEqual(r.rounds.length, 1);
  assert.strictEqual(r.passed, false);
  assert.ok(r.fixPlan.length > 0);
});
test('formatReport', () => {
  const r = selfCheck.selfCheckLoop({
    requirement: '',
    deliverable: 'x',
    files: [{ name: 'a.md', content: '# Title\n\n内容。' }],
    maxRounds: 1,
  });
  const text = selfCheck.formatReport(r);
  assert.ok(text.includes('【自查报告】'));
});

console.log('\n== index ==');
test('meta has name and v2', () => {
  assert.strictEqual(silk.meta.name, 'i-am-so-wrong-silk');
  assert.strictEqual(silk.meta.version, '2.0.0');
});
test('shouldTrigger', () => {
  assert.strictEqual(silk.shouldTrigger('帮我自查一下'), true);
  assert.strictEqual(silk.shouldTrigger('hello'), false);
  // v2 新增质疑信号
  assert.strictEqual(silk.shouldTrigger('你做错了吧'), true);
  assert.strictEqual(silk.shouldTrigger('我冤枉'), true);
});
test('run returns report', () => {
  const r = silk.run({ requirement: '', deliverable: 'x', files: [] });
  assert.ok(typeof r === 'string');
  assert.ok(r.includes('【自查报告】'));
});
test('runOnce returns report', () => {
  const r = silk.runOnce({ requirement: '', deliverable: 'x', files: [{ name: 'a.md', content: '# Title\n\n内容。' }] });
  assert.ok(r.includes('【自查报告】'));
});

console.log('\n== intentLock ==');
test('createLock requires requirement', () => {
  assert.throws(() => intentLock.createLock({}));
});
test('createLock basic', () => {
  const lock = intentLock.createLock({ requirement: '做一个 add 函数', acceptance: ['加法'] });
  assert.strictEqual(lock.target, '做一个 add 函数');
  assert.strictEqual(lock.state, 'locked');
  assert.deepStrictEqual(lock.acceptance, ['加法']);
});
test('setState changes state', () => {
  const lock = intentLock.createLock({ requirement: 'foo' });
  const updated = intentLock.setState(lock, 'challenged');
  assert.strictEqual(updated.state, 'challenged');
});
test('isStale false for fresh lock', () => {
  const lock = intentLock.createLock({ requirement: 'foo' });
  assert.strictEqual(intentLock.isStale(lock, 60000), false);
});
test('render returns multi-line', () => {
  const lock = intentLock.createLock({ requirement: '做一个 add 函数', acceptance: ['加法'] });
  const out = intentLock.render(lock);
  assert.ok(out.includes('🎯 任务锁定'));
  assert.ok(out.includes('做一个 add 函数'));
});
test('toPromptBlock', () => {
  const lock = intentLock.createLock({ requirement: 'foo' });
  const out = intentLock.toPromptBlock(lock);
  assert.ok(out.includes('已锁定'));
  assert.ok(out.includes('foo'));
});
test('verifyAgainst', () => {
  const lock = intentLock.createLock({ requirement: '实现 alpha 和 beta' });
  const r = intentLock.verifyAgainst(lock, '这是 alpha 和 beta 的实现');
  assert.strictEqual(r.alignedWithGoal, true);
  const r2 = intentLock.verifyAgainst(lock, '这是 alpha 的实现');
  assert.strictEqual(r2.alignedWithGoal, false);
});

console.log('\n== programOptimizer ==');
test('audit empty code', () => {
  const r = programOptimizer.audit('', { language: 'js' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.score, 100);
});
test('audit catches eval', () => {
  const r = programOptimizer.audit('eval("x");', { language: 'js' });
  const evals = r.suggestions.filter((s) => s.type === 'unsafe.eval');
  assert.ok(evals.length > 0);
  assert.strictEqual(evals[0].severity, 'blocker');
});
test('audit catches weak names', () => {
  const r = programOptimizer.audit('const a = 1; const b = 2;', { language: 'js' });
  const weak = r.suggestions.filter((s) => s.type === 'naming.weak');
  assert.ok(weak.length >= 2);
});
test('audit catches type suffix', () => {
  const r = programOptimizer.audit('const userStr = "x";', { language: 'js' });
  const t = r.suggestions.filter((s) => s.type === 'naming.typeSuffix');
  assert.ok(t.length > 0);
});
test('audit catches innerHTML', () => {
  const r = programOptimizer.audit('document.body.innerHTML = "<x>";', { language: 'js' });
  const t = r.suggestions.filter((s) => s.type === 'unsafe.innerHTML');
  assert.ok(t.length > 0);
});
test('audit catches dead code', () => {
  const r = programOptimizer.audit('if (true) { return; }', { language: 'js' });
  const t = r.suggestions.filter((s) => s.type === 'deadcode.constantIf');
  assert.ok(t.length > 0);
});
test('audit catches empty catch', () => {
  const r = programOptimizer.audit('try { x(); } catch (e) {}', { language: 'js' });
  const t = r.suggestions.filter((s) => s.type === 'dup.emptyCatch');
  assert.ok(t.length > 0);
});
test('audit python', () => {
  const r = programOptimizer.audit('eval("x")', { language: 'py' });
  const t = r.suggestions.filter((s) => s.type === 'unsafe.eval');
  assert.ok(t.length > 0);
});
test('render groups by severity', () => {
  const r = programOptimizer.audit('eval("x"); const a = 1; if (true) {}', { language: 'js' });
  const out = programOptimizer.render(r.suggestions);
  assert.ok(out.includes('🔴 阻断') || out.includes('🟡 警告') || out.includes('🔵 提示'));
});

console.log('\n== grievance ==');
test('isChallenge detects challenges', () => {
  assert.strictEqual(grievance.isChallenge('你做错了吧'), true);
  assert.strictEqual(grievance.isChallenge('不对啊'), true);
  assert.strictEqual(grievance.isChallenge('verify'), true);
  assert.strictEqual(grievance.isChallenge('hello world'), false);
});
test('inferSeverity levels', () => {
  assert.strictEqual(grievance.inferSeverity('是不是错了？'), 'soft');
  assert.strictEqual(grievance.inferSeverity('你做错了吧？'), 'firm');
  assert.strictEqual(grievance.inferSeverity('你做错了！！'), 'angry');
});
test('handleChallenge returns structured', () => {
  const lock = intentLock.createLock({ requirement: '实现 alpha 和 beta' });
  const r = grievance.handleChallenge({
    userInput: '你做错了吧？！',
    lock,
    deliverable: '这是 alpha 的实现',
    files: [],
  });
  assert.strictEqual(r.challenged, true);
  assert.ok(/冤/.test(r.opening), `opening 应含"冤"，实际：${r.opening}`);
  assert.ok(r.response.includes('📌 原始目标'));
  assert.ok(r.response.includes('🔍 目标对照'));
  assert.strictEqual(r.stillAligns, false); // alpha/beta 中缺 beta
});
test('handleChallenge skips non-challenge', () => {
  const lock = intentLock.createLock({ requirement: 'foo' });
  const r = grievance.handleChallenge({
    userInput: '今天天气真好',
    lock,
    deliverable: '...',
    files: [],
  });
  assert.strictEqual(r.challenged, false);
});

console.log('\n== top-level API ==');
test('silk.lockTask returns lock', () => {
  const lock = silk.lockTask('做一个 add 函数', ['加法', '类型校验']);
  assert.strictEqual(lock.target, '做一个 add 函数');
  assert.deepStrictEqual(lock.acceptance, ['加法', '类型校验']);
});
test('silk.run with lock passes through', () => {
  const lock = silk.lockTask('hello world');
  const r = silk.run({ lock, deliverable: 'hello world 在这里', files: [] });
  assert.ok(r.includes('🎯 锁定目标'));
});
test('silk.challenge handles challenge', () => {
  const lock = silk.lockTask('做一个 add 函数');
  const r = silk.challenge({
    userInput: '你做错了',
    lock,
    deliverable: '没做',
    files: [],
  });
  assert.ok(/冤/.test(r.opening), `opening 应含"冤"，实际：${r.opening}`);
});

test('silk.optimizeProgram with single string', () => {
  const r = silk.optimizeProgram('eval("x")', { file: 'bad.js' });
  assert.ok(r.suggestions.length > 0);
  assert.strictEqual(r.file, 'bad.js');
});
test('silk.optimizeProgram with array', () => {
  const r = silk.optimizeProgram([
    { name: 'a.js', content: 'eval("x")' },
    { name: 'b.js', content: 'const a = 1;' },
  ]);
  assert.strictEqual(r.files.length, 2);
  assert.ok(r.totalSuggestions > 0);
});

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);