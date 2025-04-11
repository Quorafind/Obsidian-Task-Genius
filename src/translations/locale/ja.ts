// Japanese translations
const translations = {
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
	"Task Status Settings": "タスクステータス設定",
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
	"Task Status Switcher": "タスクステータススイッチャー",
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
	"Task Status Cycle and Marks": "タスクステータスサイクルとマーク",
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
	"Task Status": "タスクステータス",
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
};

export default translations;
