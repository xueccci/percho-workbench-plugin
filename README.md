# Percho Workbench

A reversible host-side add-on that gives an installed **Percho 0.6.8 (Windows x64)** a real right-hand pane: an embedded browser and a read-only project file tree. The agent drives the same page the user sees through a built-in `workbench` tool.

**English** · [中文](#中文)

This is not an official Percho plug-in. It is an independent project that patches one archive inside an existing Percho installation and restores it on uninstall. It is not affiliated with, endorsed by, or supported by the Percho project.

## Requirements

| Item | Requirement |
| --- | --- |
| Operating system | Windows 10/11, x64 |
| Percho | 0.6.8, build commit `87476fa1f884d3590e58400b4099212593a5a047`, unmodified |
| Disk space | approximately 1 GB free on the target volume (backup plus temporary archive) |
| Node.js | not required for installation |
| Percho state | fully exited (including the tray process) before installing or uninstalling |

The installer validates the Percho version, build commit, and archive SHA-256 before writing anything, and refuses any other build.

## Installation

Two methods are available. They install the same content.

### A. npm package (Pi package)

```bash
pi install npm:percho-workbench
```

Then ask the agent to install the Workbench, or call the tool directly:

```text
percho_workbench({ action: "status" })
percho_workbench({ action: "install" })
```

`install` schedules a detached task that closes the target Percho, applies the patch, and starts Percho again after about six seconds. Progress is written to a log file in the system temporary directory and reported by the tool.

### B. Offline ZIP

1. Download `percho-workbench-plugin-0.1.0-win-x64.zip` from [Releases](https://github.com/xueccci/percho-workbench-plugin/releases) and verify it against the adjacent `.sha256` file.
2. Extract the complete archive to a writable directory.
3. Exit Percho completely, including the tray process.
4. Run `install.cmd`.
5. Select the folder that contains `Percho.exe`. If no candidate is listed, enter `B` and choose the folder manually. Do not select the `resources` subfolder.
6. Start Percho, open a local session, and use the Workbench button next to the diff icon in the title bar.

The launcher records its target, backs up the original archive, and reports a non-zero exit code on failure. It never terminates a running Percho and never modifies the UI plug-in trust settings.

## Why the in-app package gallery may not list it

The npm package is published and indexed by pi.dev, but npm's search index has not included the package name yet. The pi.dev catalogue, which the Percho package browser reads, mirrors npm search rather than the raw registry. The following commands reproduce the discrepancy:

```bash
npm view percho-workbench version        # returns 0.1.0
npm search percho-workbench --json       # returns unrelated @sanity/workbench-* entries only
```

The package detail page is reachable at <https://pi.dev/packages/percho-workbench> while `pi.dev/packages?name=percho-workbench` returns no results. This matches several upstream reports for new Pi packages ([#7849](https://github.com/earendil-works/pi/issues/7849), [#7885](https://github.com/earendil-works/pi/issues/7885), [#10145](https://github.com/earendil-works/pi/issues/10145)). Installing by npm source or by ZIP is unaffected.

## Behaviour after installation

- The original archive is copied byte for byte to `resources/.percho-workbench-plugin/original.bin` together with a receipt. Do not delete this directory.
- Only changed entries are replaced; all other archive entries, including unpacked native modules, are preserved unchanged.
- The patch sets `workbenchBuild` in the packaged metadata, which disables Percho's automatic updates until the patch is removed.
- Existing profiles, sessions, credentials, and UI plug-in settings are not modified.
- Uninstallation refuses to overwrite the archive if it changed after installation, and verifies both the receipt and the backup checksum first.

## Scope and limitations

- Supported host: the exact Percho build listed above. Other versions are rejected rather than patched approximately.
- The embedded browser is Percho's own Chromium. It is not Ego Lite, and no Ego profile or login state is imported.
- Browser entry accepts HTTP and HTTPS only. Local files require a local HTTP server.
- File tree is read-only: text up to 256 KiB and common image formats up to 8 MiB. No editing, no Office preview, no file watching.
- Sessions keep their own tabs; switching sessions or collapsing the pane preserves the live page. Browser tabs are not restored after Percho exits.
- Permission requests from web pages are denied. Pages cannot access Node.js or the preload bridge.
- Not verified: other Windows machines, administrator elevation, antivirus or application-control policies, macOS, Linux, and Percho builds other than the one listed above.

## Uninstall

```powershell
# ZIP installation
.\uninstall.cmd

# npm package
percho_workbench({ action: "uninstall" })
```

Both paths require Percho to be fully exited, restore the original archive from the backup, and remove the backup directory after the new archive matches the recorded hash. If Percho was updated after patching, uninstallation stops and keeps the backup for inspection.

## Build from source

Requires Node.js 22.19 or later and an unmodified supported Percho installation to use as the packaging base.

```bash
npm ci
npm test
npm run rebuild-host -- ./upstream-workbench
npm run build -- --host "C:/path/to/original/Percho" --workbench ./upstream-workbench
npm run release
npm run release:source
npm run build:pi
```

`host-source/` contains the upstream base commit, a patch for modified files, and the added sources stored with a `.source` suffix; `rebuild-host` restores the original extensions before building. Distribution archives contain no Percho executable, user configuration, session data, or credentials.

## Verification

Recorded evidence lives in `artifacts/` for the build machine:

- Installer unit tests: 7 passed, 0 failed (`npm test`).
- Full release flow: 12 passed, 0 failed. It installs from the extracted ZIP, exercises the real embedded page, drives it through an actual agent tool call, reads workspace files, then uninstalls and compares the restored archive hash with the original.
- npm artefact: registry `dist.shasum` equals the SHA-1 of `release/percho-workbench-0.1.0.tgz`; both `pi install npm:percho-workbench` and `pi -e npm:percho-workbench` load the extension and execute `percho_workbench`.
- Continuous integration runs the installer tests on `windows-latest`.

## Licence and attribution

MIT. See `LICENSE` and `NOTICE.md`. Percho is Copyright (c) 2026 Jaxton07, MIT licensed. The Workbench pane architecture was informed by ZCode; no ZCode source code is included.

---

# 中文

一个可逆的宿主机附加组件：为**已安装的 Percho 0.6.8（Windows x64）**增加右侧真实分栏，包含内嵌浏览器和只读项目文件树。Agent 通过内置 `workbench` 工具操作与用户相同的页面。

本项目不是 Percho 官方插件，也不经过 Percho 的 UI 插件机制。它修改已安装 Percho 内的一个归档文件，并在卸载时按字节恢复；与 Percho 项目无隶属或背书关系。

## 环境要求

| 项目 | 要求 |
| --- | --- |
| 操作系统 | Windows 10/11，x64 |
| Percho | 0.6.8，构建提交 `87476fa1f884d3590e58400b4099212593a5a047`，且未被修改 |
| 磁盘空间 | 目标磁盘约 1 GB 可用（备份加临时归档） |
| Node.js | 安装过程不需要 |
| Percho 状态 | 安装与卸载前必须完全退出，包括托盘进程 |

安装器在写入前校验 Percho 版本、构建提交与归档 SHA-256；任一不匹配即拒绝安装。

## 安装

两种方式安装的内容相同。

### A. npm 包（Pi 包）

```bash
pi install npm:percho-workbench
```

随后让 Agent 安装，或直接调用工具：

```text
percho_workbench({ action: "status" })
percho_workbench({ action: "install" })
```

`install` 会启动一个独立后台任务：关闭目标 Percho、应用补丁、约六秒后重新启动 Percho。执行过程写入系统临时目录中的日志，并由工具返回路径。

### B. 离线 ZIP

1. 从 [Releases](https://github.com/xueccci/percho-workbench-plugin/releases) 下载 `percho-workbench-plugin-0.1.0-win-x64.zip`，用同目录的 `.sha256` 文件校验。
2. 将完整压缩包解压到可写目录。
3. 完全退出 Percho，包括托盘进程。
4. 运行 `install.cmd`。
5. 选择包含 `Percho.exe` 的文件夹。若列表中没有目标，输入 `B` 手动选择；不要选择 `resources` 子目录。
6. 启动 Percho，进入本地会话，点击顶栏 Diff 图标旁的「打开工作区」按钮。

启动器会记录目标目录、备份原归档，失败时返回非零退出码。它不会结束正在运行的 Percho，也不会修改 UI 插件信任设置。

## 应用内商店未列出本包的原因

npm 包已发布且被 pi.dev 收录，但 npm 的搜索索引尚未包含该包名。Percho 插件商店读取的 pi.dev 目录镜像的是 npm 搜索结果，而非 registry 原始数据。可用以下命令复现：

```bash
npm view percho-workbench version        # 返回 0.1.0
npm search percho-workbench --json       # 仅返回无关的 @sanity/workbench-* 条目
```

详情页 <https://pi.dev/packages/percho-workbench> 可访问，但 `pi.dev/packages?name=percho-workbench` 无结果。该现象与多个上游 issue 一致（[#7849](https://github.com/earendil-works/pi/issues/7849)、[#7885](https://github.com/earendil-works/pi/issues/7885)、[#10145](https://github.com/earendil-works/pi/issues/10145)）。通过 npm 源或 ZIP 安装不受影响。

## 安装后的行为

- 原归档按字节复制到 `resources/.percho-workbench-plugin/original.bin`，并附带安装凭据。不要删除该目录。
- 仅替换发生变更的条目；其余归档条目（包括解包的本地模块）保持不变。
- 补丁在打包元数据中写入 `workbenchBuild`，从而在卸载前关闭 Percho 自动更新。
- 既有 profile、会话、凭据与 UI 插件设置均不修改。
- 卸载前校验安装凭据与备份校验和；若归档在安装后被其他程序改动，则拒绝覆盖。

## 范围与限制

- 仅支持上表指定的 Percho 构建；其他版本直接拒绝，不做近似修改。
- 内嵌浏览器使用 Percho 自带 Chromium，不是 Ego Lite，也不导入 Ego 的 profile 或登录状态。
- 浏览器仅接受 HTTP 与 HTTPS 地址；本地文件需通过本地 HTTP 服务访问。
- 文件树为只读：文本上限 256 KiB，常见图片上限 8 MiB。不支持编辑、Office 预览与文件监听。
- 各会话标签独立；切换会话或收起面板会保留活动页面。Percho 退出后浏览器标签不恢复。
- 网页的权限请求一律拒绝；页面无法访问 Node.js 或 preload 桥。
- 未验证：其他 Windows 机器、管理员提权、杀毒软件或应用控制策略、macOS、Linux，以及上表之外的 Percho 构建。

## 卸载

```powershell
# ZIP 安装
.\uninstall.cmd

# npm 安装
percho_workbench({ action: "uninstall" })
```

两种方式均要求完全退出 Percho，会从备份恢复原归档，并在新归档与记录哈希一致后删除备份目录。若 Percho 在打补丁后被更新，卸载会停止并保留备份以供检查。

## 从源码构建

需要 Node.js 22.19 或更高版本，以及一份未被修改的受支持 Percho 安装作为打包基准。

```bash
npm ci
npm test
npm run rebuild-host -- ./upstream-workbench
npm run build -- --host "C:/path/to/original/Percho" --workbench ./upstream-workbench
npm run release
npm run release:source
npm run build:pi
```

`host-source/` 保存上游基础提交、已修改文件的补丁，以及以 `.source` 后缀保存的新增源码；`rebuild-host` 在构建前恢复原始扩展名。分发包不包含 Percho 可执行文件、用户配置、会话数据或凭据。

## 验证记录

构建机器上的证据保存在 `artifacts/`：

- 安装器单元测试：7 项通过，0 失败（`npm test`）。
- 完整发布流程：12 项通过，0 失败。流程从解压后的 ZIP 安装、驱动真实内嵌页面、通过真实 Agent 工具调用修改页面、读取工作区文件，最后卸载并比对恢复后的归档哈希。
- npm 制品：registry 的 `dist.shasum` 与 `release/percho-workbench-0.1.0.tgz` 的 SHA-1 一致；`pi install npm:percho-workbench` 与 `pi -e npm:percho-workbench` 均能加载扩展并执行 `percho_workbench`。
- 持续集成在 `windows-latest` 上运行安装器测试。

## 许可与归属

MIT，详见 `LICENSE` 与 `NOTICE.md`。Percho 版权归 Jaxton07（2026），采用 MIT 许可。右侧工作区的架构参考了 ZCode，但未包含其源代码。
