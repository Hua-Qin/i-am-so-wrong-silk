# 示例 · 我很冤 v2.0

下面给出 v2 完整工作流的最小可运行示例。

## 用户输入

```
帮我写一个 Node.js 函数 add(a, b)，返回 a + b。还要写一个测试。
```

## AI 内部流程（v2 完整工作流）

```js
const silk = require('i-am-so-wrong-silk');

// === 步骤 1: 锁定任务 ===
const lock = silk.lockTask(
  '帮我写一个 Node.js 函数 add(a, b)，返回 a + b。还要写一个测试。',
  ['add(1, 2) 应返回 3', '对非数字入参应抛 TypeError', 'test/add.test.js 必须存在']
);
console.log(silk.intentLock.render(lock));
// → 🎯 任务锁定 (intent lock)
//     id: lock-xxx
//     state: locked
//     目标: ...

// === 步骤 2: AI 干活，产出 deliverable + files ===
const deliverable = '已为你创建 src/add.js 与 test/add.test.js。';
const files = [
  {
    name: 'src/add.js',
    content: `'use strict';\n\n/**\n * 两数相加。\n * @param {number} a\n * @param {number} b\n * @returns {number}\n */\nfunction add(a, b) {\n  if (typeof a !== 'number' || typeof b !== 'number') {\n    throw new TypeError('add 只能接收 number');\n  }\n  return a + b;\n}\n\nmodule.exports = add;\n`,
  },
  {
    name: 'test/add.test.js',
    content: `'use strict';\nconst assert = require('assert');\nconst add = require('../src/add');\n\nassert.strictEqual(add(1, 2), 3);\nassert.throws(() => add('1', 2), TypeError);\nconsole.log('add tests passed');\n`,
  },
];

// === 步骤 3: 完工后自检 ===
const report = silk.run({ lock, deliverable, files, maxRounds: 3 });
console.log(report);
if (!report.passed) {
  // report.fixPlan 里按文件聚合了所有要修的项，逐条落实
  // 然后再次调用 silk.run
}

// === 步骤 4: 编程优化（可选）===
const opt = silk.optimizeProgram(files);
for (const f of opt.files) {
  if (f.suggestions.length > 0) {
    console.log(`\n📄 ${f.file} 得分 ${f.score}:`);
    console.log(silk.programOptimizer.render(f.suggestions));
  }
}
```

## 期望输出（节选）

```
🎯 任务锁定 (intent lock)
   id: lock-1a2b3c4d
   state: locked
   目标: 帮我写一个 Node.js 函数 add(a, b)，返回 a + b。还要写一个测试。
   验收标准:
     - add(1, 2) 应返回 3
     - 对非数字入参应抛 TypeError
     - test/add.test.js 必须存在

【自查报告】
🎯 锁定目标：帮我写一个 Node.js 函数 add(a, b)...

— 第 1 轮 ✅ —
  · coarse: ✅ (通过 2 / 共 2, 阻断 0, 建议 0)
  · medium: ✅ (通过 1 / 共 1, 阻断 0, 建议 0)
  · fine: ✅ (通过 1 / 共 1, 阻断 0, 建议 0)

结论：连续 3 轮全部通过，可以宣告"完完全全完成" 🟢
```

## 如果 AI 漏写了测试

```
— 第 1 轮 ❌ —
  · coarse: ❌ (通过 1 / 共 2, 阻断 1, 建议 0)
      - [✗] 🔴 任务对账: 1/2 项命中关键词 (50%)  ← 命中"add"、未命中"测试"
      - [✗] 🔴 目标对齐: 原始目标关键词 4/5 已被覆盖 (80%)

=== 总修复计划 ===
## 🛠️ 修复计划 (按文件聚合)
（详见报告）
```

此时 AI 应当：

1. 补写 `test/add.test.js`。
2. 重新调用 `silk.run(...)`。
3. 再次通过后，才能把回复发给用户。

## 如果用户质疑：「你做错了吧？」

```js
const challenge = silk.challenge({
  userInput: '你做错了吧？！',
  lock,
  deliverable,
  files,
});
console.log(challenge.response);
```

输出（节选）：

```
我冤枉啊！我可是按最初目标一步步做的，且让我一条条核给您看。

## 📌 原始目标（任务锁里焊死的）
> 帮我写一个 Node.js 函数 add(a, b)，返回 a + b。还要写一个测试。
> 
> 验收标准：
> - add(1, 2) 应返回 3
> - 对非数字入参应抛 TypeError
> - test/add.test.js 必须存在

## 🔍 目标对照（关键词覆盖）
- 已覆盖：**4 / 5** （80%）
- 未覆盖：测试

## 🧾 checklist 现状
- [x] Node.js 函数 add 命中: add, 函数 (2/2 = 100%)
- [x] 返回 a + b 命中: 返回 (1/1 = 100%)
- [ ] 写一个测试 部分命中(未达阈值): 测试 (1/2 = 50%)

## 🛠️ 我准备怎么改
**目标里缺这些关键词**：测试
**修复方向**：在产物里把上述关键词对应的功能 / 描述补齐。
**未完成的 checklist 项**：
- `写一个 测试`（部分命中(未达阈值): 测试 (1/2 = 50%)）

## ⚠️ 结论：当前产物与原始目标有偏离，请让我补全

—— 我冤，但我立刻修。您看这样行不行？
```

## 编程文本全面优化示例

```js
const opt = silk.optimizeProgram([
  {
    name: 'src/bad.js',
    content: `var a = 1; eval('console.log(a)'); if (true) { console.log('debug'); }`,
  },
]);
console.log(silk.programOptimizer.render(opt.files[0].suggestions));
```

输出：

```
### 🔴 阻断 (3)
- **L1 · unsafe.eval**：`eval()` 使用 → 严禁在生产代码使用 eval
- **L1 · style.console**：生产代码里的 console.log 调用 → 改用专业 logger
- **L1 · deadcode.constantIf**：条件恒为常量的 if 分支 → 要么删掉分支，要么换成真实条件

### 🟡 警告 (1)
- **L1 · naming.weak**：标识符 `a` 区分度过低 → 改为语义化命名
```
```