# dsh-superpower

把 [obra/superpowers](https://github.com/obra/superpowers/)（一套面向编码 Agent 的
开发方法论：brainstorming、TDD、systematic-debugging、subagent-driven-development 等
14 个 `SKILL.md` 技能）接入 DeepSeek Harness，**不再以 Agent preset 形式交付**。

这个插件是一个 **host 组合行**（bundle patch 挂载）：它把打包的 14 个技能注册进 DSH
技能注册表的**全局层**，并在每个具有 `skill` 工具的会话开头注入 `using-superpowers`
纪律（"1% 规则"）。任何预设（standard / code / cordis / 自定义预设）只要提供了技能
加载面，就会自动看到这些技能——**不需要切换或选择某个 superpowers 预设**。

## 安装

```bash
dsh plugin --profile <name> add github:pai535Huang/dsh-superpower
```

重启/重启 profile 后，新会话即可使用。没有任何预设选择步骤。

> **从旧版本（preset 形态）升级**：插件启动时会自动删除旧的
> `$DSH_HOME/.agent-presets/superpowers/` 目录（它完全由旧版本维护）。
> 如果你的 `$DSH_HOME/settings.yaml` 仍把 `agent-presets.default` 设为
> `superpowers`，请在 GUI（会话预设选择器）或 settings.yaml 中改为
> **standard** 等其他预设——插件只会警告，不会修改你的设置文件。

## 行为

| 会话所在的预设 | 技能可见 | 会话开头注入 |
|---|---|---|
| standard / code / cordis（挂了 `tool-skill`） | ✅ 目录列出全部 14 个 | ✅ 强制注入（首次 + compaction 后） |
| 自定义预设（挂 `skill_search`/`skill_load` 替代） | ✅ 按需搜索/加载 | ❌ 无 `skill` 工具，自然跳过 |
| minimal | ❌ 无 skill 行 | ❌ |

- 触发遵循 **description 匹配**（目录只展示 name + description），由 bootstrap 的
  "1% 规则"强化：`using-superpowers` 完整正文在会话首请求注入，compaction 后重注一次；
  **不是每轮 prompt 都注入**（与上游 SessionStart 语义一致）。
- 同名技能：**项目/用户技能根里的同名技能会遮蔽捆绑版**（全局层是最远层，
  就近遮蔽）。这是有意的：用户意图优先。
- 子代理（`delegationDepth > 0`）跳过注入；`minimal` 按设计不移入任何技能行。

## 工作原理

1. **构建期**：`node build.mjs` 从上游克隆（`.superpowers-src`）生成 `skills/` 树，
   同时生成 `skills/manifest.json`——每个技能的 frontmatter 元数据 + 正文的
   **字节偏移**（contentOffset），并保留命名空间改写（`superpowers:<name>` →
   bare `<name>`）与 `overlays/` 合并。
2. **运行期**：`lib/index.js`（host 插件）读取 manifest 和 `SKILL.md`，用
   `ctx.skills.register()` 注册进**全局层**（rank 250，runtime provider）。
   `lib/bootstrap.mjs` 挂 `agent/pre-step`，按 `ctx.tools.get('skill', agent)`
   的可见性决定是否注入；正文实时取自注册表（`using-superpowers`），
   `references/dsh-tools.md` 从技能 resource base 读取后随信封注入。

## 开发

```bash
git -C .superpowers-src pull   # 或重新浅克隆
node build.mjs                 # 重新生成 skills/ + skills/manifest.json
npm ci
npm run check                  # 测试 + validate（manifest 与 SKILL.md 逐字对照）
```

## 测试与验证

- `npm test` — 单元测试：manifest 装载、注册、bootstrap 守卫/频率、迁移清理。
- `npm run validate` — skill 集合、frontmatter、manifest 三项一致性校验。
- `docs/acceptance-test.md` — 上游验收（"Let's make a react todo list" 在 standard
  预设下先触发 brainstorming 再写代码）的执行记录与证据清单。

## 说明

- 上游仓库的 `AGENTS.md`/`CLAUDE.md` 属于上游贡献规范，不适用于本仓库。
- 本适配不修改上游技能的行为内容；命名空间改写是适配 DSH 寻址方式所必需的最小改动。
- 技能正文、frontmatter 的 `name`/`description` 逐字保留。
