import { type App, type Workspace } from 'obsidian';

const LEFT_EDGE_PX = 12;

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
	private temporaryLeft = false;

	constructor(private readonly app: App) {}

	enter(): void {
		if (this.engaged) {
			this.reapply();
			return;
		}
		const left = this.dock('leftSplit');
		this.leftCollapsed = left?.collapsed ?? false;
		this.engaged = true;
		this.reapply();
		left?.collapse();
	}

	exit(): void {
		if (!this.engaged) {
			return;
		}
		this.engaged = false;
		this.temporaryLeft = false;
		this.body()?.classList.remove('zen-mode-chrome');
		this.restore('leftSplit', this.leftCollapsed);
	}

	reapply(): void {
		if (!this.engaged) {
			return;
		}
		this.body()?.classList.add('zen-mode-chrome');
	}

	onPointerMove(event: PointerEvent): void {
		if (!this.engaged) {
			return;
		}
		const container = this.app.workspace.containerEl;
		const bounds = container.getBoundingClientRect();
		const x = event.clientX - bounds.left;
		const inStrip = x >= 0 && x < LEFT_EDGE_PX;
		const sidebar = container.querySelector('.mod-left-split');
		const inSidebar =
			sidebar instanceof HTMLElement &&
			event.target instanceof Node &&
			sidebar.contains(event.target);
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
