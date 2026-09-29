# 禅模式收起界面 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 subagent-driven-development（推荐）或 executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 点一次「禅」同时聚焦文件夹并收起界面，用 Esc 或左边缘临时展开后再点「禅」退出。

**架构：** `ChromeController` 负责主窗口的侧栏开合、`body.zen-mode-chrome` 和左边缘临时展开。插件上的 `active` 表示会话是否进行，`focusPath` 只表示文件夹聚焦有没有做。按钮和 Esc 只调用会话的进入/退出。

**技术栈：** 现有 TypeScript、esbuild、eslint-plugin-obsidianmd。侧栏开合用 Obsidian 内部的 `leftSplit` / `rightSplit`（公开类型里没有，用局部接口收窄）。

**规格：** `docs/superpowers/specs/2026-09-29-zen-chrome-design.md`

## 全局约束

- 状态只在内存里，不写入 `data.json`，重启不保留。
- 主窗口 `body` 的标记类名是 `zen-mode-chrome`。弹出窗口不加这个类，也不听它们的 Esc。
- 左边缘触发宽度是 12 像素。
- 没有选中文件夹、也没有打开的笔记时，提示原文是 `没有选中文件夹，也没有打开的笔记`，不进入。
- 笔记在库根目录时不聚焦文件夹，不弹出 `当前在库根目录，无法聚焦单一文件夹`，界面照样收起。
- 不隐藏笔记正文、行内标题、属性，也不隐藏左栏自己的页签栏。
- 功能区是 `.workspace-ribbon`，笔记标签是 `.mod-root` 里的 `.workspace-tab-header-container`，状态栏是 `.status-bar`。
- 书签页签在时，按钮紧挨其右侧；不在时，放在左栏页签栏里最后一个页签的后面。
- 弹窗、命令面板或菜单还可见时，Esc 不退出禅模式。
- `minAppVersion` 保持 `1.7.2`。
- 规格规定不另写自动化测试。每步的检查是在插件目录运行 `npm run build` 和 `npm run lint`。全部任务做完后，按规格的手工路径在 Obsidian 里走一遍。
- 所有 git 命令都在 `.obsidian/plugins/zen-mode` 里执行，不要提交笔记库的其他文件。

---

## 文件结构

- 创建 `src/chrome.ts`：主窗口界面的收起、恢复、临时展开。不碰文件列表。
- 修改 `src/main.ts`：会话开关、根目录进入、Esc、按钮在没有书签时的位置，并调用 `ChromeController`。
- 修改 `styles.css`：`body.zen-mode-chrome` 藏起功能区、编辑区笔记标签、状态栏。
- 修改 `README.md`、`manifest.json`、`package.json` 的描述，使它们和现在的行为一致。

文件夹聚焦的标记、折叠记录、虚拟列表逻辑留在 `src/main.ts`，不拆文件。

### 任务 1：进入时收起界面，退出时按原样恢复

**文件：**
- 创建：`src/chrome.ts`
- 修改：`src/main.ts`
- 修改：`styles.css`

- [ ] **步骤 1：加上界面控制器和样式**

`src/chrome.ts`：

