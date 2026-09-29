# 禅模式

在 Obsidian 左侧边栏顶栏（文件列表、搜索、书签那一行）加入「禅」按钮。点击后，文件列表只显示目标文件夹及其子内容；再点一次恢复。

目标文件夹优先用文件列表里当前选中的文件夹。没有选中文件夹时，用当前笔记所在的文件夹。笔记在库根目录、或没有打开笔记时，不会进入禅模式。

状态只在当前会话有效，不会写入插件配置。

## 开发

需要 Node.js 18 或更高版本。

```bash
npm i
npm run dev
```

`npm run dev` 会把 `src/main.ts` 编译到 `main.js` 并保持监听。在 Obsidian 里启用「禅模式」后，重新加载插件即可看到改动。

```bash
npm run build
npm run lint
```

## 发布

这个目录目前放在笔记库的 `.obsidian/plugins/zen-mode/` 里，便于本地加载。嵌在笔记库中时，这里的 GitHub Actions 不会触发。要发布时，把本目录作为独立仓库的根目录。

1. 如有需要，先改 `manifest.json` 里的 `minAppVersion`。
2. 运行 `npm version patch`、`npm version minor` 或 `npm version major`。这会更新 `manifest.json`、`package.json`，并在 `versions.json` 写入新版本对应的最低 Obsidian 版本。tag 不带 `v` 前缀。
3. 推送该 tag。Release 工作流会构建插件，并把 `main.js`、`manifest.json`、`styles.css` 附到一个 draft release 上。
4. `main.js` 不进入 git，只出现在 GitHub Release 里。

加入社区插件列表需要另向 [obsidian-releases](https://github.com/obsidianmd/obsidian-releases) 提交 pull request。
