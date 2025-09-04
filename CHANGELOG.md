# Changelog

All notable changes to this project will be documented in this file.



## [9.8.0](https://github.com/Quorafind/Obsidian-Task-Genius/compare/9.8.0-beta.15...9.8.0) (2025-09-04)

### Features

* **projects:** add completed/total task counts to project badges ([1848f3d](https://github.com/Quorafind/Obsidian-Task-Genius/commit/1848f3d4926534b4170118c7ce552d36c5ff3c58))
* **projects:** add progress bar to Projects view ([cfdd402](https://github.com/Quorafind/Obsidian-Task-Genius/commit/cfdd40225e87777dee37140d8c08c043b4956353))
* **settings:** add global Ctrl+K/Cmd+K shortcut for search ([612a979](https://github.com/Quorafind/Obsidian-Task-Genius/commit/612a979f103b52079cf1d7de620025c870b544e7))
* **views:** add region-based organization with drag-and-drop sorting ([393fb48](https://github.com/Quorafind/Obsidian-Task-Genius/commit/393fb48c0188e29837bd6c7738a9ec2bccb24ca7))

### Bug Fixes

* **filter:** improve filter input performance with increased debounce delays ([8dd02bf](https://github.com/Quorafind/Obsidian-Task-Genius/commit/8dd02bf00c6b1e95bf340a3a1e4522387895a740))
* **habits:** prevent all habits being checked when selecting one ([28a061e](https://github.com/Quorafind/Obsidian-Task-Genius/commit/28a061eff4e93b48f97ad3d60b9176b2e24acd04))
* **quick-capture:** resolve tag duplication in autocomplete suggestions ([05d9022](https://github.com/Quorafind/Obsidian-Task-Genius/commit/05d90223847ce042a8616dbcde3f862332b03673))
* **settings:** correct event reason from 'view-deleted' to 'view-updated' ([9e595e7](https://github.com/Quorafind/Obsidian-Task-Genius/commit/9e595e7ae9c514fb222e510a2b0d8c783308e15d))
* **task-view:** resolve text display sync issues in markdown rendering ([99861bd](https://github.com/Quorafind/Obsidian-Task-Genius/commit/99861bdb9a151daccc34a351d91ece7540453403))

### Performance

* optimize view settings updates to avoid full refresh ([e26e6d5](https://github.com/Quorafind/Obsidian-Task-Genius/commit/e26e6d54c63c4a60db73a58acd8b99c06ca91e4e))

### Refactors

* remove inline styles and innerHTML from quadrant-column component ([48b3b8e](https://github.com/Quorafind/Obsidian-Task-Genius/commit/48b3b8ecf97d4e4da1e21119ec0cfd7beec66aa6))
* **styles:** extract inline styles to CSS files ([e93c78b](https://github.com/Quorafind/Obsidian-Task-Genius/commit/e93c78bc2ecd996635cdd87b22b1244081430f06))
* use Obsidian's setIcon instead of manual SVG creation ([cc9d1d5](https://github.com/Quorafind/Obsidian-Task-Genius/commit/cc9d1d5320cd4679dde35222a67a2beee63e6cdf))

### Documentation

* add bug review and fix documentation ([88f0d16](https://github.com/Quorafind/Obsidian-Task-Genius/commit/88f0d16e81315b8879b4fb74f8693e6d1a26e7a0))

### Styles

* apply prettier formatting to task view components ([27f4457](https://github.com/Quorafind/Obsidian-Task-Genius/commit/27f4457bf4bffef641e78237ee5d5df7ff926689))

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
