module.exports = {
	preset: "ts-jest",
	testEnvironment: "jsdom",
	testMatch: ["**/__tests__/**/*.test.ts"],
	moduleNameMapper: {
		"^obsidian$": "<rootDir>/src/__mocks__/obsidian.ts",
		"^@codemirror/state$": "<rootDir>/src/__mocks__/codemirror-state.ts",
		"^@codemirror/view$": "<rootDir>/src/__mocks__/codemirror-view.ts",
		"^@codemirror/language$":
			"<rootDir>/src/__mocks__/codemirror-language.ts",
		"^@codemirror/search$": "<rootDir>/src/__mocks__/codemirror-search.ts",
		"\\.(css|less|scss|sass)$": "<rootDir>/src/__mocks__/styleMock.js",
		".*\\.worker$": "<rootDir>/src/__mocks__/ProjectData.worker.ts",
	},
	transform: {
		"^.+\\.tsx?$": [
			"ts-jest",
			{
				tsconfig: "tsconfig.json",
			},
		],
	},
	moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
	setupFilesAfterEnv: ["<rootDir>/src/test-setup.ts"],
};
