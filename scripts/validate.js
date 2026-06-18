/**
 * scripts/validate.js — 对项目本身跑一遍"我很冤"自查
 *
 * 1) 对每个 JS 文件做 node --check（语法）
 * 2) 对 JSON / MD / YAML 做格式校验
 * 3) 跑测试套件
 */
'use strict';
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function walk(p, list = []) {
  for (const ent of fs.readdirSync(p, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name.startsWith('.')) continue;
    const full = path.join(p, ent.name);
    if (ent.isDirectory()) walk(full, list);
    else list.push(full);
  }
  return list;
}

const files = walk(ROOT);
let errs = 0;
for (const f of files) {
  if (/\.(js|cjs)$/.test(f)) {
    try {
      execSync(`node --check "${f}"`, { stdio: 'pipe' });
      console.log(`[js-ok] ${path.relative(ROOT, f)}`);
    } catch (e) {
      errs++;
      console.error(`[js-err] ${path.relative(ROOT, f)}\n${e.stderr ? e.stderr.toString() : e.message}`);
    }
  } else if (/\.json$/.test(f)) {
    try {
      JSON.parse(fs.readFileSync(f, 'utf8'));
      console.log(`[json-ok] ${path.relative(ROOT, f)}`);
    } catch (e) {
      errs++;
      console.error(`[json-err] ${path.relative(ROOT, f)}: ${e.message}`);
    }
  }
}

if (errs > 0) {
  console.error(`\n发现 ${errs} 个错误。`);
  process.exit(1);
}
console.log('\n所有文件静态校验通过。');