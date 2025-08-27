require('dotenv').config();

const { execSync } = require('child_process');
const semver = require('semver');

// 智能获取上一个相关版本标签
function getLastRelevantTag() {
	try {
		// 获取所有标签（包括带 v 前缀和不带 v 前缀的）
		const allTags = execSync('git tag -l', { encoding: 'utf8' })
			.trim()
			.split('\n')
			.filter(Boolean);
		
		// 过滤出在当前分支历史中的标签
		const reachableTags = [];
		for (const tag of allTags) {
			try {
				// 检查标签是否可以从 HEAD 访问到（即在当前分支的历史中）
				execSync(`git merge-base --is-ancestor ${tag} HEAD`, { encoding: 'utf8' });
				// 尝试解析版本号（移除可能的 'v' 前缀）
				const versionString = tag.replace(/^v/, '');
				const version = semver.valid(versionString);
				if (version) {
					reachableTags.push({ tag, version });
				}
			} catch (e) {
				// 标签不在当前分支历史中，跳过
			}
		}
		
		if (reachableTags.length === 0) {
			console.log('No valid tags found in current branch history, using HEAD~30');
			return 'HEAD~30';
		}
		
		// 按照 semver 排序，从高到低
		const sortedTags = reachableTags.sort((a, b) => semver.rcompare(a.version, b.version));
		
		// 获取最新的标签（已发布的最新版本）
		const latestTag = sortedTags[0];
		console.log(`Using latest reachable tag: ${latestTag.tag} (version: ${latestTag.version})`);
		
		// 显示提交数量信息
		try {
			const commitCount = execSync(`git rev-list --count ${latestTag.tag}..HEAD`, { encoding: 'utf8' }).trim();
			console.log(`Will include ${commitCount} commits since ${latestTag.tag}`);
		} catch (e) {
			// 忽略错误，这只是信息性输出
		}
		
		return latestTag.tag;
		
	} catch (error) {
		console.warn('Warning: Could not determine last relevant tag, using HEAD~30', error.message);
		return 'HEAD~30';
	}
}

module.exports = {
	interactive: true,
	preRelease: 'beta',
	hooks: {
		"before:init": ["node esbuild.config.mjs production"],
		"after:bump": [
			"node esbuild.config.mjs production",
			"node ./scripts/zip.mjs",
			"git add .",
		],
		"after:release":
			"echo 'Successfully released Task Genius v${version} (BETA) to ${repo.repository}.'",
	},
	git: {
		requireBranch: ["master", "beta", "develop", "refactor/*"],
		requireCleanWorkingDir: true,
		pushArgs: "--follow-tags -o ci.skip",
		commitMessage: "chore(release): bump version to ${version} [beta]",
		tagName: "v${version}",
		tagAnnotation: "Beta Release v${version}",
		addUntrackedFiles: true,
	},
	plugins: {
		"@release-it/conventional-changelog": {
			preset: {
				name: "conventionalcommits",
				types: [
					{type: "feat", section: "Features"},
					{type: "fix", section: "Bug Fixes"},
					{type: "perf", section: "Performance"},
					{type: "refactor", section: "Refactors"},
					{type: "chore", section: "Chores"},
					{type: "docs", section: "Documentation"},
					{type: "style", section: "Styles"},
					{type: "test", section: "Tests"}
				]
			},
			infile: "CHANGELOG-BETA.md",
			header: "# Beta Changelog\n\nAll notable changes to beta releases will be documented in this file.\n\n",
			// 限制 git log 的提交范围，避免 ENAMETOOLONG 错误
			gitRawCommitsOpts: {
				from: getLastRelevantTag(), // 智能获取上一个相关版本
			}
		},
		"./scripts/ob-bumper.mjs": {
			indent: 2,
			copyTo: "./dist",
		},
	},
	npm: {
		publish: false,
		tag: 'beta',
	},
	github: {
		release: true,
		preRelease: true,
		draft: false,
		assets: [
			"dist/main.js",
			"dist/manifest.json",
			"dist/styles.css",
			"dist/task-genius-${version}.zip",
		],
		proxy: process.env.HTTPS_PROXY,
		releaseName: "v${version} (Beta)",
		releaseNotes: (context) => {
			// 获取智能范围信息
			const fromTag = getLastRelevantTag();
			const rangeInfo = fromTag.startsWith('HEAD') 
				? `\n### Changes in this release (last ${fromTag.replace('HEAD~', '')} commits):\n`
				: `\n### Changes since ${fromTag}:\n`;
			
			return `## ⚠️ Beta Release\n\nThis is a beta release and may contain bugs or incomplete features. Use at your own risk.\n${rangeInfo}\n${context.changelog}`;
		},
	},
};