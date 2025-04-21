import { App, Component, setIcon } from "obsidian";
import { Task } from "src/utils/types/TaskIndex"; // Adjust path
import { KanbanCardComponent } from "./kanban-card";
import TaskProgressBarPlugin from "../../index"; // Adjust path
import { QuickCaptureModal } from "../QuickCaptureModal"; // Import QuickCaptureModal
import { t } from "../../translations/helper"; // Import translation helper

const BATCH_SIZE = 20; // Number of cards to load at a time

export class KanbanColumnComponent extends Component {
	private element: HTMLElement;
	private contentEl: HTMLElement;
	private cards: KanbanCardComponent[] = [];
	private renderedTaskCount = 0;
	private isLoadingMore = false; // Prevent multiple simultaneous loads
	private observer: IntersectionObserver | null = null;
	private sentinelEl: HTMLElement | null = null; // Element to observe

	constructor(
		private app: App,
		private plugin: TaskProgressBarPlugin,
		private containerEl: HTMLElement,
		public statusName: string, // e.g., "Todo", "In Progress"
		private tasks: Task[],
		private params: {
			onTaskStatusUpdate?: (
				taskId: string,
				newStatusMark: string
			) => Promise<void>;
			onTaskSelected?: (task: Task) => void;
			onTaskCompleted?: (task: Task) => void;
			onTaskContextMenu?: (ev: MouseEvent, task: Task) => void;
		}
	) {
		super();
	}

	override onload(): void {
		this.element = this.containerEl.createDiv({
			cls: "tg-kanban-column",
			attr: { "data-status-name": this.statusName },
		});

		// Column Header
		this.element.createEl(
			"div",
			{
<<<<<<< HEAD:src/components/kanban/kanban-column.ts
				cls: "tg-kanban-column-header",
=======
				cls: "kanban-column-header",
>>>>>>> 76d92e6 (chore: bump version):src/components/kanban/KanbanColumn.ts
			},
			(el) => {
				const checkbox = el.createEl("input", {
					cls: "task-list-item-checkbox",
					type: "checkbox",
				});

				checkbox.dataset.task =
					this.plugin.settings.taskStatusMarks[this.statusName] ||
					" ";
				if (
					this.plugin.settings.taskStatusMarks[this.statusName] !==
					" "
				) {
					checkbox.checked = true;
				}

				this.registerDomEvent(checkbox, "click", (event) => {
					event.stopPropagation();
					event.preventDefault();
				});

				el.createEl("span", {
					text: this.statusName,
				});
			}
		);

		// Column Content (Scrollable Area for Cards, and Drop Zone)
		this.contentEl = this.element.createDiv({
			cls: "tg-kanban-column-content",
		});

		// Create sentinel element
		this.sentinelEl = this.contentEl.createDiv({
			cls: "tg-kanban-sentinel",
		});

		// --- Add Card Button ---
		const addCardButtonContainer = this.element.createDiv({
			cls: "tg-kanban-add-card-container",
		});
		const addCardButton = addCardButtonContainer.createEl(
			"button",
			{
				cls: "tg-kanban-add-card-button",
			},
			(el) => {
				el.createEl("span", {}, (el) => {
					setIcon(el, "plus");
				});
				el.createEl("span", {
					text: t("Add Card"),
				});
			}
		);
		this.registerDomEvent(addCardButton, "click", () => {
			// Get the status symbol for the current column
			const taskStatusSymbol =
				this.plugin.settings.taskStatusMarks[this.statusName] ||
				this.statusName ||
				" ";
			new QuickCaptureModal(
				this.app,
				this.plugin,
				{ status: taskStatusSymbol },
				true
			).open();
		});
		// --- End Add Card Button ---

		// Setup Intersection Observer
		this.setupIntersectionObserver();

		// Load initial cards (observer will trigger if sentinel is initially visible)
		// If the initial view is empty or very short, we might need an initial load.
		// Check if sentinel is visible initially or if task list is short
		this.loadMoreCards(); // Let's attempt initial load, observer handles subsequent
	}

	override onunload(): void {
		this.observer?.disconnect(); // Disconnect observer
		this.sentinelEl?.remove(); // Remove sentinel
		this.cards.forEach((card) => card.unload());
		this.cards = [];
		this.element?.remove();
	}

	private loadMoreCards() {
		if (this.isLoadingMore || this.renderedTaskCount >= this.tasks.length) {
			return; // Already loading or all tasks rendered
		}

		this.isLoadingMore = true;

		const startIndex = this.renderedTaskCount;
		const endIndex = Math.min(startIndex + BATCH_SIZE, this.tasks.length);
		let cardsAdded = false;

		for (let i = startIndex; i < endIndex; i++) {
			const task = this.tasks[i];
			const card = new KanbanCardComponent(
				this.app,
				this.plugin,
				this.contentEl,
				task,
				this.params
			);
			this.addChild(card); // Register for lifecycle
			this.cards.push(card);
			card.load(); // Load should handle appending to the DOM if not done already
			// Now insert the created element before the sentinel
			if (card.element && this.sentinelEl) {
				// Check if element and sentinel exist
				this.contentEl.insertBefore(card.element, this.sentinelEl);
			}
			this.renderedTaskCount++;
			cardsAdded = true;
		}

		this.isLoadingMore = false;

		// If all cards are loaded, stop observing
		if (this.renderedTaskCount >= this.tasks.length && this.sentinelEl) {
			this.observer?.unobserve(this.sentinelEl);
			this.sentinelEl.hide(); // Optionally hide the sentinel
		}
	}

	// Optional: Method to add a card component if tasks are updated dynamically
	addCard(task: Task) {
		const card = new KanbanCardComponent(
			this.app,
			this.plugin,
			this.contentEl,
			task,
			this.params
		);
		this.addChild(card);
		this.cards.push(card);
		card.load();
	}

	// Optional: Method to remove a card component
	removeCard(taskId: string) {
		const cardIndex = this.cards.findIndex(
			(c) => c.getTask().id === taskId
		);
		if (cardIndex > -1) {
			const card = this.cards[cardIndex];
			this.removeChild(card); // Unregister
			card.unload(); // Detach DOM element etc.
			this.cards.splice(cardIndex, 1);
		}
	}

	private setupIntersectionObserver(): void {
		if (!this.sentinelEl) return;

		const options = {
			root: this.contentEl, // Observe within the scrolling container
			rootMargin: "0px", // No margin
			threshold: 0.1, // Trigger when 10% of the sentinel is visible
		};

		this.observer = new IntersectionObserver((entries) => {
			entries.forEach((entry) => {
				if (entry.isIntersecting && !this.isLoadingMore) {
					this.loadMoreCards();
				}
			});
		}, options);

		this.observer.observe(this.sentinelEl);
	}
}
