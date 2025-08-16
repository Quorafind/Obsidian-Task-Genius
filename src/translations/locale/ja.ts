// Japanese translations
const translations = {
	"File Metadata Inheritance": "ファイルメタデータ継承",
	"Configure how tasks inherit metadata from file frontmatter":
		"タスクがファイルフロントマターからメタデータを継承する方法を設定",
	"Enable file metadata inheritance": "ファイルメタデータ継承を有効化",
	"Allow tasks to inherit metadata properties from their file's frontmatter":
		"タスクがそのファイルのフロントマターからメタデータプロパティを継承することを許可",
	"Inherit from frontmatter": "フロントマターから継承",
	"Tasks inherit metadata properties like priority, context, etc. from file frontmatter when not explicitly set on the task":
		"タスクに明示的に設定されていない場合、タスクは優先度、コンテキストなどのメタデータプロパティをファイルフロントマターから継承",
	"Inherit from frontmatter for subtasks":
		"サブタスクのフロントマターから継承",
	"Allow subtasks to inherit metadata from file frontmatter. When disabled, only top-level tasks inherit file metadata":
		"サブタスクがファイルフロントマターからメタデータを継承することを許可。無効化した場合、トップレベルのタスクのみがファイルメタデータを継承",
	"Comprehensive task management plugin for Obsidian with progress bars, task status cycling, and advanced task tracking features.":
		"プログレスバー、タスクステータスサイクル、高度なタスク追跡機能を備えたObsidian用の包括的なタスク管理プラグイン。",
	"Show progress bar": "プログレスバーを表示",
	"Toggle this to show the progress bar.":
		"プログレスバーを表示するにはこれを切り替えてください。",
	"Support hover to show progress info": "ホバーでプログレス情報を表示",
	"Toggle this to allow this plugin to show progress info when hovering over the progress bar.":
		"プログレスバーにカーソルを合わせたときに進捗情報を表示できるようにするにはこれを切り替えてください。",
	"Add progress bar to non-task bullet":
		"非タスク箇条書きにプログレスバーを追加",
	"Toggle this to allow adding progress bars to regular list items (non-task bullets).":
		"通常のリストアイテム（非タスク箇条書き）にプログレスバーを追加できるようにするにはこれを切り替えてください。",
	"Add progress bar to Heading": "見出しにプログレスバーを追加",
	"Toggle this to allow this plugin to add progress bar for Task below the headings.":
		"見出しの下のタスクにプログレスバーを追加できるようにするにはこれを切り替えてください。",
	"Enable heading progress bars": "見出しプログレスバーを有効化",
	"Add progress bars to headings to show progress of all tasks under that heading.":
		"その見出しの下にあるすべてのタスクの進捗状況を表示するために、見出しにプログレスバーを追加します。",
	"Auto complete parent task": "親タスクを自動完了",
	"Toggle this to allow this plugin to auto complete parent task when all child tasks are completed.":
		"すべての子タスクが完了したときに親タスクを自動的に完了させるにはこれを切り替えてください。",
	"Mark parent as 'In Progress' when partially complete":
		"部分的に完了したら親を「進行中」としてマーク",
	"When some but not all child tasks are completed, mark the parent task as 'In Progress'. Only works when 'Auto complete parent' is enabled.":
		"一部の子タスクが完了しているが全部ではない場合、親タスクを「進行中」としてマークします。「親タスクを自動完了」が有効な場合のみ機能します。",
	"Count sub children level of current Task":
		"現在のタスクのサブ子レベルをカウント",
	"Toggle this to allow this plugin to count sub tasks.":
		"サブタスクをカウントできるようにするにはこれを切り替えてください。",
	"Checkbox Status Settings": "タスクステータス設定",
	"Select a predefined task status collection or customize your own":
		"事前定義されたタスクステータスコレクションを選択するか、独自にカスタマイズしてください",
	"Completed task markers": "完了タスクマーカー",
	'Characters in square brackets that represent completed tasks. Example: "x|X"':
		'完了したタスクを表す角括弧内の文字。例："x|X"',
	"Planned task markers": "計画タスクマーカー",
	'Characters in square brackets that represent planned tasks. Example: "?"':
		'計画されたタスクを表す角括弧内の文字。例："?"',
	"In progress task markers": "進行中タスクマーカー",
	'Characters in square brackets that represent tasks in progress. Example: ">|/"':
		'進行中のタスクを表す角括弧内の文字。例：">|/"',
	"Abandoned task markers": "放棄タスクマーカー",
	'Characters in square brackets that represent abandoned tasks. Example: "-"':
		'放棄されたタスクを表す角括弧内の文字。例："-"',
	'Characters in square brackets that represent not started tasks. Default is space " "':
		'開始されていないタスクを表す角括弧内の文字。デフォルトはスペース " "',
	"Count other statuses as": "他のステータスをカウントする方法",
	'Select the status to count other statuses as. Default is "Not Started".':
		"他のステータスをカウントするステータスを選択します。デフォルトは「未開始」です。",
	"Task Counting Settings": "タスクカウント設定",
	"Exclude specific task markers": "特定のタスクマーカーを除外",
	'Specify task markers to exclude from counting. Example: "?|/"':
		'カウントから除外するタスクマーカーを指定します。例："?|/"',
	"Only count specific task markers": "特定のタスクマーカーのみをカウント",
	"Toggle this to only count specific task markers":
		"特定のタスクマーカーのみをカウントするにはこれを切り替えてください",
	"Specific task markers to count": "カウントする特定のタスクマーカー",
	'Specify which task markers to count. Example: "x|X|>|/"':
		'カウントするタスクマーカーを指定します。例："x|X|>|/"',
	"Conditional Progress Bar Display": "条件付きプログレスバー表示",
	"Hide progress bars based on conditions":
		"条件に基づいてプログレスバーを非表示",
	"Toggle this to enable hiding progress bars based on tags, folders, or metadata.":
		"タグ、フォルダ、またはメタデータに基づいてプログレスバーを非表示にするにはこれを切り替えてください。",
	"Hide by tags": "タグで非表示",
	'Specify tags that will hide progress bars (comma-separated, without #). Example: "no-progress-bar,hide-progress"':
		'プログレスバーを非表示にするタグを指定します（カンマ区切り、#なし）。例："no-progress-bar,hide-progress"',
	"Hide by folders": "フォルダで非表示",
	'Specify folder paths that will hide progress bars (comma-separated). Example: "Daily Notes,Projects/Hidden"':
		'プログレスバーを非表示にするフォルダパスを指定します（カンマ区切り）。例："Daily Notes,Projects/Hidden"',
	"Hide by metadata": "メタデータで非表示",
	'Specify frontmatter metadata that will hide progress bars. Example: "hide-progress-bar: true"':
		'プログレスバーを非表示にするフロントマターメタデータを指定します。例："hide-progress-bar: true"',
	"Checkbox Status Switcher": "タスクステータススイッチャー",
	"Enable task status switcher": "タスクステータススイッチャーを有効化",
	"Enable/disable the ability to cycle through task states by clicking.":
		"クリックによるタスク状態の循環機能を有効/無効にします。",
	"Enable custom task marks": "カスタムタスクマークを有効化",
	"Replace default checkboxes with styled text marks that follow your task status cycle when clicked.":
		"デフォルトのチェックボックスを、クリック時にタスクステータスサイクルに従ってスタイル付きテキストマークに置き換えます。",
	"Enable cycle complete status": "サイクル完了ステータスを有効化",
	"Enable/disable the ability to automatically cycle through task states when pressing a mark.":
		"マークを押したときに自動的にタスク状態を循環する機能を有効/無効にします。",
	"Always cycle new tasks": "常に新しいタスクをサイクル",
	"When enabled, newly inserted tasks will immediately cycle to the next status. When disabled, newly inserted tasks with valid marks will keep their original mark.":
		"有効にすると、新しく挿入されたタスクは直ちに次のステータスに循環します。無効にすると、有効なマークを持つ新しく挿入されたタスクは元のマークを保持します。",
	"Checkbox Status Cycle and Marks": "タスクステータスサイクルとマーク",
	"Define task states and their corresponding marks. The order from top to bottom defines the cycling sequence.":
		"タスク状態とそれに対応するマークを定義します。上から下への順序がサイクルの順序を定義します。",
	"Add Status": "ステータスを追加",
	"Completed Task Mover": "完了タスク移動ツール",
	"Enable completed task mover": "完了タスク移動ツールを有効化",
	"Toggle this to enable commands for moving completed tasks to another file.":
		"完了したタスクを別のファイルに移動するコマンドを有効にするにはこれを切り替えてください。",
	"Task marker type": "タスクマーカータイプ",
	"Choose what type of marker to add to moved tasks":
		"移動したタスクに追加するマーカーのタイプを選択",
	"Version marker text": "バージョンマーカーテキスト",
	"Text to append to tasks when moved (e.g., 'version 1.0')":
		"タスクを移動するときに追加するテキスト（例：'version 1.0'）",
	"Date marker text": "日付マーカーテキスト",
	"Text to append to tasks when moved (e.g., 'archived on 2023-12-31')":
		"タスクを移動するときに追加するテキスト（例：'archived on 2023-12-31'）",
	"Custom marker text": "カスタムマーカーテキスト",
	"Use {{DATE:format}} for date formatting (e.g., {{DATE:YYYY-MM-DD}}":
		"日付フォーマットには {{DATE:format}} を使用します（例：{{DATE:YYYY-MM-DD}}",
	"Treat abandoned tasks as completed": "放棄されたタスクを完了として扱う",
	"If enabled, abandoned tasks will be treated as completed.":
		"有効にすると、放棄されたタスクは完了として扱われます。",
	"Complete all moved tasks": "移動したすべてのタスクを完了",
	"If enabled, all moved tasks will be marked as completed.":
		"有効にすると、移動したすべてのタスクが完了としてマークされます。",
	"With current file link": "現在のファイルリンク付き",
	"A link to the current file will be added to the parent task of the moved tasks.":
		"移動したタスクの親タスクに現在のファイルへのリンクが追加されます。",
	"Say Thank You": "感謝の言葉",
	Donate: "寄付",
	"If you like this plugin, consider donating to support continued development:":
		"このプラグインが気に入ったら、継続的な開発をサポートするために寄付をご検討ください：",
	"Add number to the Progress Bar": "プログレスバーに数字を追加",
	"Toggle this to allow this plugin to add tasks number to progress bar.":
		"プログレスバーにタスク数を追加できるようにするにはこれを切り替えてください。",
	"Show percentage": "パーセンテージを表示",
	"Toggle this to allow this plugin to show percentage in the progress bar.":
		"プログレスバーにパーセンテージを表示できるようにするにはこれを切り替えてください。",
	"Customize progress text": "進捗テキストをカスタマイズ",
	"Toggle this to customize text representation for different progress percentage ranges.":
		"異なる進捗パーセンテージ範囲のテキスト表現をカスタマイズするにはこれを切り替えてください。",
	"Progress Ranges": "進捗範囲",
	"Define progress ranges and their corresponding text representations.":
		"進捗範囲とそれに対応するテキスト表現を定義します。",
	"Add new range": "新しい範囲を追加",
	"Add a new progress percentage range with custom text":
		"カスタムテキストで新しい進捗パーセンテージ範囲を追加",
	"Min percentage (0-100)": "最小パーセンテージ（0-100）",
	"Max percentage (0-100)": "最大パーセンテージ（0-100）",
	"Text template (use {{PROGRESS}})":
		"テキストテンプレート（{{PROGRESS}}を使用）",
	"Reset to defaults": "デフォルトにリセット",
	"Reset progress ranges to default values":
		"進捗範囲をデフォルト値にリセット",
	Reset: "リセット",
	"Priority Picker Settings": "優先度ピッカー設定",
	"Toggle to enable priority picker dropdown for emoji and letter format priorities.":
		"絵文字と文字形式の優先度のための優先度ピッカードロップダウンを有効にするには切り替えてください。",
	"Enable priority picker": "優先度ピッカーを有効化",
	"Enable priority keyboard shortcuts":
		"優先度キーボードショートカットを有効化",
	"Toggle to enable keyboard shortcuts for setting task priorities.":
		"タスクの優先度を設定するためのキーボードショートカットを有効にするには切り替えてください。",
	"Date picker": "日付ピッカー",
	"Enable date picker": "日付ピッカーを有効化",
	"Toggle this to enable date picker for tasks. This will add a calendar icon near your tasks which you can click to select a date.":
		"タスクの日付ピッカーを有効にするにはこれを切り替えてください。これにより、タスクの近くにカレンダーアイコンが追加され、クリックして日付を選択できます。",
	"Date mark": "日付マーク",
	"Emoji mark to identify dates. You can use multiple emoji separated by commas.":
		"日付を識別する絵文字マーク。カンマで区切って複数の絵文字を使用できます。",
	"Quick capture": "クイックキャプチャ",
	"Enable quick capture": "クイックキャプチャを有効化",
	"Toggle this to enable Org-mode style quick capture panel. Press Alt+C to open the capture panel.":
		"Org-modeスタイルのクイックキャプチャパネルを有効にするにはこれを切り替えてください。Alt+Cを押してキャプチャパネルを開きます。",
	"Target file": "ターゲットファイル",
	"The file where captured text will be saved. You can include a path, e.g., 'folder/Quick Capture.md'":
		"キャプチャしたテキストが保存されるファイル。パスを含めることができます。例：'folder/Quick Capture.md'",
	"Placeholder text": "プレースホルダーテキスト",
	"Placeholder text to display in the capture panel":
		"キャプチャパネルに表示するプレースホルダーテキスト",
	"Append to file": "ファイルに追加",
	"If enabled, captured text will be appended to the target file. If disabled, it will replace the file content.":
		"有効にすると、キャプチャしたテキストはターゲットファイルに追加されます。無効にすると、ファイルの内容が置き換えられます。",
	"Task Filter": "タスクフィルター",
	"Enable Task Filter": "タスクフィルターを有効化",
	"Toggle this to enable the task filter panel":
		"タスクフィルターパネルを有効にするにはこれを切り替えてください",
	"Preset Filters": "プリセットフィルター",
	"Create and manage preset filters for quick access to commonly used task filters.":
		"よく使用するタスクフィルターにすばやくアクセスするためのプリセットフィルターを作成および管理します。",
	"Edit Filter: ": "フィルターを編集：",
	"Filter name": "フィルター名",
	"Checkbox Status": "タスクステータス",
	"Include or exclude tasks based on their status":
		"ステータスに基づいてタスクを含めるか除外する",
	"Include Completed Tasks": "完了タスクを含める",
	"Include In Progress Tasks": "進行中タスクを含める",
	"Include Abandoned Tasks": "放棄タスクを含める",
	"Include Not Started Tasks": "未開始タスクを含める",
	"Include Planned Tasks": "計画タスクを含める",
	"Related Tasks": "関連タスク",
	"Include parent, child, and sibling tasks in the filter":
		"フィルターに親、子、および兄弟タスクを含める",
	"Include Parent Tasks": "親タスクを含める",
	"Include Child Tasks": "子タスクを含める",
	"Include Sibling Tasks": "兄弟タスクを含める",
	"Advanced Filter": "高度なフィルター",
	"Use boolean operations: AND, OR, NOT. Example: 'text content AND #tag1'":
		"ブール演算を使用：AND、OR、NOT。例：'text content AND #tag1'",
	"Filter query": "フィルタークエリ",
	"Filter out tasks": "タスクをフィルタリング",
	"If enabled, tasks that match the query will be hidden, otherwise they will be shown":
		"有効にすると、クエリに一致するタスクは非表示になり、そうでなければ表示されます",
	Save: "保存",
	Cancel: "キャンセル",
	"Hide filter panel": "フィルターパネルを非表示",
	"Show filter panel": "フィルターパネルを表示",
	"Filter Tasks": "タスクをフィルター",
	"Preset filters": "プリセットフィルター",
	"Select a saved filter preset to apply":
		"適用する保存済みフィルタープリセットを選択",
	"Select a preset...": "プリセットを選択...",
	Query: "クエリ",
	"Use boolean operations: AND, OR, NOT. Example: 'text content AND #tag1 AND DATE:<2022-01-02 NOT PRIORITY:>=#B' - Supports >, <, =, >=, <=, != for PRIORITY and DATE.":
		"ブール演算を使用：AND、OR、NOT。例：'text content AND #tag1 AND DATE:<2022-01-02 NOT PRIORITY:>=#B' - PRIORITYとDATEには >、<、=、>=、<=、!= をサポートします。",
	"If true, tasks that match the query will be hidden, otherwise they will be shown":
		"trueの場合、クエリに一致するタスクは非表示になり、そうでなければ表示されます",
	Completed: "完了",
	"In Progress": "進行中",
	Abandoned: "放棄",
	"Not Started": "未開始",
	Planned: "計画済み",
	"Include Related Tasks": "関連タスクを含める",
	"Parent Tasks": "親タスク",
	"Child Tasks": "子タスク",
	"Sibling Tasks": "兄弟タスク",
	Apply: "適用",
	"New Preset": "新しいプリセット",
	"Preset saved": "プリセットを保存しました",
	"No changes to save": "保存する変更はありません",
	Close: "閉じる",
	"Capture to": "キャプチャ先",
	Capture: "キャプチャ",
	"Capture thoughts, tasks, or ideas...":
		"考え、タスク、アイデアをキャプチャ...",
	Tomorrow: "明日",
	"In 2 days": "2日後",
	"In 3 days": "3日後",
	"In 5 days": "5日後",
	"In 1 week": "1週間後",
	"In 10 days": "10日後",
	"In 2 weeks": "2週間後",
	"In 1 month": "1ヶ月後",
	"In 2 months": "2ヶ月後",
	"In 3 months": "3ヶ月後",
	"In 6 months": "6ヶ月後",
	"In 1 year": "1年後",
	"In 5 years": "5年後",
	"In 10 years": "10年後",
	"Highest priority": "最高優先度",
	"High priority": "高優先度",
	"Medium priority": "中優先度",
	"No priority": "無優先度",
	"Low priority": "低優先度",
	"Lowest priority": "最低優先度",
	"Priority A": "優先度A",
	"Priority B": "優先度B",
	"Priority C": "優先度C",
	"Task Priority": "タスク優先度",
	"Remove Priority": "優先度を削除",
	"Cycle task status forward": "タスクステータスを前に循環",
	"Cycle task status backward": "タスクステータスを後ろに循環",
	"Remove priority": "優先度を削除",
	"Move task to another file": "タスクを別のファイルに移動",
	"Move all completed subtasks to another file":
		"すべての完了したサブタスクを別のファイルに移動",
	"Move direct completed subtasks to another file":
		"直接完了したサブタスクを別のファイルに移動",
	"Move all subtasks to another file":
		"すべてのサブタスクを別のファイルに移動",
	"Set priority": "優先度を設定",
	"Toggle quick capture panel": "クイックキャプチャパネルを切り替え",
	"Quick capture (Global)": "クイックキャプチャ（グローバル）",
	"Toggle task filter panel": "タスクフィルターパネルを切り替え",
	"Filter Mode": "フィルターモード",
	"Choose whether to include or exclude tasks that match the filters":
		"タスクをフィルターする方法を選択します。",
	"Show matching tasks": "一致するタスクを表示",
	"Hide matching tasks": "一致するタスクを非表示",
	"Choose whether to show or hide tasks that match the filters":
		"タスクをフィルターする方法を選択します。",
	"Create new file:": "新しいファイルを作成：",
	"Completed tasks moved to": "完了したタスクの移動先",
	"Failed to create file:": "ファイルの作成に失敗しました：",
	"Beginning of file": "ファイルの先頭",
	"Failed to move tasks:": "タスクの移動に失敗しました：",
	"No active file found": "アクティブなファイルが見つかりません",
	"Task moved to": "タスクの移動先",
	"Failed to move task:": "タスクの移動に失敗しました：",
	"Nothing to capture": "キャプチャするものがありません",
	"Captured successfully": "キャプチャに成功しました",
	"Failed to save:": "保存に失敗しました：",
	"Captured successfully to": "キャプチャ先",
	Total: "合計",
	Workflow: "ワークフロー",
	"Add as workflow root": "ワークフローのルートとして追加",
	"Move to stage": "ステージに移動",
	"Complete stage": "ステージを完了",
	"Add child task with same stage": "同じステージの子タスクを追加",
	"Could not open quick capture panel in the current editor":
		"現在のエディタでクイックキャプチャパネルを開けませんでした",
	"Just started {{PROGRESS}}%": "開始したばかり {{PROGRESS}}%",
	"Making progress {{PROGRESS}}%": "進行中 {{PROGRESS}}%",
	"Half way {{PROGRESS}}%": "半分まで {{PROGRESS}}%",
	"Good progress {{PROGRESS}}%": "順調に進行中 {{PROGRESS}}%",
	"Almost there {{PROGRESS}}%": "もう少しで完了 {{PROGRESS}}%",
	"Progress bar": "進捗バー",
	"You can customize the progress bar behind the parent task(usually at the end of the task). You can also customize the progress bar for the task below the heading.":
		"親タスクの後ろの進捗バー（通常はタスクの最後）をカスタマイズできます。また、見出しの下のタスクの進捗バーもカスタマイズできます。",
	"Hide progress bars": "進捗バーを非表示",
	"Parent task changer": "親タスク変更ツール",
	"Change the parent task of the current task.":
		"現在のタスクの親タスクを変更します。",
	"No preset filters created yet. Click 'Add New Preset' to create one.":
		"プリセットフィルターがまだ作成されていません。「新しいプリセットを追加」をクリックして作成してください。",
	"Configure task workflows for project and process management":
		"プロジェクトとプロセス管理のためのタスクワークフローを設定",
	"Enable workflow": "ワークフローを有効化",
	"Toggle to enable the workflow system for tasks":
		"タスクのワークフローシステムを有効にする切り替え",
	"Auto-add timestamp": "タイムスタンプを自動追加",
	"Automatically add a timestamp to the task when it is created":
		"タスク作成時に自動的にタイムスタンプを追加",
	"Timestamp format:": "タイムスタンプ形式：",
	"Timestamp format": "タイムスタンプ形式",
	"Remove timestamp when moving to next stage":
		"次のステージに移動する際にタイムスタンプを削除",
	"Remove the timestamp from the current task when moving to the next stage":
		"次のステージに移動する際に現在のタスクからタイムスタンプを削除",
	"Calculate spent time": "経過時間を計算",
	"Calculate and display the time spent on the task when moving to the next stage":
		"次のステージに移動する際にタスクにかかった時間を計算して表示",
	"Format for spent time:": "経過時間の形式：",
	"Calculate spent time when move to next stage.":
		"次のステージに移動する際に経過時間を計算します。",
	"Spent time format": "経過時間の形式",
	"Calculate full spent time": "全経過時間を計算",
	"Calculate the full spent time from the start of the task to the last stage":
		"タスクの開始から最後のステージまでの全経過時間を計算",
	"Auto remove last stage marker": "最後のステージマーカーを自動削除",
	"Automatically remove the last stage marker when a task is completed":
		"タスクが完了したときに最後のステージマーカーを自動的に削除",
	"Auto-add next task": "次のタスクを自動追加",
	"Automatically create a new task with the next stage when completing a task":
		"タスクを完了する際に次のステージの新しいタスクを自動的に作成",
	"Workflow definitions": "ワークフロー定義",
	"Configure workflow templates for different types of processes":
		"異なるタイプのプロセス用のワークフローテンプレートを設定",
	"No workflow definitions created yet. Click 'Add New Workflow' to create one.":
		"ワークフロー定義がまだ作成されていません。「新しいワークフローを追加」をクリックして作成してください。",
	"Edit workflow": "ワークフローを編集",
	"Remove workflow": "ワークフローを削除",
	"Delete workflow": "ワークフローを削除",
	Delete: "削除",
	"Add New Workflow": "新しいワークフローを追加",
	"New Workflow": "新しいワークフロー",
	"Create New Workflow": "新しいワークフローを作成",
	"Workflow name": "ワークフロー名",
	"A descriptive name for the workflow": "ワークフローの説明的な名前",
	"Workflow ID": "ワークフローID",
	"A unique identifier for the workflow (used in tags)":
		"ワークフローの一意の識別子（タグで使用）",
	Description: "説明",
	"Optional description for the workflow": "ワークフローのオプション説明",
	"Describe the purpose and use of this workflow...":
		"このワークフローの目的と使用方法を説明...",
	"Workflow Stages": "ワークフローステージ",
	"No stages defined yet. Add a stage to get started.":
		"ステージがまだ定義されていません。ステージを追加して始めましょう。",
	Edit: "編集",
	"Move up": "上に移動",
	"Move down": "下に移動",
	"Sub-stage": "サブステージ",
	"Sub-stage name": "サブステージ名",
	"Sub-stage ID": "サブステージID",
	"Next: ": "次：",
	"Add Sub-stage": "サブステージを追加",
	"New Sub-stage": "新しいサブステージ",
	"Edit Stage": "ステージを編集",
	"Stage name": "ステージ名",
	"A descriptive name for this workflow stage":
		"このワークフローステージの説明的な名前",
	"Stage ID": "ステージID",
	"A unique identifier for the stage (used in tags)":
		"ステージの一意の識別子（タグで使用）",
	"Stage type": "ステージタイプ",
	"The type of this workflow stage": "このワークフローステージのタイプ",
	"Linear (sequential)": "線形（順次）",
	"Cycle (repeatable)": "サイクル（繰り返し可能）",
	"Terminal (end stage)": "終端（終了ステージ）",
	"Next stage": "次のステージ",
	"The stage to proceed to after this one": "このステージの後に進むステージ",
	"Sub-stages": "サブステージ",
	"Define cycle sub-stages (optional)":
		"サイクルサブステージを定義（オプション）",
	"No sub-stages defined yet.": "サブステージがまだ定義されていません。",
	"Can proceed to": "進むことができる先",
	"Additional stages that can follow this one (for right-click menu)":
		"このステージの後に続く追加のステージ（右クリックメニュー用）",
	"No additional destination stages defined.":
		"追加の目的地ステージが定義されていません。",
	Remove: "削除",
	Add: "追加",
	"Name and ID are required.": "名前とIDが必要です。",
	"End of file": "ファイルの終わり",
	"Include in cycle": "サイクルに含める",
	Preset: "プリセット",
	"Preset name": "プリセット名",
	"Edit Filter": "フィルターを編集",
	"Add New Preset": "新しいプリセットを追加",
	"New Filter": "新しいフィルター",
	"Reset to Default Presets": "デフォルトのプリセットにリセット",
	"This will replace all your current presets with the default set. Are you sure?":
		"これにより、現在のすべてのプリセットがデフォルトのセットに置き換えられます。よろしいですか？",
	"Edit Workflow": "ワークフローを編集",
	General: "一般",
	"Progress Bar": "進捗バー",
	"Task Mover": "タスク移動",
	"Quick Capture": "クイックキャプチャ",
	"Date & Priority": "日付と優先度",
	About: "について",
	"Count sub children of current Task":
		"現在のタスクのサブ子タスクをカウント",
	"Toggle this to allow this plugin to count sub tasks when generating progress bar\t.":
		"進捗バーを生成する際にサブタスクをカウントするためにこのプラグインを許可するには切り替えてください。",
	"Configure task status settings": "タスクステータス設定を構成",
	"Configure which task markers to count or exclude":
		"カウントまたは除外するタスクマーカーを構成",
	"Task status cycle and marks": "タスクステータスサイクルとマーク",
	"About Task Genius": "Task Geniusについて",
	Version: "バージョン",
	Documentation: "ドキュメント",
	"View the documentation for this plugin":
		"このプラグインのドキュメントを表示",
	"Open Documentation": "ドキュメントを開く",
	"Incomplete tasks": "未完了のタスク",
	"In progress tasks": "進行中のタスク",
	"Completed tasks": "完了したタスク",
	"All tasks": "すべてのタスク",
	"After heading": "見出しの後",
	"End of section": "セクションの終わり",
	"Enable text mark in source mode": "ソースモードでテキストマークを有効化",
	"Make the text mark in source mode follow the task status cycle when clicked.":
		"ソースモードでテキストマークをクリックするとタスクステータスサイクルに従う",
	"Status name": "ステータス名",
	"Progress display mode": "進捗表示モード",
	"Choose how to display task progress": "タスク進捗の表示方法を選択",
	"No progress indicators": "進捗インジケーターなし",
	"Graphical progress bar": "グラフィカル進捗バー",
	"Text progress indicator": "テキスト進捗インジケーター",
	"Both graphical and text": "グラフィカルとテキストの両方",
	"Toggle this to allow this plugin to count sub tasks when generating progress bar.":
		"進捗バーを生成する際にサブタスクをカウントするためにこのプラグインを許可するには切り替えてください。",
	"Progress format": "進捗フォーマット",
	"Choose how to display the task progress": "タスク進捗の表示方法を選択",
	"Percentage (75%)": "パーセンテージ (75%)",
	"Bracketed percentage ([75%])": "括弧付きパーセンテージ ([75%])",
	"Fraction (3/4)": "分数 (3/4)",
	"Bracketed fraction ([3/4])": "括弧付き分数 ([3/4])",
	"Detailed ([3✓ 1⟳ 0✗ 1? / 5])": "詳細 ([3✓ 1⟳ 0✗ 1? / 5])",
	"Custom format": "カスタムフォーマット",
	"Range-based text": "範囲ベースのテキスト",
	"Use placeholders like {{COMPLETED}}, {{TOTAL}}, {{PERCENT}}, etc.":
		"{{COMPLETED}}、{{TOTAL}}、{{PERCENT}}などのプレースホルダーを使用",
	"Preview:": "プレビュー：",
	"Available placeholders": "利用可能なプレースホルダー",
	"Available placeholders: {{COMPLETED}}, {{TOTAL}}, {{IN_PROGRESS}}, {{ABANDONED}}, {{PLANNED}}, {{NOT_STARTED}}, {{PERCENT}}, {{COMPLETED_SYMBOL}}, {{IN_PROGRESS_SYMBOL}}, {{ABANDONED_SYMBOL}}, {{PLANNED_SYMBOL}}":
		"利用可能なプレースホルダー：{{COMPLETED}}、{{TOTAL}}、{{IN_PROGRESS}}、{{ABANDONED}}、{{PLANNED}}、{{NOT_STARTED}}、{{PERCENT}}、{{COMPLETED_SYMBOL}}、{{IN_PROGRESS_SYMBOL}}、{{ABANDONED_SYMBOL}}、{{PLANNED_SYMBOL}}",
	"Expression examples": "表現例",
	"Examples of advanced formats using expressions":
		"表現を使用した高度なフォーマットの例",
	"Text Progress Bar": "テキスト進捗バー",
	"Emoji Progress Bar": "絵文字進捗バー",
	"Color-coded Status": "色分けされたステータス",
	"Status with Icons": "アイコン付きステータス",
	Preview: "プレビュー",
	Use: "使用",
	"Toggle this to show percentage instead of completed/total count.":
		"完了/合計カウントの代わりにパーセンテージを表示するには切り替えてください。",
	"Customize progress ranges": "進捗範囲をカスタマイズ",
	"Toggle this to customize the text for different progress ranges.":
		"異なる進捗範囲のテキストをカスタマイズするには切り替えてください。",
	"Apply Theme": "テーマを適用",
	"Back to main settings": "メイン設定に戻る",
	"Support expression in format, like using data.percentages to get the percentage of completed tasks. And using math or even repeat functions to get the result.":
		"フォーマットで式をサポートする、例えばdata.percentagesを使用して完了したタスクのパーセンテージを取得する。また、数学や繰り返し関数を使用して結果を取得する。",
	"Target File:": "対象ファイル：",
	"Task Properties": "タスクのプロパティ",
	"Start Date": "開始日",
	"Due Date": "期限日",
	"Scheduled Date": "予定日",
	Priority: "優先度",
	None: "なし",
	Highest: "最高",
	High: "高",
	Medium: "中",
	Low: "低",
	Lowest: "最低",
	Project: "プロジェクト",
	"Project name": "プロジェクト名",
	Context: "コンテキスト",
	Recurrence: "繰り返し",
	"e.g., every day, every week": "例：毎日、毎週",
	"Task Content": "タスク内容",
	"Task Details": "タスクの詳細",
	File: "ファイル",
	"Edit in File": "ファイルで編集",
	"Mark Incomplete": "未完了としてマーク",
	"Mark Complete": "完了としてマーク",
	"Task Title": "タスクタイトル",
	Tags: "タグ",
	"e.g. every day, every 2 weeks": "例：毎日、2週間ごと",
	Forecast: "予測",
	"0 actions, 0 projects": "0アクション、0プロジェクト",
	"Toggle list/tree view": "リスト/ツリービューの切り替え",
	"Focusing on Work": "作業に集中",
	Unfocus: "集中解除",
	"Past Due": "期限超過",
	Today: "今日",
	Future: "将来",
	actions: "アクション",
	project: "プロジェクト",
	"Coming Up": "今後の予定",
	Task: "タスク",
	Tasks: "タスク",
	"No upcoming tasks": "今後のタスクはありません",
	"No tasks scheduled": "予定されているタスクはありません",
	"0 tasks": "0タスク",
	"Filter tasks...": "タスクをフィルター...",
	Projects: "プロジェクト",
	"Toggle multi-select": "複数選択の切り替え",
	"No projects found": "プロジェクトが見つかりません",
	"projects selected": "プロジェクトが選択されました",
	tasks: "タスク",
	"No tasks in the selected projects":
		"選択したプロジェクトにタスクがありません",
	"Select a project to see related tasks":
		"関連タスクを表示するプロジェクトを選択してください",
	"Configure Review for": "レビューの設定：",
	"Review Frequency": "レビュー頻度",
	"How often should this project be reviewed":
		"このプロジェクトをどのくらいの頻度でレビューするか",
	"Custom...": "カスタム...",
	"e.g., every 3 months": "例：3ヶ月ごと",
	"Last Reviewed": "最終レビュー日",
	"Please specify a review frequency": "レビュー頻度を指定してください",
	"Review schedule updated for": "レビュースケジュールが更新されました：",
	"Review Projects": "プロジェクトのレビュー",
	"Select a project to review its tasks.":
		"タスクをレビューするプロジェクトを選択してください。",
	"Configured for Review": "レビュー設定済み",
	"Not Configured": "未設定",
	"No projects available.": "利用可能なプロジェクトがありません。",
	"Select a project to review.":
		"レビューするプロジェクトを選択してください。",
	"Show all tasks": "すべてのタスクを表示",
	"Showing all tasks, including completed tasks from previous reviews.":
		"以前のレビューで完了したタスクを含む、すべてのタスクを表示しています。",
	"Show only new and in-progress tasks": "新規および進行中のタスクのみ表示",
	"No tasks found for this project.":
		"このプロジェクトのタスクが見つかりません。",
	"Review every": "レビュー頻度",
	never: "なし",
	"Last reviewed": "最終レビュー日",
	"Mark as Reviewed": "レビュー済みとしてマーク",
	"No review schedule configured for this project":
		"このプロジェクトにはレビュースケジュールが設定されていません",
	"Configure Review Schedule": "レビュースケジュールを設定",
	"Project Review": "プロジェクトレビュー",
	"Select a project from the left sidebar to review its tasks.":
		"左サイドバーからプロジェクトを選択してタスクをレビューしてください。",
	Inbox: "受信トレイ",
	Flagged: "フラグ付き",
	Review: "レビュー",
	"tags selected": "タグが選択されました",
	"No tasks with the selected tags": "選択したタグのタスクがありません",
	"Select a tag to see related tasks":
		"関連タスクを表示するタグを選択してください",
	"Open Task Genius view": "Task Geniusビューを開く",
	"Task capture with metadata": "メタデータ付きタスクキャプチャ",
	"Refresh task index": "タスクインデックスを更新",
	"Refreshing task index...": "タスクインデックスを更新中...",
	"Task index refreshed": "タスクインデックスが更新されました",
	"Failed to refresh task index": "タスクインデックスの更新に失敗しました",
	"Force reindex all tasks": "すべてのタスクを強制的に再インデックス",
	"Clearing task cache and rebuilding index...":
		"タスクキャッシュをクリアしてインデックスを再構築中...",
	"Task index completely rebuilt":
		"タスクインデックスが完全に再構築されました",
	"Failed to force reindex tasks": "タスクの強制再インデックスに失敗しました",
	"Task Genius View": "Task Geniusビュー",
	"Toggle Sidebar": "サイドバーの切り替え",
	Details: "詳細",
	View: "ビュー",
	"Task Genius view is a comprehensive view that allows you to manage your tasks in a more efficient way.":
		"Task Geniusビューは、タスクをより効率的に管理できる包括的なビューです。",
	"Enable task genius view": "Task Geniusビューを有効にする",
	"Select a task to view details": "タスクを選択して詳細を表示",
	Status: "ステータス",
	"Comma separated": "カンマ区切り",
	Focus: "集中",
	"Loading more...": "読み込み中...",
	projects: "プロジェクト",
	"No tasks for this section.": "このセクションにはタスクがありません。",
	"No tasks found.": "タスクが見つかりません。",
	Complete: "完了",
	"Switch status": "ステータスを切り替える",
	"Rebuild index": "インデックスを再構築",
	Rebuild: "再構築",
	"0 tasks, 0 projects": "0タスク, 0プロジェクト",
	"New Custom View": "新しいカスタムビュー",
	"Create Custom View": "カスタムビューを作成",
	"Edit View: ": "ビューを編集：",
	"View Name": "ビュー名",
	"My Custom Task View": "マイカスタムタスクビュー",
	"Icon Name": "アイコン名",
	"Enter any Lucide icon name (e.g., list-checks, filter, inbox)":
		"Lucideアイコン名を入力してください（例：list-checks、filter、inbox）",
	"Filter Rules": "フィルタールール",
	"Hide Completed and Abandoned Tasks":
		"完了したタスクと放棄したタスクを非表示",
	"Hide completed and abandoned tasks in this view.":
		"このビューで完了したタスクと放棄したタスクを非表示にします。",
	"Text Contains": "テキストを含む",
	"Filter tasks whose content includes this text (case-insensitive).":
		"このテキストを含むタスクをフィルタリングします（大文字小文字を区別しません）。",
	"Tags Include": "タグを含む",
	"Task must include ALL these tags (comma-separated).":
		"タスクはこれらのタグをすべて含む必要があります（カンマ区切り）。",
	"Tags Exclude": "タグを除外",
	"Task must NOT include ANY of these tags (comma-separated).":
		"タスクはこれらのタグのいずれも含んではいけません（カンマ区切り）。",
	"Project Is": "プロジェクトは",
	"Task must belong to this project (exact match).":
		"タスクはこのプロジェクトに属している必要があります（完全一致）。",
	"Priority Is": "優先度は",
	"Task must have this priority (e.g., 1, 2, 3).":
		"タスクはこの優先度を持つ必要があります（例：1、2、3）。",
	"Status Include": "ステータスを含む",
	"Task status must be one of these (comma-separated markers, e.g., /,>).":
		"タスクのステータスはこれらのいずれかである必要があります（カンマ区切りのマーカー、例：/,>）。",
	"Status Exclude": "ステータスを除外",
	"Task status must NOT be one of these (comma-separated markers, e.g., -,x).":
		"タスクのステータスはこれらのいずれでもあってはいけません（カンマ区切りのマーカー、例：-,x）。",
	"Use YYYY-MM-DD or relative terms like 'today', 'tomorrow', 'next week', 'last month'.":
		"YYYY-MM-DD形式または「今日」、「明日」、「来週」、「先月」などの相対的な用語を使用してください。",
	"Due Date Is": "期限日は",
	"Start Date Is": "開始日は",
	"Scheduled Date Is": "予定日は",
	"Path Includes": "パスを含む",
	"Task must contain this path (case-insensitive).":
		"タスクはこのパスを含む必要があります（大文字小文字を区別しません）。",
	"Path Excludes": "パスを除外",
	"Task must NOT contain this path (case-insensitive).":
		"タスクはこのパスを含んではいけません（大文字小文字を区別しません）。",
	"Unnamed View": "名前のないビュー",
	"View configuration saved.": "ビュー設定が保存されました。",
	"Hide Details": "詳細を非表示",
	"Show Details": "詳細を表示",
	"View Config": "ビュー設定",
	"View Configuration": "ビュー設定",
	"Configure the Task Genius sidebar views, visibility, order, and create custom views.":
		"Task Geniusサイドバービューの表示、順序、カスタムビューの作成を設定します。",
	"Manage Views": "ビューを管理",
	"Configure sidebar views, order, visibility, and hide/show completed tasks per view.":
		"サイドバービュー、順序、表示、ビューごとの完了タスクの表示/非表示を設定します。",
	"Show in sidebar": "サイドバーに表示",
	"Edit View": "ビューを編集",
	"Move Up": "上に移動",
	"Move Down": "下に移動",
	"Delete View": "ビューを削除",
	"Add Custom View": "カスタムビューを追加",
	"Error: View ID already exists.": "エラー：ビューIDはすでに存在します。",
	Events: "イベント",
	Plan: "プラン",
	Year: "年",
	Month: "月",
	Week: "週",
	Day: "日",
	Agenda: "アジェンダ",
	"Back to categories": "カテゴリーに戻る",
	"No matching options found": "一致するオプションが見つかりません",
	"No matching filters found": "一致するフィルターが見つかりません",
	Tag: "タグ",
	"File Path": "ファイルパス",
	"Add filter": "フィルターを追加",
	"Clear all": "すべてクリア",
	"Add Card": "カードを追加",
	"First Day of Week": "週の最初の日",
	"Overrides the locale default for calendar views.":
		"カレンダービューのロケールデフォルトを上書きします。",
	"Show checkbox": "チェックボックスを表示",
	"Show a checkbox for each task in the kanban view.":
		"かんばんビューの各タスクにチェックボックスを表示します。",
	"Locale Default": "ロケールデフォルト",
	"Use custom goal for progress bar": "プログレスバーにカスタム目標を使用",
	"Toggle this to allow this plugin to find the pattern g::number as goal of the parent task.":
		"このプラグインが親タスクの目標として g::number パターンを見つけられるようにするにはこれを切り替えてください。",
	"Prefer metadata format of task": "タスクのメタデータ形式を優先",
	"You can choose dataview format or tasks format, that will influence both index and save format.":
		"dataview形式またはtasks形式を選択できます。これはインデックスと保存形式の両方に影響します。",
	"Open in new tab": "新しいタブで開く",
	"Open settings": "設定を開く",
	"Hide in sidebar": "サイドバーに非表示",
	"No items found": "項目が見つかりません",
	"High Priority": "高優先度",
	"Medium Priority": "中優先度",
	"Low Priority": "低優先度",
	"No tasks in the selected items": "選択した項目にタスクがありません",
	"View Type": "ビュータイプ",
	"Select the type of view to create": "作成するビューのタイプを選択",
	"Standard View": "標準ビュー",
	"Two Column View": "2列ビュー",
	Items: "項目",
	"selected items": "選択された項目",
	"No items selected": "項目が選択されていません",
	"Two Column View Settings": "2列ビュー設定",
	"Group by Task Property": "タスクプロパティでグループ化",
	"Select which task property to use for left column grouping":
		"左列のグループ化に使用するタスクプロパティを選択",
	Priorities: "優先度",
	Contexts: "コンテキスト",
	"Due Dates": "期限日",
	"Scheduled Dates": "予定日",
	"Start Dates": "開始日",
	Files: "ファイル",
	"Left Column Title": "左列のタイトル",
	"Title for the left column (items list)": "左列のタイトル（項目リスト）",
	"Right Column Title": "右列のタイトル",
	"Default title for the right column (tasks list)":
		"右列のデフォルトタイトル（タスクリスト）",
	"Multi-select Text": "複数選択テキスト",
	"Text to show when multiple items are selected":
		"複数の項目が選択されたときに表示するテキスト",
	"Empty State Text": "空の状態テキスト",
	"Text to show when no items are selected":
		"項目が選択されていないときに表示するテキスト",
	"Filter Blanks": "空白をフィルター",
	"Filter out blank tasks in this view.":
		"このビューで空白のタスクを除外します。",
	"Task sorting is disabled or no sort criteria are defined in settings.":
		"タスクの並べ替えが無効になっているか、設定で並べ替え条件が定義されていません。",
	"e.g. #tag1, #tag2, #tag3": "例：#tag1, #tag2, #tag3",
	Overdue: "期限切れ",
	"No tasks found for this tag.": "このタグのタスクが見つかりません。",
	"New custom view": "新しいカスタムビュー",
	"Create custom view": "カスタムビューを作成",
	"Edit view: ": "ビューを編集：",
	"Icon name": "アイコン名",
	"First day of week": "週の最初の日",
	"Overrides the locale default for forecast views.":
		"予測ビューのロケールデフォルトを上書きします。",
	"View type": "ビュータイプ",
	"Standard view": "標準ビュー",
	"Two column view": "2列ビュー",
	"Two column view settings": "2列ビュー設定",
	"Group by task property": "タスクプロパティでグループ化",
	"Left column title": "左列のタイトル",
	"Right column title": "右列のタイトル",
	"Empty state text": "空の状態テキスト",
	"Hide completed and abandoned tasks":
		"完了したタスクと放棄されたタスクを非表示",
	"Filter blanks": "空白をフィルタリング",
	"Text contains": "テキストを含む",
	"Tags include": "タグを含む",
	"Tags exclude": "タグを除外",
	"Project is": "プロジェクトは",
	"Priority is": "優先度は",
	"Status include": "ステータスを含む",
	"Status exclude": "ステータスを除外",
	"Due date is": "期限日は",
	"Start date is": "開始日は",
	"Scheduled date is": "予定日は",
	"Path includes": "パスを含む",
	"Path excludes": "パスを除外",
	"Sort Criteria": "並べ替え条件",
	"Define the order in which tasks should be sorted. Criteria are applied sequentially.":
		"タスクを並べ替える順序を定義します。条件は順番に適用されます。",
	"No sort criteria defined. Add criteria below.":
		"並べ替え条件が定義されていません。以下に条件を追加してください。",
	Content: "内容",
	Ascending: "昇順",
	Descending: "降順",
	"Ascending: High -> Low -> None. Descending: None -> Low -> High":
		"昇順：高 -> 低 -> なし。降順：なし -> 低 -> 高",
	"Ascending: Earlier -> Later -> None. Descending: None -> Later -> Earlier":
		"昇順：早い -> 遅い -> なし。降順：なし -> 遅い -> 早い",
	"Ascending respects status order (Overdue first). Descending reverses it.":
		"昇順はステータス順（期限切れが最初）を尊重します。降順はそれを逆にします。",
	"Ascending: A-Z. Descending: Z-A": "昇順：A-Z。降順：Z-A",
	"Remove Criterion": "条件を削除",
	"Add Sort Criterion": "並べ替え条件を追加",
	"Reset to Defaults": "デフォルトにリセット",
	"Has due date": "期限日あり",
	"Has date": "日付あり",
	"No date": "日付なし",
	Any: "任意",
	"Has start date": "開始日あり",
	"Has scheduled date": "予定日あり",
	"Has created date": "作成日あり",
	"Has completed date": "完了日あり",
	"Only show tasks that match the completed date.":
		"完了日に一致するタスクのみを表示します。",
	"Has recurrence": "繰り返しあり",
	"Has property": "プロパティあり",
	"No property": "プロパティなし",
	"Unsaved Changes": "未保存の変更",
	"Sort Tasks in Section": "セクション内のタスクを並べ替え",
	"Tasks sorted (using settings). Change application needs refinement.":
		"タスクが並べ替えられました（設定を使用）。変更の適用には改良が必要です。",
	"Sort Tasks in Entire Document": "ドキュメント全体のタスクを並べ替え",
	"Entire document sorted (using settings).":
		"ドキュメント全体が並べ替えられました（設定を使用）。",
	"Tasks already sorted or no tasks found.":
		"タスクはすでに並べ替えられているか、タスクが見つかりません。",
	"Task Handler": "タスクハンドラー",
	"Show progress bars based on heading":
		"見出しに基づいてプログレスバーを表示",
	"Toggle this to enable showing progress bars based on heading.":
		"見出しに基づいてプログレスバーを表示するにはこれを切り替えてください。",
	"# heading": "# 見出し",
	"Task Sorting": "タスク並べ替え",
	"Configure how tasks are sorted in the document.":
		"ドキュメント内でタスクがどのように並べ替えられるかを設定します。",
	"Enable Task Sorting": "タスク並べ替えを有効にする",
	"Toggle this to enable commands for sorting tasks.":
		"タスクを並べ替えるコマンドを有効にするにはこれを切り替えてください。",
	"Use relative time for date": "日付に相対時間を使用",
	"Use relative time for date in task list item, e.g. 'yesterday', 'today', 'tomorrow', 'in 2 days', '3 months ago', etc.":
		"タスクリストアイテムの日付に相対時間を使用します。例：'昨日'、'今日'、'明日'、'2日後'、'3ヶ月前'など。",
	"Ignore all tasks behind heading": "見出しの後のすべてのタスクを無視",
	"Enter the heading to ignore, e.g. '## Project', '## Inbox', separated by comma":
		"無視する見出しを入力してください。例：'## プロジェクト'、'## 受信箱'、カンマで区切ります",
	"Focus all tasks behind heading": "見出しの後のすべてのタスクにフォーカス",
	"Enter the heading to focus, e.g. '## Project', '## Inbox', separated by comma":
		"フォーカスする見出しを入力してください。例：'## プロジェクト'、'## 受信箱'、カンマで区切ります",
	"Enable rewards": "報酬を有効にする",
	"Reward display type": "報酬表示タイプ",
	"Choose how rewards are displayed when earned.":
		"獲得時に報酬がどのように表示されるかを選択します。",
	"Modal dialog": "モーダルダイアログ",
	"Notice (Auto-accept)": "通知（自動受け入れ）",
	"Occurrence levels": "出現レベル",
	"Add occurrence level": "出現レベルを追加",
	"Reward items": "報酬アイテム",
	"Image url (optional)": "画像URL（任意）",
	"Delete reward item": "報酬アイテムを削除",
	"Add reward item": "報酬アイテムを追加",
	"(Optional) Trigger a notification when this value is reached":
		"（任意）この値に達したときに通知をトリガーする",
	"The property name in daily note front matter to store mapping values":
		"マッピング値を保存するデイリーノートのフロントマターのプロパティ名",
	"Value mapping": "値のマッピング",
	"Define mappings from numeric values to display text":
		"数値から表示テキストへのマッピングを定義",
	"Add new mapping": "新しいマッピングを追加",
	"Scheduled events": "スケジュールされたイベント",
	"Add multiple events that need to be completed":
		"完了する必要のある複数のイベントを追加",
	"Event name": "イベント名",
	"Event details": "イベントの詳細",
	"Add new event": "新しいイベントを追加",
	"Please enter a property name": "プロパティ名を入力してください",
	"Please add at least one mapping value":
		"少なくとも1つのマッピング値を追加してください",
	"Mapping key must be a number": "マッピングキーは数字である必要があります",
	"Please enter text for all mapping values":
		"すべてのマッピング値にテキストを入力してください",
	"Please add at least one event":
		"少なくとも1つのイベントを追加してください",
	"Event name cannot be empty": "イベント名は空にできません",
	"Add new habit": "新しい習慣を追加",
	"No habits yet": "まだ習慣がありません",
	"Click the button above to add your first habit":
		"上のボタンをクリックして最初の習慣を追加してください",
	"Habit updated": "習慣が更新されました",
	"Habit added": "習慣が追加されました",
	"Delete habit": "習慣を削除",
	"This action cannot be undone.": "このアクションは元に戻せません。",
	"Habit deleted": "習慣が削除されました",
	"You've Earned a Reward!": "報酬を獲得しました！",
	"Your reward:": "あなたの報酬：",
	"Image not found:": "画像が見つかりません：",
	"Claim Reward": "報酬を受け取る",
	Skip: "スキップ",
	Reward: "報酬",
	"View & Index Configuration": "ビュー＆インデックス設定",
	"Enable task genius view will also enable the task genius indexer, which will provide the task genius view results from whole vault.":
		"Task Genius ビューを有効にすると、Task Genius インデクサーも有効になり、保管庫全体から Task Genius ビューの結果が提供されます。",
	"Use daily note path as date": "デイリーノートのパスを日付として使用",
	"If enabled, the daily note path will be used as the date for tasks.":
		"有効にすると、デイリーノートのパスがタスクの日付として使用されます。",
	"Task Genius will use moment.js and also this format to parse the daily note path.":
		"Task Genius はmoment.jsとこの形式を使用してデイリーノートのパスを解析します。",
	"You need to set `yyyy` instead of `YYYY` in the format string. And `dd` instead of `DD`.":
		"形式文字列では `YYYY` の代わりに `yyyy` を、`DD` の代わりに `dd` を設定する必要があります。",
	"Daily note format": "デイリーノート形式",
	"Daily note path": "デイリーノートパス",
	"Select the folder that contains the daily note.":
		"デイリーノートを含むフォルダを選択してください。",
	"Use as date type": "日付タイプとして使用",
	"You can choose due, start, or scheduled as the date type for tasks.":
		"タスクの日付タイプとして、期限、開始、または予定を選択できます。",
	Due: "期限",
	Start: "開始",
	Scheduled: "予定",
	Rewards: "報酬",
	"Configure rewards for completing tasks. Define items, their occurrence chances, and conditions.":
		"タスク完了の報酬を設定します。アイテム、出現確率、条件を定義します。",
	"Enable Rewards": "報酬を有効にする",
	"Toggle to enable or disable the reward system.":
		"報酬システムを有効または無効にするトグル。",
	"Occurrence Levels": "出現レベル",
	"Define different levels of reward rarity and their probability.":
		"報酬のレア度とその確率の異なるレベルを定義します。",
	"Chance must be between 0 and 100.":
		"確率は0から100の間である必要があります。",
	"Level Name (e.g., common)": "レベル名（例：一般）",
	"Chance (%)": "確率（%）",
	"Delete Level": "レベルを削除",
	"Add Occurrence Level": "出現レベルを追加",
	"New Level": "新しいレベル",
	"Reward Items": "報酬アイテム",
	"Manage the specific rewards that can be obtained.":
		"獲得できる特定の報酬を管理します。",
	"No levels defined": "レベルが定義されていません",
	"Reward Name/Text": "報酬名/テキスト",
	"Inventory (-1 for ∞)": "在庫（-1で∞）",
	"Invalid inventory number.": "無効な在庫数です。",
	"Condition (e.g., #tag AND project)": "条件（例：#タグ AND プロジェクト）",
	"Image URL (optional)": "画像URL（任意）",
	"Delete Reward Item": "報酬アイテムを削除",
	"No reward items defined yet.": "報酬アイテムがまだ定義されていません。",
	"Add Reward Item": "報酬アイテムを追加",
	"New Reward": "新しい報酬",
	"Configure habit settings, including adding new habits, editing existing habits, and managing habit completion.":
		"習慣設定を構成します。新しい習慣の追加、既存の習慣の編集、習慣の完了管理を含みます。",
	"Enable habits": "習慣を有効にする",
	"Just started": "開始したばかり",
	"Making progress": "進行中",
	"Half way": "半分完了",
	"Good progress": "順調に進行",
	"Almost there": "もうすぐ完了",
	"archived on": "アーカイブ日",
	moved: "移動済み",
	"moved on": "移動日",
	"Capture your thoughts...": "思考を記録...",
	"Project Workflow": "プロジェクトワークフロー",
	"Standard project management workflow":
		"標準的なプロジェクト管理ワークフロー",
	Planning: "計画",
	Development: "開発",
	Testing: "テスト",
	Cancelled: "キャンセル",
	Habit: "習慣",
	"Drink a cup of good tea": "美味しいお茶を一杯飲む",
	"Watch an episode of a favorite series": "お気に入りのシリーズを一話見る",
	"Play a game": "ゲームをする",
	"Eat a piece of chocolate": "チョコレートを一口食べる",
	common: "一般",
	rare: "レア",
	legendary: "レジェンダリー",
	"No Habits Yet": "習慣がまだありません",
	"Click the open habit button to create a new habit.":
		"習慣を開くボタンをクリックして新しい習慣を作成してください。",
	"Please enter details": "詳細を入力してください",
	"Goal reached": "目標達成",
	"Exceeded goal": "目標超過",
	Active: "アクティブ",
	today: "今日",
	Inactive: "非アクティブ",
	"All Done!": "すべて完了！",
	"Select event...": "イベントを選択...",
	"Create new habit": "新しい習慣を作成",
	"Edit habit": "習慣を編集",
	"Habit type": "習慣タイプ",
	"Daily habit": "日次習慣",
	"Simple daily check-in habit": "シンプルな日次チェックイン習慣",
	"Count habit": "カウント習慣",
	"Record numeric values, e.g., how many cups of water":
		"数値を記録、例：水を何杯飲んだか",
	"Mapping habit": "マッピング習慣",
	"Use different values to map, e.g., emotion tracking":
		"異なる値をマッピング、例：感情追跡",
	"Scheduled habit": "スケジュール習慣",
	"Habit with multiple events": "複数のイベントを持つ習慣",
	"Habit name": "習慣名",
	"Display name of the habit": "習慣の表示名",
	"Optional habit description": "習慣の説明（任意）",
	Icon: "アイコン",
	"Please enter a habit name": "習慣名を入力してください",
	"Property name": "プロパティ名",
	"The property name of the daily note front matter":
		"デイリーノートのフロントマターのプロパティ名",
	"Completion text": "完了テキスト",
	"(Optional) Specific text representing completion, leave blank for any non-empty value to be considered completed":
		"（任意）完了を表す特定のテキスト、空白のままにすると空でない値が完了とみなされます",
	"The property name in daily note front matter to store count values":
		"カウント値を保存するデイリーノートのフロントマターのプロパティ名",
	"Minimum value": "最小値",
	"(Optional) Minimum value for the count": "（任意）カウントの最小値",
	"Maximum value": "最大値",
	"(Optional) Maximum value for the count": "（任意）カウントの最大値",
	Unit: "単位",
	"(Optional) Unit for the count, such as 'cups', 'times', etc.":
		"（任意）カウントの単位、例：「杯」、「回」など",
	"Notice threshold": "通知しきい値",
	"Priority (High to Low)": "優先度（高から低）",
	"Priority (Low to High)": "優先度（低から高）",
	"Due Date (Earliest First)": "期限日（早い順）",
	"Due Date (Latest First)": "期限日（遅い順）",
	"Scheduled Date (Earliest First)": "予定日（早い順）",
	"Scheduled Date (Latest First)": "予定日（遅い順）",
	"Start Date (Earliest First)": "開始日（早い順）",
	"Start Date (Latest First)": "開始日（遅い順）",
	"Created Date": "作成日",
	Overview: "概要",
	Dates: "日付",
	"e.g. #tag1, #tag2": "例：#タグ1, #タグ2",
	"e.g. @home, @work": "例：@家, @職場",
	"Recurrence Rule": "繰り返しルール",
	"e.g. every day, every week": "例：毎日、毎週",
	"Edit Task": "タスクを編集",
	"Save Filter Configuration": "フィルター設定を保存",
	"Filter Configuration Name": "フィルター設定名",
	"Enter a name for this filter configuration":
		"このフィルター設定の名前を入力してください",
	"Filter Configuration Description": "フィルター設定の説明",
	"Enter a description for this filter configuration (optional)":
		"このフィルター設定の説明を入力してください（任意）",
	"Load Filter Configuration": "フィルター設定を読み込み",
	"No saved filter configurations": "保存されたフィルター設定がありません",
	"Select a saved filter configuration":
		"保存されたフィルター設定を選択してください",
	Load: "読み込み",
	Created: "作成済み",
	Updated: "更新済み",
	"Filter Summary": "フィルター概要",
	"filter group": "フィルターグループ",
	filter: "フィルター",
	"Root condition": "ルート条件",
	"Filter configuration name is required": "フィルター設定名は必須です",
	"Failed to save filter configuration": "フィルター設定の保存に失敗しました",
	"Filter configuration saved successfully":
		"フィルター設定が正常に保存されました",
	"Failed to load filter configuration":
		"フィルター設定の読み込みに失敗しました",
	"Filter configuration loaded successfully":
		"フィルター設定が正常に読み込まれました",
	"Failed to delete filter configuration":
		"フィルター設定の削除に失敗しました",
	"Delete Filter Configuration": "フィルター設定を削除",
	"Are you sure you want to delete this filter configuration?":
		"このフィルター設定を削除してもよろしいですか？",
	"Filter configuration deleted successfully":
		"フィルター設定が正常に削除されました",
	Match: "一致",
	All: "すべて",
	"Add filter group": "フィルターグループを追加",
	"Save Current Filter": "現在のフィルターを保存",
	"Load Saved Filter": "保存されたフィルターを読み込み",
	"filter in this group": "このグループのフィルター",
	"Duplicate filter group": "フィルターグループを複製",
	"Remove filter group": "フィルターグループを削除",
	OR: "または",
	"AND NOT": "かつ〜でない",
	AND: "かつ",
	"Remove filter": "フィルターを削除",
	contains: "含む",
	"does not contain": "含まない",
	is: "である",
	"is not": "でない",
	"starts with": "で始まる",
	"ends with": "で終わる",
	"is empty": "空である",
	"is not empty": "空でない",
	"is true": "真である",
	"is false": "偽である",
	"is set": "設定されている",
	"is not set": "設定されていない",
	equals: "等しい",
	NOR: "どちらでもない",
	"Group by": "グループ化",
	"Select which task property to use for creating columns":
		"列を作成するために使用するタスクプロパティを選択してください",
	"Hide empty columns": "空の列を非表示",
	"Hide columns that have no tasks.": "タスクがない列を非表示にします。",
	"Default sort field": "デフォルトソートフィールド",
	"Default field to sort tasks by within each column.":
		"各列内でタスクをソートするデフォルトフィールド。",
	"Default sort order": "デフォルトソート順",
	"Default order to sort tasks within each column.":
		"各列内でタスクをソートするデフォルト順序。",
	"Custom Columns": "カスタム列",
	"Configure custom columns for the selected grouping property":
		"選択したグループ化プロパティのカスタム列を設定",
	"No custom columns defined. Add columns below.":
		"カスタム列が定義されていません。下に列を追加してください。",
	"Column Title": "列タイトル",
	Value: "値",
	"Remove Column": "列を削除",
	"Add Column": "列を追加",
	"New Column": "新しい列",
	"Reset Columns": "列をリセット",
	"Task must have this priority (e.g., 1, 2, 3). You can also use 'none' to filter out tasks without a priority.":
		"タスクはこの優先度を持つ必要があります（例：1、2、3）。優先度のないタスクを除外するために「none」も使用できます。",
	"Task must contain this path (case-insensitive). Separate multiple paths with commas.":
		"タスクはこのパスを含む必要があります（大文字小文字を区別しない）。複数のパスはカンマで区切ってください。",
	"Task must NOT contain this path (case-insensitive). Separate multiple paths with commas.":
		"タスクはこのパスを含んではいけません（大文字小文字を区別しない）。複数のパスはカンマで区切ってください。",
	"You have unsaved changes. Save before closing?":
		"未保存の変更があります。閉じる前に保存しますか？",
	"From now": "今から",
	"Complete workflow": "ワークフローを完了",
	"Move to": "移動先",
	"Move all incomplete subtasks to another file":
		"すべての未完了サブタスクを別のファイルに移動",
	"Move direct incomplete subtasks to another file":
		"直接の未完了サブタスクを別のファイルに移動",
	Filter: "フィルター",
	"Reset Filter": "フィルターをリセット",
	Settings: "設定",
	"Saved Filters": "保存されたフィルター",
	"Manage Saved Filters": "保存されたフィルターを管理",
	Reindex: "再インデックス",
	"Are you sure you want to force reindex all tasks?":
		"すべてのタスクを強制的に再インデックスしてもよろしいですか？",
	"Filter applied: ": "適用されたフィルター：",
	"Enable progress bar in reading mode":
		"読み取りモードでプログレスバーを有効にする",
	"Toggle this to allow this plugin to show progress bars in reading mode.":
		"このプラグインが読み取りモードでプログレスバーを表示できるようにするトグル。",
	Range: "範囲",
	"as a placeholder for the percentage value":
		"パーセンテージ値のプレースホルダーとして",
	"Template text with": "テンプレートテキスト",
	placeholder: "プレースホルダー",
	"Recurrence date calculation": "繰り返し日付計算",
	"Choose how to calculate the next date for recurring tasks":
		"繰り返しタスクの次の日付の計算方法を選択してください",
	"Based on due date": "期限日に基づく",
	"Based on scheduled date": "予定日に基づく",
	"Based on current date": "現在の日付に基づく",
	"Task Gutter": "タスクガター",
	"Configure the task gutter.": "タスクガターを設定します。",
	"Enable task gutter": "タスクガターを有効にする",
	"Toggle this to enable the task gutter.":
		"タスクガターを有効にするトグル。",
	"Incomplete Task Mover": "未完了タスク移動機能",
	"Enable incomplete task mover": "未完了タスク移動機能を有効にする",
	"Toggle this to enable commands for moving incomplete tasks to another file.":
		"未完了タスクを別のファイルに移動するコマンドを有効にするトグル。",
	"Incomplete task marker type": "未完了タスクマーカータイプ",
	"Choose what type of marker to add to moved incomplete tasks":
		"移動した未完了タスクに追加するマーカーのタイプを選択してください",
	"Incomplete version marker text": "未完了バージョンマーカーテキスト",
	"Text to append to incomplete tasks when moved (e.g., 'version 1.0')":
		"移動時に未完了タスクに追加するテキスト（例：'version 1.0'）",
	"Incomplete date marker text": "未完了日付マーカーテキスト",
	"Text to append to incomplete tasks when moved (e.g., 'moved on 2023-12-31')":
		"移動時に未完了タスクに追加するテキスト（例：'moved on 2023-12-31'）",
	"Incomplete custom marker text": "未完了カスタムマーカーテキスト",
	"With current file link for incomplete tasks":
		"未完了タスクに現在のファイルリンクを付ける",
	"A link to the current file will be added to the parent task of the moved incomplete tasks.":
		"移動した未完了タスクの親タスクに現在のファイルへのリンクが追加されます。",
	"Line Number": "行番号",
	"Clear Date": "日付をクリア",
	"Copy view": "ビューをコピー",
	"View copied successfully: ": "ビューのコピーが成功しました：",
	"Copy of ": "コピー ",
	"Copy view: ": "ビューをコピー：",
	"Creating a copy based on: ": "以下に基づいてコピーを作成中：",
	"You can modify all settings below. The original view will remain unchanged.":
		"以下のすべての設定を変更できます。元のビューは変更されません。",
	"Tasks Plugin Detected": "Tasksプラグインが検出されました",
	"Current status management and date management may conflict with the Tasks plugin. Please check the ":
		"現在のステータス管理と日付管理はTasksプラグインと競合する可能性があります。",
	"compatibility documentation": "互換性ドキュメント",
	" for more information.": "を確認してください。",
	"Auto Date Manager": "自動日付管理",
	"Automatically manage dates based on task status changes":
		"タスクステータスの変更に基づいて日付を自動管理",
	"Enable auto date manager": "自動日付管理を有効にする",
	"Toggle this to enable automatic date management when task status changes. Dates will be added/removed based on your preferred metadata format (Tasks emoji format or Dataview format).":
		"タスクステータスが変更されたときの自動日付管理を有効にするトグル。日付は、お好みのメタデータ形式（Tasks絵文字形式またはDataview形式）に基づいて追加/削除されます。",
	"Manage completion dates": "完了日を管理",
	"Automatically add completion dates when tasks are marked as completed, and remove them when changed to other statuses.":
		"タスクが完了としてマークされたときに完了日を自動的に追加し、他のステータスに変更されたときに削除します。",
	"Manage start dates": "開始日を管理",
	"Automatically add start dates when tasks are marked as in progress, and remove them when changed to other statuses.":
		"タスクが進行中としてマークされたときに開始日を自動的に追加し、他のステータスに変更されたときに削除します。",
	"Manage cancelled dates": "キャンセル日を管理",
	"Automatically add cancelled dates when tasks are marked as abandoned, and remove them when changed to other statuses.":
		"タスクが放棄としてマークされたときにキャンセル日を自動的に追加し、他のステータスに変更されたときに削除します。",
	"Copy View": "ビューをコピー",
	Beta: "ベータ",
	"Beta Test Features": "ベータテスト機能",
	"Experimental features that are currently in testing phase. These features may be unstable and could change or be removed in future updates.":
		"現在テスト段階にある実験的機能です。これらの機能は不安定で、将来のアップデートで変更または削除される可能性があります。",
	"Beta Features Warning": "ベータ機能の警告",
	"These features are experimental and may be unstable. They could change significantly or be removed in future updates due to Obsidian API changes or other factors. Please use with caution and provide feedback to help improve these features.":
		"これらの機能は実験的で不安定な可能性があります。Obsidian APIの変更やその他の要因により、将来のアップデートで大幅に変更または削除される可能性があります。注意してご使用いただき、これらの機能の改善にご協力ください。",
	"Base View": "ベースビュー",
	"Advanced view management features that extend the default Task Genius views with additional functionality.":
		"デフォルトのTask Geniusビューを追加機能で拡張する高度なビュー管理機能です。",
	"Enable experimental Base View functionality. This feature provides enhanced view management capabilities but may be affected by future Obsidian API changes. You may need to restart Obsidian to see the changes.":
		"実験的なベースビュー機能を有効にします。この機能は強化されたビュー管理機能を提供しますが、将来のObsidian APIの変更により影響を受ける可能性があります。変更を確認するためにObsidianの再起動が必要な場合があります。",
	"You need to close all bases view if you already create task view in them and remove unused view via edit them manually when disable this feature.":
		"この機能を無効にする際、既にタスクビューを作成している場合は、すべてのベースビューを閉じ、手動で編集して未使用のビューを削除する必要があります。",
	"Enable Base View": "ベースビューを有効にする",
	"Enable experimental Base View functionality. This feature provides enhanced view management capabilities but may be affected by future Obsidian API changes.":
		"実験的なベースビュー機能を有効にします。この機能は強化されたビュー管理機能を提供しますが、将来のObsidian APIの変更により影響を受ける可能性があります。",
	Enable: "有効にする",
	"Beta Feedback": "ベータフィードバック",
	"Help improve these features by providing feedback on your experience.":
		"ご利用体験のフィードバックを提供して、これらの機能の改善にご協力ください。",
	"Report Issues": "問題を報告",
	"If you encounter any issues with beta features, please report them to help improve the plugin.":
		"ベータ機能で問題が発生した場合は、プラグインの改善のために報告してください。",
	"Report Issue": "問題を報告",
	Table: "テーブル",
	"No Priority": "優先度なし",
	"Click to select date": "日付を選択するにはクリック",
	"Enter tags separated by commas": "タグをカンマ区切りで入力",
	"Enter project name": "プロジェクト名を入力",
	"Enter context": "コンテキストを入力",
	"Invalid value": "無効な値",
	"No tasks": "タスクなし",
	"1 task": "1つのタスク",
	Columns: "列",
	"Toggle column visibility": "列の表示を切り替え",
	"Switch to List Mode": "リストモードに切り替え",
	"Switch to Tree Mode": "ツリーモードに切り替え",
	Collapse: "折りたたむ",
	Expand: "展開",
	"Collapse subtasks": "サブタスクを折りたたむ",
	"Expand subtasks": "サブタスクを展開",
	"Click to change status": "ステータスを変更するにはクリック",
	"Click to set priority": "優先度を設定するにはクリック",
	Yesterday: "昨日",
	"Click to edit date": "日付を編集するにはクリック",
	"No tags": "タグなし",
	"Click to open file": "ファイルを開くにはクリック",
	"No tasks found": "タスクが見つかりません",
	"Completed Date": "完了日",
	"Loading...": "読み込み中...",
	"Advanced Filtering": "高度なフィルタリング",
	"Use advanced multi-group filtering with complex conditions":
		"複雑な条件による高度なマルチグループフィルタリングを使用",
	"Auto-moved": "自動移動済み",
	"tasks to": "件のタスクを",
	"Failed to auto-move tasks:": "タスクの自動移動に失敗：",
	"Workflow created successfully": "ワークフローが正常に作成されました",
	"No task structure found at cursor position":
		"カーソル位置にタスク構造が見つかりません",
	"Use similar existing workflow": "類似の既存ワークフローを使用",
	"Create new workflow": "新しいワークフローを作成",
	"No workflows defined. Create a workflow first.":
		"ワークフローが定義されていません。まずワークフローを作成してください。",
	"Workflow task created": "ワークフロータスクが作成されました",
	"Task converted to workflow root":
		"タスクがワークフロールートに変換されました",
	"Failed to convert task": "タスクの変換に失敗しました",
	"No workflows to duplicate": "複製するワークフローがありません",
	Duplicate: "複製",
	"Workflow duplicated and saved": "ワークフローが複製され保存されました",
	"Workflow created from task structure":
		"タスク構造からワークフローが作成されました",
	"Create Quick Workflow": "クイックワークフローを作成",
	"Convert Task to Workflow": "タスクをワークフローに変換",
	"Convert to Workflow Root": "ワークフロールートに変換",
	"Start Workflow Here": "ここからワークフローを開始",
	"Duplicate Workflow": "ワークフローを複製",
	"Simple Linear Workflow": "シンプルな線形ワークフロー",
	"A basic linear workflow with sequential stages":
		"順次ステージを持つ基本的な線形ワークフロー",
	"To Do": "ToDo",
	Done: "完了",
	"Project Management": "プロジェクト管理",
	Coding: "コーディング",
	"Research Process": "研究プロセス",
	"Academic or professional research workflow":
		"学術または専門研究ワークフロー",
	"Literature Review": "文献レビュー",
	"Data Collection": "データ収集",
	Analysis: "分析",
	Writing: "執筆",
	Published: "公開済み",
	"Custom Workflow": "カスタムワークフロー",
	"Create a custom workflow from scratch":
		"ゼロからカスタムワークフローを作成",
	"Quick Workflow Creation": "クイックワークフロー作成",
	"Workflow Template": "ワークフローテンプレート",
	"Choose a template to start with or create a custom workflow":
		"開始するテンプレートを選択するか、カスタムワークフローを作成",
	"Workflow Name": "ワークフロー名",
	"A descriptive name for your workflow": "ワークフローの説明的な名前",
	"Enter workflow name": "ワークフロー名を入力",
	"Unique identifier (auto-generated from name)":
		"一意識別子（名前から自動生成）",
	"Optional description of the workflow purpose":
		"ワークフローの目的の説明（オプション）",
	"Describe your workflow...": "ワークフローを説明してください...",
	"Preview of workflow stages (edit after creation for advanced options)":
		"ワークフローステージのプレビュー（高度なオプションは作成後に編集）",
	"Add Stage": "ステージを追加",
	"No stages defined. Choose a template or add stages manually.":
		"ステージが定義されていません。テンプレートを選択するか、手動でステージを追加してください。",
	"Remove stage": "ステージを削除",
	"Create Workflow": "ワークフローを作成",
	"Please provide a workflow name and ID":
		"ワークフロー名とIDを入力してください",
	"Please add at least one stage to the workflow":
		"ワークフローに少なくとも1つのステージを追加してください",
	Discord: "Discord",
	"Chat with us": "チャットでお話ししましょう",
	"Open Discord": "Discord を開く",
	"Task Genius icons are designed by": "Task Genius アイコンはデザイン：",
	"Task Genius Icons": "Task Genius アイコン",
	"ICS Calendar Integration": "ICS カレンダー統合",
	"Configure external calendar sources to display events in your task views.":
		"タスクビューでイベントを表示するための外部カレンダーソースを設定。",
	"Add New Calendar Source": "新しいカレンダーソースを追加",
	"Global Settings": "グローバル設定",
	"Enable Background Refresh": "バックグラウンド更新を有効化",
	"Automatically refresh calendar sources in the background":
		"バックグラウンドでカレンダーソースを自動的に更新",
	"Global Refresh Interval": "グローバル更新間隔",
	"Default refresh interval for all sources (minutes)":
		"すべてのソースのデフォルト更新間隔（分）",
	"Maximum Cache Age": "最大キャッシュ期間",
	"How long to keep cached data (hours)":
		"キャッシュデータの保存期間（時間）",
	"Network Timeout": "ネットワークタイムアウト",
	"Request timeout in seconds": "リクエストタイムアウト（秒）",
	"Max Events Per Source": "ソースあたりの最大イベント数",
	"Maximum number of events to load from each source":
		"各ソースから読み込む最大イベント数",
	"Default Event Color": "デフォルトイベント色",
	"Default color for events without a specific color":
		"特定の色がないイベントのデフォルト色",
	"Calendar Sources": "カレンダーソース",
	"No calendar sources configured. Add a source to get started.":
		"カレンダーソースが設定されていません。ソースを追加して開始してください。",
	"ICS Enabled": "ICS 有効",
	"ICS Disabled": "ICS 無効",
	URL: "URL",
	Refresh: "更新",
	min: "分",
	Color: "色",
	"Edit this calendar source": "このカレンダーソースを編集",
	Sync: "同期",
	"Sync this calendar source now": "このカレンダーソースを今すぐ同期",
	"Syncing...": "同期中...",
	"Sync completed successfully": "同期が正常に完了しました",
	"Sync failed: ": "同期失敗：",
	Disable: "無効化",
	"Disable this source": "このソースを無効化",
	"Enable this source": "このソースを有効化",
	"Delete this calendar source": "このカレンダーソースを削除",
	"Are you sure you want to delete this calendar source?":
		"このカレンダーソースを削除してもよろしいですか？",
	"Edit ICS Source": "ICS ソースを編集",
	"Add ICS Source": "ICS ソースを追加",
	"ICS Source Name": "ICS ソース名",
	"Display name for this calendar source": "このカレンダーソースの表示名",
	"My Calendar": "マイカレンダー",
	"ICS URL": "ICS URL",
	"URL to the ICS/iCal file": "ICS/iCal ファイルの URL",
	"Whether this source is active": "このソースがアクティブかどうか",
	"Refresh Interval": "更新間隔",
	"How often to refresh this source (minutes)":
		"このソースを更新する頻度（分）",
	"Color for events from this source (optional)":
		"このソースからのイベントの色（オプション）",
	"Show Type": "表示タイプ",
	"How to display events from this source in calendar views":
		"カレンダービューでこのソースからのイベントを表示する方法",
	Event: "イベント",
	Badge: "バッジ",
	"Show All-Day Events": "終日イベントを表示",
	"Include all-day events from this source":
		"このソースからの終日イベントを含める",
	"Show Timed Events": "時間指定イベントを表示",
	"Include timed events from this source":
		"このソースからの時間指定イベントを含める",
	"Authentication (Optional)": "認証（オプション）",
	"Authentication Type": "認証タイプ",
	"Type of authentication required": "必要な認証のタイプ",
	"ICS Auth None": "認証なし",
	"Basic Auth": "ベーシック認証",
	"Bearer Token": "ベアラートークン",
	"Custom Headers": "カスタムヘッダー",
	"Text Replacements": "テキスト置換",
	"Configure rules to modify event text using regular expressions":
		"正規表現を使用してイベントテキストを変更するルールを設定",
	"No text replacement rules configured":
		"テキスト置換ルールが設定されていません",
	Enabled: "有効",
	Disabled: "無効",
	Target: "対象",
	Pattern: "パターン",
	Replacement: "置換",
	"Are you sure you want to delete this text replacement rule?":
		"このテキスト置換ルールを削除してもよろしいですか？",
	"Add Text Replacement Rule": "テキスト置換ルールを追加",
	"ICS Username": "ICS ユーザー名",
	"ICS Password": "ICS パスワード",
	"ICS Bearer Token": "ICS ベアラートークン",
	"JSON object with custom headers": "カスタムヘッダーを含むJSONオブジェクト",
	"Holiday Configuration": "祝日設定",
	"Configure how holiday events are detected and displayed":
		"祝日イベントの検出と表示方法を設定",
	"Enable Holiday Detection": "祝日検出を有効化",
	"Automatically detect and group holiday events":
		"祝日イベントを自動検出してグループ化",
	"Status Mapping": "ステータスマッピング",
	"Configure how ICS events are mapped to task statuses":
		"ICSイベントをタスクステータスにマッピングする方法を設定",
	"Enable Status Mapping": "ステータスマッピングを有効化",
	"Automatically map ICS events to specific task statuses":
		"ICSイベントを特定のタスクステータスに自動マッピング",
	"Grouping Strategy": "グループ化戦略",
	"How to handle consecutive holiday events":
		"連続する祝日イベントの処理方法",
	"Show All Events": "すべてのイベントを表示",
	"Show First Day Only": "最初の日のみ表示",
	"Show Summary": "サマリーを表示",
	"Show First and Last": "最初と最後を表示",
	"Maximum Gap Days": "最大間隔日数",
	"Maximum days between events to consider them consecutive":
		"イベントを連続とみなすための最大間隔日数",
	"Show in Forecast": "予測で表示",
	"Whether to show holiday events in forecast view":
		"予測ビューで祝日イベントを表示するかどうか",
	"Show in Calendar": "カレンダーで表示",
	"Whether to show holiday events in calendar view":
		"カレンダービューで祝日イベントを表示するかどうか",
	"Detection Patterns": "検出パターン",
	"Summary Patterns": "サマリーパターン",
	"Regex patterns to match in event titles (one per line)":
		"イベントタイトルとマッチする正規表現パターン（一行に一つ）",
	Keywords: "キーワード",
	"Keywords to detect in event text (one per line)":
		"イベントテキストで検出するキーワード（一行に一つ）",
	Categories: "カテゴリー",
	"Event categories that indicate holidays (one per line)":
		"祝日を示すイベントカテゴリー（一行に一つ）",
	"Group Display Format": "グループ表示形式",
	"Format for grouped holiday display. Use {title}, {count}, {startDate}, {endDate}":
		"グループ化された祝日表示の形式。{title}, {count}, {startDate}, {endDate}を使用",
	"Override ICS Status": "ICSステータスを上書き",
	"Override original ICS event status with mapped status":
		"元のICSイベントステータスをマッピングされたステータスで上書き",
	"Timing Rules": "タイミングルール",
	"Past Events Status": "過去のイベントステータス",
	"Status for events that have already ended":
		"すでに終了したイベントのステータス",
	"Status Incomplete": "未完了ステータス",
	"Status Complete": "完了ステータス",
	"Status Cancelled": "キャンセルステータス",
	"Status In Progress": "進行中ステータス",
	"Status Question": "問い合わせステータス",
	"Current Events Status": "現在のイベントステータス",
	"Status for events happening today": "今日発生するイベントのステータス",
	"Future Events Status": "将来のイベントステータス",
	"Status for events in the future": "将来のイベントのステータス",
	"Property Rules": "プロパティルール",
	"Optional rules based on event properties (higher priority than timing rules)":
		"イベントプロパティに基づくオプションルール（タイミングルールより高優先度）",
	"Holiday Status": "祝日ステータス",
	"Status for events detected as holidays":
		"祝日として検出されたイベントのステータス",
	"Use timing rules": "タイミングルールを使用",
	"Category Mapping": "カテゴリーマッピング",
	"Map specific categories to statuses (format: category:status, one per line)":
		"特定のカテゴリーをステータスにマッピング（形式：category:status、一行に一つ）",
	"Please enter a name for the source": "ソースの名前を入力してください",
	"Please enter a URL for the source": "ソースのURLを入力してください",
	"Please enter a valid URL": "有効なURLを入力してください",
	"Edit Text Replacement Rule": "テキスト置換ルールを編集",
	"Rule Name": "ルール名",
	"Descriptive name for this replacement rule":
		"この置換ルールの説明的な名前",
	"Remove Meeting Prefix": "会議プレフィックスを削除",
	"Whether this rule is active": "このルールがアクティブかどうか",
	"Target Field": "対象フィールド",
	"Which field to apply the replacement to": "置換を適用するフィールド",
	"Summary/Title": "サマリー/タイトル",
	Location: "場所",
	"All Fields": "すべてのフィールド",
	"Pattern (Regular Expression)": "パターン（正規表現）",
	"Regular expression pattern to match. Use parentheses for capture groups.":
		"マッチする正規表現パターン。キャプチャグループには括弧を使用してください。",
	"Text to replace matches with. Use $1, $2, etc. for capture groups.":
		"マッチしたテキストを置換するテキスト。キャプチャグループには$1、$2などを使用してください。",
	"Regex Flags": "正規表現フラグ",
	"Regular expression flags (e.g., 'g' for global, 'i' for case-insensitive)":
		"正規表現フラグ（例：グローバルの場合は'g'、大文字小文字の区別なしの場合は'i'）",
	Examples: "例",
	"Remove prefix": "プレフィックスを削除",
	"Replace room numbers": "部屋番号を置換",
	"Swap words": "単語を入れ替え",
	"Test Rule": "ルールをテスト",
	"Output: ": "出力：",
	"Test Input": "テスト入力",
	"Enter text to test the replacement rule":
		"置換ルールをテストするテキストを入力",
	"Please enter a name for the rule": "ルールの名前を入力してください",
	"Please enter a pattern": "パターンを入力してください",
	"Invalid regular expression pattern": "無効な正規表現パターン",
	"Enhanced Project Configuration": "拡張プロジェクト設定",
	"Configure advanced project detection and management features":
		"高度なプロジェクト検出と管理機能を設定",
	"Enable enhanced project features": "拡張プロジェクト機能を有効化",
	"Enable path-based, metadata-based, and config file-based project detection":
		"パスベース、メタデータベース、設定ファイルベースのプロジェクト検出を有効化",
	"Path-based Project Mappings": "パスベースプロジェクトマッピング",
	"Configure project names based on file paths":
		"ファイルパスに基づいたプロジェクト名を設定",
	"No path mappings configured yet.":
		"パスマッピングはまだ設定されていません。",
	Mapping: "マッピング",
	"Path pattern (e.g., Projects/Work)": "パスパターン（例：Projects/Work）",
	"Add Path Mapping": "パスマッピングを追加",
	"Metadata-based Project Configuration": "メタデータベースプロジェクト設定",
	"Configure project detection from file frontmatter":
		"ファイルフロントマターからのプロジェクト検出を設定",
	"Enable metadata project detection": "メタデータプロジェクト検出を有効化",
	"Detect project from file frontmatter metadata":
		"ファイルフロントマターメタデータからプロジェクトを検出",
	"Metadata key": "メタデータキー",
	"The frontmatter key to use for project name":
		"プロジェクト名に使用するフロントマターキー",
	"Inherit other metadata fields from file frontmatter":
		"ファイルフロントマターから他のメタデータフィールドを継承",
	"Allow subtasks to inherit metadata from file frontmatter. When disabled, only top-level tasks inherit file metadata.":
		"サブタスクがファイルフロントマターからメタデータを継承することを許可。無効にすると、トップレベルタスクのみがファイルメタデータを継承します。",
	"Project Configuration File": "プロジェクト設定ファイル",
	"Configure project detection from project config files":
		"プロジェクト設定ファイルからのプロジェクト検出を設定",
	"Enable config file project detection":
		"設定ファイルプロジェクト検出を有効化",
	"Detect project from project configuration files":
		"プロジェクト設定ファイルからプロジェクトを検出",
	"Config file name": "設定ファイル名",
	"Name of the project configuration file": "プロジェクト設定ファイルの名前",
	"Search recursively": "再帰的に検索",
	"Search for config files in parent directories":
		"親ディレクトリで設定ファイルを検索",
	"Metadata Mappings": "メタデータマッピング",
	"Configure how metadata fields are mapped and transformed":
		"メタデータフィールドのマッピングと変換方法を設定",
	"No metadata mappings configured yet.":
		"メタデータマッピングはまだ設定されていません。",
	"Source key (e.g., proj)": "ソースキー（例：proj）",
	"Select target field": "対象フィールドを選択",
	"Add Metadata Mapping": "メタデータマッピングを追加",
	"Default Project Naming": "デフォルトプロジェクト命名",
	"Configure fallback project naming when no explicit project is found":
		"明示的なプロジェクトが見つからない場合のフォールバックプロジェクト命名を設定",
	"Enable default project naming": "デフォルトプロジェクト命名を有効化",
	"Use default naming strategy when no project is explicitly defined":
		"プロジェクトが明示的に定義されていない場合にデフォルト命名戦略を使用",
	"Naming strategy": "命名戦略",
	"Strategy for generating default project names":
		"デフォルトプロジェクト名を生成する戦略",
	"Use filename": "ファイル名を使用",
	"Use folder name": "フォルダー名を使用",
	"Use metadata field": "メタデータフィールドを使用",
	"Metadata field to use as project name":
		"プロジェクト名として使用するメタデータフィールド",
	"Enter metadata key (e.g., project-name)":
		"メタデータキーを入力（例：project-name）",
	"Strip file extension": "ファイル拡張子を削除",
	"Remove file extension from filename when using as project name":
		"プロジェクト名として使用する際にファイル名からファイル拡張子を削除",
	"Target type": "対象タイプ",
	"Choose whether to capture to a fixed file or daily note":
		"固定ファイルまたは日報ノートのどちらにキャプチャするか選択",
	"Fixed file": "固定ファイル",
	"Daily note": "日報ノート",
	"The file where captured text will be saved. You can include a path, e.g., 'folder/Quick Capture.md'. Supports date templates like {{DATE:YYYY-MM-DD}} or {{date:YYYY-MM-DD-HHmm}}":
		"キャプチャしたテキストが保存されるファイル。パスを含めることができます。例：'folder/Quick Capture.md'。{{DATE:YYYY-MM-DD}}や{{date:YYYY-MM-DD-HHmm}}などの日付テンプレートに対応",
	"Sync with Daily Notes plugin": "Daily Notesプラグインと同期",
	"Automatically sync settings from the Daily Notes plugin":
		"Daily Notesプラグインから設定を自動同期",
	"Sync now": "今すぐ同期",
	"Daily notes settings synced successfully":
		"日報ノート設定の同期が成功しました",
	"Daily Notes plugin is not enabled":
		"Daily Notesプラグインが有効化されていません",
	"Failed to sync daily notes settings": "日報ノート設定の同期に失敗しました",
	"Date format for daily notes (e.g., YYYY-MM-DD)":
		"日報ノートの日付形式（例：YYYY-MM-DD）",
	"Daily note folder": "日報ノートフォルダー",
	"Folder path for daily notes (leave empty for root)":
		"日報ノートのフォルダーパス（ルートの場合は空白）",
	"Daily note template": "日報ノートテンプレート",
	"Template file path for new daily notes (optional)":
		"新しい日報ノートのテンプレートファイルパス（オプション）",
	"Target heading": "対象見出し",
	"Optional heading to append content under (leave empty to append to file)":
		"コンテンツを追加する見出し（オプション、空白の場合はファイルに追加）",
	"How to add captured content to the target location":
		"キャプチャしたコンテンツを対象位置に追加する方法",
	Append: "追加",
	Prepend: "先頭に追加",
	Replace: "置換",
	"Enable auto-move for completed tasks": "完了タスクの自動移動を有効化",
	"Automatically move completed tasks to a default file without manual selection.":
		"手動選択なしで完了タスクをデフォルトファイルに自動移動。",
	"Default target file": "デフォルト対象ファイル",
	"Default file to move completed tasks to (e.g., 'Archive.md')":
		"完了タスクを移動するデフォルトファイル（例：'Archive.md'）",
	"Default insertion mode": "デフォルト挿入モード",
	"Where to insert completed tasks in the target file":
		"対象ファイルで完了タスクを挿入する場所",
	"Default heading name": "デフォルト見出し名",
	"Heading name to insert tasks after (will be created if it doesn't exist)":
		"タスクを挿入する見出し名（存在しない場合は作成されます）",
	"Enable auto-move for incomplete tasks": "未完了タスクの自動移動を有効化",
	"Automatically move incomplete tasks to a default file without manual selection.":
		"手動選択なしで未完了タスクをデフォルトファイルに自動移動。",
	"Default target file for incomplete tasks":
		"未完了タスクのデフォルト対象ファイル",
	"Default file to move incomplete tasks to (e.g., 'Backlog.md')":
		"未完了タスクを移動するデフォルトファイル（例：'Backlog.md'）",
	"Default insertion mode for incomplete tasks":
		"未完了タスクのデフォルト挿入モード",
	"Where to insert incomplete tasks in the target file":
		"対象ファイルで未完了タスクを挿入する場所",
	"Default heading name for incomplete tasks":
		"未完了タスクのデフォルト見出し名",
	"Heading name to insert incomplete tasks after (will be created if it doesn't exist)":
		"未完了タスクを挿入する見出し名（存在しない場合は作成されます）",
	"Other settings": "その他の設定",
	"Use Task Genius icons": "Task Geniusアイコンを使用",
	"Use Task Genius icons for task statuses":
		"タスクステータスにTask Geniusアイコンを使用",
	"Timeline Sidebar": "タイムラインサイドバー",
	"Enable Timeline Sidebar": "タイムラインサイドバーを有効化",
	"Toggle this to enable the timeline sidebar view for quick access to your daily events and tasks.":
		"日常のイベントやタスクに素早くアクセスできるタイムラインサイドバービューを有効にするにはこれを切り替えてください。",
	"Auto-open on startup": "起動時に自動オープン",
	"Automatically open the timeline sidebar when Obsidian starts.":
		"Obsidian起動時にタイムラインサイドバーを自動で開く。",
	"Show completed tasks": "完了タスクを表示",
	"Include completed tasks in the timeline view. When disabled, only incomplete tasks will be shown.":
		"タイムラインビューに完了タスクを含める。無効にすると、未完了タスクのみが表示されます。",
	"Focus mode by default": "デフォルトでフォーカスモード",
	"Enable focus mode by default, which highlights today's events and dims past/future events.":
		"デフォルトでフォーカスモードを有効にし、今日のイベントをハイライトし、過去/将来のイベントを暗くします。",
	"Maximum events to show": "表示する最大イベント数",
	"Maximum number of events to display in the timeline. Higher numbers may affect performance.":
		"タイムラインに表示するイベントの最大数。数が大きいとパフォーマンスに影響する可能性があります。",
	"Open Timeline Sidebar": "タイムラインサイドバーを開く",
	"Click to open the timeline sidebar view.":
		"クリックしてタイムラインサイドバービューを開く。",
	"Open Timeline": "タイムラインを開く",
	"Timeline sidebar opened": "タイムラインサイドバーが開かれました",
	"Task Parser Configuration": "タスクパーサー設定",
	"Configure how task metadata is parsed and recognized.":
		"タスクメタデータの解析と認識方法を設定。",
	"Project tag prefix": "プロジェクトタグプレフィックス",
	"Customize the prefix used for project tags in dataview format (e.g., 'project' for [project:: myproject]). Changes require reindexing.":
		"dataview形式のプロジェクトタグに使用するプレフィックスをカスタマイズ（例：[project:: myproject]の'project'）。変更には再インデックスが必要です。",
	"Customize the prefix used for project tags (e.g., 'project' for #project/myproject). Changes require reindexing.":
		"プロジェクトタグに使用するプレフィックスをカスタマイズ（例：#project/myprojectの'project'）。変更には再インデックスが必要です。",
	"Context tag prefix": "コンテキストタグプレフィックス",
	"Customize the prefix used for context tags in dataview format (e.g., 'context' for [context:: home]). Changes require reindexing.":
		"dataview形式のコンテキストタグに使用するプレフィックスをカスタマイズ（例：[context:: home]の'context'）。変更には再インデックスが必要です。",
	"Customize the prefix used for context tags (e.g., '@home' for @home). Changes require reindexing.":
		"コンテキストタグに使用するプレフィックスをカスタマイズ（例：@homeの'@home'）。変更には再インデックスが必要です。",
	"Area tag prefix": "エリアタグプレフィックス",
	"Customize the prefix used for area tags in dataview format (e.g., 'area' for [area:: work]). Changes require reindexing.":
		"dataview形式のエリアタグに使用するプレフィックスをカスタマイズ（例：[area:: work]の'area'）。変更には再インデックスが必要です。",
	"Customize the prefix used for area tags (e.g., 'area' for #area/work). Changes require reindexing.":
		"エリアタグに使用するプレフィックスをカスタマイズ（例：#area/workの'area'）。変更には再インデックスが必要です。",
	"Format Examples:": "形式の例：",
	Area: "エリア",
	"always uses @ prefix": "常に@プレフィックスを使用",
	"File Parsing Configuration": "ファイル解析設定",
	"Configure how to extract tasks from file metadata and tags.":
		"ファイルメタデータとタグからタスクを抽出する方法を設定。",
	"Enable file metadata parsing": "ファイルメタデータ解析を有効化",
	"Parse tasks from file frontmatter metadata fields. When enabled, files with specific metadata fields will be treated as tasks.":
		"ファイルフロントマターメタデータフィールドからタスクを解析。有効にすると、特定のメタデータフィールドを持つファイルがタスクとして扱われます。",
	"File metadata parsing enabled. Rebuilding task index...":
		"ファイルメタデータ解析が有効化されました。タスクインデックスを再構築中...",
	"Task index rebuilt successfully":
		"タスクインデックスの再構築が成功しました",
	"Failed to rebuild task index": "タスクインデックスの再構築に失敗しました",
	"Metadata fields to parse as tasks":
		"タスクとして解析するメタデータフィールド",
	"Comma-separated list of metadata fields that should be treated as tasks (e.g., dueDate, todo, complete, task)":
		"タスクとして扱われるべきメタデータフィールドのカンマ区切りリスト（例：dueDate, todo, complete, task）",
	"Task content from metadata": "メタデータからのタスクコンテンツ",
	"Which metadata field to use as task content. If not found, will use filename.":
		"タスクコンテンツとして使用するメタデータフィールド。見つからない場合はファイル名を使用します。",
	"Default task status": "デフォルトタスクステータス",
	"Default status for tasks created from metadata (space for incomplete, x for complete)":
		"メタデータから作成されたタスクのデフォルトステータス（未完了はスペース、完了はx）",
	"Enable tag-based task parsing": "タグベースタスク解析を有効化",
	"Parse tasks from file tags. When enabled, files with specific tags will be treated as tasks.":
		"ファイルタグからタスクを解析。有効にすると、特定のタグを持つファイルがタスクとして扱われます。",
	"Tags to parse as tasks": "タスクとして解析するタグ",
	"Comma-separated list of tags that should be treated as tasks (e.g., #todo, #task, #action, #due)":
		"タスクとして扱われるべきタグのカンマ区切りリスト（例：#todo, #task, #action, #due）",
	"Enable worker processing": "ワーカー処理を有効化",
	"Use background worker for file parsing to improve performance. Recommended for large vaults.":
		"パフォーマンス向上のためにファイル解析にバックグラウンドワーカーを使用。大きなヴォルトに推奨。",
	"Enable inline editor": "インラインエディターを有効化",
	"Enable inline editing of task content and metadata directly in task views. When disabled, tasks can only be edited in the source file.":
		"タスクビューでタスクコンテンツとメタデータのインライン編集を有効化。無効にすると、タスクはソースファイルでのみ編集できます。",
	"Auto-assigned from path": "パスから自動割り当て",
	"Auto-assigned from file metadata": "ファイルメタデータから自動割り当て",
	"Auto-assigned from config file": "設定ファイルから自動割り当て",
	"Auto-assigned": "自動割り当て",
	"This project is automatically assigned and cannot be changed":
		"このプロジェクトは自動的に割り当てられており、変更できません",
	"You can override the auto-assigned project by entering a different value":
		"異なる値を入力することで自動割り当てプロジェクトを上書きできます",
	"Auto from path": "パスから自動",
	"Auto from metadata": "メタデータから自動",
	"Auto from config": "設定から自動",
	"You can override the auto-assigned project":
		"自動割り当てプロジェクトを上書きできます",
	Timeline: "タイムライン",
	"Go to today": "今日に移動",
	"Focus on today": "今日にフォーカス",
	"What do you want to do today?": "今日は何をしますか？",
	"More options": "その他のオプション",
	"No events to display": "表示するイベントがありません",
	"Go to task": "タスクに移動",
	to: "から",
	"Hide weekends": "週末を非表示",
	"Hide weekend columns (Saturday and Sunday) in calendar views.":
		"カレンダービューで週末の列（土曜日と日曜日）を非表示。",
	"Hide weekend columns (Saturday and Sunday) in forecast calendar.":
		"予測カレンダーで週末の列（土曜日と日曜日）を非表示。",
	Repeatable: "繰り返し可能",
	Final: "最終",
	Sequential: "順次",
	"Current: ": "現在：",
	completed: "完了",
	"Convert to workflow template": "ワークフローテンプレートに変換",
	"Start workflow here": "ここからワークフローを開始",
	"Create quick workflow": "クイックワークフローを作成",
	"Workflow not found": "ワークフローが見つかりません",
	"Stage not found": "ステージが見つかりません",
	"Current stage": "現在のステージ",
	Type: "タイプ",
	Next: "次へ",
	"Start workflow": "ワークフローを開始",
	Continue: "続行",
	"Complete substage and move to": "サブステージを完了して移動",
	"Add new task": "新しいタスクを追加",
	"Add new sub-task": "新しいサブタスクを追加",
	"Auto-move completed subtasks to default file":
		"完了したサブタスクをデフォルトファイルに自動移動",
	"Auto-move direct completed subtasks to default file":
		"直接の完了したサブタスクをデフォルトファイルに自動移動",
	"Auto-move all subtasks to default file":
		"すべてのサブタスクをデフォルトファイルに自動移動",
	"Auto-move incomplete subtasks to default file":
		"未完了のサブタスクをデフォルトファイルに自動移動",
	"Auto-move direct incomplete subtasks to default file":
		"直接の未完了サブタスクをデフォルトファイルに自動移動",
	"Convert task to workflow template":
		"タスクをワークフローテンプレートに変換",
	"Convert current task to workflow root":
		"現在のタスクをワークフロールートに変換",
	"Duplicate workflow": "ワークフローを複製",
	"Workflow quick actions": "ワークフロークイックアクション",
	"Views & Index": "ビューとインデックス",
	"Progress Display": "進捗表示",
	Workflows: "ワークフロー",
	"Dates & Priority": "日付と優先度",
	Habits: "習慣",
	"Calendar Sync": "カレンダー同期",
	"Beta Features": "ベータ機能",
	"Core Settings": "基本設定",
	"Display & Progress": "表示と進捗",
	"Task Management": "タスク管理",
	"Workflow & Automation": "ワークフローと自動化",
	Gamification: "ゲーミフィケーション",
	Integration: "統合",
	Advanced: "高度",
	Information: "情報",
	"Workflow generated from task structure":
		"タスク構造から生成されたワークフロー",
	"Workflow based on existing pattern": "既存パターンに基づくワークフロー",
	Matrix: "マトリックス",
	"More actions": "その他のアクション",
	"Open in file": "ファイルで開く",
	"Copy task": "タスクをコピー",
	"Mark as urgent": "緊急としてマーク",
	"Mark as important": "重要としてマーク",
	"Overdue by {days} days": "{days}日遅れ",
	"Due today": "今日期限",
	"Due tomorrow": "明日期限",
	"Due in {days} days": "{days}日後期限",
	"Loading tasks...": "タスクを読み込み中...",
	task: "タスク",
	"No crisis tasks - great job!": "緊急タスクなし - 素晴らしい！",
	"No planning tasks - consider adding some goals":
		"計画タスクなし - いくつかの目標の追加を検討してください",
	"No interruptions - focus time!": "中断なし - 集中タイム！",
	"No time wasters - excellent focus!": "時間の無駄なし - 素晴らしい集中力！",
	"No tasks in this quadrant": "この象限にタスクがありません",
	"Handle immediately. These are critical tasks that need your attention now.":
		"即座に対処してください。これらは今すぐあなたの注意が必要な重要なタスクです。",
	"Schedule and plan. These tasks are key to your long-term success.":
		"スケジュールと計画。これらのタスクは長期的な成功の鍵です。",
	"Delegate if possible. These tasks are urgent but don't require your specific skills.":
		"可能であれば委任してください。これらのタスクは緊急ですが、あなたの特定のスキルを必要としません。",
	"Eliminate or minimize. These tasks may be time wasters.":
		"排除または最小化してください。これらのタスクは時間の無駄かもしれません。",
	"Review and categorize these tasks appropriately.":
		"これらのタスクを適切に確認して分類してください。",
	"Urgent & Important": "緊急かつ重要",
	"Do First - Crisis & emergencies": "最優先 - 危機と緊急事態",
	"Not Urgent & Important": "緊急ではないが重要",
	"Schedule - Planning & development": "スケジュール - 計画と開発",
	"Urgent & Not Important": "緊急だが重要ではない",
	"Delegate - Interruptions & distractions": "委任 - 中断と気晴らし",
	"Not Urgent & Not Important": "緊急でも重要でもない",
	"Eliminate - Time wasters": "削除 - 時間の無駄",
	"Task Priority Matrix": "タスク優先度マトリックス",
	"Created Date (Newest First)": "作成日（新しい順）",
	"Created Date (Oldest First)": "作成日（古い順）",
	"Toggle empty columns": "空の列を切り替え",
	"Failed to update task": "タスクの更新に失敗しました",
	"Remove urgent tag": "緊急タグを削除",
	"Remove important tag": "重要タグを削除",
	"Loading more tasks...": "さらにタスクを読み込み中...",
	"Action Type": "アクションタイプ",
	"Select action type...": "アクションタイプを選択...",
	"Delete task": "タスクを削除",
	"Keep task": "タスクを保持",
	"Complete related tasks": "関連タスクを完了",
	"Move task": "タスクを移動",
	"Archive task": "タスクをアーカイブ",
	"Duplicate task": "タスクを複製",
	"Task IDs": "タスクID",
	"Enter task IDs separated by commas": "カンマ区切りでタスクIDを入力",
	"Comma-separated list of task IDs to complete when this task is completed":
		"このタスクが完了したときに完了するタスクIDのカンマ区切りリスト",
	"Target File": "対象ファイル",
	"Path to target file": "対象ファイルのパス",
	"Target Section (Optional)": "対象セクション（オプション）",
	"Section name in target file": "対象ファイル内のセクション名",
	"Archive File (Optional)": "アーカイブファイル（オプション）",
	"Default: Archive/Completed Tasks.md":
		"デフォルト: Archive/Completed Tasks.md",
	"Archive Section (Optional)": "アーカイブセクション（オプション）",
	"Default: Completed Tasks": "デフォルト: 完了済みタスク",
	"Target File (Optional)": "対象ファイル（オプション）",
	"Default: same file": "デフォルト: 同じファイル",
	"Preserve Metadata": "メタデータを保持",
	"Keep completion dates and other metadata in the duplicated task":
		"複製されたタスクに完了日とその他のメタデータを保持",
	"Overdue by": "期限を過ぎている",
	days: "日",
	"Due in": "期限まで",
	"File Filter": "ファイルフィルター",
	"Enable File Filter": "ファイルフィルターを有効化",
	"Toggle this to enable file and folder filtering during task indexing. This can significantly improve performance for large vaults.":
		"タスクインデックス作成中のファイルとフォルダーのフィルタリングを有効にするにはこれを切り替えてください。これにより大きな保庫のパフォーマンスが大幅に向上します。",
	"File Filter Mode": "ファイルフィルターモード",
	"Choose whether to include only specified files/folders (whitelist) or exclude them (blacklist)":
		"指定したファイル/フォルダーのみを含める（ホワイトリスト）か、それらを除外する（ブラックリスト）かを選択",
	"Whitelist (Include only)": "ホワイトリスト（含めるのみ）",
	"Blacklist (Exclude)": "ブラックリスト（除外）",
	"File Filter Rules": "ファイルフィルタールール",
	"Configure which files and folders to include or exclude from task indexing":
		"タスクインデックスから含めるまたは除外するファイルとフォルダーを設定",
	"Type:": "タイプ:",
	Folder: "フォルダー",
	"Path:": "パス:",
	"Enabled:": "有効:",
	"Delete rule": "ルールを削除",
	"Add Filter Rule": "フィルタールールを追加",
	"Add File Rule": "ファイルルールを追加",
	"Add Folder Rule": "フォルダールールを追加",
	"Add Pattern Rule": "パターンルールを追加",
	"Refresh Statistics": "統計を更新",
	"Manually refresh filter statistics to see current data":
		"現在のデータを見るためにフィルター統計を手動で更新",
	"Refreshing...": "更新中...",
	"Active Rules": "アクティブルール",
	"Cache Size": "キャッシュサイズ",
	"No filter data available": "フィルターデータがありません",
	"Error loading statistics": "統計の読み込みエラー",
	"On Completion": "完了時",
	"Enable OnCompletion": "完了時動作を有効化",
	"Enable automatic actions when tasks are completed":
		"タスクが完了したときの自動アクションを有効化",
	"Default Archive File": "デフォルトアーカイブファイル",
	"Default file for archive action":
		"アーカイブアクションのデフォルトファイル",
	"Default Archive Section": "デフォルトアーカイブセクション",
	"Default section for archive action":
		"アーカイブアクションのデフォルトセクション",
	"Show Advanced Options": "高度なオプションを表示",
	"Show advanced configuration options in task editors":
		"タスクエディターで高度な設定オプションを表示",
	"Configure checkbox status settings":
		"チェックボックスステータス設定を構成",
	"Auto complete parent checkbox": "親チェックボックスを自動完了",
	"Toggle this to allow this plugin to auto complete parent checkbox when all child tasks are completed.":
		"すべての子タスクが完了したときに親チェックボックスを自動完了させるにはこれを切り替えてください。",
	"When some but not all child tasks are completed, mark the parent checkbox as 'In Progress'. Only works when 'Auto complete parent' is enabled.":
		"一部の子タスクが完了しているがすべてではない場合、親チェックボックスを「進行中」としてマークします。「親を自動完了」が有効な場合のみ機能します。",
	"Select a predefined checkbox status collection or customize your own":
		"事前定義されたチェックボックスステータスコレクションを選択するか、独自にカスタマイズしてください",
	"Checkbox Switcher": "チェックボックススイッチャー",
	"Enable checkbox status switcher":
		"チェックボックスステータススイッチャーを有効化",
	"Replace default checkboxes with styled text marks that follow your checkbox status cycle when clicked.":
		"デフォルトのチェックボックスを、クリック時にチェックボックスステータスサイクルに従うスタイル付きテキストマークに置き換えます。",
	"Make the text mark in source mode follow the checkbox status cycle when clicked.":
		"ソースモードのテキストマークをクリック時にチェックボックスステータスサイクルに従わせます。",
	"Automatically manage dates based on checkbox status changes":
		"チェックボックスステータスの変更に基づいて日付を自動管理",
	"Toggle this to enable automatic date management when checkbox status changes. Dates will be added/removed based on your preferred metadata format (Tasks emoji format or Dataview format).":
		"チェックボックスステータスが変更されたときの自動日付管理を有効にするにはこれを切り替えてください。日付はお好みのメタデータ形式（Tasks絵文字形式またはDataview形式）に基づいて追加/削除されます。",
	"Default view mode": "デフォルトビューモード",
	"Choose the default display mode for all views. This affects how tasks are displayed when you first open a view or create a new view.":
		"すべてのビューのデフォルト表示モードを選択してください。これはビューを初めて開いたり新しいビューを作成したりするときのタスクの表示方法に影響します。",
	"List View": "リストビュー",
	"Tree View": "ツリービュー",
	"Global Filter Configuration": "グローバルフィルター設定",
	"Configure global filter rules that apply to all Views by default. Individual Views can override these settings.":
		"デフォルトですべてのビューに適用されるグローバルフィルタールールを設定します。個別のビューでこれらの設定を上書きできます。",
	"Cancelled Date": "キャンセル日",
	"Configuration is valid": "設定が有効です",
	"Action to execute on completion": "完了時に実行するアクション",
	"Depends On": "依存",
	"Task IDs separated by commas": "カンマ区切りのタスクID",
	"Task ID": "タスクID",
	"Unique task identifier": "一意のタスク識別子",
	"Action to execute when task is completed":
		"タスクが完了したときに実行するアクション",
	"Comma-separated list of task IDs this task depends on":
		"このタスクが依存するタスクIDのカンマ区切りリスト",
	"Unique identifier for this task": "このタスクの一意識別子",
	"Quadrant Classification Method": "象限分類方法",
	"Choose how to classify tasks into quadrants":
		"タスクを象限に分類する方法を選択",
	"Urgent Priority Threshold": "緊急優先度闾値",
	"Tasks with priority >= this value are considered urgent (1-5)":
		"優先度 >= この値のタスクは緊急とみなされます（1-5）",
	"Important Priority Threshold": "重要優先度闾値",
	"Tasks with priority >= this value are considered important (1-5)":
		"優先度 >= この値のタスクは重要とみなされます（1-5）",
	"Urgent Tag": "緊急タグ",
	"Tag to identify urgent tasks (e.g., #urgent, #fire)":
		"緊急タスクを識別するタグ（例：#urgent、#fire）",
	"Important Tag": "重要タグ",
	"Tag to identify important tasks (e.g., #important, #key)":
		"重要タスクを識別するタグ（例：#important、#key）",
	"Urgent Threshold Days": "緊急闾値日数",
	"Tasks due within this many days are considered urgent":
		"この日数以内に期限のタスクは緊急とみなされます",
	"Auto Update Priority": "優先度自動更新",
	"Automatically update task priority when moved between quadrants":
		"象限間で移動したときにタスク優先度を自動更新",
	"Auto Update Tags": "タグ自動更新",
	"Automatically add/remove urgent/important tags when moved between quadrants":
		"象限間で移動したときに緊急/重要タグを自動追加/削除",
	"Hide Empty Quadrants": "空の象限を非表示",
	"Hide quadrants that have no tasks": "タスクがない象限を非表示にする",
	"Configure On Completion Action": "完了時アクションを設定",
	"URL to the ICS/iCal file (supports http://, https://, and webcal:// protocols)":
		"ICS/iCalファイルのURL（http://、https://、webcal://プロトコルに対応）",
	"Task mark display style": "タスクマーク表示スタイル",
	"Choose how task marks are displayed: default checkboxes, custom text marks, or Task Genius icons.":
		"タスクマークの表示方法を選択：デフォルトチェックボックス、カスタムテキストマーク、またはTask Geniusアイコン。",
	"Default checkboxes": "デフォルトチェックボックス",
	"Custom text marks": "カスタムテキストマーク",
	"Task Genius icons": "Task Geniusアイコン",
	"Time Parsing Settings": "時刻解析設定",
	"Enable Time Parsing": "時刻解析を有効化",
	"Automatically parse natural language time expressions in Quick Capture":
		"クイックキャプチャで自然言語の時間表現を自動解析",
	"Remove Original Time Expressions": "元の時間表現を削除",
	"Remove parsed time expressions from the task text":
		"タスクテキストから解析された時間表現を削除",
	"Supported Languages": "サポートされている言語",
	"Currently supports English and Chinese time expressions. More languages may be added in future updates.":
		"現在、英語と中国語の時間表現をサポートしています。今後のアップデートでさらに多くの言語が追加される可能性があります。",
	"Date Keywords Configuration": "日付キーワード設定",
	"Start Date Keywords": "開始日キーワード",
	"Keywords that indicate start dates (comma-separated)":
		"開始日を示すキーワード（カンマ区切り）",
	"Due Date Keywords": "期限キーワード",
	"Keywords that indicate due dates (comma-separated)":
		"期限を示すキーワード（カンマ区切り）",
	"Scheduled Date Keywords": "スケジュール日キーワード",
	"Keywords that indicate scheduled dates (comma-separated)":
		"スケジュール日を示すキーワード（カンマ区切り）",
	"Configure...": "設定...",
	"Collapse quick input": "クイック入力を折りたたみ",
	"Expand quick input": "クイック入力を展開",
	"Set Priority": "優先度を設定",
	"Clear Flags": "フラグをクリア",
	"Filter by Priority": "優先度でフィルター",
	"New Project": "新しいプロジェクト",
	"Archive Completed": "完了をアーカイブ",
	"Project Statistics": "プロジェクト統計",
	"Manage Tags": "タグ管理",
	"Time Parsing": "時刻解析",
	"Minimal Quick Capture": "ミニマルクイックキャプチャ",
	"Enter your task...": "タスクを入力...",
	"Set date": "日付を設定",
	"Set location": "場所を設定",
	"Add tags": "タグを追加",
	"Day after tomorrow": "明後日",
	"Next week": "来週",
	"Next month": "来月",
	"Choose date...": "日付を選択...",
	"Fixed location": "固定場所",
	Date: "日付",
	"Add date (triggers ~)": "日付を追加（トリガー ~）",
	"Set priority (triggers !)": "優先度を設定（トリガー !）",
	"Target Location": "対象場所",
	"Set target location (triggers *)": "対象場所を設定（トリガー *）",
	"Add tags (triggers #)": "タグを追加（トリガー #）",
	"Minimal Mode": "ミニマルモード",
	"Enable minimal mode": "ミニマルモードを有効化",
	"Enable simplified single-line quick capture with inline suggestions":
		"インライン提案付きの簡略化された単一行クイックキャプチャを有効化",
	"Suggest trigger character": "提案トリガー文字",
	"Character to trigger the suggestion menu":
		"提案メニューをトリガーする文字",
	"Highest Priority": "最高優先度",
	"🔺 Highest priority task": "🔺 Highest priority task",
	"Highest priority set": "最高優先度が設定されました",
	"⏫ High priority task": "⏫ High priority task",
	"High priority set": "高優先度が設定されました",
	"🔼 Medium priority task": "🔼 Medium priority task",
	"Medium priority set": "中優先度が設定されました",
	"🔽 Low priority task": "🔽 低優先度タスク",
	"Low priority set": "低優先度が設定されました",
	"Lowest Priority": "最低優先度",
	"⏬ Lowest priority task": "⏬ 最低優先度タスク",
	"Lowest priority set": "最低優先度が設定されました",
	"Set due date to today": "期限を今日に設定",
	"Due date set to today": "期限を今日に設定しました",
	"Set due date to tomorrow": "期限を明日に設定",
	"Due date set to tomorrow": "期限を明日に設定しました",
	"Pick Date": "日付を選択",
	"Open date picker": "日付ピッカーを開く",
	"Set scheduled date": "スケジュール日を設定",
	"Scheduled date set": "スケジュール日を設定しました",
	"Save to inbox": "受信ボックスに保存",
	"Target set to Inbox": "ターゲットを受信ボックスに設定",
	"Daily Note": "デイリーノート",
	"Save to today's daily note": "今日のデイリーノートに保存",
	"Target set to Daily Note": "ターゲットをデイリーノートに設定",
	"Current File": "現在のファイル",
	"Save to current file": "現在のファイルに保存",
	"Target set to Current File": "ターゲットを現在のファイルに設定",
	"Choose File": "ファイルを選択",
	"Open file picker": "ファイルピッカーを開く",
	"Save to recent file": "最近のファイルに保存",
	"Target set to": "ターゲットを設定:",
	Important: "重要",
	"Tagged as important": "重要としてタグ付け",
	Urgent: "緊急",
	"Tagged as urgent": "緊急としてタグ付け",
	Work: "仕事",
	"Work related task": "仕事関連のタスク",
	"Tagged as work": "仕事としてタグ付け",
	Personal: "個人",
	"Personal task": "個人タスク",
	"Tagged as personal": "個人としてタグ付け",
	"Choose Tag": "タグを選択",
	"Open tag picker": "タグピッカーを開く",
	"Existing tag": "既存のタグ",
	"Tagged with": "タグ付け:",
	"Toggle quick capture panel in editor":
		"エディターでクイックキャプチャパネルを切り替え",
	"Toggle quick capture panel in editor (Globally)":
		"エディターでクイックキャプチャパネルを切り替え（全体）",
	"Selected Mode": "選択モード",
	"Features that will be enabled": "有効になる機能",
	"Don't worry! You can customize any of these settings later in the plugin settings.":
		"ご安心ください！これらの設定はプラグイン設定で後からいつでもカスタマイズできます。",
	"Available views": "利用可能なビュー",
	"Key settings": "主要設定",
	"Progress bars": "プログレスバー",
	"Enabled (both graphical and text)": "有効（グラフィカルとテキスト両方）",
	"Task status switching": "タスクステータス切り替え",
	"Workflow management": "ワークフロー管理",
	"Reward system": "報酬システム",
	"Habit tracking": "習慣トラッキング",
	"Performance optimization": "パフォーマンス最適化",
	"Configuration Changes": "設定変更",
	"Your custom views will be preserved": "カスタムビューは保持されます",
	"New views to be added": "追加される新しいビュー",
	"Existing views to be updated": "更新される既存のビュー",
	"Feature changes": "機能変更",
	"Only template settings will be applied. Your existing custom configurations will be preserved.":
		"テンプレート設定のみが適用されます。既存のカスタム設定は保持されます。",
	"Congratulations!": "おめでとうございます！",
	"Task Genius has been configured with your selected preferences":
		"Task Genius があなたの選択した設定で構成されました",
	"Your Configuration": "あなたの設定",
	"Quick Start Guide": "クイックスタートガイド",
	"What's next?": "次にすべきことは？",
	"Open Task Genius view from the left ribbon":
		"左リボンから Task Genius ビューを開く",
	"Create your first task using Quick Capture":
		"クイックキャプチャを使用して最初のタスクを作成",
	"Explore different views to organize your tasks":
		"さまざまなビューを探索してタスクを整理",
	"Customize settings anytime in plugin settings":
		"プラグイン設定でいつでも設定をカスタマイズ",
	"Helpful Resources": "役立つリソース",
	"Complete guide to all features": "すべての機能の完全ガイド",
	Community: "コミュニティ",
	"Get help and share tips": "ヘルプを受けてヒントを共有",
	"Customize Task Genius": "Task Genius をカスタマイズ",
	"Click the Task Genius icon in the left sidebar":
		"左サイドバーの Task Genius アイコンをクリック",
	"Start with the Inbox view to see all your tasks":
		"受信箱ビューから始めてすべてのタスクを確認",
	"Use quick capture panel to quickly add your first task":
		"クイックキャプチャパネルを使用して最初のタスクを素早く追加",
	"Try the Forecast view to see tasks by date":
		"予測ビューを試して日付別にタスクを確認",
	"Open Task Genius and explore the available views":
		"Task Genius を開いて利用可能なビューを探索",
	"Set up a project using the Projects view":
		"プロジェクトビューを使用してプロジェクトを設定",
	"Try the Kanban board for visual task management":
		"カンバンボードを試して視覚的なタスク管理",
	"Use workflow stages to track task progress":
		"ワークフローステージを使用してタスクの進捗を追跡",
	"Explore all available views and their configurations":
		"すべての利用可能なビューとその設定を探索",
	"Set up complex workflows for your projects":
		"プロジェクトの複雑なワークフローを設定",
	"Configure habits and rewards to stay motivated":
		"習慣と報酬を設定してモチベーションを維持",
	"Integrate with external calendars and systems":
		"外部カレンダーとシステムと統合",
	"Open Task Genius from the left sidebar":
		"左サイドバーから Task Genius を開く",
	"Create your first task": "最初のタスクを作成",
	"Explore the different views available": "利用可能なさまざまなビューを探索",
	"Customize settings as needed": "必要に応じて設定をカスタマイズ",
	"Thank you for your positive feedback!":
		"肯定的なフィードバックありがとうございます！",
	"Thank you for your feedback. We'll continue improving the experience.":
		"フィードバックありがとうございます。体験の改善を続けていきます。",
	"Share detailed feedback": "詳細なフィードバックを共有",
	"Skip onboarding": "オンボーディングをスキップ",
	Back: "戻る",
	"Welcome to Task Genius": "Task Genius へようこそ",
	"Transform your task management with advanced progress tracking and workflow automation":
		"高度な進捗追跡とワークフロー自動化でタスク管理を変革",
	"Progress Tracking": "進捗追跡",
	"Visual progress bars and completion tracking for all your tasks":
		"すべてのタスクの視覚的なプログレスバーと完了追跡",
	"Organize tasks by projects with advanced filtering and sorting":
		"高度なフィルタリングとソートでプロジェクト別にタスクを整理",
	"Workflow Automation": "ワークフロー自動化",
	"Automate task status changes and improve your productivity":
		"タスクステータスの変更を自動化して生産性を向上",
	"Multiple Views": "複数のビュー",
	"Kanban boards, calendars, Gantt charts, and more visualization options":
		"カンバンボード、カレンダー、ガントチャートなどの視覚化オプション",
	"This quick setup will help you configure Task Genius based on your experience level and needs. You can always change these settings later.":
		"このクイックセットアップは、あなたの経験レベルとニーズに基づいて Task Genius を設定するのに役立ちます。これらの設定はいつでも後で変更できます。",
	"Choose Your Usage Mode": "使用モードを選択",
	"Select the configuration that best matches your task management experience":
		"あなたのタスク管理経験に最も適した設定を選択",
	"Configuration Preview": "設定プレビュー",
	"Review the settings that will be applied for your selected mode":
		"選択したモードに適用される設定を確認",
	"Include task creation guide": "タスク作成ガイドを含む",
	"Show a quick tutorial on creating your first task":
		"最初のタスク作成のクイックチュートリアルを表示",
	"Create Your First Task": "最初のタスクを作成",
	"Learn how to create and format tasks in Task Genius":
		"Task Genius でタスクを作成してフォーマットする方法を学ぶ",
	"Setup Complete!": "セットアップ完了！",
	"Task Genius is now configured and ready to use":
		"Task Genius の設定が完了し、使用準備が整いました",
	"Start Using Task Genius": "Task Genius を使い始める",
	"Task Genius Setup": "Task Genius セットアップ",
	"Skip setup": "セットアップをスキップ",
	"We noticed you've already configured Task Genius":
		"Task Genius はすでに設定されているようです",
	"Your current configuration includes:": "現在の設定内容：",
	"Would you like to run the setup wizard anyway?":
		"それでもセットアップウィザードを実行しますか？",
	"Yes, show me the setup wizard": "はい、セットアップウィザードを表示",
	"No, I'm happy with my current setup": "いいえ、現在の設定で満足しています",
	"Learn the different ways to create and format tasks in Task Genius. You can use either emoji-based or Dataview-style syntax.":
		"Task Genius でタスクを作成してフォーマットするさまざまな方法を学びます。絵文字ベースまたは Dataview スタイルの構文を使用できます。",
	"Task Format Examples": "タスクフォーマットの例",
	"Basic Task": "基本タスク",
	"With Emoji Metadata": "絵文字メタデータ付き",
	"📅 = Due date, 🔺 = High priority, #project/ = Docs project tag":
		"📅 = 期限、🔺 = 高優先度、#project/ = ドキュメントプロジェクトタグ",
	"With Dataview Metadata": "Dataview メタデータ付き",
	"Mixed Format": "混合フォーマット",
	"Combine emoji and dataview syntax as needed":
		"必要に応じて絵文字と Dataview 構文を組み合わせ",
	"Task Status Markers": "タスクステータスマーカー",
	"Not started": "未開始",
	"In progress": "進行中",
	"Common Metadata Symbols": "一般的なメタデータシンボル",
	"Due date": "期限",
	"Start date": "開始日",
	"Scheduled date": "予定日",
	"Higher priority": "高優先度",
	"Lower priority": "低優先度",
	"Recurring task": "繰り返しタスク",
	"Project/tag": "プロジェクト/タグ",
	"Use quick capture panel to quickly capture tasks from anywhere in Obsidian.":
		"Obsidian のどこからでもクイックキャプチャパネルを使用して素早くタスクをキャプチャ。",
	"Try Quick Capture": "クイックキャプチャを試す",
	"Quick capture is now enabled in your configuration!":
		"クイックキャプチャが設定で有効になりました！",
	"Failed to open quick capture. Please try again later.":
		"クイックキャプチャを開けませんでした。後でもう一度お試しください。",
	"Try It Yourself": "自分で試してみる",
	"Practice creating a task with the format you prefer:":
		"好みのフォーマットでタスク作成を練習：",
	"Practice Task": "練習タスク",
	"Enter a task using any of the formats shown above":
		"上記の任意のフォーマットを使用してタスクを入力",
	"- [ ] Your task here": "- [ ] ここにタスクを入力",
	"Validate Task": "タスクを検証",
	"Please enter a task to validate": "検証するタスクを入力してください",
	"This doesn't look like a valid task. Tasks should start with '- [ ]'":
		"これは有効なタスクではないようです。タスクは '- [ ]' で始まる必要があります",
	"Valid task format!": "有効なタスクフォーマット！",
	"Emoji metadata": "絵文字メタデータ",
	"Dataview metadata": "Dataview メタデータ",
	"Project tags": "プロジェクトタグ",
	"Detected features: ": "検出された機能：",
	Onboarding: "オンボーディング",
	"Restart the welcome guide and setup wizard":
		"ウェルカムガイドとセットアップウィザードを再起動",
	"Restart Onboarding": "オンボーディングを再起動",
	Copy: "コピー",
	"Copied!": "コピーしました！",
	"MCP integration is only available on desktop":
		"MCP 統合はデスクトップ版でのみ利用可能",
	"MCP Server Status": "MCP サーバーステータス",
	"Enable MCP Server": "MCP サーバーを有効化",
	"Start the MCP server to allow external tool connections":
		"外部ツール接続を許可するために MCP サーバーを起動",
	"WARNING: Enabling the MCP server will allow external AI tools and applications to access and modify your task data. This includes:\n\n• Reading all tasks and their details\n• Creating new tasks\n• Updating existing tasks\n• Deleting tasks\n• Accessing task metadata and properties\n\nOnly enable this if you trust the applications that will connect to the MCP server. Make sure to keep your authentication token secure.\n\nDo you want to continue?":
		"警告：MCP サーバーを有効にすると、外部の AI ツールやアプリケーションがタスクデータにアクセスして変更できるようになります。これには次が含まれます：\n\n• すべてのタスクとその詳細の読み取り\n• 新しいタスクの作成\n• 既存のタスクの更新\n• タスクの削除\n• タスクメタデータとプロパティのアクセス\n\nMCP サーバーに接続するアプリケーションを信頼している場合のみ有効にしてください。認証トークンを安全に保管してください。\n\n続行しますか？",
	"MCP Server enabled. Keep your authentication token secure!":
		"MCP サーバーが有効になりました。認証トークンを安全に保管してください！",
	"Server Configuration": "サーバー設定",
	Host: "ホスト",
	"Server host address. Use 127.0.0.1 for local only, 0.0.0.0 for all interfaces":
		"サーバーホストアドレス。ローカルのみの場合は 127.0.0.1、すべてのインターフェースの場合は 0.0.0.0 を使用",
	"Security Warning": "セキュリティ警告",
	"⚠️ **WARNING**: Switching to 0.0.0.0 will make the MCP server accessible from external networks.\n\nThis could expose your Obsidian data to:\n- Other devices on your local network\n- Potentially the internet if your firewall is misconfigured\n\n**Only proceed if you:**\n- Understand the security implications\n- Have properly configured your firewall\n- Need external access for legitimate reasons\n\nAre you sure you want to continue?":
		"⚠️ **警告**：0.0.0.0 に切り替えると、MCP サーバーが外部ネットワークからアクセス可能になります。\n\nこれにより、Obsidian データが次に公開される可能性があります：\n- ローカルネットワーク上の他のデバイス\n- ファイアウォールが正しく設定されていない場合、インターネット\n\n**次の場合のみ続行してください：**\n- セキュリティ上の影響を理解している\n- ファイアウォールを適切に設定している\n- 正当な理由で外部アクセスが必要\n\n本当に続行しますか？",
	"Yes, I understand the risks": "はい、リスクを理解しています",
	"Host changed to 0.0.0.0. Server is now accessible from external networks.":
		"ホストが 0.0.0.0 に変更されました。サーバーは外部ネットワークからアクセス可能になりました。",
	Port: "ポート",
	"Server port number (default: 7777)":
		"サーバーポート番号（デフォルト：7777）",
	Authentication: "認証",
	"Authentication Token": "認証トークン",
	"Bearer token for authenticating MCP requests (keep this secret)":
		"MCP リクエストを認証するための Bearer トークン（秘密に保管してください）",
	Show: "表示",
	Hide: "非表示",
	"Token copied to clipboard": "トークンをクリップボードにコピーしました",
	Regenerate: "再生成",
	"New token generated": "新しいトークンが生成されました",
	"Advanced Settings": "高度な設定",
	"Enable CORS": "CORS を有効化",
	"Allow cross-origin requests (required for web clients)":
		"クロスオリジンリクエストを許可（Web クライアントに必要）",
	"Log Level": "ログレベル",
	"Logging verbosity for debugging": "デバッグ用のログ詳細度",
	Error: "エラー",
	Warning: "警告",
	Info: "情報",
	Debug: "デバッグ",
	"Server Actions": "サーバーアクション",
	"Test Connection": "接続テスト",
	"Test the MCP server connection": "MCP サーバー接続をテスト",
	Test: "テスト",
	"Testing...": "テスト中...",
	"Connection test successful! MCP server is working.":
		"接続テスト成功！MCP サーバーは動作中です。",
	"Connection test failed: ": "接続テスト失敗：",
	"Restart Server": "サーバーを再起動",
	"Stop and restart the MCP server": "MCP サーバーを停止して再起動",
	Restart: "再起動",
	"MCP server restarted": "MCP サーバーが再起動されました",
	"Failed to restart server: ": "サーバーの再起動に失敗：",
	"Use Next Available Port": "次の利用可能なポートを使用",
	"Port updated to ": "ポートが更新されました：",
	"No available port found in range":
		"範囲内に利用可能なポートが見つかりません",
	"Client Configuration": "クライアント設定",
	"Authentication Method": "認証方法",
	"Choose the authentication method for client configurations":
		"クライアント設定の認証方法を選択",
	"Method B: Combined Bearer (Recommended)": "方法 B：統合 Bearer（推奨）",
	"Method A: Custom Headers": "方法 A：カスタムヘッダー",
	"Supported Authentication Methods:": "サポートされている認証方法：",
	"API Documentation": "API ドキュメント",
	"Server Endpoint": "サーバーエンドポイント",
	"Copy URL": "URL をコピー",
	"Available Tools": "利用可能なツール",
	"Loading tools...": "ツールを読み込み中...",
	"No tools available": "利用可能なツールがありません",
	"Failed to load tools. Is the MCP server running?":
		"ツールの読み込みに失敗しました。MCP サーバーは実行中ですか？",
	"Example Request": "リクエストの例",
	"MCP Server not initialized": "MCP サーバーが初期化されていません",
	Running: "実行中",
	Stopped: "停止中",
	Uptime: "稼働時間",
	Requests: "リクエスト数",
	"Toggle this to enable Org-mode style quick capture panel.":
		"Org-mode スタイルのクイックキャプチャパネルを有効にするにはこれを切り替えます。",
	"Auto-add task prefix": "タスクプレフィックスを自動追加",
	"Automatically add task checkbox prefix to captured content":
		"キャプチャしたコンテンツにタスクチェックボックスプレフィックスを自動的に追加",
	"Task prefix format": "タスクプレフィックスフォーマット",
	"The prefix to add before captured content (e.g., '- [ ]' for task, '- ' for list item)":
		"キャプチャしたコンテンツの前に追加するプレフィックス（例：タスクの場合は '- [ ]'、リスト項目の場合は '- '）",
	"Search settings...": "設定を検索...",
	"Search settings": "設定を検索",
	"Clear search": "検索をクリア",
	"Search results": "検索結果",
	"No settings found": "設定が見つかりません",
	"Project Tree View Settings": "プロジェクトツリービュー設定",
	"Configure how projects are displayed in tree view.":
		"ツリービューでのプロジェクト表示方法を設定。",
	"Default project view mode": "デフォルトプロジェクトビューモード",
	"Choose whether to display projects as a flat list or hierarchical tree by default.":
		"プロジェクトをデフォルトでフラットリストまたは階層ツリーとして表示するかを選択。",
	"Auto-expand project tree": "プロジェクトツリーを自動展開",
	"Automatically expand all project nodes when opening the project view in tree mode.":
		"ツリーモードでプロジェクトビューを開くときに、すべてのプロジェクトノードを自動的に展開。",
	"Show empty project folders": "空のプロジェクトフォルダーを表示",
	"Display project folders even if they don't contain any tasks.":
		"タスクが含まれていなくてもプロジェクトフォルダーを表示。",
	"Project path separator": "プロジェクトパスセパレーター",
	"Character used to separate project hierarchy levels (e.g., '/' in 'Project/SubProject').":
		"プロジェクト階層レベルを区切る文字（例：'Project/SubProject' の '/'）。",
	"Enable dynamic metadata positioning": "動的メタデータ位置決めを有効化",
	"Intelligently position task metadata. When enabled, metadata appears on the same line as short tasks and below long tasks. When disabled, metadata always appears below the task content.":
		"タスクメタデータをインテリジェントに配置します。有効にすると、メタデータは短いタスクと同じ行に表示され、長いタスクの場合は下に表示されます。無効にすると、メタデータは常にタスクコンテンツの下に表示されます。",
	"Toggle tree/list view": "ツリー/リストビューを切り替え",
	"Clear date": "日付をクリア",
	"Clear priority": "優先度をクリア",
	"Clear all tags": "すべてのタグをクリア",
	"🔺 Highest priority": "🔺 最高優先度",
	"⏫ High priority": "⏫ 高優先度",
	"🔼 Medium priority": "🔼 中優先度",
	"🔽 Low priority": "🔽 低優先度",
	"⏬ Lowest priority": "⏬ 最低優先度",
	"Fixed File": "固定ファイル",
	"Save to Inbox.md": "Inbox.md に保存",
	"Open Task Genius Setup": "Task Genius セットアップを開く",
	"MCP Integration": "MCP 統合",
	Beginner: "初級者",
	"Basic task management with essential features":
		"基本的なタスク管理と必須機能",
	"Basic progress bars": "基本プログレスバー",
	"Essential views (Inbox, Forecast, Projects)":
		"必須ビュー（受信箱、予測、プロジェクト）",
	"Simple task status tracking": "シンプルなタスクステータス追跡",
	"Quick task capture": "クイックタスクキャプチャ",
	"Date picker functionality": "日付ピッカー機能",
	"Project management with enhanced workflows":
		"プロジェクト管理と強化ワークフロー",
	"Full progress bar customization": "完全なプログレスバーカスタマイズ",
	"Extended views (Kanban, Calendar, Table)":
		"拡張ビュー（カンバン、カレンダー、テーブル）",
	"Project management features": "プロジェクト管理機能",
	"Basic workflow automation": "基本ワークフロー自動化",
	"Advanced filtering and sorting": "高度なフィルタリングとソート",
	"Power User": "パワーユーザー",
	"Full-featured experience with all capabilities":
		"すべての機能を備えたフル機能体験",
	"All views and advanced configurations": "すべてのビューと高度な設定",
	"Complex workflow definitions": "複雑なワークフロー定義",
	"Reward and habit tracking systems": "報酬と習慣追跡システム",
	"Performance optimizations": "パフォーマンス最適化",
	"Advanced integrations": "高度な統合",
	"Experimental features": "実験的機能",
	"Timeline and calendar sync": "タイムラインとカレンダー同期",
	"Not configured": "未設定",
	Custom: "カスタム",
	"Custom views created": "カスタムビューが作成されました",
	"Progress bar settings modified": "プログレスバー設定が変更されました",
	"Task status settings configured": "タスクステータス設定が構成されました",
	"Quick capture configured": "クイックキャプチャが設定されました",
	"Workflow settings enabled": "ワークフロー設定が有効化されました",
	"Advanced features enabled": "高度な機能が有効化されました",
	"File parsing customized": "ファイル解析がカスタマイズされました",
};

export default translations;
