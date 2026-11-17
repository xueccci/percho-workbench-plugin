# 交付与验证记录

已完成 Windows x64 可直装的独立兼容插件包，版本 0.1.0。它使用 Percho 的已安装运行时，安装所需的 Workbench 宿主兼容补丁；不包含整套 Percho，也不要求用户安装 Node.js、npm 或编译源码。

## 文件

- 安装包：`release/percho-workbench-plugin-0.1.0-win-x64.zip`（约 4 MB）。
- 安装入口：解压后的 `install.cmd`。
- 卸载入口：解压后的 `uninstall.cmd`。
- 状态入口：解压后的 `status.cmd`。
- 校验值：同名 `.zip.sha256` 文件。
- 源码：当前目录的 `src/`、`scripts/`、`tests/` 和 `host-source/`。源码 ZIP 不含本地临时目录、依赖目录或用户数据。

只支持原版 Windows Percho 0.6.8，构建提交 `87476fa1f884d3590e58400b4099212593a5a047`，安装器同时校验原版归档 SHA-256。其他构建会拒绝安装。当前开发用的 Workbench 增强版无需重复安装；要验证原版安装，须完全退出原版后选择原版安装目录。

## 权威验证

安装器测试：`npm test` → 6 项通过，0 失败。同一测试文件使用原版 `Percho.exe` 自带的 Node 运行时执行也为 6 项通过，0 失败。

分发验证：

```bash
node scripts/verify-release.mjs "<原版 Percho 目录>" "<Workbench 源码目录>"
```

最终 ZIP 解压后通过 12 项检查，0 失败：实际 `install.cmd` 安装、状态查询和重复安装；真实 Electron 内嵌网页、点击填写、键盘与 Node 隔离、页面树与截图、真实 Agent 工具调用修改可见页面、文件树与文本预览、路径越界和错误 guest 拒绝、收起保留页面、标签与会话归属、关闭回收、实际 `uninstall.cmd` 恢复原始归档并清理备份。

归档恢复前后 SHA-256 均为：

```text
1cee035d21e9060358c139db2ad0b2629c74b767d2ea1f7c02cdb25a69a1dc19
```

源码补丁在固定上游 commit 的干净 checkout 上应用成功，恢复的 40 个文件与已构建源码一致（换行符统一后逐文件比较）。主项目类型检查与生产构建通过。插件实际源码的 Biome 检查及 JavaScript 语法检查通过；PowerShell 脚本语法检查通过。活动 LSP 部分 JavaScript 文件只有无诊断结果，服务器不能确认 clean；没有把这一点替代实际测试。

可查证据（本地保留，不混入分发安装包）：

- `artifacts/release-verification.json`、`artifacts/release-verification.log`。
- `artifacts/workbench-agent-same-page.png`、`artifacts/workbench-files.png`。
- `artifacts/source-verification.json`。
- `runtime-test.log`。

## 已知范围

- 这是非官方宿主兼容插件，由独立安装器接入；不经过 Percho 设置中的 UI 插件加载器。
- 浏览器使用 Electron 自带 Chromium，没有嵌入 Ego Lite。
- 安装后关闭 Percho 自动更新，卸载恢复上游行为。升级 Percho 前先卸载。
- 正常安装备份为 `resources/.percho-workbench-plugin/original.bin`，避免 Electron 缓存 `.asar` 备份而导致文件锁。不可手动删除该备份。
- 没有验证其他 Percho 构建、其他 Windows 机器、macOS/Linux、实际管理员提权和杀毒软件策略；当前版本对不支持的构建直接拒绝。
- 未创建或推送 GitHub 仓库；安装包和源码项目已在本机生成。
