import { App, Component, Point, TFile } from "obsidian";

export interface DragStartEvent {
	element: HTMLElement;
	originalElement: HTMLElement;
	startX: number;
	startY: number;
	event: PointerEvent | MouseEvent | TouchEvent;
	dropZoneSelector?: string; // Selector for valid drop zones
}

export interface DragMoveEvent extends DragStartEvent {
	currentX: number;
	currentY: number;
	deltaX: number;
	deltaY: number;
}

export interface DragEndEvent extends DragMoveEvent {
	dropTarget: HTMLElement | null;
}

export interface DragManagerOptions {
	draggableSelector?: string; // Selector for elements *within* the container that are draggable
	container: HTMLElement; // The element that contains draggable items and listens for events
	onDragStart?: (data: DragStartEvent) => void | boolean; // Return false to cancel drag
	onDragMove?: (data: DragMoveEvent) => void;
	onDragEnd?: (data: DragEndEvent) => void;
	dragHandleSelector?: string; // Optional selector for a specific drag handle within the draggable element
	cloneElement?: boolean | (() => HTMLElement); // Option to drag a clone
	dragClass?: string; // Class added to the element being dragged (or its clone)
	ghostClass?: string; // Class added to the original element when dragging a clone
	dropZoneSelector?: string; // Selector for valid drop zones
}

export class DragManager extends Component {
	private options: DragManagerOptions;
	private isDragging = false;
	private isPotentialDrag = false; // Flag to track if a drag might start
	private startX = 0;
	private startY = 0;
	private currentX = 0;
	private currentY = 0;
	private initialPointerX = 0; // Store initial pointer down position
	private initialPointerY = 0;
	private dragThreshold = 5; // Minimum distance in pixels to initiate drag
	private draggedElement: HTMLElement | null = null;
	private originalElement: HTMLElement | null = null; // Store original always
	private hasMovedBeyondThreshold = false; // Flag to track if threshold was crossed during move
	private startEventData: DragStartEvent | null = null;
	private boundHandlePointerDown: (event: PointerEvent) => void;
	private boundHandlePointerMove: (event: PointerEvent) => void;
	private boundHandlePointerUp: (event: PointerEvent) => void;
	private boundHandleKeyDown: (event: KeyboardEvent) => void; // Added for Escape key
	private initialTarget: EventTarget | null = null; // Store the initial target of pointerdown
	private currentDropTargetHover: HTMLElement | null = null; // Track the element currently highlighted as drop zone

	constructor(options: DragManagerOptions) {
		super();
		this.options = options;
		this.boundHandlePointerDown = this.handlePointerDown.bind(this);
		this.boundHandlePointerMove = this.handlePointerMove.bind(this);
		this.boundHandlePointerUp = this.handlePointerUp.bind(this);
		this.boundHandleKeyDown = this.handleKeyDown.bind(this); // Bind the new handler
	}

	override onload(): void {
		this.registerListeners();
	}

	override onunload(): void {
		// Listeners are unregistered automatically by Component
		if (this.isDragging || this.isPotentialDrag) {
			// Clean up if unloaded mid-drag or potential drag
			this.resetDragState(); // Ensure cleanup including keydown listener
		}
	}

	private registerListeners(): void {
		this.registerDomEvent(
			this.options.container,
			"pointerdown",
			this.boundHandlePointerDown
		);
	}

	// Add a new handler for keyboard events
	private handleKeyDown(event: KeyboardEvent): void {
		if (
			event.key === "Escape" &&
			(this.isDragging || this.isPotentialDrag)
		) {
			console.log("DragManager: Escape key pressed, cancelling drag.");
			event.stopPropagation(); // Prevent event from bubbling up
			// Optionally trigger a specific cancel event/callback here
			this.resetDragState();
		}
	}

