# dsh-superpower

把 [obra/superpowers](https://github.com/obra/superpowers/)（一套面向编码 Agent 的技能库）接入 DeepSeek Harness 的 Agent preset，并打包成可由 `dsh plugin` 安装的 bundle。

Superpowers 是一套由 14 个 `SKILL.md` 技能组成的开发方法论（brainstorming、TDD、systematic-debugging、subagent-driven-development 等）。它本身不为 DSH 编写，所以这个仓库把它适配成 DSH 的 **Agent preset**：一个 `agent.cordis.yml` 组合 + 打包好的 `skills/` 目录 + 一个会话启动引导（bootstrap）插件。

## 目录结构

```
.
├── build.mjs                     # 从上游仓库重新生成 superpowers/skills/
├── validate.mjs                  # 校验组合与技能 frontmatter（用 loader 同款 !!js 方言）
├── install.sh                    # 手动安装回退
├── cordis.patch.yml              # DSH bundle patch：挂载宿主同步插件
├── lib/index.js                  # 宿主插件：启动时幂等同步 preset
├── overlays/                     # DSH 本地覆盖（dsh-tools.md），构建时并入技能树
├── scripts/                      # 手动同步与只读安装验证
├── test/                         # build/install/bootstrap/validate 自动测试
├── package.json                  # 测试、校验与统一检查命令
├── .github/workflows/ci.yml      # GitHub Actions（Node.js 20/22）
├── superpowers/                  # ← 这是要安装的 preset
│   ├── preset.yml                # 显示名与描述
│   ├── agent.cordis.yml          # 组合（标准模式 + bootstrap + 打包技能）
│   ├── superpowers-bootstrap.mjs # 会话启动注入 using-superpowers 规则 + DSH 工具映射
│   └── skills/                   # 14 个技能（SKILL.md + references/scripts/assets）
└── .superpowers-src/             # 上游浅克隆（仅用于重新生成技能，非运行依赖）
```

## 一条命令安装（推荐）

仓库推送到 GitHub 后，安装到要使用的 DSH profile：

```bash
dsh plugin --profile <name> add github:pai535Huang/dsh-superpower
```

例如安装到 Web profile：

```bash
dsh plugin --profile web add github:pai535Huang/dsh-superpower
```

`dsh plugin` 会通过 pnpm 安装本包，识别 `package.json` 中的 `dsh.bundle.patch`，并把 `dsh-superpower` 加入该 profile 的 bundle 列表。下一次启动或重启该 profile 时，宿主插件会把包内 `superpowers/` 幂等同步到 `${DSH_HOME:-~/.dsh}/.agent-presets/superpowers/`；更新插件后也会自动更新 preset 和技能。然后在新会话的预设选择器中选择 **Superpowers**。

GitHub 仓库的 `dsh-plugin` topic 只用于搜索和展示，不参与插件识别；真正的识别入口是 `package.json` 的 `dsh.bundle.patch`。

验证已安装文件是否与包内版本一致：

```bash
npm run verify
```

### 手动安装回退

```bash
./install.sh
```

该脚本直接把 `superpowers/` 整个目录复制到 `${DSH_HOME:-~/.dsh}/.agent-presets/superpowers/`，适合本地开发或没有使用 DSH plugin profile 的环境。然后在 Web GUI 里新建会话时选择 **Superpowers** 预设（或在 `~/.dsh/settings.yaml` 的 `agent-presets.default` 设为 `superpowers`）。

- 已有会话切到 Superpowers：新建会话时选预设即可；DSH 只允许在**尚未产生任何内容**的会话上切换预设。

## 更新技能

技能内容来自上游 `obra/superpowers`。重新生成：

```bash
git -C .superpowers-src pull   # 或重新浅克隆
node build.mjs                 # 复制并重写命名空间 → superpowers/skills/
npm ci                         # 首次开发或依赖变化后安装开发依赖
npm run check                  # 自动测试 + preset 校验 + shell 语法检查
./install.sh                   # 重新安装
```

## 测试与 CI

本地运行完整检查：

```bash
npm ci
npm run check
```

也可以分别运行：

```bash
npm test           # build、install、bootstrap 和异常路径测试
npm run validate   # preset 组合、元数据和 14 个技能的结构校验
bash -n install.sh # 安装脚本语法检查
```

GitHub Actions 会在每次 push 和 pull request 时，分别使用 Node.js 20 和 22 执行同一套检查。测试覆盖 bundle 打包内容、宿主插件的幂等同步与权限收紧、同步/验证 CLI、构建时的资源复制与命名空间改写、临时 `DSH_HOME` 中的安装和更新、会话 bootstrap 的注入规则，以及缺失/额外技能的校验失败路径。

这些检查验证的是插件代码和运行机制，不是模型生成代码的实际质量。要比较 Agent 效果，还需要固定模型和任务集进行独立的行为评测（eval）。

上游对 harness 移植的硬性验收（全新会话发 "Let's make a react todo list"，`brainstorming` 必须先于任何代码自动触发）已通过并留档：见 [`docs/acceptance-test.md`](docs/acceptance-test.md)（DSH headless + superpowers preset，deepseek-v4-pro）。

## 工作原理（与「精确的技能使用检测」）

Superpowers 的技能不会自己触发——上游靠 SessionStart hook 把 `using-superpowers` 技能内容注入到会话开头，让模型在动手前先检查是否有匹配技能。这个仓库用 `superpowers-bootstrap.mjs` 复刻了这一步：

1. **会话启动注入（复刻上游 SessionStart hook）**：每个顶层会话的第一个请求里，注入 `<EXTREMELY_IMPORTANT>` 包裹的 `using-superpowers` 完整内容（compaction 之后再注入一次），正文按上游原文要求「在回答/动手前先调用相关技能，包括澄清问题、探索代码库之前」。bootstrap 正文从技能注册表实时读取并复用 DSH 的 `<skill_content>` 渲染，因此注入内容始终与 `using-superpowers/SKILL.md` 一致；其后追加同目录 `references/dsh-tools.md` 的 DSH 工具映射（同一文件、单一来源，文件缺失时静默降级，不影响会话）。
2. **强制技能使用（上游「1% 就调用」规则）**：逐字保留上游逻辑——「只要 1% 可能相关就必须调用；技能适用就必须用，没有商量余地」，以及 Red Flags 理性化清单和「process 技能优先」的优先级。加载后若发现不适用再放下，而不是跳过检查。
3. **按 description 路由**：每个技能 frontmatter 的 `description` 就是触发条件（例如 `brainstorming` 只在「写代码前」、`systematic-debugging` 只在「遇到 bug 前」）。目录只展示 name + description，模型据此路由。
4. **子代理跳过**：`delegationDepth > 0` 的子代理不注入 bootstrap（正文里也保留 `<SUBAGENT-STOP>` 兜底），避免每个被派发的子代理都重新跑一遍完整流程。

### 技能加载方式

与 Claude Code 的 `superpowers:<name>` 命名空间不同，DSH 用裸 kebab-case 名称寻址技能（`skill` 工具 + 目录里的 name）。`build.mjs` 会把技能正文里的 `superpowers:<name>` 交叉引用改写为裸 `<name>`，使这些引用在 DSH 里仍然可以直接加载。资源（`references/`、`scripts/`、`assets/`、`code-reviewer.md` 等）按原目录结构保留，DSH 的 `resourceBase`（技能目录）会正确解析相对路径。

### 与上游的差异

- 技能正文、frontmatter 的 `name`/`description` 逐字保留；只做命名空间改写。
- 不保留 Claude Code / Cursor / Codex 等专属 hook 与 marketplace 清单，只适配 DSH 的 `skill-filesystem` + `tool-skill` 机制。
- **DSH 工具映射**：上游给每个 harness 配一份工具映射参考（如 `codex-tools.md`）。本仓库在 `overlays/using-superpowers/references/dsh-tools.md` 维护 DSH 的映射（skill 裸名调用、subagent 生命周期、文件沙箱升级、后台 job、问用户与审批门槛——`ask_user_question` / `exit_plan_mode`——plan mode 等），构建时并入技能树，并由 bootstrap 在每次会话启动时随 `using-superpowers` 一起注入。
- **Platform Adaptation 指针**：上游唯一放行的 SKILL.md 编辑——`build.mjs` 在 `using-superpowers/SKILL.md` 的 Platform Adaptation 列表里幂等插入 `- DeepSeek Harness: references/dsh-tools.md` 一行。
- 除此之外仅有的内容改动是 `superpowers:<name>` → `<name>` 命名空间改写（DSH 用裸名寻址）；技能 frontmatter 与正文的「1% 就调用」「技能适用就必须用」等行为规则全部逐字保留。

## 技能清单

| 技能 | 触发条件（description 摘要） |
|---|---|
| brainstorming | 任何创造性工作前 |
| using-git-worktrees | 需要隔离工作区的功能开发前 |
| writing-plans | 有多步任务规格、动代码前 |
| subagent-driven-development | 用独立子代理执行实现计划 |
| executing-plans | 有书面计划、带检查点执行 |
| dispatching-parallel-agents | 2+ 个相互独立、可并行的任务 |
| test-driven-development | 实现任何功能/bugfix、写实现代码前 |
| requesting-code-review | 完成任务/大功能/合并前 |
| receiving-code-review | 收到评审反馈、实施建议前 |
| systematic-debugging | 遇到任何 bug/测试失败/异常行为、提修复前 |
| verification-before-completion | 声称完成/修复/通过前 |
| finishing-a-development-branch | 实现完成、测试通过、决定如何合入时 |
| writing-skills | 新建/编辑/验证技能时 |
| using-superpowers | 会话开始、技能系统导览（bootstrap 注入的就是它的完整内容） |

## 说明

- 上游仓库的 `AGENTS.md`（`CLAUDE.md`）属于上游贡献规范，不适用于本仓库（本仓库不向上游提 PR）。
- 本适配不修改上游技能的行为内容；命名空间改写是适配 DSH 寻址方式所必需的最小改动。
