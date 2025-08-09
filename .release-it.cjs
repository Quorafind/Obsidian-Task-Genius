module.exports = {
	hooks: {
		"before:init": ["pnpm test", "pnpm run build"],
		"after:bump": [
			"pnpm run build",
			"node ./scripts/zip.mjs",
			"git add .",
		],
		"after:release":
			"echo Successfully released Task Genius v${version} to ${repo.repository}.",
	},
	git: {
		requireBranch: "master",
		requireCleanWorkingDir: true,
		pushArgs: "--follow-tags -o ci.skip",
		commitMessage: "chore(release): bump version to ${version}",
		tagName: "${version}",
		tagAnnotation: "Release v${version}",
		addUntrackedFiles: true,
	},
	plugins: {
		"@release-it/conventional-changelog": {
			preset: {
				name: "conventionalcommits",
				types: [
					{ type: "feat", section: "✨ Features" },
					{ type: "fix", section: "🐛 Bug Fixes" },
					{ type: "perf", section: "⚡ Performance" },
					{ type: "refactor", section: "♻️ Refactors" },
					{ type: "chore", section: "🔧 Chores" },
					{ type: "docs", section: "📝 Documentation" },
					{ type: "style", section: "💄 Styles" },
					{ type: "test", section: "✅ Tests" }
				]
			},
			infile: "CHANGELOG.md",
			header: "# Changelog\n\nAll notable changes to this project will be documented in this file.\n\n"
		},
		"./scripts/ob-bumper.mjs": {
			indent: 2,
			copyTo: "./dist",
		},
	},
	npm: {
		publish: false,
	},
	github: {
		release: true,
		assets: [
			"dist/main.js",
			"dist/manifest.json",
			"dist/styles.css",
			"dist/task-genius-${version}.zip",
		],
		proxy: process.env.HTTPS_PROXY,
		releaseName: "v${version}",
	},
};