	private handlePointerDown(event: PointerEvent): void {
		if (event.button !== 0) return; // Only main button

		let targetElement = event.target as HTMLElement;
		this.initialTarget = event.target; // Store the initial target

		// Check for drag handle if specified
		if (this.options.dragHandleSelector) {
			const handle = targetElement.closest(
				this.options.dragHandleSelector
			);
			if (!handle) return; // Clicked outside handle

			// If handle is found, the draggable element is its parent (or ancestor matching draggableSelector)
			targetElement = handle.closest(
				this.options.draggableSelector || "*"
			) as HTMLElement;
			if (
				!targetElement ||
				!this.options.container.contains(targetElement)
			)
				return;
		} else if (this.options.draggableSelector) {
			// Find the closest draggable ancestor if draggableSelector is specified
			targetElement = targetElement.closest(
				this.options.draggableSelector
			) as HTMLElement;
			if (
				!targetElement ||
				!this.options.container.contains(targetElement)
			)
				return;
		} else if (targetElement !== this.options.container) {
			// If no selector, assume direct children might be draggable, but check container boundary
			if (!this.options.container.contains(targetElement)) return;
			// Potentially allow dragging direct children if no selector specified
		} else {
			return; // Clicked directly on the container background
		}

		// Potential drag start - record state but don't activate drag yet
		this.isPotentialDrag = true;
		this.initialPointerX = event.clientX;
		this.initialPointerY = event.clientY;
		this.originalElement = targetElement; // Store the element that received the pointerdown

		// Add global listeners immediately to capture move/up/escape
		this.registerDomEvent(
			document,
			"pointermove",
			this.boundHandlePointerMove
		);
		this.registerDomEvent(document, "pointerup", this.boundHandlePointerUp);
		this.registerDomEvent(document, "keydown", this.boundHandleKeyDown); // Add keydown listener

		// Prevent default only if needed (e.g., text selection), maybe delay this
		// event.preventDefault(); // Let's avoid calling this here to allow clicks
	}

	private handlePointerMove(event: PointerEvent): void {
		if (!this.isPotentialDrag && !this.isDragging) return;

		this.currentX = event.clientX;
		this.currentY = event.clientY;

		if (this.isPotentialDrag) {
			const deltaX = Math.abs(this.currentX - this.initialPointerX);
			const deltaY = Math.abs(this.currentY - this.initialPointerY);

			console.log(
				`DragManager: Pointer move. deltaX: ${deltaX}, deltaY: ${deltaY}, distance: ${Math.sqrt(
					deltaX * deltaX + deltaY * deltaY
				)}`
			);

			// Check if threshold is exceeded
			if (
				Math.sqrt(deltaX * deltaX + deltaY * deltaY) >
				this.dragThreshold
			) {
				this.isPotentialDrag = false; // It's now a confirmed drag
				this.isDragging = true;
				this.hasMovedBeyondThreshold = true; // Set the flag

				// Prevent default actions like text selection *now* that it's a drag
				if (event.cancelable) event.preventDefault();

				// --- Perform Drag Initialization ---
				this.startX = this.initialPointerX; // Use initial pointer pos as drag start
				this.startY = this.initialPointerY;

				// --- Cloning Logic ---
				if (this.options.cloneElement && this.originalElement) {
					if (typeof this.options.cloneElement === "function") {
						this.draggedElement = this.options.cloneElement();
					} else {
						this.draggedElement = this.originalElement.cloneNode(
							true
						) as HTMLElement;
					}
					// Position the clone absolutely
					const rect = this.originalElement.getBoundingClientRect();
					this.draggedElement.style.position = "absolute";
					// Start clone at the initial pointer down position offset by click inside element
					const offsetX = this.startX - rect.left;
					const offsetY = this.startY - rect.top;
					this.draggedElement.style.left = `${
						this.currentX - offsetX
					}px`; // Position based on current mouse
					this.draggedElement.style.top = `${
						this.currentY - offsetY
					}px`;
					this.draggedElement.style.width = `${rect.width}px`;
					this.draggedElement.style.height = `${rect.height}px`; // Ensure height is set
					this.draggedElement.style.boxSizing = "border-box"; // Crucial for layout consistency
					this.draggedElement.style.pointerEvents = "none";
					this.draggedElement.style.zIndex = "1000";
					document.body.appendChild(this.draggedElement);

					if (this.options.ghostClass) {
						this.originalElement.classList.add(
							this.options.ghostClass
						);
					}
				} else {
					this.draggedElement = this.originalElement; // Drag original element
				}

				if (this.options.dragClass && this.draggedElement) {
					this.draggedElement.classList.add(this.options.dragClass);
				}
				// --- End Cloning Logic ---

				this.startEventData = {
					element: this.draggedElement!,
					originalElement: this.originalElement!,
					startX: this.startX,
					startY: this.startY,
					event: event, // Use the current move event as the 'start' trigger
					dropZoneSelector: this.options.dropZoneSelector,
				};

				// Check if drag should proceed (callback)
				const proceed = this.options.onDragStart?.(
					this.startEventData!
				);
				if (proceed === false) {
					console.log("Drag start cancelled by callback");
					this.resetDragState(); // Reset includes hasMovedBeyondThreshold
					return;
				}
				// --- End Drag Initialization ---

				// Trigger initial move callback immediately after start
				this.triggerDragMove(event);
			}
			// If threshold not exceeded, do nothing - wait for more movement or pointerup
			return; // Don't proceed further in this move event if we just initiated drag
		}

		// --- Continue Drag Move ---
		if (this.isDragging) {
			if (event.cancelable) event.preventDefault(); // Continue preventing defaults during drag
			this.triggerDragMove(event);
		}
	}

