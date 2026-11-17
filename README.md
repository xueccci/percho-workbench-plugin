# Percho Workbench 兼容安装包（Windows）

本包给**本机已安装的 Windows x64 Percho** 应用宿主兼容补丁，让 Percho 使用实际的嵌入式 Workbench。它是独立的离线安装包，不是 Percho 官方 UI 插件，不通过 Percho 的 UI 插件系统加载，也不需要开启或修改任何 UI 插件信任开关。

尚未发布：没有 GitHub Release、npm 包或应用商店版本，也没有自动更新通道。

## 下载

从本仓库的 [Releases](https://github.com/xueccci/percho-workbench-plugin/releases) 下载 `percho-workbench-plugin-<版本>-win-x64.zip`，旁边的 `.sha256` 文件可用于校验。源码 ZIP 仅用于自行构建。

## 支持范围

- 仅支持 Windows x64。
- 仅支持 Windows Percho **0.6.8**，构建提交 `87476fa1f884d3590e58400b4099212593a5a047`。
- 安装器会严格检查宿主的版本、提交和文件哈希；不匹配时拒绝安装，不做强制覆盖。
- 不需要 Node.js 或 npm。启动器通过目标 `Percho.exe` 自带的运行时执行安装；源码开发和构建才需要 Node.js。
- 内嵌浏览器是 Percho 自带的 Chromium，不是 Ego / Ego Lite，也不导入 Ego 的 Profile 或登录数据。

## 安装

1. 完全退出 Percho，包括托盘图标和后台进程。安装器检测到目标仍在运行时会要求关闭后重试，不会强制结束进程。
2. 将整个压缩包解压到可写目录。不要只复制单个文件，也不要直接在压缩包预览窗口中运行。
3. 双击 `install.cmd`。
4. 启动器会列出检测到的安装目录。来源包括正在运行的 Percho、`HKCU`/`HKLM` 卸载注册表项和常见安装位置；不会写死任何盘符。
5. 输入编号选择目录。若没有候选或列表不对，输入 `B` 打开文件夹选择框，选择**包含 `Percho.exe` 的安装文件夹**，不是 `resources` 子目录。
6. 安装完成后重新启动原来的 Percho，进入已创建的本地会话，点击顶栏 Diff 图标旁的「打开工作区」。右侧可切换浏览器和文件，Agent 通过内置 `workbench` 工具操作同一个页面。

安装目标必须是原版，不要选之前单独构建的 `Percho-Workbench` 目录。安装会写入目标 `resources/app.asar`；请预留约 1 GB 可用空间，用于备份和临时归档。若目标位于受保护的 Program Files 目录，需以管理员身份运行安装入口。

也可在命令行指定目录：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\manage.ps1 install -Target "C:\path\to\Percho"
```

## 安装后的实际行为

- 原版文件备份在目标目录的 `resources\.percho-workbench-plugin` 下，并记录安装清单。不要手动删除该目录。
- 沿用现有 Percho profile 和会话数据；不迁移、不复制、不导出登录密钥。
- 安装期间禁用 Percho 自动更新，避免更新覆盖补丁或造成哈希不匹配。要升级 Percho，请先卸载补丁，升级后再使用对应版本的补丁。
- 卸载会按安装清单把原版资源恢复回去，并拒绝覆盖安装后被其他程序改动过的文件。恢复前会做校验；发现外来改动时停止并给出提示，不会静默覆盖。
- 不修改 UI 插件信任开关，不安装 UI 插件，不强制结束任何进程。

## 卸载与状态

先完全退出 Percho，再双击 `uninstall.cmd`，选择同一个安装目录。`status.cmd` 用于查看当前状态。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\manage.ps1 status -Target "C:\path\to\Percho"
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\manage.ps1 uninstall -Target "C:\path\to\Percho"
```

启动器会保留核心安装器返回的退出代码；启动器自身的参数或环境错误返回 `1`。核心安装器也可直接调用，参数为 `install|uninstall|status --target <Percho 目录>`。

## 常见问题

- **没有自动找到目录**：输入 `B` 手动选择包含 `Percho.exe` 的文件夹，或使用 `-Target`。
- **提示 Percho 正在运行**：从托盘完全退出后重试。本包不会替你结束进程。
- **版本或哈希不匹配**：当前 Percho 不是上述受支持构建。请安装对应的 0.6.8 版本；不要使用其他版本或其他 Workbench 打包目录。
- **卸载时拒绝恢复**：原版文件在安装后被其他程序改动。先保留 `resources\.percho-workbench-plugin` 以便排查，不要强行覆盖。

## 文件

- `install.cmd`、`uninstall.cmd`、`status.cmd`：双击入口。
- `scripts\manage.ps1`：目录检测、选择、运行时和退出代码处理。只负责启动核心安装器。
- `dist\installer.cjs`：核心安装/卸载/状态实现。
- `README.md`、`NOTICE.md`：使用说明与归属声明。

## 从源码构建

源码项目包括安装器和固定上游版本的宿主改动，许可证为 MIT。`host-source/overlay` 的 `.source` 文件保存新增源码，重建脚本会恢复原扩展名；`integration.patch` 保存已有文件的改动。

```bash
npm ci
npm test
npm run rebuild-host -- ./upstream-workbench
npm run build -- --host "C:/path/to/original/Percho" --workbench ./upstream-workbench
```

安装包生成在 `release/`。构建产物不包含 Percho 的可执行文件、用户配置、会话或密钥；浏览器支持文件作为宿主兼容补丁随包分发。当前功能包含基础网页操作、按会话保留标签、文件树及文本/图片只读预览；暂不提供文件编辑、站点权限授权和退出后的标签恢复。

## 恢复

正常卸载会恢复备份归档的原始字节并恢复上游更新行为，用户数据保留。若电脑断电留下 `.percho-workbench-install.lock`，先确认没有安装器或 Percho 进程，再检查备份与日志后移除该锁；不要在仍有进程时删除。卸载发现外部更新会停止，保留备份供检查。

