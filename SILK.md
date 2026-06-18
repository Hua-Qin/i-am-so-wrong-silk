# SILK 元数据：我很冤 v2.0

```yaml
name: i-am-so-wrong-silk
displayName: 我很冤
version: 2.0.0
author: Operit Silk Community
maintainer: Hua-Qin
license: MIT
description: 一个让 AI 反复自查、确保任务完完全全完成的 Silk 库（v2：任务锁定 + 质疑应对 + 编程文本全面优化）。
tagline: 我很冤 — 锁定目标、自检到完、质疑必答、代码必优
tags:
  - self-check
  - intent-lock
  - quality-assurance
  - editing
  - task-verification
  - challenge-handle
  - program-optimize
capabilities:
  - lockTask          # 任务锁定
  - selfCheckLoop     # 多轮自查
  - runOnce           # 单次自检
  - taskReconcile     # 任务对账
  - goalCompare       # 目标对照
  - syntaxCheck       # 语法 / 格式（JS/TS/Python/JSON/MD/YAML）
  - contentProofread  # 内容校对
  - styleCheck        # 样式一致性
  - programOptimize   # 编程文本全面优化（命名/复杂度/死代码/不安全模式）
  - challengeHandle   # 质疑应对（"我冤枉啊"）
  - enhanceEdit       # 增强编辑
triggers:
  - "自查"
  - "检查一下"
  - "做完没"
  - "有没有遗漏"
  - "我做完的怎么样"
  - "我冤"
  - "冤枉"
  - "i-am-so-wrong"
  - "i am so wrong"
  - "i'm so wrong"
  - "verify"
  - "self-check"
  # 质疑信号（v2）
  - "你做错了"
  - "不对吧"
  - "你漏了"
  - "我没要"
  - "再检查一遍"
defaultBehavior:
  - 收到用户需求时，自动调用 lockTask 锁定目标
  - 在 AI 完成任意产出后，自动追加【自查报告】段落
  - 自检未通过时，禁止使用"已完成"等确定性措辞，并按 fixPlan 修复
  - 自检通过 ≥ 3 轮才允许声明"完完全全完成"
  - 用户质疑时，自动调用 challenge 生成"我冤枉啊"式回应
  - 编程任务完成后，自动调用 optimizeProgram 优化代码
```