```typescript
import { type App, type Workspace } from 'obsidian';

interface WorkspaceSidedock {
	collapsed: boolean;
	collapse: () => void;
	expand: () => void;
}

interface WorkspaceWithDocks {
	leftSplit?: WorkspaceSidedock;
	rightSplit?: WorkspaceSidedock;
}

export class ChromeController {
	private engaged = false;
	private leftCollapsed = false;
	private rightCollapsed = false;

	constructor(private readonly app: App) {}

	enter(): void {
		if (this.engaged) {
			this.reapply();
			return;
		}
		const left = this.dock('leftSplit');
		const right = this.dock('rightSplit');
		this.leftCollapsed = left?.collapsed ?? false;
		this.rightCollapsed = right?.collapsed ?? false;
		this.engaged = true;
		this.reapply();
		left?.collapse();
		right?.collapse();
	}

	exit(): void {
		if (!this.engaged) {
			return;
		}
		this.engaged = false;
		this.body()?.classList.remove('zen-mode-chrome');
		this.restore('leftSplit', this.leftCollapsed);
		this.restore('rightSplit', this.rightCollapsed);
	}

	reapply(): void {
		if (!this.engaged) {
			return;
		}
		this.body()?.classList.add('zen-mode-chrome');
	}

	private body(): HTMLElement | null {
		const body = this.app.workspace.containerEl.ownerDocument.body;
		return body instanceof HTMLElement ? body : null;
	}

	private dock(side: 'leftSplit' | 'rightSplit'): WorkspaceSidedock | null {
		const workspace = this.app.workspace as Workspace & WorkspaceWithDocks;
		const dock = workspace[side];
		if (
			!dock ||
			typeof dock.collapse !== 'function' ||
			typeof dock.expand !== 'function' ||
			typeof dock.collapsed !== 'boolean'
		) {
			return null;
		}
		return dock;
	}

	private restore(side: 'leftSplit' | 'rightSplit', collapsed: boolean): void {
		const dock = this.dock(side);
		if (!dock || dock.collapsed === collapsed) {
			return;
		}
		if (collapsed) {
			dock.collapse();
		} else {
			dock.expand();
		}
	}
}
```

在 `styles.css` 末尾加上：

```css
body.zen-mode-chrome .workspace-ribbon,
body.zen-mode-chrome .status-bar,
body.zen-mode-chrome .mod-root .workspace-tab-header-container {
	display: none !important;
}
```

- [ ] **步骤 2：把控制器接进现有的进入和退出**

在 `src/main.ts` 顶部增加 import：

```typescript
import { ChromeController } from './chrome';
```

在字段区增加：

```typescript
private readonly chrome = new ChromeController(this.app);
```

`onload` 的 `layout-change` 回调改成：有 `focusPath` 时照旧装饰文件列表，并且只要控制器已经进入就 `this.chrome.reapply()`。这一步里会话是否进入仍由 `focusPath !== null` 表示，所以 `reapply` 可以无条件调用，控制器自己会在未进入时返回。

```typescript
this.app.workspace.on('layout-change', () => {
	this.ensureButton();
	this.chrome.reapply();
	if (this.focusPath !== null) {
		void this.decorateAll();
		this.watchExplorer();
	}
}),
```

在 `toggle` 里，`await this.decorateAll()` 之后、`this.syncButtonState()` 之前调用 `this.chrome.enter()`。

在 `exit` 里，文件列表恢复完成、`this.syncButtonState()` 之前调用 `this.chrome.exit()`。`focusPath` 仍在 `exit` 开头清空，这样侧栏恢复触发的 `layout-change` 不会再次装饰。

- [ ] **步骤 3：构建并检查规范**

在插件目录运行：

```bash
npm run build
npm run lint
```

预期：两条都成功。`main.js` 被更新，且仍被 git 忽略。

- [ ] **步骤 4：Commit**

```bash
git add src/chrome.ts src/main.ts styles.css
git commit -m "$(cat <<'EOF'
进入禅模式时收起两侧栏和界面装饰，退出时按进入前的开合恢复。

EOF
)"
```

### 任务 2：根目录笔记也能进入，会话不再依赖文件夹

**文件：**
- 修改：`src/main.ts`

- [ ] **步骤 1：用 active 表示会话**

增加字段 `private active = false`。

`syncButtonState` 改为看 `this.active`，不再看 `this.focusPath`。

`toggle` 整段换成：

