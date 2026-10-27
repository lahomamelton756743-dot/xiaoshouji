# 归栖 APK 构建与交付指南（跨聊天窗口必读）

> **用途**：给接手 `xiaoshouji` 项目的新 ChatGPT 会话使用。用户要求的是**真实、可安装、原签名的 APK 文件**，不是 ZIP、源码、GitHub 网页链接或空口承诺。
>
> **已验证成功**：2026-10-27，GitHub Actions run `40480730203`，commit `7d3deee1e5e0bd44cc3b93bf4886bd9ee0bc5824`，构建结论 `success`，artifact ID `12722108729`。通过 GitHub 连接器下载 ZIP，解压后向用户交付 APK。

## 1. 唯一正确的当前开发位置

- 仓库：`lahomamelton756743-dot/xiaoshouji`
- **工作分支**：`feature/home-app-v01`（不要误改 `main`）
- 前端页面：`android/app/src/main/assets/littlephone/index.html`
- APK 构建脚本：`android/build.sh`
- **已验证的正式预览工作流**：`.github/workflows/home-preview-build.yml`，名称 `Home preview signed APK`
- 另一个成功的构建工作流：`.github/workflows/android-debug.yml`，名称 `Build Android Debug APK`。虽然名字叫 Debug，其 `android/build.sh` 实际使用项目固定公用签名密钥。
- 最新上传 APK 可能比源码分支更接近用户想要的界面；修改前要对照用户提供的 APK 与源码，不能擅自回退其他功能。

## 2. 正确的自动构建方式

`home-preview-build.yml` 监听 `feature/home-app-v01` 分支的 push，也支持 `workflow_dispatch`。它在 GitHub Actions 的 Ubuntu runner 中 checkout 仓库，配置 JDK 17，运行：

```bash
chmod +x android/build.sh
cd android
./build.sh
```

并上传 `Guiqi-Home-Preview-Signed` artifact，内含 `android/Guiqi-v0.8.5-18.apk`。

`android-debug.yml` 对 `android/**` 或自身工作流文件的 push 触发，安装 Android 34 SDK/build-tools 34.0.0，执行 `bash android/build.sh`，上传 `zhangxinchuang-public-debug-apk` artifact。**2026-10-27 的实际成功产物就是这个工作流生成的**。

不要假定“聊天容器没有 Android SDK”就无法交付 APK：**过去成功的方法是 GitHub Actions 远程构建，而不是聊天容器本地编译**。

## 3. 最重要的坑：不要用错构建记录查询接口

`mcp__GitHub__fetch_commit_workflow_runs` 当前包装器**只筛选 Pull Request 触发的运行**，所以对 push 构建返回 `workflow_runs: []` 并不代表没有构建。此前因此多次误判，造成用户长期等待。

**已实测可用的查询方法**：使用 GitHub 连接器的 `mcp__GitHub__fetch` 访问：

```text
https://api.github.com/repos/lahomamelton756743-dot/xiaoshouji/actions/runs?per_page=5
```

该接口实际返回了 `workflow_runs`、`id`、`head_branch`、`head_sha`、`status` 和 `conclusion`。按当前分支与目标 commit SHA 找到成功运行。可按需增大 per_page 或分页，**不要因为前五条没有目标运行就判定失败**。

实证：
- run ID：`40480730203`
- workflow：`Build Android Debug APK`
- branch：`feature/home-app-v01`
- commit：`7d3deee1e5e0bd44cc3b93bf4886bd9ee0bc5824`
- conclusion：`success`
- artifact：`12722108729`，名称 `zhangxinchuang-public-debug-apk`
- artifact digest：`sha256:48488479aae64fb8886fd31b1be54feff15a408e837c884ba2c7b32c18523647`

历史成功预览运行：`40071545176`、`40072968850`、`40078872765`、`40080836596`。历史运行仅用于验证方法，**不要误将旧 APK 当成最新修改**。

## 4. 下载并交付真正的 APK

