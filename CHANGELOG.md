# Changelog

All notable changes to this project will be documented in this file.


## [9.9.1](https://github.com/Quorafind/Obsidian-Task-Genius/compare/9.9.0...9.9.1) (2025-10-21)

### Refactors

* implement filter notice and remove unused code ([b566533](https://github.com/Quorafind/Obsidian-Task-Genius/commit/b566533))
* **storage:** migrate from localStorage to Obsidian app storage API ([01bbd43](https://github.com/Quorafind/Obsidian-Task-Genius/commit/01bbd43))

### Styles

* **fluent:** add responsive tab text hiding for narrow views ([a1fc6b6](https://github.com/Quorafind/Obsidian-Task-Genius/commit/a1fc6b6))

## [9.9.0](https://github.com/Quorafind/Obsidian-Task-Genius/compare/9.8.14...9.9.0) (2025-10-21)

### Features

- **Fluent Interface**: Brand new modern interface mode

![task_genius_dark](https://github.com/Quorafind/Obsidian-Task-Genius/blob/master/media/fluent.png?raw=true)

- **Bulk Operations**: Select and manage multiple tasks at once
  - Multi-task Selection: Select multiple tasks with pressing `Shift` key
  - Bulk Operations when you right click on these selected tasks
- **Quick Capture Enhancements**: More powerful task capture
  - Multi-mode Capture: Create tasks or entire files
  - Template Folder Support: Use templates from folders with content merging
  - File Name Template Dropdown: Quick access to common filename patterns
  - Comprehensive Frontmatter: Auto-generate frontmatter for new files
  - Mode Persistence: Remembers your last capture mode
- **Module Visibility Control**: Show/hide modules in fluent interface
- **In-app Changelog Viewer**: View release notes directly in the app with auto-display on updates
- **Enhanced Onboarding**: Guided setup experience
  - Fluent/Legacy Mode Selection: Choose your preferred interface
  - Theme-aware Preview Images: See what each mode looks like
  - Progressive Steps: Step-by-step configuration
  - File Filter Configuration: Set up task sources during onboarding
- **Bases Integration**: Full support Obsidian 1.10.0+
- **Settings Improvements**:
  - Dedicated Interface Settings Tab: Easily switch between Fluent/Legacy modes
  - Tabbed Source Configuration: Better organized index settings
  - Workspace Selector Component: Quickly navigate between workspaces

### Fixes

- **Editor Extensions**: Resolved transaction conflicts between workflow and date managers
- **Workspace**: Improved async handling and error recovery in module visibility
- **Filter**: Fixed proper initialization of filter components
- **Workspace**: Fixed filter state persistence and restoration issues
- **Task Mover**: Prevented archive markers on non-task lines and preserved folded content
- **Settings**: Manage workspace setting now correctly jumps to workspace settings tab
- **Editor**: Improved date positioning in task content (cancel date now goes before task content)
- **Changelog**: Improved cache serialization
- **UI**: Corrected translation interpolation and button alignment

### Improvements

- **State Management**: Improved workspace state management and persistence reliability
- **Code Quality**: Removed void keywords and standardized code formatting
- **Quick Capture**: Consolidated modal imports and improved code quality
- **View Copy**: Enhanced with intelligent two-column preset detection
- **Workflow**: Improved code quality and type safety
- **Performance**: Optimized view initialization and reduced unnecessary renders
- **Search**: Made search query ephemeral across workspace switches
- **License**: Added FSL-1.1-ALv2 license and contributor license agreement
- **Documentation**: Updated with CLA and license information, added PR template


## [9.8.14](https://github.com/Quorafind/Obsidian-Task-Genius/compare/9.8.13...9.8.14) (2025-09-19)

### Bug Fixes

* **write:** sanitize spaces in project and context tags for Tasks format ([3362968](https://github.com/Quorafind/Obsidian-Task-Genius/commit/3362968))
* **write:** preserve spaces in project and context tags when updating tasks ([f770126](https://github.com/Quorafind/Obsidian-Task-Genius/commit/f770126))

### Refactors

* remove unused plus token regex pattern ([c8dfe57](https://github.com/Quorafind/Obsidian-Task-Genius/commit/c8dfe57))
* extract token regexes to centralized location ([ede2379](https://github.com/Quorafind/Obsidian-Task-Genius/commit/ede2379))

### Styles

* **icons:** enhance checkbox hover effects ([58a22af](https://github.com/Quorafind/Obsidian-Task-Genius/commit/58a22af))

## [9.8.13](https://github.com/Quorafind/Obsidian-Task-Genius/compare/9.8.12...9.8.13) (2025-09-17)

### Bug Fixes

* **write:** preserve unknown dataview fields when updating task metadata ([01613e5](https://github.com/Quorafind/Obsidian-Task-Genius/commit/01613e5))
* **write:** preserve wiki links and inline code when updating task metadata ([a787cee](https://github.com/Quorafind/Obsidian-Task-Genius/commit/a787cee))

## [9.8.12](https://github.com/Quorafind/Obsidian-Task-Genius/compare/9.8.11...9.8.12) (2025-09-16)

### Bug Fixes

* **view:** prevent rendering when container not visible ([2d5c117](https://github.com/Quorafind/Obsidian-Task-Genius/commit/2d5c117))
* **write:** unify status→date pipeline; correct date insert positions; prevent clearing content; improve recurring due-date calc (weekly/monthly) and new task generation; ensure single write events; safer delete/batch ops; refs #444 #446 #431 #415 ([c75f207](https://github.com/Quorafind/Obsidian-Task-Genius/commit/c75f207))
* **tags:** ignore escaped \#tag to align with Obsidian behavior; refs #438 ([4a15c61](https://github.com/Quorafind/Obsidian-Task-Genius/commit/4a15c61))
* **view:** ensure single-instance activation for main view and timeline sidebar; dedupe duplicate leaves; refs #428 ([a94d20d](https://github.com/Quorafind/Obsidian-Task-Genius/commit/a94d20d))
* **status-cycler:** prevent status cycling on normal typing in empty checkbox; avoids conflicts with Easy Typing capitalization; refs #409 ([25b2349](https://github.com/Quorafind/Obsidian-Task-Genius/commit/25b2349))

### Refactors

* improve task parsing, date management, and tag handling ([cf51bdb](https://github.com/Quorafind/Obsidian-Task-Genius/commit/cf51bdb))

## [9.8.11](https://github.com/Quorafind/Obsidian-Task-Genius/compare/9.8.10...9.8.11) (2025-09-15)

### Features

* **dataflow:** enhance project configuration and metadata handling ([ab5b945](https://github.com/Quorafind/Obsidian-Task-Genius/commit/ab5b945))
* **settings:** add reset all settings functionality ([fd6df16](https://github.com/Quorafind/Obsidian-Task-Genius/commit/fd6df16))

### Bug Fixes

* **tasks:** improve task completion handling and metadata updates ([46197db](https://github.com/Quorafind/Obsidian-Task-Genius/commit/46197db))

### Refactors

* **projects:** optimize popover creation with Obsidian APIs ([574fbc8](https://github.com/Quorafind/Obsidian-Task-Genius/commit/574fbc8))

## [9.8.10](https://github.com/Quorafind/Obsidian-Task-Genius/compare/9.8.9...9.8.10) (2025-09-13)

### Bug Fixes

* **tasks:** restore recurring task creation on completion ([e3a9f69](https://github.com/Quorafind/Obsidian-Task-Genius/commit/e3a9f69))

### Refactors

* **dataflow:** improve ObsidianSource lifecycle management ([0da0bd8](https://github.com/Quorafind/Obsidian-Task-Genius/commit/0da0bd8))

## [9.8.9](https://github.com/Quorafind/Obsidian-Task-Genius/compare/9.8.8...9.8.9) (2025-09-11)

### Bug Fixes

* **date-picker:** improve robustness when document changes ([9a92ba6](https://github.com/Quorafind/Obsidian-Task-Genius/commit/9a92ba6))
* **tasks:** restore recurring task creation on completion ([4ba8b97](https://github.com/Quorafind/Obsidian-Task-Genius/commit/4ba8b97))

## [9.8.8](https://github.com/Quorafind/Obsidian-Task-Genius/compare/9.8.7...9.8.8) (2025-09-11)

### Bug Fixes

* **file-filter:** correct folder rule matching for nested paths ([895444c](https://github.com/Quorafind/Obsidian-Task-Genius/commit/895444c))

## [9.8.7](https://github.com/Quorafind/Obsidian-Task-Genius/compare/9.8.6...9.8.7) (2025-09-09)

### Bug Fixes

* **task-view:** allow task selection when inline editor is disabled ([81f7775](https://github.com/Quorafind/Obsidian-Task-Genius/commit/81f7775))
* **metadata:** add reindexing prompts for inheritance settings and improve augmentor sync ([6c51119](https://github.com/Quorafind/Obsidian-Task-Genius/commit/6c51119))

### Refactors

* **debounce:** use Obsidian's built-in debounce utility and reduce log spam ([36ca266](https://github.com/Quorafind/Obsidian-Task-Genius/commit/36ca266))

## [9.8.6](https://github.com/Quorafind/Obsidian-Task-Genius/compare/9.8.5...9.8.6) (2025-09-07)

### Bug Fixes

* **project:** restore project config settings synchronization ([42d67c6](https://github.com/Quorafind/Obsidian-Task-Genius/commit/42d67c6))

## [9.8.5](https://github.com/Quorafind/Obsidian-Task-Genius/compare/9.8.4...9.8.5) (2025-09-07)

### Bug Fixes

* **kanban:** improve status mark resolution and task selection ([9c5b27c](https://github.com/Quorafind/Obsidian-Task-Genius/commit/9c5b27c))

## [9.8.4](https://github.com/Quorafind/Obsidian-Task-Genius/compare/9.8.3...9.8.4) (2025-09-06)

### Bug Fixes

* **habit:** improve count habit display and prevent dataflow loops ([f868c16](https://github.com/Quorafind/Obsidian-Task-Genius/commit/f868c16))

## [9.8.3](https://github.com/Quorafind/Obsidian-Task-Genius/compare/9.8.2...9.8.3) (2025-09-06)

### Features

* **habit:** add quick create habit button in habit view ([dad5480](https://github.com/Quorafind/Obsidian-Task-Genius/commit/dad5480))

### Bug Fixes

* **sidebar:** open habit settings tab directly instead of modal ([37ef1a8](https://github.com/Quorafind/Obsidian-Task-Genius/commit/37ef1a8))
* **habit:** use boolean values for daily habit completion tracking ([5550cb0](https://github.com/Quorafind/Obsidian-Task-Genius/commit/5550cb0))

### Styles

* **habit:** add container for habit create button ([b0f8912](https://github.com/Quorafind/Obsidian-Task-Genius/commit/b0f8912))

## [9.8.2](https://github.com/Quorafind/Obsidian-Task-Genius/compare/9.8.1...9.8.2) (2025-09-05)

### Features

* **task-view:** add modifier key navigation to open tasks in source file ([8700e54](https://github.com/Quorafind/Obsidian-Task-Genius/commit/8700e54))

### Refactors

* **dataflow:** improve file filtering and task indexing performance ([937d7b7](https://github.com/Quorafind/Obsidian-Task-Genius/commit/937d7b7))

## [9.8.1](https://github.com/Quorafind/Obsidian-Task-Genius/compare/9.8.0...9.8.1) (2025-09-05)

### Bug Fixes

* **quick-capture:** prevent window height expansion during text input ([f4c0ebc](https://github.com/Quorafind/Obsidian-Task-Genius/commit/f4c0ebc))

## [9.8.0](https://github.com/Quorafind/Obsidian-Task-Genius/compare/9.7.6...9.8.0) (2025-09-04)

### Breaking Changes

* **dataflow:** complete TaskManager to Dataflow migration with enhanced APIs ([a5884b3](https://github.com/Quorafind/Obsidian-Task-Genius/commit/a5884b3))
  TaskManager has been removed in favor of the new Dataflow architecture

### Features

* **settings:** add global Ctrl+K/Cmd+K shortcut for search ([612a979](https://github.com/Quorafind/Obsidian-Task-Genius/commit/612a979))
* **views:** add region-based organization with drag-and-drop sorting ([393fb48](https://github.com/Quorafind/Obsidian-Task-Genius/commit/393fb48))
* **projects:** add completed/total task counts to project badges ([1848f3d](https://github.com/Quorafind/Obsidian-Task-Genius/commit/1848f3d))
* **projects:** add progress bar to Projects view ([cfdd402](https://github.com/Quorafind/Obsidian-Task-Genius/commit/cfdd402))
* **tasks:** add task deletion with cascade support ([1cec2cc](https://github.com/Quorafind/Obsidian-Task-Genius/commit/1cec2cc))
* **quick-capture:** add start and scheduled date fields to electron quick capture ([cbfb2fc](https://github.com/Quorafind/Obsidian-Task-Genius/commit/cbfb2fc))
* **quick-capture:** add electron-based quick capture window ([ae80f14](https://github.com/Quorafind/Obsidian-Task-Genius/commit/ae80f14))
* **parser:** add case-insensitive tag prefix matching ([6e20a7a](https://github.com/Quorafind/Obsidian-Task-Genius/commit/6e20a7a))
* **habits:** improve habit property handling and add reindex command ([40bb407](https://github.com/Quorafind/Obsidian-Task-Genius/commit/40bb407))
* **settings:** improve heading filter UI and fix matching logic ([1e20055](https://github.com/Quorafind/Obsidian-Task-Genius/commit/1e20055))
* **settings:** improve input fields with native HTML5 types ([e617890](https://github.com/Quorafind/Obsidian-Task-Genius/commit/e617890))
* **tray:** add theme-aware Task Genius icon for system tray ([6faded9](https://github.com/Quorafind/Obsidian-Task-Genius/commit/6faded9))
* **notifications:** add flexible tray modes and improve task filtering ([9d65bd5](https://github.com/Quorafind/Obsidian-Task-Genius/commit/9d65bd5))
* **notifications:** add desktop notifications and tray menu integration ([06b162a](https://github.com/Quorafind/Obsidian-Task-Genius/commit/06b162a))
* **settings:** add bases-support URL and improve modal styling ([b10a757](https://github.com/Quorafind/Obsidian-Task-Genius/commit/b10a757))
* **modal:** add external link button to IframeModal header ([5511203](https://github.com/Quorafind/Obsidian-Task-Genius/commit/5511203))
* **filesource:** add status mapping between checkboxes and file metadata ([9f671ab](https://github.com/Quorafind/Obsidian-Task-Genius/commit/9f671ab))
* **time-parsing:** add enhanced time parsing with date inheritance and timeline improvements ([dc364df](https://github.com/Quorafind/Obsidian-Task-Genius/commit/dc364df))
* **time-parsing:** add enhanced time parsing with range and component extraction ([86b64b0](https://github.com/Quorafind/Obsidian-Task-Genius/commit/86b64b0))
* **uri:** add enhanced deep-link support with path-based routing ([a175bf4](https://github.com/Quorafind/Obsidian-Task-Genius/commit/a175bf4))
* **core:** integrate FileSource and add URI handler support ([a7e4daf](https://github.com/Quorafind/Obsidian-Task-Genius/commit/a7e4daf))
* **manager:** enhance FileTaskManager with expanded functionality ([8e292cb](https://github.com/Quorafind/Obsidian-Task-Genius/commit/8e292cb))
* **filesource:** enhance FileSource task handling and WriteAPI support ([4c5f560](https://github.com/Quorafind/Obsidian-Task-Genius/commit/4c5f560))
* **filter:** enhance file filter manager and settings UI ([c7db2b5](https://github.com/Quorafind/Obsidian-Task-Genius/commit/c7db2b5))
* **file-source:** add path-based task recognition strategy ([5fc1ad0](https://github.com/Quorafind/Obsidian-Task-Genius/commit/5fc1ad0))
* **settings:** add automatic settings migration system ([1b2e26d](https://github.com/Quorafind/Obsidian-Task-Genius/commit/1b2e26d))
* **filesource:** implement file-based task recognition system ([691952a](https://github.com/Quorafind/Obsidian-Task-Genius/commit/691952a))
* **dataflow:** implement WriteAPI with event-based skip mechanism for views ([1dcedc0](https://github.com/Quorafind/Obsidian-Task-Genius/commit/1dcedc0))
* **dataflow:** add WriteAPI for task write operations ([d989762](https://github.com/Quorafind/Obsidian-Task-Genius/commit/d989762))
* **mcp:** add batch task creation and fix subtask insertion ([559008c](https://github.com/Quorafind/Obsidian-Task-Genius/commit/559008c))

### Bug Fixes

* **settings:** correct event reason from 'view-deleted' to 'view-updated' ([9e595e7](https://github.com/Quorafind/Obsidian-Task-Genius/commit/9e595e7))
* **habits:** prevent all habits being checked when selecting one ([28a061e](https://github.com/Quorafind/Obsidian-Task-Genius/commit/28a061e))
* **task-view:** resolve text display sync issues in markdown rendering ([99861bd](https://github.com/Quorafind/Obsidian-Task-Genius/commit/99861bd))
* **filter:** improve filter input performance with increased debounce delays ([8dd02bf](https://github.com/Quorafind/Obsidian-Task-Genius/commit/8dd02bf))
* **quick-capture:** resolve tag duplication in autocomplete suggestions ([05d9022](https://github.com/Quorafind/Obsidian-Task-Genius/commit/05d9022))
* **parser:** respect custom project/context/area prefixes in task parsing ([527cb36](https://github.com/Quorafind/Obsidian-Task-Genius/commit/527cb36))
* **dates:** apply timezone handling to InlineEditor and TaskPropertyTwoColumnView ([77d21e4](https://github.com/Quorafind/Obsidian-Task-Genius/commit/77d21e4))
* **dates:** correct timezone handling for date display in task views ([f1a3c10](https://github.com/Quorafind/Obsidian-Task-Genius/commit/f1a3c10))
* improve task regex to prevent matching nested brackets in status ([26cd602](https://github.com/Quorafind/Obsidian-Task-Genius/commit/26cd602))
* **habits:** improve habit sync and progress visualization ([d18267c](https://github.com/Quorafind/Obsidian-Task-Genius/commit/d18267c))
* **tray:** improve icon visibility and window focus behavior ([a5aedad](https://github.com/Quorafind/Obsidian-Task-Genius/commit/a5aedad))
* resolve memory leaks by adding proper cleanup handlers ([2d85f38](https://github.com/Quorafind/Obsidian-Task-Genius/commit/2d85f38))
* **tray:** add cleanup handler for hard reloads and improve electron API access ([29e000c](https://github.com/Quorafind/Obsidian-Task-Genius/commit/29e000c))
* **dataflow:** correct event cleanup in DataflowOrchestrator ([0401a63](https://github.com/Quorafind/Obsidian-Task-Genius/commit/0401a63))
* **renderer:** remove priority emojis from markdown content regardless of position ([ba52d97](https://github.com/Quorafind/Obsidian-Task-Genius/commit/ba52d97))
* **task-view:** resolve task sorting instability and scroll jumping ([ac54fdb](https://github.com/Quorafind/Obsidian-Task-Genius/commit/ac54fdb))
* **date:** date and priority issue when using inline editor update content ([f6a82d3](https://github.com/Quorafind/Obsidian-Task-Genius/commit/f6a82d3))
* **type:** type issue with TFile ([ff488e8](https://github.com/Quorafind/Obsidian-Task-Genius/commit/ff488e8))
* **writeapi:** prevent writing empty tag arrays to frontmatter ([c1ac3e3](https://github.com/Quorafind/Obsidian-Task-Genius/commit/c1ac3e3))
* **writeapi:** correct typo in console log message ([5117c63](https://github.com/Quorafind/Obsidian-Task-Genius/commit/5117c63))
* **settings:** make performSearch method public for external access ([d4d9d02](https://github.com/Quorafind/Obsidian-Task-Genius/commit/d4d9d02))
* **views:** exclude badge tasks from forecast view ([44900dd](https://github.com/Quorafind/Obsidian-Task-Genius/commit/44900dd))
* **ics:** restore workspace event listeners for ICS updates ([316518d](https://github.com/Quorafind/Obsidian-Task-Genius/commit/316518d))
* **dataflow:** resolve initialization race condition causing empty data on first load ([771d9f7](https://github.com/Quorafind/Obsidian-Task-Genius/commit/771d9f7))
* **priority:** resolve priority parsing and caching issues ([b8f4586](https://github.com/Quorafind/Obsidian-Task-Genius/commit/b8f4586))
* **dataflow:** resolve data loss on restart and integrate FileSource ([172e5fc](https://github.com/Quorafind/Obsidian-Task-Genius/commit/172e5fc))
* **calendar:** display ICS badge events in calendar views ([8408636](https://github.com/Quorafind/Obsidian-Task-Genius/commit/8408636))
* **dataflow:** resolve blank TaskView and integrate ICS events ([deef893](https://github.com/Quorafind/Obsidian-Task-Genius/commit/deef893))
* **dataflow:** resolve data persistence and task parsing issues ([3c67a73](https://github.com/Quorafind/Obsidian-Task-Genius/commit/3c67a73))
* **dataflow:** resolve data persistence and task parsing issues ([b84389e](https://github.com/Quorafind/Obsidian-Task-Genius/commit/b84389e))
* **build:** resolve merge conflicts and compilation errors after rebase ([87bee19](https://github.com/Quorafind/Obsidian-Task-Genius/commit/87bee19))
* **mcp:** improve task retrieval after creation and updates ([e273301](https://github.com/Quorafind/Obsidian-Task-Genius/commit/e273301))

### Performance

* optimize view settings updates to avoid full refresh ([e26e6d5](https://github.com/Quorafind/Obsidian-Task-Genius/commit/e26e6d5))

### Refactors

* **styles:** extract inline styles to CSS files ([e93c78b](https://github.com/Quorafind/Obsidian-Task-Genius/commit/e93c78b))
* **settings:** replace custom list UI with ListConfigModal and use native debounce ([a6d94a5](https://github.com/Quorafind/Obsidian-Task-Genius/commit/a6d94a5))
* **build:** migrate to TypeScript path aliases and update esbuild to v0.25.9 ([77dd5f5](https://github.com/Quorafind/Obsidian-Task-Genius/commit/77dd5f5))
* **components:** add missing re-exports for backward compatibility (phase 5) ([a720293](https://github.com/Quorafind/Obsidian-Task-Genius/commit/a720293))
* **components:** add barrel exports for ui modules (phase 4) ([a009352](https://github.com/Quorafind/Obsidian-Task-Genius/commit/a009352))
* **settings:** standardize settings under features/settings with tabs/components/core structure (phase 3) ([28efa41](https://github.com/Quorafind/Obsidian-Task-Genius/commit/28efa41))
* **components:** consolidate feature modules under src/components/features/* with transitional re-exports (phase 2) ([b9ace94](https://github.com/Quorafind/Obsidian-Task-Genius/commit/b9ace94))
* **components:** extract shared UI into src/components/ui/* with transitional re-exports (phase 1) ([88bcca4](https://github.com/Quorafind/Obsidian-Task-Genius/commit/88bcca4))
* **settings:** restructure beta features into dedicated tabs ([b0431ce](https://github.com/Quorafind/Obsidian-Task-Genius/commit/b0431ce))
* **quadrant:** replace custom feedback elements with Obsidian Notice API ([b2b4ce9](https://github.com/Quorafind/Obsidian-Task-Genius/commit/b2b4ce9))
* **settings:** consolidate dataflowEnabled into enableIndexer ([e599302](https://github.com/Quorafind/Obsidian-Task-Genius/commit/e599302))
* **bases:** enhance Bases API compatibility and content handling ([cfaa2dd](https://github.com/Quorafind/Obsidian-Task-Genius/commit/cfaa2dd))
* **canvas:** consolidate Canvas parsing into core CanvasParser ([52573bf](https://github.com/Quorafind/Obsidian-Task-Genius/commit/52573bf))
* **worker:** remove unused imports from WorkerOrchestrator fallback ([ec032f0](https://github.com/Quorafind/Obsidian-Task-Genius/commit/ec032f0))
* **dataflow:** consolidate time parsing types and remove debug files ([13bd8f3](https://github.com/Quorafind/Obsidian-Task-Genius/commit/13bd8f3))
* **orchestrator:** clean up FileSource initialization ([8388455](https://github.com/Quorafind/Obsidian-Task-Genius/commit/8388455))
* **settings:** update settings UI for FileSource configuration ([d58f487](https://github.com/Quorafind/Obsidian-Task-Genius/commit/d58f487))
* **settings:** convert File Task configuration to dynamic add/remove components ([96162af](https://github.com/Quorafind/Obsidian-Task-Genius/commit/96162af))
* **dataflow:** complete TaskManager to Dataflow migration with enhanced APIs ([a5884b3](https://github.com/Quorafind/Obsidian-Task-Genius/commit/a5884b3))
* **dataflow:** major architecture improvements and bug fixes ([55fbc63](https://github.com/Quorafind/Obsidian-Task-Genius/commit/55fbc63))
* **components:** improve view management and ICS integration ([d3a850b](https://github.com/Quorafind/Obsidian-Task-Genius/commit/d3a850b))
* **dataflow:** optimize single task updates and cache invalidation ([0c6db25](https://github.com/Quorafind/Obsidian-Task-Genius/commit/0c6db25))
* **settings:** consolidate project configuration into unified tab ([b600490](https://github.com/Quorafind/Obsidian-Task-Genius/commit/b600490))
* **dataflow:** optimize worker parallelization and fix tgProject handling ([4e78382](https://github.com/Quorafind/Obsidian-Task-Genius/commit/4e78382))
* **editor-extensions:** restructure editor-ext and standardize kebab-case naming ([effbf91](https://github.com/Quorafind/Obsidian-Task-Genius/commit/effbf91))
* **dataflow:** reorganize workers and fix import paths ([8c256a9](https://github.com/Quorafind/Obsidian-Task-Genius/commit/8c256a9))
* **dataflow:** fix import paths and add dataflow event support ([8e68e01](https://github.com/Quorafind/Obsidian-Task-Genius/commit/8e68e01))
* **architecture:** complete dataflow migration and file reorganization ([ac682e5](https://github.com/Quorafind/Obsidian-Task-Genius/commit/ac682e5))
* **dataflow:** implement new task data architecture foundation ([062379f](https://github.com/Quorafind/Obsidian-Task-Genius/commit/062379f))

### Documentation

* add bug review and fix documentation ([88f0d16](https://github.com/Quorafind/Obsidian-Task-Genius/commit/88f0d16))
* update architecture documentation and file specifications ([449348d](https://github.com/Quorafind/Obsidian-Task-Genius/commit/449348d))
* **filesource:** add comprehensive specification and implementation docs ([738d7aa](https://github.com/Quorafind/Obsidian-Task-Genius/commit/738d7aa))
* add editor-extensions refactoring plan documentation ([9831541](https://github.com/Quorafind/Obsidian-Task-Genius/commit/9831541))

### Tests

* **priority:** add user scenario test for priority parsing ([b323886](https://github.com/Quorafind/Obsidian-Task-Genius/commit/b323886))
* **filesource:** add comprehensive test suite for FileSource feature ([4c82ab5](https://github.com/Quorafind/Obsidian-Task-Genius/commit/4c82ab5))

### Styles

* apply prettier formatting to task view components ([27f4457](https://github.com/Quorafind/Obsidian-Task-Genius/commit/27f4457))
* fix indentation and improve configuration passing ([fbb9417](https://github.com/Quorafind/Obsidian-Task-Genius/commit/fbb9417))
* apply code formatting and linting updates ([d43186f](https://github.com/Quorafind/Obsidian-Task-Genius/commit/d43186f))
* **task-list:** improve multi-line content layout flexibility ([bd56cd6](https://github.com/Quorafind/Obsidian-Task-Genius/commit/bd56cd6))
* **settings:** add tg- prefix to CSS classes to avoid conflicts ([449a1b7](https://github.com/Quorafind/Obsidian-Task-Genius/commit/449a1b7))

## [9.7.6](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/compare/9.7.5...9.7.6) (2025-08-18)

### Bug Fixes

* **mcp:** correct Accept header validation for POST requests ([641b8c0](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/641b8c0314bb29367985ef4020dff8e60be7437a))
* **mcp:** improve protocol compliance and error handling ([329e1f9](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/329e1f913e00ca9ff8410193172ff74a90eba506))
* **mcp:** restrict POST endpoint to /mcp path only ([f9b37e7](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/f9b37e7a4c6f67ed259d92a1b6422b01c2a8a43b))

## [9.7.5](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/compare/9.7.4...9.7.5) (2025-08-18)

### Bug Fixes

* **mcp:** correct Accept header validation logic ([81e7b68](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/81e7b68ea46d306b429ef8c11165bfa0ff565dad))

### Chores

* remove dist folder in repo ([b4bdc85](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/b4bdc858d2caba4b77649037fc288d8a21a4d1a0))
* remove dist folder in repo ([b92371c](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/b92371c0880311bcda4e1ee64c7e5787006c6605))
* update version in repos ([023674a](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/023674af9c4dd063a1798ffd806c0867a94b3bb5))

## [9.7.5](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/compare/9.7.4...9.7.5) (2025-08-18)

### Chores

* remove dist folder in repo ([b92371c](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/b92371c0880311bcda4e1ee64c7e5787006c6605))

## [9.7.4](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/compare/9.7.3...9.7.4) (2025-08-18)

### Bug Fixes

* **mcp:** ensure protocol compliance and consistent tag formatting ([cdeb1fc](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/cdeb1fcea400e76ba7b2b07aa91fb644506e5f7e))

### Refactors

* reorganize architecture and add dataflow foundation ([7afc7a2](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/7afc7a2e7b0f30ee0e5e916255cf5f6ba33760b1))

## [9.7.3](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/compare/9.7.2...9.7.3) (2025-08-17)

## [9.7.2](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/compare/9.7.1...9.7.2) (2025-08-16)

### Bug Fixes

* filter out abandoned/cancelled tasks in timeline sidebar ([01f6ce6](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/01f6ce600d9339beffa5c2f43cabae66ddfca883)), closes [#374](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/issues/374)

## [9.7.1](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/compare/9.7.0...9.7.1) (2025-08-16)

### Refactors

* **date-parsing:** migrate to date-fns and add custom date format support ([8dff8d1](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/8dff8d1b861761ad1e82d49c54218fcebf51f054))

### Chores

* **i18n:** add onboarding and setup wizard translations ([dc98350](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/dc98350f30cd5c19ba5f92c039b4660d3887c44e))

## [9.7.0](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/compare/9.6.3...9.6.4) (2025-08-15)

### Features

* **mcp:** add MCP server integration for external tool connections ([2b685db](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/2b685db09798e123963351014cbb49a33bfdaf9a))
* **security:** add confirmation dialogs for MCP server security settings ([b2efd27](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/b2efd277b2adb1154249ce7f86d3d6c969e20a52))

### Bug Fixes

* **mcp:** only initialize MCP server when explicitly enabled ([4dcfaa9](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/4dcfaa93f3465f80134375408d7bdd8abc07fd2a))
* **mcp:** resolve CORS and requestUrl compatibility issues ([6ef0b6b](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/6ef0b6b38560c9c2b8ed5f0bdef5dd01b7f972c2))
* **mcp:** update MCP integration settings and server implementation ([cc26dba](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/cc26dba12dd6f0299e8a813dbd607237e20bfc3f))

### Chores

* **dependency:** remove unused files in package.json ([f472229](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/f472229354e8a8a8c53730f06977076d2462c131))
* **release:** bump version to 9.7.0 ([5e3b8b6](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/5e3b8b6aa510e0e5e61c795544d42fce1bd75be1))
* **release:** bump version to 9.7.0 ([b081262](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/b081262e9c6887da68095d87ab37559a532e3dbf))
* remove conflict from styles.css ([220a761](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/220a7612a30e93869d37e7176eaf930e28dfb34d))
## [9.6.4](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/compare/9.6.3...9.6.4) (2025-08-14)

### Refactors

* **editor:** extend suggest system to quick capture panel ([45c62a3](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/45c62a3430ec0a2df4388bef16e2b8ae52c2ccce))

### Chores

* **release:** bump version to 9.6.4 ([68123c1](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/68123c196b084ea6fce6c5394d912b7b02d59856))

## [9.7.0](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/compare/9.6.4...9.7.0) (2025-08-15)

### Features

* **mcp:** add MCP server integration for external tool connections ([2b685db](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/2b685db09798e123963351014cbb49a33bfdaf9a))
* **security:** add confirmation dialogs for MCP server security settings ([b2efd27](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/b2efd277b2adb1154249ce7f86d3d6c969e20a52))

### Bug Fixes

* **mcp:** only initialize MCP server when explicitly enabled ([4dcfaa9](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/4dcfaa93f3465f80134375408d7bdd8abc07fd2a))

### Chores

* **dependency:** remove unused files in package.json ([f472229](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/f472229354e8a8a8c53730f06977076d2462c131))
* **release:** bump version to 9.7.0 ([b081262](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/b081262e9c6887da68095d87ab37559a532e3dbf))
* remove conflict from styles.css ([220a761](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/220a7612a30e93869d37e7176eaf930e28dfb34d))

## [9.7.0](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/compare/9.6.4...9.7.0) (2025-08-15)

### Features

* **mcp:** add MCP server integration for external tool connections ([2b685db](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/2b685db09798e123963351014cbb49a33bfdaf9a))
* **security:** add confirmation dialogs for MCP server security settings ([b2efd27](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/b2efd277b2adb1154249ce7f86d3d6c969e20a52))

### Bug Fixes

* **mcp:** only initialize MCP server when explicitly enabled ([4dcfaa9](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/4dcfaa93f3465f80134375408d7bdd8abc07fd2a))

### Chores

* **dependency:** remove unused files in package.json ([f472229](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/f472229354e8a8a8c53730f06977076d2462c131))
* **release:** bump version to 9.7.0 ([b081262](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/b081262e9c6887da68095d87ab37559a532e3dbf))
* remove conflict from styles.css ([220a761](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/220a7612a30e93869d37e7176eaf930e28dfb34d))

## [9.7.0](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/compare/9.6.4...9.7.0) (2025-08-15)

### Features

* **mcp:** add MCP server integration for external tool connections ([2b685db](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/2b685db09798e123963351014cbb49a33bfdaf9a))
* **security:** add confirmation dialogs for MCP server security settings ([b2efd27](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/b2efd277b2adb1154249ce7f86d3d6c969e20a52))

### Bug Fixes

* **mcp:** only initialize MCP server when explicitly enabled ([4dcfaa9](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/4dcfaa93f3465f80134375408d7bdd8abc07fd2a))

### Chores

* **dependency:** remove unused files in package.json ([f472229](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/f472229354e8a8a8c53730f06977076d2462c131))
* remove conflict from styles.css ([220a761](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/220a7612a30e93869d37e7176eaf930e28dfb34d))

## [9.6.4](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/compare/9.6.3...9.6.4) (2025-08-14)

### Refactors

* **editor:** extend suggest system to quick capture panel ([45c62a3](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/45c62a3430ec0a2df4388bef16e2b8ae52c2ccce))

## [9.6.3](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/compare/9.6.2...9.6.3) (2025-08-13)

### Bug Fixes

* **table:** resolve sorting issues for metadata-based task properties ([eab936e](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/eab936ed575115e6522091ec1de164ec0119fe8e))

## [9.6.2](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/compare/9.6.1...9.6.2) (2025-08-12)

### Features

* **settings:** enhance settings search with DOM-based indexing ([38859db](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/38859db6570a59bf3038823cde53008fda111316))

### Refactors

* **quadrant:** migrate event listeners to registerDomEvent ([3a0d380](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/3a0d38084c2b707543dc68755cc056f2c5203e45))

## [9.6.1](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/compare/9.6.0...9.6.1) (2025-08-12)

### Bug Fixes

* **kanban:** only show header checkbox as checked for completed column ([f331344](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/f331344efdecab7540ed9b08c33da023a5157098))
* **ui:** resolve icon display issues for non-completed task states ([51ca203](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/51ca2033814e815bf9e306a51784751b67800de4))

### Chores

* **file:** remove unused file generated by claude ([a81c905](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/a81c90517d283cf6261d13bbb9d7ff7a1c8d68dc))

## [9.6.0](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/compare/9.5.0...9.6.0) (2025-08-12)

### Features

* **projects:** add hierarchical tree view for nested projects ([c2cb144](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/c2cb144e6bd878e5b612a4514a220fb49d92e347))

### Refactors

* **ui:** improve projects sidebar header button layout ([0de2fff](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/0de2fff32ad8626834ebc8d8efd3f39da2831f0d))

## [9.5.0](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/compare/9.4.0...9.5.0) (2025-08-11)

### Features

* **settings:** add search functionality with fuzzy matching ([8a8dec0](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/8a8dec0f1bfc96823d6c7cfca67a246f6e535648))

### Bug Fixes

* **settings:** improve search functionality and UI integration ([8feecd0](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/8feecd0cafedeb736621d34b46aa7f8dddf2b259))

### Refactors

* **settings:** migrate SettingsSearchComponent to inherit Component class ([b9bc9ce](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/b9bc9ce997570952c2867b1b262c56662824f2bd))

### Chores

* **conflict:** fix conflict between styles.css ([837c647](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/837c647c0de63b82674e40785e87d730748ae506))
* resolve merge conflicts ([a57d5ba](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/a57d5bac2a51fcfc50da944f9688593c8af2e94e))
* **style:** update input style in settings search container ([f7ec982](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/f7ec9827cd7642e34b15f7b3b0e860d15460f8b9))

## [9.4.0](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/compare/9.3.0...9.4.0) (2025-08-09)

### Features

* **settings:** add configurable dynamic metadata positioning ([c034862](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/c034862d576490acae3e2d65e5a3908136ce164a))

### Chores

* **ci:** remove GitHub Actions release workflows ([9ea08c2](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/9ea08c2509547b2060e2511ce786abaf2001bde7))
* resolve conflict of styles. css ([6a25d44](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/6a25d4475effd544e29fe4f8590863b4b04994fd))
* resolve conflict of styles. css ([14d2844](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/14d2844cbb873c61cd5accc38361cf21bcaa82e7))

## [9.3.0](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/compare/9.2.2...9.3.0) (2025-08-09)

### Features

* **task-view:** implement dynamic metadata positioning ([662f5a6](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/662f5a69de599dd6ba087b20329c34d6f6d31628))

### Bug Fixes

* task gutter select date ([9e9af7f](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/9e9af7f4840eea2929198933395e36de347dfeb7))

### Chores

* bump release ([b9ba970](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/b9ba970d20a7cf6993849647bf29ab01f56b53f0))
* bump release ([1590071](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/1590071b43abd3e44cdea2fa16b7ad1ebb5d99a8))
* bump version ([b7f06dd](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/b7f06ddc679e59b718880eccfbb39214c5f44b59))
* bump version ([34a25cf](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/34a25cf1c635507bd18d8bc5e0171916ef7084a7))
* **release:** bump version to 9.3.0 ([82c1bed](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/82c1bed09d5a2aca9cef919535057771af24a2f4))
* **release:** bump version to 9.3.0 ([8269846](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/82698464f760cea439442b964d239a639ea637b8))
* styles conflict ([750c74e](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/750c74e16ecff0cbd8e250e5f0101159e245d3c3))

### Tests

* improve test reliability and fix flaky date tests ([d66a13a](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/d66a13a5f41a5ea74d22c7b9215087aef80b5b07))

## [9.3.1](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/compare/9.3.0...9.3.1) (2025-08-09)

## [9.3.0](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/compare/9.2.2...9.3.0) (2025-08-09)

### Features

* **task-view:** implement dynamic metadata positioning ([662f5a6](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/662f5a69de599dd6ba087b20329c34d6f6d31628))

### Bug Fixes

* task gutter select date ([9e9af7f](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/9e9af7f4840eea2929198933395e36de347dfeb7))

### Chores

* bump release ([b9ba970](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/b9ba970d20a7cf6993849647bf29ab01f56b53f0))
* bump release ([1590071](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/1590071b43abd3e44cdea2fa16b7ad1ebb5d99a8))
* **release:** bump version to 9.3.0 ([8269846](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/82698464f760cea439442b964d239a639ea637b8))
* styles conflict ([750c74e](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/750c74e16ecff0cbd8e250e5f0101159e245d3c3))

### Tests

* improve test reliability and fix flaky date tests ([d66a13a](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/d66a13a5f41a5ea74d22c7b9215087aef80b5b07))

## [9.3.0](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/compare/9.2.2...9.3.0) (2025-08-09)

### Features

* **task-view:** implement dynamic metadata positioning ([662f5a6](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/662f5a69de599dd6ba087b20329c34d6f6d31628))

### Bug Fixes

* task gutter select date ([9e9af7f](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/9e9af7f4840eea2929198933395e36de347dfeb7))

### Chores

* bump release ([1590071](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/1590071b43abd3e44cdea2fa16b7ad1ebb5d99a8))
* styles conflict ([750c74e](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/750c74e16ecff0cbd8e250e5f0101159e245d3c3))

### Tests

* improve test reliability and fix flaky date tests ([d66a13a](https://github.com/Quorafind/Obsidian-Task-Progress-Bar/commit/d66a13a5f41a5ea74d22c7b9215087aef80b5b07))