```typescript
private async toggle(): Promise<void> {
	if (this.active) {
		await this.exit();
		return;
	}

	const folder = this.resolveTarget();
	if (!folder) {
		return;
	}

	this.active = true;
	if (!folder.isRoot() && this.explorerViews().length > 0) {
		this.focusPath = folder.path;
		this.collapseRecorded = false;
		this.savedCollapsed = [];
		this.layoutQueued = false;

		const leaf = this.fileExplorerLeaf();
		if (leaf) {
			await this.app.workspace.revealLeaf(leaf);
		}
		await this.decorateAll();
		this.watchExplorer();
	}
	if (!this.active) {
		return;
	}
	this.chrome.enter();
	this.syncButtonState();
}
```

`exit` 开头先写 `this.active = false`，再清空 `focusPath`。文件列表恢复之后仍调用 `this.chrome.exit()`。

`layout-change` 改为：

```typescript
this.app.workspace.on('layout-change', () => {
	this.ensureButton();
	if (!this.active) {
		return;
	}
	this.chrome.reapply();
	if (this.focusPath !== null) {
		void this.decorateAll();
		this.watchExplorer();
	}
}),
```

`decorateAll` 发现聚焦文件夹已经不在库里时调用的 `exit()` 会同时恢复界面，因为 `exit` 现在总会调用 `this.chrome.exit()`。根目录进入时 `focusPath` 保持 `null`，删除别的文件不会因此退出。文件列表视图不存在时同样不设置 `focusPath`，只收起界面；退出时没有文件列表需要恢复。

- [ ] **步骤 2：构建并检查规范**

```bash
npm run build
npm run lint
```

预期：成功。根目录分支里不再出现 `当前在库根目录，无法聚焦单一文件夹`。`没有选中文件夹，也没有打开的笔记` 仍只在 `resolveTarget` 里出现一次。

- [ ] **步骤 3：Commit**

```bash
git add src/main.ts
git commit -m "$(cat <<'EOF'
库根目录的笔记也可以进入禅模式，只收起界面。

EOF
)"
```

### 任务 3：Esc 退出，但让开弹窗、命令面板和菜单

**文件：**
- 修改：`src/main.ts`

- [ ] **步骤 1：在主窗口上听 Esc**

在 `onload` 里，`onLayoutReady` 之前注册：

```typescript
this.registerDomEvent(
	this.app.workspace.containerEl,
	'keydown',
	(event) => {
		this.onEscape(event);
	},
	true,
);
```

增加方法：

```typescript
private onEscape(event: KeyboardEvent): void {
	if (!this.active || event.key !== 'Escape' || event.repeat) {
		return;
	}
	if (this.escapeIsTaken()) {
		return;
	}
	event.preventDefault();
	event.stopPropagation();
	void this.exit();
}

private escapeIsTaken(): boolean {
	const doc = this.app.workspace.containerEl.ownerDocument;
	for (const node of doc.querySelectorAll('.modal-container, .prompt, .menu')) {
		if (node instanceof HTMLElement && node.getClientRects().length > 0) {
			return true;
		}
	}
	return false;
}
```

监听加在主窗口的 `workspace.containerEl` 上，捕获阶段。弹窗如果在这个容器外面，事件到不了这里，禅模式不会退。弹出笔记窗口没有这个监听。

- [ ] **步骤 2：构建并检查规范**

```bash
npm run build
npm run lint
```

预期：成功。`registerDomEvent` 的第四个参数 `true` 表示捕获阶段，类型是 `boolean | AddEventListenerOptions`。

- [ ] **步骤 3：Commit**

```bash
git add src/main.ts
git commit -m "$(cat <<'EOF'
禅模式中按 Esc 退出，弹窗和菜单仍先被关掉。

EOF
)"
```

### 任务 4：指针靠到左边缘时临时展开左栏

**文件：**
- 修改：`src/chrome.ts`
- 修改：`src/main.ts`

- [ ] **步骤 1：临时展开不改进入时记下的开合**

在 `src/chrome.ts` 增加常量和方法。`exit` 里在 `this.engaged = false` 之后加上 `this.temporaryLeft = false`。

