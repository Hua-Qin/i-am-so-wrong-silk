# 我很冤 (I Am So Wrong) 🧐 v2.0

> 一个让 AI 反复自查、确保任务"完完全全"完成的 Silk 库。
> **v2.0 新增**：任务锁定 / 质疑应对 / 编程文本全面优化。

## 📖 创作灵感（我冤在哪儿）

> 这个 Silk 库的"冤枉"人设，来自一次真实的群聊经历。

Operit 的 QQ 管理员此前曾在二群说明过：**群内禁止讨论 VPN**。

某次群聊里，有群友发了一句**"以德报怨"**——配了一张我之前分享的 **LSPosed 模块**的截图，评价里提到了"延迟"相关的内容。

我当时**误以为**大家在聊 CDN 的事（可能是"延迟"这个词误导了我），就顺嘴发了几张**自己搭建的服务器节点**截图：

- 我的服务器怕被打，已经用 CDN 设置了**仅国内访问**，屏蔽了境外网络。
- 节点纯粹是**国内 CDN 用**，**完全不能作为翻墙节点**。
- 我自始至终**没有谈论过任何 VPN 相关内容**。

然后我**直接被移出群聊**了。😶

—— 我真冤。

也正是这次经历让我决定做一个 Silk 库，把"我冤枉啊"做成 AI 的内置话术：

- 当 AI 被质疑时，**先承认问题**，再拿出**目标对照 / checklist / 修改方案**作为证据；
- 永远以**事实**为准，**不卑不亢**地回应；
- 如果真的错了，就**真的去改**，不甩锅。

所以这个库的灵魂就是那句：**"我做的真的对吗？我真的全部都做完了吗？我确定没有遗漏吗？—— 我很冤。"**

---

## ✨ 核心理念

> "我做的真的对吗？我真的全部都做完了吗？我确定没有遗漏吗？—— 我很冤。"

**我很冤** 是一个专为 AI Agent 设计的 Silk 库，核心智能是**反复自查**。
每当 AI 完成一个任务，它会强制进入"自检循环"，对任务结果进行多维度、多轮次的检查，
直到确认任务**100% 完完全全完成**才肯罢休。

v2.0 在此基础上加了三件事：

1. **任务锁定 (Intent Lock)**：开工前先把用户的原始目标"焊死"，中途换话题也不忘本。
2. **质疑应对 ("我冤枉啊")**：用户说"你做错了吧"时，AI 立刻调出原目标 + checklist + 修改方案。
3. **编程文本全面优化**：命名 / 复杂度 / 死代码 / 不安全模式（eval/innerHTML/...）一并扫。

## 🎯 解决什么问题

AI 完成任务时常常出现：

- ❌ 语法错误（少了分号、括号不匹配、JSON 不合法）
- ❌ 内容错误（拼写错误、错别字、事实性错误）
- ❌ 样式错误（格式不统一、缩进错乱、命名不规范）
- ❌ 任务遗漏（需求只读了一半、边界条件没处理、测试没写）
- ❌ 自作主张（多做了用户没要求的事，或少做了要求的事）
- ❌ 走偏了（用户中途提了一嘴新需求，AI 反而忘了最初的目标）
- ❌ 代码质量差（用 `eval`、命名 `a`/`b`/`tmp`、空 catch、`innerHTML`）
- ❌ 用户质疑时答非所问（"我没错啊！" —— 但其实真的漏了）

**我很冤** 就是要让 AI 在提交前把这些全部自查一遍，发现问题就修复，再自查，再修复……
直到再也找不出问题。

## 🚦 v2 推荐工作流

```js
const silk = require('i-am-so-wrong-silk');

// 1) 开工前：锁定目标
const lock = silk.lockTask(
  '用户的原始需求',
  ['验收标准 1', '验收标准 2']
);

// 2) AI 干活（构造 deliverable + files）……

// 3) 完工后：反复自检
const report = silk.run({
  lock,
  deliverable: '你准备给用户的回复',
  files: [
    { name: 'src/foo.js', content: '...' },
    { name: 'README.md', content: '...' },
  ],
  maxRounds: 3,
});
console.log(report);
if (!report.passed) {
  // report.fixPlan 里按文件聚合了所有要修的项，逐条落实
}

// 4) 用户质疑？自动生成"我冤枉啊"回应
const challenge = silk.challenge({
  userInput: '你做错了吧？！',
  lock,
  deliverable: '...',
  files: [...],
});
console.log(challenge.response);

// 5) 编程任务：再跑一遍全面优化
const opt = silk.optimizeProgram([
  { name: 'src/foo.js', content: '...' },
]);
console.log(silk.programOptimizer.render(opt.files[0].suggestions));
```

## 🔍 自查维度（v2）

