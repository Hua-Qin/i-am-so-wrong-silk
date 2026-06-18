#!/usr/bin/env bash
# 一键推送脚本。运行前先填好下方变量。
set -u

# === 在这里填你的信息 ===
GITHUB_USER="你的用户名"           # 替换成你的 GitHub 用户名
REPO_NAME="i-am-so-wrong-silk"     # 仓库名（一般不用改）
COMMIT_NAME="Your Name"            # 替换成你想显示的提交者名字
COMMIT_EMAIL="you@example.com"     # 替换成你的邮箱

# === 颜色输出 ===
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# === 0. 预检 ===
if [ "$GITHUB_USER" = "你的用户名" ]; then
  echo -e "${RED}❌ 请先在脚本里填 GITHUB_USER / COMMIT_NAME / COMMIT_EMAIL${NC}"
  exit 1
fi

# === 1. 切到项目根目录 ===
cd "$(dirname "$0")/.."
echo -e "${GREEN}📁 项目目录：$(pwd)${NC}"

# === 2. git init ===
if [ ! -d .git ]; then
  git init
  git branch -M main
  echo -e "${GREEN}✅ git 初始化完成${NC}"
else
  echo -e "${YELLOW}ℹ️  .git 已存在，跳过 init${NC}"
fi

# === 3. 设置提交者信息 ===
git config user.name  "$COMMIT_NAME"
git config user.email "$COMMIT_EMAIL"

# === 4. 添加所有文件并提交 ===
git add .
# 如果已经有过提交，commit 会失败但不影响
git commit -m "feat: 我很冤 silk 库 —— 让 AI 反复自查任务完成情况" || echo -e "${YELLOW}ℹ️  没有新的改动需要提交${NC}"

# === 5. 配置 remote ===
REMOTE_URL="https://github.com/${GITHUB_USER}/${REPO_NAME}.git"
if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "$REMOTE_URL"
else
  git remote add origin "$REMOTE_URL"
fi
echo -e "${GREEN}🔗 remote 已设置：$REMOTE_URL${NC}"

# === 6. 推送 ===
echo -e "${YELLOW}⏳ 正在推送到 GitHub...${NC}"
git push -u origin main
RESULT=$?

if [ $RESULT -eq 0 ]; then
  echo ""
  echo -e "${GREEN}🎉 推送成功！${NC}"
  echo -e "${GREEN}👉 项目地址：https://github.com/${GITHUB_USER}/${REPO_NAME}${NC}"
else
  echo ""
  echo -e "${RED}❌ 推送失败（exit code $RESULT）${NC}"
  echo -e "${YELLOW}可能原因：${NC}"
  echo "  1. GitHub 上还没建好空仓库（https://github.com/new）"
  echo "  2. 用户名填错"
  echo "  3. 需要登录：第一次 push 会弹窗让你输入 GitHub 用户名和 Personal Access Token"
  echo "     （密码已不再可用，必须用 PAT）"
  exit $RESULT
fi