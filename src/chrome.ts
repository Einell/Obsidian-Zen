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
