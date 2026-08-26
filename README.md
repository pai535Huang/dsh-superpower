# dsh-superpower

把 [obra/superpowers](https://github.com/obra/superpowers/)（一套面向编码 Agent 的
开发方法论：brainstorming、TDD、systematic-debugging、subagent-driven-development 等
14 个 `SKILL.md` 技能）接入 DeepSeek Harness。

这个插件是一个 **host 组合行**（bundle patch 挂载）：它通过 `ctx.skills.registerProvider()`
把打包的 14 个技能注册进 DSH 技能注册表，并在每个具有 `skill` 工具的会话开头注入
`using-superpowers` 纪律（"1% 规则"）。任何预设（standard / code / cordis / 自定义预设）
只要提供了技能加载面，就会自动看到这些技能。

## 安装

```bash
dsh plugin --profile <name> add github:pai535Huang/dsh-superpower
```

重启 profile 后，新会话即可使用。

## 行为

| 会话所在的预设 | 技能可见 | 会话开头注入 |
|---|---|---|
| standard / code / cordis（挂了 `tool-skill`） | ✅ 目录列出全部捆绑技能 | ✅ 强制注入（首次 + compaction 后） |
| 自定义预设（挂 `skill_search`/`skill_load` 替代） | ✅ 按需搜索/加载 | ❌ 无 `skill` 工具，自然跳过 |
| minimal | ❌ 无 skill 行 | ❌ |

- 触发遵循 **description 匹配**（目录只展示 name + description），由 bootstrap 的
  "1% 规则"强化：`using-superpowers` 完整正文在会话首请求注入，compaction 后重注一次；
  **不是每轮 prompt 都注入**（与上游 SessionStart 语义一致）。
- 同名技能：**项目/用户技能根里的同名技能会遮蔽捆绑版**（bundled provider rank 低于
  本地技能根，就近遮蔽）。这是有意的：用户意图优先。
- 子代理（`delegationDepth > 0`）跳过注入；`minimal` 按设计不移入任何技能行。

## 工作原理

1. **技能来源**：`skills/<name>/SKILL.md` 直接随包分发，命名空间已改写（`superpowers:<name>`
   → bare `<name>`）、DSH 平台适配（`references/dsh-tools.md`）已并入。**没有构建步骤**——
   往 `skills/` 放一个新的 `<name>/SKILL.md`，插件运行期自动发现它。
2. **运行期**：`lib/index.js`（host 插件）用 `ctx.skills.registerProvider()` 注册一个
   provider（`list()` 扫描 `skills/` 目录、`get()` 按需解析 frontmatter 与正文，返回带
   目录 resource base 的定义）。`lib/bootstrap.mjs` 挂 `agent/pre-step`，按
   `ctx.tools.get('skill', agent)` 的可见性决定是否注入；正文实时取自注册表
   （`using-superpowers`），`references/dsh-tools.md` 从技能 resource base 读取后随信封注入。

## 添加自己的技能

往 `skills/` 里放一个新的 `<kebab-name>/SKILL.md`，以 YAML frontmatter 开头
（`name` + `description`，可选 `whenToUse`）即可。无需改任何代码：provider 会自动发现它。

## 开发

```bash
npm ci
npm run check                  # 测试 + validate（校验每个 SKILL.md 合法且可发现）
```

## 测试与验证

- `npm test` — 单元测试：manifest 装载、注册、bootstrap 守卫/频率、迁移清理。
- `npm run validate` — skill 集合、frontmatter、manifest 三项一致性校验。
- `docs/acceptance-test.md` — 上游验收（"Let's make a react todo list" 在 standard
  预设下先触发 brainstorming 再写代码）的执行记录与证据清单。

## 许可证

MIT License。本插件的技能内容源自
[obra/superpowers](https://github.com/obra/superpowers/)（MIT，Copyright (c) 2025 Jesse
Vincent）。详见根目录 `LICENSE`。
