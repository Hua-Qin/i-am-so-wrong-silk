/**
 * scripts/self-audit.js — 用"我很冤"自己审查本项目
 */
'use strict';
const fs = require('fs');
const path = require('path');
const silk = require('../index.js');

const ROOT = path.resolve(__dirname, '..');
const files = [];
function walk(p) {
  for (const ent of fs.readdirSync(p, { withFileTypes: true })) {
    if (['node_modules', '.git'].includes(ent.name)) continue;
    const full = path.join(p, ent.name);
    if (ent.isDirectory()) walk(full);
    else files.push(full);
  }
}
walk(ROOT);
const rel = files
  .filter((f) => /\.(js|json|md|md|yml|yaml|txt)$/.test(f))
  .filter((f) => !f.includes('node_modules') && !f.includes('package-lock'))
  .map((f) => ({
    name: path.relative(ROOT, f),
    content: fs.readFileSync(f, 'utf8'),
  }));

const report = silk.run({
  requirement: '创建一个 silk 库"我很冤"，核心能力是反复自查。',
  deliverable: '已创建仓库 i-am-so-wrong-silk，包含 src/、prompts/、examples/、tests/。',
  files: rel,
  maxRounds: 3,
});
console.log(report);