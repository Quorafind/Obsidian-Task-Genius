/**
 * Tests for viewModeUtils functionality
 * These tests verify the global view mode configuration feature
 */

import { getDefaultViewMode, getSavedViewMode, saveViewMode, getInitialViewMode } from '../utils/ui/view-mode-utils';

// Mock Obsidian App
class MockApp {
	private storage: Record<string, any> = {};

	loadLocalStorage(key: string): any {
		return this.storage[key] || null;
	}

	saveLocalStorage(key: string, value: any): void {
		this.storage[key] = value;
	}

	clearStorage(): void {
		this.storage = {};
	}
}

// Mock Plugin
class MockPlugin {
	settings = {
		defaultViewMode: "list" as "list" | "tree"
	};

	setDefaultViewMode(mode: "list" | "tree"): void {
		this.settings.defaultViewMode = mode;
	}
}

describe('viewModeUtils', () => {
	let mockApp: MockApp;
	let mockPlugin: MockPlugin;

	beforeEach(() => {
		mockApp = new MockApp();
		mockPlugin = new MockPlugin();
	});

	describe('getDefaultViewMode', () => {
		test('should return false for list mode', () => {
			mockPlugin.setDefaultViewMode("list");
			expect(getDefaultViewMode(mockPlugin as any)).toBe(false);
		});

		test('should return true for tree mode', () => {
			mockPlugin.setDefaultViewMode("tree");
			expect(getDefaultViewMode(mockPlugin as any)).toBe(true);
		});
	});

	describe('getSavedViewMode', () => {
		test('should return null when no saved state exists', () => {
			const result = getSavedViewMode(mockApp as any, "inbox");
			expect(result).toBeNull();
		});

		test('should return true for saved tree mode', () => {
			mockApp.saveLocalStorage("task-genius:view-mode:inbox", "tree");
			const result = getSavedViewMode(mockApp as any, "inbox");
			expect(result).toBe(true);
		});

		test('should return false for saved list mode', () => {
			mockApp.saveLocalStorage("task-genius:view-mode:inbox", "list");
			const result = getSavedViewMode(mockApp as any, "inbox");
			expect(result).toBe(false);
		});

		test('should handle different view IDs', () => {
			mockApp.saveLocalStorage("task-genius:view-mode:projects", "tree");
			mockApp.saveLocalStorage("task-genius:view-mode:tags", "list");
			
			expect(getSavedViewMode(mockApp as any, "projects")).toBe(true);
			expect(getSavedViewMode(mockApp as any, "tags")).toBe(false);
			expect(getSavedViewMode(mockApp as any, "forecast")).toBeNull();
		});
	});

	describe('saveViewMode', () => {
		test('should save tree mode correctly', () => {
			saveViewMode(mockApp as any, "inbox", true);
			const saved = mockApp.loadLocalStorage("task-genius:view-mode:inbox");
			expect(saved).toBe("tree");
		});

		test('should save list mode correctly', () => {
			saveViewMode(mockApp as any, "inbox", false);
			const saved = mockApp.loadLocalStorage("task-genius:view-mode:inbox");
			expect(saved).toBe("list");
		});

		test('should save different view IDs independently', () => {
			saveViewMode(mockApp as any, "projects", true);
			saveViewMode(mockApp as any, "tags", false);
			
			expect(mockApp.loadLocalStorage("task-genius:view-mode:projects")).toBe("tree");
			expect(mockApp.loadLocalStorage("task-genius:view-mode:tags")).toBe("list");
		});
	});

	describe('getInitialViewMode', () => {
		test('should use saved state when available', () => {
			mockPlugin.setDefaultViewMode("list");
			mockApp.saveLocalStorage("task-genius:view-mode:inbox", "tree");
			
			const result = getInitialViewMode(mockApp as any, mockPlugin as any, "inbox");
			expect(result).toBe(true); // Should use saved tree mode, not default list
		});

		test('should use global default when no saved state', () => {
			mockPlugin.setDefaultViewMode("tree");
			
			const result = getInitialViewMode(mockApp as any, mockPlugin as any, "inbox");
			expect(result).toBe(true); // Should use global default tree mode
		});

		test('should use global default list mode when no saved state', () => {
			mockPlugin.setDefaultViewMode("list");
			
			const result = getInitialViewMode(mockApp as any, mockPlugin as any, "inbox");
			expect(result).toBe(false); // Should use global default list mode
		});

		test('should prioritize saved state over global default', () => {
			// Global default is tree, but saved state is list
			mockPlugin.setDefaultViewMode("tree");
			mockApp.saveLocalStorage("task-genius:view-mode:projects", "list");
			
			const result = getInitialViewMode(mockApp as any, mockPlugin as any, "projects");
			expect(result).toBe(false); // Should use saved list mode, not global tree
		});
	});

	describe('integration scenarios', () => {
		test('should handle complete workflow: save, retrieve, and use defaults', () => {
			// Set global default to list
			mockPlugin.setDefaultViewMode("list");
			
			// New view should use global default
			expect(getInitialViewMode(mockApp as any, mockPlugin as any, "inbox")).toBe(false);
			
			// User changes to tree mode and saves
			saveViewMode(mockApp as any, "inbox", true);
			
			// Next time should use saved state
			expect(getInitialViewMode(mockApp as any, mockPlugin as any, "inbox")).toBe(true);
			
			// Different view should still use global default
			expect(getInitialViewMode(mockApp as any, mockPlugin as any, "projects")).toBe(false);
			
			// Change global default to tree
			mockPlugin.setDefaultViewMode("tree");
			
			// Inbox should still use saved state (list)
			expect(getInitialViewMode(mockApp as any, mockPlugin as any, "inbox")).toBe(true);
			
			// New view should use new global default (tree)
			expect(getInitialViewMode(mockApp as any, mockPlugin as any, "tags")).toBe(true);
		});
	});
});
