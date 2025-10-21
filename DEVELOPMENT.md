# Task Genius Development Guide

> Comprehensive guide for developers contributing to the Task Genius plugin for Obsidian

## Table of Contents

- [Getting Started](#getting-started)
- [Project Architecture](#project-architecture)
- [Code Style Guide](#code-style-guide)
- [Testing Strategy](#testing-strategy)
- [CLA](#cla)
- [Getting Help](#getting-help)
- [Questions?](#questions)

## Getting Started

### Prerequisites

- **Node.js**: Version 18.x or higher
- **pnpm**: Version 8.x or higher (preferred) or npm
- **Git**: Latest version
- **Obsidian**: Version 1.9.0 or higher
- **IDE**: VS Code (recommended) with TypeScript support

### Initial Setup

```bash
# Clone the repository into your Obsidian vault's plugin folder
cd {YOUR_OBSIDIAN_VAULT_PATH}/.obsidian/plugins
git clone https://github.com/Quorafind/Obsidian-Task-Genius.git
cd Obsidian-Task-Genius

# Install dependencies
pnpm install

# Start development with hot reload
pnpm run dev
```

### Quick Start Checklist

- [ ] Fork the repository
- [ ] Clone your fork locally
- [ ] Install dependencies with `pnpm install`
- [ ] Create symbolic link to Obsidian vault
- [ ] Run `pnpm run dev` for development mode
- [ ] Enable "Task Genius" plugin in Obsidian settings
- [ ] Open Developer Console (Ctrl/Cmd + Shift + I)

## Project Architecture

### Directory Structure

```
SRC
├─cache # Cache system used for caching data from Fluent view
├─commands # Commands for the plugin
├─common # Common files for the plugin
│  └─task-status # Task statuses marks like `[x]` and `[ ]`
├─components # Components for the plugin
│  ├─features # Contains all features related components
│  │  ├─calendar
│  │  │  ├─rendering
│  │  │  └─views
│  │  ├─fluent
│  │  │  ├─components
│  │  │  ├─events
│  │  │  └─managers
│  │  ├─gantt
│  │  ├─habit
│  │  │  ├─components
│  │  │  ├─habitcard
│  │  │  └─modals
│  │  ├─kanban
│  │  ├─on-completion
│  │  ├─onboarding
│  │  │  ├─modals
│  │  │  ├─previews
│  │  │  ├─steps
│  │  │  │  ├─guide
│  │  │  │  ├─intro
│  │  │  │  └─preview
│  │  │  └─ui
│  │  ├─quadrant
│  │  ├─quick-capture
│  │  │  ├─components
│  │  │  ├─modals
│  │  │  └─suggest
│  │  ├─read-mode
│  │  ├─settings
│  │  │  ├─components
│  │  │  ├─core
│  │  │  └─tabs
│  │  ├─table
│  │  ├─task
│  │  │  ├─edit
│  │  │  ├─filter
│  │  │  │  └─in-view
│  │  │  │      └─custom
│  │  │  └─view
│  │  │      └─modals
│  │  ├─timeline-sidebar
│  │  └─workflow
│  │      ├─modals
│  │      └─widgets
│  └─ui # UI components for the plugin
│      ├─behavior
│      ├─date-picker
│      ├─feedback
│      ├─inputs
│      ├─menus
│      ├─modals
│      ├─popovers
│      ├─renderers
│      ├─suggest
│      └─tree
├─core # Main core files for the plugin
│  └─goal
├─dataflow # Dataflow architecture(focused on performance and scalability)
│  ├─api
│  ├─augment
│  ├─core
│  ├─events
│  ├─indexer
│  ├─parsers
│  ├─persistence
│  ├─project
│  ├─sources
│  └─workers
├─editor-extensions # Editor extensions for Obsidian
│  ├─autocomplete
│  ├─core
│  ├─date-time
│  ├─task-operations
│  ├─ui-widgets
│  └─workflow
├─executors # Action executors when task is completed/archived/duplicated/moved/etc.
│  └─completion
├─managers # Some data/task managers
├─mcp # MCP server for Agentic task management
│  ├─auth
│  ├─bridge
│  └─types
├─pages # All views created by the plugin
│  └─bases # Bases view support
├─parsers # Task parsers
├─patches # Patches for Obsidian
├─services # Task related services
├─styles # All styles for the plugin
│  ├─calendar
│  ├─fluent
│  ├─gantt
│  ├─kanban
│  └─quadrant
├─translations # All translations for the plugin
│  └─locale
├─types # All types for the plugin
├─utils # All utils for the plugin
│  ├─date
│  ├─file
│  ├─task
│  └─ui
├─__mocks__
└─__tests__
    ├─file-source
    ├─file-task-manager
    └─integration
```

### Feature Development Flow

1. **Create Feature Branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Development Cycle**
   ```bash
   # Make changes
   pnpm run dev     # Watch mode

   # Run tests
   pnpm test

   # Lint code
   pnpm run lint
   ```

3. **Commit Changes**
   ```bash
   git add .
   git commit -m "feat: add new feature"
   git push origin feature/your-feature-name
   ```

4. **Submit Pull Request**
   - Push to your fork
   - Create PR against `master` branch
   - Ensure CI passes
   - Request review

### Conventional Commits

Format: `<type>(<scope>): <subject>`

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Test additions/changes
- `chore`: Build/tooling changes

Examples:
```bash
feat(kanban): add drag-and-drop support
fix(parser): handle edge case in task parsing
docs(api): update TaskManager documentation
perf(indexer): optimize file scanning algorithm
```

## Code Style Guide

### TypeScript Guidelines

```typescript
// 1. Use explicit types for function parameters and returns
function calculateProgress(completed: number, total: number): number {
  return (completed / total) * 100;
}

// 2. Use interfaces for object shapes
interface TaskConfig {
  enableWorker: boolean;
  maxConcurrency: number;
  cacheTimeout: number;
}

// 3. Prefer const assertions for literals
const TASK_STATUSES = ['todo', 'in-progress', 'done'] as const;
type TaskStatus = typeof TASK_STATUSES[number];

// 4. Use optional chaining and nullish coalescing
const title = task?.metadata?.title ?? 'Untitled';

// 5. Async/await over promises
async function loadTasks(): Promise<Task[]> {
  const files = await this.getTaskFiles();
  return this.parseTasks(files);
}
```

### Component Guidelines

```typescript
// 1. Extract complex logic to separate methods
export class TaskList extends Component {
  private async renderTasks(): Promise<void> {
    const tasks = await this.fetchTasks();
    const filtered = this.applyFilters(tasks);
    const sorted = this.sortTasks(filtered);
    this.display(sorted);
  }

  private applyFilters(tasks: Task[]): Task[] {
    // Filter logic
  }

  private sortTasks(tasks: Task[]): Task[] {
    // Sort logic
  }
}

// 2. Use descriptive names
// Bad: const d = new Date();
// Good: const currentDate = new Date();

// 3. Document complex algorithms
/**
 * Calculates task priority score based on multiple factors
 * @param task - The task to score
 * @returns Priority score (0-100)
 */
function calculatePriorityScore(task: Task): number {
  // Implementation
}
```

### CSS/Styling Guidelines

```css
/* Use BEM naming convention */
.task-genius-view task-card {
  /* Block */
}

.task-genius-view task-card__header {
  /* Element */
}

.task-genius-view task-card--completed {
  /* Modifier */
}

/* Use CSS variables for theming */
.task-genius-view {
  --primary-color: var(--interactive-accent);
  --spacing-sm: 4px;
  --spacing-md: 8px;
  --spacing-lg: 16px;
}

/* Scope styles to prevent conflicts */
.workspace-leaf-content[data-type="task-genius"] {
  /* Plugin-specific styles */
}
```

## Testing Strategy

### Test Structure

```typescript
// src/__tests__/unit/TaskParser.test.ts
describe('TaskParser', () => {
  let parser: TaskParser;

  beforeEach(() => {
    parser = new TaskParser();
  });

  describe('parseTask', () => {
    it('should parse basic task syntax', () => {
      const input = '- [ ] Sample task';
      const result = parser.parseTask(input);
      expect(result).toMatchObject({
        content: 'Sample task',
        completed: false
      });
    });

    it('should handle task with metadata', () => {
      // Test implementation
    });
  });
});
```

### Testing Commands

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm run test:watch

# Run specific test file
pnpm test src/__tests__/unit/TaskParser.test.ts
```

### Mock Strategies

```typescript
// Mock Obsidian API
jest.mock('obsidian', () => ({
  Plugin: class MockPlugin {
    // Mock implementation
  },
  TFile: class MockTFile {
    // Mock implementation
  }
}));
```

## CLA

Contributor License Agreement (CLA) for Task Genius

Important: Please read this carefully before contributing.

By submitting a contribution (pull request, issue, comment, or any other form of contribution) to this project, you agree to the following terms:

### License Grant

1.  **Grant of Rights**: You grant Quorafind the perpetual, worldwide, non-exclusive, royalty-free, irrevocable right to use, reproduce, modify, and distribute your contributions under one or more licenses, including but not limited to:
    * (a) The Project's Public License: The project's primary public-facing license, which is currently the **Functional Source License 1.1 (FSL 1.1)**, and the subsequent **Apache License 2.0** it is converted to.
    * (b) Proprietary Commercial Licenses: Any other proprietary license of Quorafind's choosing. This allows us to offer the software to commercial customers under terms different from the public license if needed in the future.

2.  **Original Work**: You confirm that:
    * You are the original author of the contribution.
    * You have the legal right to grant the above license.
    * Your contribution does not violate any third-party rights.
    * Your contribution is submitted voluntarily.

3.  **No Warranty**: Contributions are provided "as-is" without warranty of any kind.

### Why We Need This

Our mission is to build the best task management tool for Obsidian and keep it free for everyone. To achieve this sustainably, our project operates under a specific licensing model, and your agreement is essential.

* **Commitment to Free Use:** The compiled, ready-to-use Task Genius plugin is and will remain **free for all users**, including for commercial purposes. We want everyone to benefit from it without a paywall.
* **Protecting the Source Code:** To ensure the project's long-term health and fund its development, we release the **source code** under the Functional Source License 1.1 (FSL 1.1). This prevents others from simply taking our code, rebranding it, and selling it as a competing product.

* **Your Role as a Contributor:** This CLA is the bridge between your contribution and our project. It grants us the legal clarity to incorporate your code into our BSL-licensed project. This single agreement allows us to continue developing, maintaining, and distributing the plugin for the benefit of the entire community.

By signing, you help us protect the project's future while keeping the plugin itself free for all. Thank you for your contribution!

## Getting Help

1. Check existing issues on GitHub
2. Search Discord plugin-dev channel
3. Create detailed issue with:
   - Environment details
   - Steps to reproduce
   - Expected vs actual behavior
   - Console logs

## Questions?

If you have questions not covered here:
1. Open a discussion on GitHub
2. Ask in the Obsidian Discord
3. Contact the maintainers

Happy coding! 🚀