先使用 GitHub 连接器：

```text
mcp__GitHub__fetch_workflow_run_artifacts({
  "repo_full_name": "lahomamelton756743-dot/xiaoshouji",
  "run_id": 40480730203
})
```

确认返回的 artifact ID、commit SHA 和是否过期，再下载：

```text
mcp__GitHub__download_workflow_artifact({
  "repo_full_name": "lahomamelton756743-dot/xiaoshouji",
  "artifact_id": 12722108729,
  "file_name": "Guiqi-latest-chat-plus.zip"
})
```

这个工具**确实能够把 ZIP 文件放入聊天容器**，2026-10-27 实际返回了 `/mnt/data/Guiqi-latest-chat-plus.zip`。新窗口必须以**本次工具实际返回的路径**为准，不能假设旧路径仍存在。

在容器里：

```bash
unzip -l /mnt/data/Guiqi-latest-chat-plus.zip
mkdir -p /mnt/data/guiqi-apk
unzip -o /mnt/data/Guiqi-latest-chat-plus.zip -d /mnt/data/guiqi-apk
find /mnt/data/guiqi-apk -maxdepth 2 -name '*.apk' -type f -ls
cp /mnt/data/guiqi-apk/Guiqi-v0.8.5-18.apk /mnt/data/归栖-聊天加号新版.apk
ls -lh /mnt/data/归栖-聊天加号新版.apk
```

文件名应根据 ZIP 实际内容调整。用 `unzip -t` 检查压缩包；必要时核对 APK 中的页面、AndroidManifest 版本与签名。**只有在本轮确实创建或验证了该文件路径后**，才能提供 `[下载 APK](sandbox:/mnt/data/归栖-聊天加号新版.apk)`。不要把 ZIP 直接交给用户冒充 APK。

## 5. 原签名及覆盖安装

签名密钥已经在仓库中：`android/signing/zhangxinchuang-public-release.p12`，类型 PKCS12，别名 `zhangxinchuang-public`。GitHub Actions checkout 仓库后直接通过 `android/build.sh` 使用它，**不需要从聊天连接器读取二进制私钥**，也不需要从 APK 提取私钥。

已核对的证书 SHA-256：

```text
AEA75C9B2B5F5C42D56B72D4A69A79A38E1C57F27DB021017BE8656BC8F002FB
```

脚本包含 `aapt2`、`javac`、`d8`、`zipalign`、`apksigner sign` 和 `apksigner verify`。不要生成新的 debug.keystore 或替换原密钥，否则可能无法覆盖安装旧版。**不要把签名密钥或密码复制进本指南或聊天消息**。

## 6. 交付前的检查清单

1. 用户要求的界面代码确实进入 `feature/home-app-v01` 的目标页面；注意不要修改另一个同名页面。
2. 构建运行的 `head_sha` 包含**本次**修改，不是旧成功记录。
3. GitHub Actions `conclusion=success`，artifact 存在且未过期。
4. 下载并解压后确实有 APK，且 APK 非空、ZIP/APK 结构正常。
5. 核对原签名指纹；如果无法验证，明确说明未验证，不能编造。
6. 最终直接给用户可下载的 `.apk` 附件链接，**不是 ZIP，也不是 GitHub 网页地址**。

## 7. 为什么之前总是卡住

核心误区：用只查 PR 的接口去判断 push 构建；误以为聊天容器缺 SDK 就不能编译；误以为必须从 GitHub 连接器直接读取二进制 `.p12`，忽略了 GitHub Actions checkout 时已经拥有它；拿到 ZIP 后未及时解压为 APK。

**已验证的闭环是：代码提交 → GitHub Actions push 构建 → 正确查询 actions/runs → 获取 artifact ID → download_workflow_artifact → 容器解压 → 核验 APK → 直接交付 APK。**

此指南记录可复现的方法，但**不保证未来每次构建自动成功**；新会话仍须检查本次真实运行和产物。