	private triggerDragMove(event: PointerEvent): void {
		if (!this.isDragging || !this.draggedElement || !this.startEventData)
			return;

		const deltaX = this.currentX - this.startX;
		const deltaY = this.currentY - this.startY;

		// Update clone position if cloning
		if (this.options.cloneElement) {
			const startRect = this.originalElement!.getBoundingClientRect();
			// Adjust based on where the pointer started *within* the element
			const offsetX = this.startEventData.startX - startRect.left;
			const offsetY = this.startEventData.startY - startRect.top;
			this.draggedElement.style.left = `${this.currentX - offsetX}px`;
			this.draggedElement.style.top = `${this.currentY - offsetY}px`;
		}

		// --- Highlight potential drop target ---
		this.updateDropTargetHighlight(event.clientX, event.clientY);
		// --- End Highlight ---

		const moveEventData: DragMoveEvent = {
			...this.startEventData,
			currentX: this.currentX,
			currentY: this.currentY,
			deltaX: deltaX,
			deltaY: deltaY,
			event: event,
		};

		this.options.onDragMove?.(moveEventData);
	}

	private handlePointerUp(event: PointerEvent): void {
		console.log(
			"DragManager: Pointer up",
			event,
			this.hasMovedBeyondThreshold
		);
		// Check if the drag threshold was ever crossed during the pointermove phase
		if (this.hasMovedBeyondThreshold) {
			// If movement occurred, prevent the click event regardless of drop success etc.
			event.preventDefault();
			// console.log(`DragManager: Preventing click because threshold was crossed.`);
		} else {
			// console.log(`DragManager: Not preventing click because threshold was not crossed.`);
		}

		// Check if it was essentially a click (potential drag never became actual drag)
		if (this.isPotentialDrag && !this.isDragging) {
			// console.log("DragManager: PotentialDrag=true, IsDragging=false. Treating as click/short drag.");
			this.resetDragState(); // Clean up listeners etc.
			// Do not return here if preventDefault was called above
			// If hasMovedBeyondThreshold is false (no preventDefault), this allows the click
			// If hasMovedBeyondThreshold is true (preventDefault was called), the click is blocked anyway
			return; // Allow default behavior (or prevented behavior)
		}

		// Check if drag state is inconsistent or drag didn't actually start properly
		if (!this.isDragging || !this.draggedElement || !this.startEventData) {
			// console.log(`DragManager: Inconsistent state? isDragging=${this.isDragging}, hasMoved=${this.hasMovedBeyondThreshold}`);
			this.resetDragState();
			return;
		}

		// --- Drag End --- (Now we are sure a drag was properly started)
		// preventDefault() was potentially called at the beginning of this function.
		// console.log("DragManager: Drag End logic. hasMovedBeyondThreshold:", this.hasMovedBeyondThreshold);

		// Determine potential drop target
		let dropTarget: HTMLElement | null = null;
		if (this.options.dropZoneSelector) {
			// Hide the clone temporarily to accurately find the element underneath
			// Use the dragged element (which might be the clone or original)
			const elementToHide = this.draggedElement;
			const originalDisplay = elementToHide.style.display;
			// Only hide if it's the clone, otherwise elementFromPoint gets the original element itself
			if (this.options.cloneElement) {
				elementToHide.style.display = "none";
			}

			const elementUnderPointer = document.elementFromPoint(
				event.clientX, // Use event's clientX/Y which are the final pointer coords
				event.clientY
			);

			// Restore visibility
			if (this.options.cloneElement) {
				elementToHide.style.display = originalDisplay;
			}

			if (elementUnderPointer) {
				dropTarget = elementUnderPointer.closest(
					this.options.dropZoneSelector
				) as HTMLElement;
			}
		}

		const endEventData: DragEndEvent = {
			...this.startEventData,
			currentX: event.clientX, // Use final pointer coords
			currentY: event.clientY,
			deltaX: event.clientX - this.startX, // Delta based on drag start coords (startX/Y)
			deltaY: event.clientY - this.startY,
			event: event,
			dropTarget: dropTarget,
		};

		// Trigger the callback *before* final cleanup
		try {
			this.options.onDragEnd?.(endEventData);
		} catch (error) {
			console.error("DragManager: Error in onDragEnd callback:", error);
		} finally {
			// Ensure cleanup happens even if callback throws
			this.resetDragState(); // This now resets hasMovedBeyondThreshold
		}
	}

