import { Notice, Plugin, TAbstractFile, TFolder, type WorkspaceLeaf } from 'obsidian';

interface ExplorerItemInfo {
	hidden: boolean;
	height: number;
	computed: boolean;
}

interface ExplorerItem {
	el: HTMLElement;
	selfEl: HTMLElement;
	file?: TAbstractFile;
	parent?: ExplorerItem;
	collapsed?: boolean;
	setCollapsed?: (collapsed: boolean, animate?: boolean) => Promise<void>;
	vChildren?: { children: ExplorerItem[] };
	info?: ExplorerItemInfo;
}

interface FileExplorerView {
	fileItems: Record<string, ExplorerItem>;
	navFileContainerEl: HTMLElement;
	tree?: {
		selectedDoms?: Set<ExplorerItem>;
		infinityScroll?: {
			queueCompute?: () => void;
		};
	};
}

interface SavedCollapse {
	path: string;
	collapsed: boolean;
}

function asFileExplorerView(view: WorkspaceLeaf['view']): FileExplorerView | null {
	if (view.getViewType() !== 'file-explorer') {
		return null;
	}
	const candidate = view as Partial<FileExplorerView>;
	if (candidate.fileItems === undefined || !(candidate.navFileContainerEl instanceof HTMLElement)) {
		return null;
	}
	return view as unknown as FileExplorerView;
}

export default class ZenModePlugin extends Plugin {
	private buttonEl: HTMLElement | null = null;
	private focusPath: string | null = null;
	private collapseRecorded = false;
	private savedCollapsed: SavedCollapse[] = [];
	private decorating = false;
	private decorateAgain = false;
	private layoutQueued = false;
	private observer: MutationObserver | null = null;

	onload(): void {
		this.registerEvent(
			this.app.workspace.on('layout-change', () => {
				this.ensureButton();
				if (this.focusPath !== null) {
					void this.decorateAll();
					this.watchExplorer();
				}
			}),
		);
		this.registerEvent(
			this.app.vault.on('create', () => {
				void this.decorateAll();
			}),
		);
		this.registerEvent(this.app.vault.on('delete', (file) => this.onDelete(file)));
		this.registerEvent(
			this.app.vault.on('rename', (file, oldPath) => this.onRename(file, oldPath)),
		);

		this.app.workspace.onLayoutReady(() => {
			this.ensureButton();
		});
	}

	onunload(): void {
		void this.exit();
		this.buttonEl?.remove();
		this.buttonEl = null;
	}

	private bookmarkTab(): HTMLElement | null {
		const leaf = this.app.workspace.getLeavesOfType('bookmarks')[0] as
			| { tabHeaderEl?: HTMLElement }
			| undefined;
		const header = leaf?.tabHeaderEl;
		if (header instanceof HTMLElement && header.isConnected) {
			return header;
		}
		const fallback = activeDocument.querySelector(
			'.mod-left-split .workspace-tab-header[aria-label="书签"], .mod-left-split .workspace-tab-header[aria-label="Bookmarks"]',
		);
		return fallback instanceof HTMLElement ? fallback : null;
	}