```typescript
const LEFT_EDGE_PX = 12;

// 字段
private temporaryLeft = false;

onPointerMove(event: PointerEvent): void {
	if (!this.engaged) {
		return;
	}
	const container = this.app.workspace.containerEl;
	const bounds = container.getBoundingClientRect();
	const x = event.clientX - bounds.left;
	const inStrip = x >= 0 && x < LEFT_EDGE_PX;
	const sidebar = container.querySelector('.mod-left-split');
	const inSidebar = sidebar instanceof HTMLElement && event.target instanceof Node && sidebar.contains(event.target);
	if (inStrip || inSidebar) {
		this.revealLeft();
		return;
	}
	this.hideTemporaryLeft();
}

private revealLeft(): void {
	const left = this.dock('leftSplit');
	if (!left) {
		return;
	}
	if (!left.collapsed) {
		this.temporaryLeft = true;
		return;
	}
	left.expand();
	if (!left.collapsed) {
		this.temporaryLeft = true;
	}
}

private hideTemporaryLeft(): void {
	if (!this.temporaryLeft) {
		return;
	}
	const left = this.dock('leftSplit');
	this.temporaryLeft = false;
	if (left && !left.collapsed) {
		left.collapse();
	}
}
```

`revealLeft` 在展开后如果 `collapsed` 仍是 `true`，不把 `temporaryLeft` 设为 `true`。这样没展开成功时，后续移开指针不会再去改侧栏。

`exit` 先清掉 `temporaryLeft`，再按进入时记下的 `leftCollapsed` 恢复。临时展开期间不要改 `leftCollapsed`。

- [ ] **步骤 2：把指针移动接到主窗口**

在 `onload` 里注册：

```typescript
this.registerDomEvent(
	this.app.workspace.containerEl,
	'pointermove',
	(event) => {
		this.chrome.onPointerMove(event);
	},
	true,
);
```

- [ ] **步骤 3：构建并检查规范**

```bash
npm run build
npm run lint
```

预期：成功。

- [ ] **步骤 4：Commit**

```bash
git add src/chrome.ts src/main.ts
git commit -m "$(cat <<'EOF'
指针靠到主窗口左边缘时临时展开左栏，离开后再收起。

EOF
)"
```

### 任务 5：没有书签页签时按钮仍在左栏顶栏

**文件：**
- 修改：`src/main.ts`

- [ ] **步骤 1：改 ensureButton 的锚点**

把 `ensureButton` 换成下面的逻辑。有书签时，锚点仍是书签页签，按钮紧挨在右侧。没有书签时，锚点是 `.mod-left-split .workspace-tab-header-container-inner` 里最后一个 `.workspace-tab-header`，按钮放在它后面。这一排一个页签都没有时，把按钮直接放进这一排，尺寸留着样式表里的默认值。

```typescript
private leftTabRow(): HTMLElement | null {
	const row = activeDocument.querySelector(
		'.mod-left-split .workspace-tab-header-container-inner',
	);
	return row instanceof HTMLElement ? row : null;
}

private ensureButton(): void {
	const bookmark = this.bookmarkTab();
	const row = bookmark?.parentElement ?? this.leftTabRow();
	if (!row) {
		return;
	}
	const anchor =
		bookmark ??
		row.querySelector(':scope > .workspace-tab-header:last-of-type');
	const placed =
		this.buttonEl?.isConnected &&
		this.buttonEl.parentElement === row &&
		(anchor
			? this.buttonEl.previousElementSibling === anchor
			: this.buttonEl.parentElement === row);
	if (placed) {
		if (anchor instanceof HTMLElement) {
			this.syncButtonSize(anchor);
		}
		this.syncButtonState();
		return;
	}

	this.buttonEl?.remove();
	const button = row.createDiv({
		cls: 'zen-mode-toggle clickable-icon',
		text: '禅',
	});
	button.setAttribute('role', 'button');
	button.setAttribute('aria-label', '禅模式');
	button.setAttribute('aria-pressed', 'false');
	this.registerDomEvent(button, 'click', (event) => {
		event.preventDefault();
		event.stopPropagation();
		void this.toggle();
	});
	if (anchor instanceof HTMLElement) {
		anchor.insertAdjacentElement('afterend', button);
	} else {
		row.append(button);
	}
	this.buttonEl = button;
	if (anchor instanceof HTMLElement) {
		this.syncButtonSize(anchor);
	}
	this.syncButtonState();
}
```