	private resetDragState(): void {
		// Note: No need to manually remove event listeners since we're using registerDomEvent
		// Obsidian will automatically clean them up when the component is unloaded

		// Clean up dragged element styles/DOM
		if (this.draggedElement) {
			if (this.options.dragClass) {
				this.draggedElement.classList.remove(this.options.dragClass);
			}
			// Remove clone if it exists
			if (
				this.options.cloneElement &&
				this.draggedElement !== this.originalElement
			) {
				// Check it's not the original element before removing
				this.draggedElement.remove();
			}
		}
		// Clean up original element styles
		if (this.originalElement && this.options.ghostClass) {
			this.originalElement.classList.remove(this.options.ghostClass);
		}

		// Remove drop target highlight
		if (this.currentDropTargetHover) {
			this.currentDropTargetHover.classList.remove("drop-target-active"); // Use your defined class
			this.currentDropTargetHover = null;
		}

		// Reset state variables
		this.isDragging = false;
		this.isPotentialDrag = false; // Reset potential drag flag
		this.hasMovedBeyondThreshold = false; // Reset the movement flag
		this.draggedElement = null;
		this.originalElement = null;
		this.startEventData = null;
		this.initialTarget = null;
		this.startX = 0;
		this.startY = 0;
		this.currentX = 0;
		this.currentY = 0;
		// Reset initial pointer positions as well
		this.initialPointerX = 0;
		this.initialPointerY = 0;
		// console.log("DragManager: resetDragState finished");
	}

	// New method to handle highlighting drop targets during move
	private updateDropTargetHighlight(
		pointerX: number,
		pointerY: number
	): void {
		if (!this.options.dropZoneSelector || !this.draggedElement) return;

		let potentialDropTarget: HTMLElement | null = null;
		const currentHighlight = this.currentDropTargetHover;

		// Temporarily hide the clone to find the element underneath
		const originalDisplay = this.draggedElement.style.display;
		// Only hide if it's the clone
		if (this.options.cloneElement) {
			this.draggedElement.style.display = "none";
		}

		const elementUnderPointer = document.elementFromPoint(
			pointerX,
			pointerY
		);

		// Restore visibility
		if (this.options.cloneElement) {
			this.draggedElement.style.display = originalDisplay;
		}

		if (elementUnderPointer) {
			potentialDropTarget = elementUnderPointer.closest(
				this.options.dropZoneSelector
			) as HTMLElement;
		}

		// Check if the highlighted target has changed
		if (potentialDropTarget !== currentHighlight) {
			// Remove highlight from the previous target
			if (currentHighlight) {
				currentHighlight.classList.remove("drop-target-active"); // Use your defined class
			}

			// Add highlight to the new target
			if (potentialDropTarget) {
				potentialDropTarget.classList.add("drop-target-active"); // Use your defined class
				this.currentDropTargetHover = potentialDropTarget;
			} else {
				this.currentDropTargetHover = null; // No valid target under pointer
			}
		}
	}
}