	private ensureButton(): void {
		const bookmark = this.bookmarkTab();
		if (!bookmark) {
			return;
		}
		if (this.buttonEl?.isConnected && this.buttonEl.previousElementSibling === bookmark) {
			this.syncButtonSize(bookmark);
			this.syncButtonState();
			return;
		}

		const parent = bookmark.parentElement;
		if (!parent) {
			return;
		}

		this.buttonEl?.remove();
		const button = parent.createDiv({
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
		bookmark.insertAdjacentElement('afterend', button);
		this.buttonEl = button;
		this.syncButtonSize(bookmark);
		this.syncButtonState();
	}

	private syncButtonSize(bookmark: HTMLElement): void {
		const rect = bookmark.getBoundingClientRect();
		if (!this.buttonEl || rect.width <= 0 || rect.height <= 0) {
			return;
		}
		this.buttonEl.style.width = `${rect.width}px`;
		this.buttonEl.style.height = `${rect.height}px`;
	}

	private syncButtonState(): void {
		const active = this.focusPath !== null;
		this.buttonEl?.classList.toggle('is-active', active);
		this.buttonEl?.setAttribute('aria-pressed', active ? 'true' : 'false');
	}

	private async toggle(): Promise<void> {
		if (this.focusPath !== null) {
			await this.exit();
			return;
		}

		const folder = this.resolveTarget();
		if (!folder) {
			return;
		}
		if (folder.isRoot()) {
			new Notice('当前在库根目录，无法聚焦单一文件夹');
			return;
		}

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
		this.syncButtonState();
	}

	private resolveTarget(): TFolder | null {
		const selected = this.selectedFolder();
		if (selected) {
			return selected;
		}

		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice('没有选中文件夹，也没有打开的笔记');
			return null;
		}
		return activeFile.parent;
	}

	private selectedFolder(): TFolder | null {
		for (const view of this.explorerViews()) {
			const selected = view.tree?.selectedDoms;
			if (!selected) {
				continue;
			}
			for (const item of selected) {
				if (item.file instanceof TFolder) {
					return item.file;
				}
			}
		}

		const leaf = this.fileExplorerLeaf();
		const activeTitle = leaf?.view.containerEl.querySelector(
			'.nav-folder-title.is-selected, .nav-folder-title.is-active',
		);
		if (!(activeTitle instanceof HTMLElement)) {
			return null;
		}
		const path = activeTitle.dataset.path;
		if (path === undefined) {
			return null;
		}
		if (path === '/' || path === '') {
			return this.app.vault.getRoot();
		}
		const file = this.app.vault.getAbstractFileByPath(path);
		return file instanceof TFolder ? file : null;
	}

	private fileExplorerLeaf(): WorkspaceLeaf | null {
		return this.app.workspace.getLeavesOfType('file-explorer')[0] ?? null;
	}

	private explorerViews(): FileExplorerView[] {
		const views: FileExplorerView[] = [];
		for (const leaf of this.app.workspace.getLeavesOfType('file-explorer')) {
			const view = asFileExplorerView(leaf.view);
			if (view) {
				views.push(view);
			}
		}
		return views;
	}

	private async decorateAll(): Promise<void> {
		if (this.focusPath === null) {
			return;
		}
		if (this.decorating) {
			this.decorateAgain = true;
			return;
		}

		const folder = this.app.vault.getAbstractFileByPath(this.focusPath);
		if (!(folder instanceof TFolder)) {
			await this.exit();
			return;
		}

		this.decorating = true;
		try {
			do {
				this.decorateAgain = false;
				for (const view of this.explorerViews()) {
					const item = view.fileItems[folder.path];
					if (!item) {
						continue;
					}
					await this.expandPath(item);
					this.mark(view, item);
				}
			} while (this.decorateAgain && this.focusPath !== null);
		} finally {
			this.decorating = false;
		}
	}

	private async expandPath(item: ExplorerItem): Promise<void> {
		const chain: ExplorerItem[] = [];
		let node: ExplorerItem | undefined = item;
		while (node?.file instanceof TFolder && !node.file.isRoot()) {
			chain.push(node);
			node = node.parent;
		}

		if (!this.collapseRecorded) {
			this.savedCollapsed = chain.flatMap((entry) => {
				const path = entry.file?.path;
				if (!path) {
					return [];
				}
				return [{ path, collapsed: entry.collapsed === true }];
			});
			this.collapseRecorded = true;
		}

		for (const entry of [...chain].reverse()) {
			if (entry.collapsed && entry.setCollapsed) {
				await entry.setCollapsed(false, false);
			}
		}
	}

	private mark(view: FileExplorerView, focusItem: ExplorerItem): void {
		this.clearMarks(view);
		view.navFileContainerEl.classList.add('zen-mode-active');

		let current: ExplorerItem | undefined = focusItem;
		while (current?.parent?.vChildren) {
			const parent: ExplorerItem = current.parent;
			const children = parent.vChildren?.children;
			if (!children) {
				break;
			}
			if (parent.el.classList.contains('nav-folder')) {
				parent.el.classList.add('zen-ancestor');
			}
			for (const kid of children) {
				if (kid === current) {
					continue;
				}
				kid.el.classList.add('zen-hidden');
				if (kid.info) {
					kid.info.hidden = true;
					kid.info.height = 0;
					kid.info.computed = false;
				}
			}
			current = parent;
		}

		focusItem.el.classList.add('zen-focus');
		focusItem.el.classList.remove('zen-hidden');
		if (focusItem.info) {
			focusItem.info.hidden = false;
		}
		if (!this.layoutQueued) {
			this.layoutQueued = true;
			view.tree?.infinityScroll?.queueCompute?.();
		}
	}

	private clearMarks(view: FileExplorerView): void {
		view.navFileContainerEl.classList.remove('zen-mode-active');
		for (const item of Object.values(view.fileItems)) {
			const wasHidden = item.el.classList.contains('zen-hidden');
			item.el.classList.remove('zen-focus', 'zen-ancestor', 'zen-hidden');
			if (wasHidden && item.info) {
				item.info.hidden = false;
				item.info.computed = false;
			}
		}
	}

	private watchExplorer(): void {
		this.observer?.disconnect();
		this.observer = new MutationObserver(() => {
			void this.decorateAll();
		});
		for (const view of this.explorerViews()) {
			this.observer.observe(view.navFileContainerEl, { childList: true, subtree: true });
		}
	}

	private onRename(file: TAbstractFile, oldPath: string): void {
		if (this.focusPath === null) {
			return;
		}
		if (
			file instanceof TFolder &&
			(this.focusPath === oldPath || this.focusPath.startsWith(`${oldPath}/`))
		) {
			const nextPath = file.path + this.focusPath.slice(oldPath.length);
			this.focusPath = nextPath;
			this.savedCollapsed = this.savedCollapsed.map((entry) => {
				if (entry.path === oldPath || entry.path.startsWith(`${oldPath}/`)) {
					return {
						path: file.path + entry.path.slice(oldPath.length),
						collapsed: entry.collapsed,
					};
				}
				return entry;
			});
		}
		void this.decorateAll();
	}

	private onDelete(file: TAbstractFile): void {
		if (this.focusPath === null) {
			return;
		}
		if (file.path === this.focusPath || this.focusPath.startsWith(`${file.path}/`)) {
			void this.exit();
			return;
		}
		void this.decorateAll();
	}

	private async exit(): Promise<void> {
		const saved = this.savedCollapsed;
		this.focusPath = null;
		this.collapseRecorded = false;
		this.savedCollapsed = [];
		this.layoutQueued = false;
		this.observer?.disconnect();
		this.observer = null;

		const views = this.explorerViews();
		for (const view of views) {
			this.clearMarks(view);
		}
		for (const view of views) {
			for (const entry of saved) {
				const item = view.fileItems[entry.path];
				if (item?.setCollapsed && item.collapsed !== entry.collapsed) {
					await item.setCollapsed(entry.collapsed, false);
				}
			}
			view.tree?.infinityScroll?.queueCompute?.();
		}
		this.syncButtonState();
	}
}