`bookmarkTab()` 保持原样。尺寸仍用锚点页签的 `getBoundingClientRect()`。

- [ ] **步骤 2：构建并检查规范**

```bash
npm run build
npm run lint
```

预期：成功。

- [ ] **步骤 3：Commit**

```bash
git add src/main.ts
git commit -m "$(cat <<'EOF'
书签页签关掉时，禅按钮仍留在左栏顶栏，临时展开后还能点到。

EOF
)"
```

### 任务 6：改描述，并按规格手工检查

**文件：**
- 修改：`README.md`
- 修改：`manifest.json`
- 修改：`package.json`

- [ ] **步骤 1：改用户看得到的说明**

`README.md` 整篇换成：

```markdown
# 禅模式

在 Obsidian 左侧边栏顶栏（文件列表、搜索、书签那一行）加入「禅」按钮。点一次进入禅模式，再点一次、或按 Esc 退出。

进入后，文件列表只显示目标文件夹及其子内容，并收起左右侧栏、功能区、编辑区顶部的笔记标签和底部状态栏。笔记正文、行内标题和属性仍留着。

目标文件夹优先用文件列表里当前选中的文件夹。没有选中文件夹时，用当前笔记所在的文件夹。笔记在库根目录时不聚焦文件夹，界面仍会收起。没有选中文件夹、也没有打开笔记时，不会进入。

指针移到窗口左边缘时，左栏会临时出现，可以再点「禅」退出。指针离开后，左栏收回。

状态只在当前会话有效，不会写入插件配置。
```

`manifest.json` 和 `package.json` 的 `description` 都改成：

```text
进入禅模式时聚焦当前文件夹，并收起侧栏、功能区、笔记标签和状态栏。
```

不要改版本号，不要改 `minAppVersion`。

- [ ] **步骤 2：构建并检查规范**

```bash
npm run build
npm run lint
```

预期：成功。

- [ ] **步骤 3：在 Obsidian 里按规格走一遍**

打开这份库，确认插件已启用，然后核对：

- 选中普通文件夹，或打开一份不在库根目录的笔记，点「禅」。文件列表只剩该文件夹；左栏、右栏、功能区、笔记标签、状态栏都收起；正文、行内标题、属性还在。
- 打开一份在库根目录的笔记再点「禅」。界面收起，文件列表不聚焦，也不弹出「无法聚焦」的提示。
- 不选文件夹、也不开笔记，点「禅」。出现「没有选中文件夹，也没有打开的笔记」，界面不动。
- 按 Esc。文件列表和两侧栏的开合回到进入前。进入前某一侧本来就是收起的，退出后仍收起。
- 先打开命令面板再按 Esc。命令面板关掉，禅模式还在。面板关掉后再按 Esc，才退出。
- 指针进入主窗口左边缘，左栏展开。指针还在左边缘或左栏上时保持展开。两边都不在、且没有点「禅」时，左栏收回，禅模式还在。在展开的左栏里点「禅」，完整退出。
- 删掉或移走正在聚焦的文件夹，界面一并恢复。
- 关掉插件，界面恢复，「禅」按钮消失。
- 书签页签关着时，临时展开的左栏里仍能点到「禅」。

- [ ] **步骤 4：Commit**

```bash
git add README.md manifest.json package.json
git commit -m "$(cat <<'EOF'
说明改成进入禅模式时会同时收起界面。

EOF
)"
```