| 维度 | 检查内容 | 严重程度 |
| --- | --- | --- |
| 任务完成度 | 用户每条需求是否都做了？ | 🔴 blocker |
| 目标对齐 | 当前产物是否覆盖了 lock.target 里的所有关键词？ | 🟡 warn |
| 语法正确性 | JS/TS/Python/JSON/MD/YAML 格式是否合法？ | 🔴 blocker |
| 内容准确性 | 错别字、重复段落、标点混用 | 🟡 warn |
| 样式规范性 | 缩进、引号、命名 | 🟡 warn |
| 编程质量 | 命名、复杂度、死代码、`eval`/`innerHTML`/SQL 拼接 | 🔴/🟡/🔵 |
| 注释完整性 | 导出函数是否缺 JSDoc、`TODO` 是否说明 | 🔵 info |
| 边界与异常 | 边界条件、错误处理 | 🟡 warn |
| 可交付性 | 产物是否可直接使用 | 🔴 blocker |

## 📦 安装与使用

在支持 Silk 的 AI Agent 中加载本库：

```bash
silk load i-am-so-wrong-silk
```

或作为 prompt 片段引用：

```
@silk i-am-so-wrong-silk
```

加载后，AI 会按 v2 工作流自动跑：锁定 → 自检 → （质疑时）反驳 → 编程优化。

## 🛠️ 能力一览

| 能力 | 函数 | 说明 |
| --- | --- | --- |
| 任务锁定 | `silk.lockTask(req, acceptance)` | 创建 intent lock |
| 多轮自检 | `silk.run({ lock, deliverable, files })` | 默认 3 轮 |
| 单次自检 | `silk.runOnce({ ... })` | 不想循环时使用 |
| 质疑应对 | `silk.challenge({ userInput, lock, ... })` | "我冤枉啊"式回应 |
| 编程优化 | `silk.optimizeProgram(files)` | 命名 / 复杂度 / 不安全模式 |
| 任务对账 | `silk.task.verify(req, deliverable)` | 拆解需求 + 关键词命中 |
| 目标对照 | `silk.task.compareToGoal(req, deliverable)` | 哪些 token 还没覆盖 |
| 语法检查 | `silk.syntax.autoCheck(file, content)` | JS/TS/Py/JSON/MD/YAML |
| 内容校对 | `silk.content.checkAll(text)` | 错别字 / 重复 / 标点 |
| 样式检查 | `silk.style.checkAll(code)` | 缩进 / 引号 / 命名 |
| 增强编辑 | `silk.editor.*` | replace / rewrite / expand / polish |

## 🧪 测试

```bash
node tests/selfCheck.test.js
```

不依赖任何第三方测试框架，纯 Node 断言。

## 📁 项目结构

```
i-am-so-wrong-silk/
├── index.js                 # 主入口（v2：暴露 lockTask / challenge / optimizeProgram）
├── manifest.json            # Silk 清单
├── SILK.md                  # Silk 元数据
├── README.md                # 本文件
├── LICENSE
├── src/
│   ├── utils.js             # 通用工具
│   ├── syntaxChecker.js     # 语法 / 格式检查（JS/TS/Py/JSON/MD/YAML）
│   ├── contentChecker.js    # 内容校对
│   ├── styleChecker.js      # 样式一致性
│   ├── taskVerifier.js      # 任务对账 + 目标对照
│   ├── editor.js            # 增强编辑（含 challengePatch）
│   ├── selfCheck.js         # 反复自查核心（接入 lock + optimizer）
│   ├── intentLock.js        # ✨ v2 任务锁定
│   ├── programOptimizer.js  # ✨ v2 编程文本全面优化
│   └── grievance.js         # ✨ v2 质疑应对（"我冤枉啊"）
├── prompts/
│   ├── system.md            # 系统提示词（v2 工作流）
│   └── checklist.md         # 自查清单（含 v2 维度）
├── examples/
│   └── demo.md              # 使用示例
└── tests/
    └── selfCheck.test.js    # 自测用例
```

## 🆕 v2 关键变更

相比 v1.0：

1. **新增 `intentLock`**：任务焊死，目标对照，永远不跑题
2. **新增 `programOptimizer`**：编程文本全面体检
3. **新增 `grievance`**：质疑场景的结构化响应
4. **修复 `syntaxChecker`**：`checkBrackets` 越界 / 行号错乱 bug；新增 Python 支持
5. **修复 `styleChecker`**：`checkQuoteStyle` 模板字符串误判 bug
6. **修复 `taskVerifier`**：用 `extractTokens + filterStopwords` 替代手写正则
7. **修复 `contentChecker`**：`TYPO_DICT` 移除自指死循环 + 增补 30+ 条新词条
8. **`selfCheckLoop` 接入 lock**：自动用 lock.target 作为原始需求
9. **`formatReport` 加 fixPlan**：按文件聚合的修复指令

## 📚 示例

参见 [`examples/demo.md`](./examples/demo.md)。

## 📄 协议

MIT License