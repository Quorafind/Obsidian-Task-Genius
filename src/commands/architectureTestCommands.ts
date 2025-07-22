/**
 * 架构测试命令
 * 
 * 提供一系列命令来测试和验证新统一数据管理架构的功能
 */

import { Notice } from "obsidian";
import type TaskProgressBarPlugin from "../index";

/**
 * 注册架构测试相关的命令
 */
export function registerArchitectureTestCommands(plugin: TaskProgressBarPlugin): void {
	// 架构状态检查命令
	plugin.addCommand({
		id: "check-architecture-status",
		name: "🔍 检查当前数据管理架构状态",
		callback: async () => {
			await checkArchitectureStatus(plugin);
		},
	});

	// 内存使用统计命令
	plugin.addCommand({
		id: "show-memory-stats",
		name: "📊 显示内存使用统计",
		callback: async () => {
			await showMemoryStats(plugin);
		},
	});

	// 架构性能对比命令
	plugin.addCommand({
		id: "compare-architecture-performance",
		name: "⚡ 对比架构性能",
		callback: async () => {
			await compareArchitecturePerformance(plugin);
		},
	});

	// 切换架构命令
	plugin.addCommand({
		id: "toggle-unified-architecture",
		name: "🔄 快速切换数据管理架构",
		callback: async () => {
			await toggleUnifiedArchitecture(plugin);
		},
	});

	// 运行架构验证测试
	plugin.addCommand({
		id: "run-architecture-validation",
		name: "✅ 运行架构功能验证测试",
		callback: async () => {
			await runArchitectureValidation(plugin);
		},
	});
}

/**
 * 检查当前架构状态
 */
async function checkArchitectureStatus(plugin: TaskProgressBarPlugin): Promise<void> {
	const isUnified = plugin.settings.experimental?.enableUnifiedDataManager || false;
	const activeManager = plugin.getActiveTaskManager();
	
	let statusInfo = `📋 数据管理架构状态报告\n\n`;
	statusInfo += `🏗️ 当前架构: ${isUnified ? '新统一架构' : '传统架构'}\n`;
	statusInfo += `🔧 管理器类型: ${activeManager?.constructor?.name || 'Unknown'}\n`;
	const isInitialized = activeManager && typeof (activeManager as any).getInitialized === 'function' 
	                      ? (activeManager as any).getInitialized() 
	                      : false;
	statusInfo += `⚡ 初始化状态: ${isInitialized ? '✅ 已初始化' : '❌ 未初始化'}\n`;
	
	if (isUnified && plugin.unifiedTaskManager) {
		statusInfo += `🔬 调试模式: ${plugin.settings.experimental?.unifiedDataManagerDebug ? '开启' : '关闭'}\n`;
		
		// 获取内存统计
		try {
			const memoryStats = plugin.unifiedTaskManager.getMemoryStats();
			statusInfo += `💾 内存统计:\n`;
			statusInfo += `  - 总内存使用: ${(memoryStats.unified.estimatedMemoryUsage / 1024 / 1024).toFixed(2)} MB\n`;
			statusInfo += `  - 缓存项目: ${memoryStats.unified.cacheSize} 项\n`;
			statusInfo += `  - 活跃监听器: ${memoryStats.unified.activeListeners} 个\n`;
		} catch (error) {
			statusInfo += `❌ 无法获取内存统计: ${error}\n`;
		}
	}
	
	statusInfo += `\n💡 提示: 可通过设置 > Beta测试 切换架构`;
	
	new Notice(statusInfo, 8000);
	console.log("🏗️ 架构状态检查:", {
		isUnified,
		managerType: activeManager?.constructor?.name,
		initialized: activeManager?.getInitialized?.(),
		settings: plugin.settings.experimental
	});
}

/**
 * 显示内存使用统计
 */
async function showMemoryStats(plugin: TaskProgressBarPlugin): Promise<void> {
	const isUnified = plugin.settings.experimental?.enableUnifiedDataManager || false;
	
	if (!isUnified || !plugin.unifiedTaskManager) {
		new Notice("❌ 仅在新统一架构下可用", 3000);
		return;
	}

	try {
		const stats = plugin.unifiedTaskManager.getMemoryStats();
		
		let memoryReport = `📊 内存使用详细报告\n\n`;
		
		// 统一管理器统计
		memoryReport += `🏗️ 统一管理器:\n`;
		memoryReport += `  💾 内存: ${(stats.unified.estimatedMemoryUsage / 1024 / 1024).toFixed(2)} MB\n`;
		memoryReport += `  📦 缓存: ${stats.unified.cacheSize} 项\n`;
		memoryReport += `  👂 监听器: ${stats.unified.activeListeners} 个\n\n`;
		
		// 任务数据管理器统计
		memoryReport += `📋 任务数据管理器:\n`;
		memoryReport += `  💾 内存: ${(stats.task.estimatedMemoryUsage / 1024 / 1024).toFixed(2)} MB\n`;
		memoryReport += `  📦 缓存: ${stats.task.cacheSize} 项\n\n`;
		
		// 项目数据管理器统计
		memoryReport += `🏗️ 项目数据管理器:\n`;
		memoryReport += `  💾 内存: ${(stats.project.estimatedMemoryUsage / 1024 / 1024).toFixed(2)} MB\n`;
		memoryReport += `  📦 缓存: ${stats.project.cacheSize} 项\n\n`;
		
		// 文件数据管理器统计
		memoryReport += `📂 文件数据管理器:\n`;
		memoryReport += `  💾 内存: ${(stats.file.estimatedMemoryUsage / 1024 / 1024).toFixed(2)} MB\n`;
		memoryReport += `  📦 缓存: ${stats.file.cacheSize} 项\n\n`;
		
		// 总计
		const totalMemory = Object.values(stats).reduce((sum, stat) => sum + stat.estimatedMemoryUsage, 0);
		const totalCache = Object.values(stats).reduce((sum, stat) => sum + stat.cacheSize, 0);
		
		memoryReport += `📊 总计:\n`;
		memoryReport += `  💾 总内存: ${(totalMemory / 1024 / 1024).toFixed(2)} MB\n`;
		memoryReport += `  📦 总缓存: ${totalCache} 项`;
		
		new Notice(memoryReport, 10000);
		console.log("📊 内存统计报告:", stats);
		
	} catch (error) {
		new Notice(`❌ 获取内存统计失败: ${error}`, 3000);
		console.error("获取内存统计失败:", error);
	}
}

/**
 * 架构性能对比
 */
async function compareArchitecturePerformance(plugin: TaskProgressBarPlugin): Promise<void> {
	new Notice("⚡ 开始性能对比测试...", 2000);
	
	const results = {
		oldArchitecture: null as any,
		newArchitecture: null as any
	};
	
	try {
		// 如果当前是新架构，需要临时切换到旧架构进行对比
		const isCurrentlyUnified = plugin.settings.experimental?.enableUnifiedDataManager || false;
		
		// 测试旧架构（如果存在）
		if (!isCurrentlyUnified && plugin.taskManager) {
			console.log("🧪 测试传统架构性能...");
			const startTime = performance.now();
			const tasks = plugin.taskManager.getAllTasks();
			const endTime = performance.now();
			
			results.oldArchitecture = {
				taskCount: tasks.length,
				executionTime: endTime - startTime,
				memoryEstimate: tasks.length * 1000 // 简单估算
			};
		}
		
		// 测试新架构（如果存在）
		if (isCurrentlyUnified && plugin.unifiedTaskManager) {
			console.log("🧪 测试新统一架构性能...");
			const startTime = performance.now();
			const tasks = await plugin.unifiedTaskManager.getTasks();
			const endTime = performance.now();
			
			const memStats = plugin.unifiedTaskManager.getMemoryStats();
			
			results.newArchitecture = {
				taskCount: tasks.length,
				executionTime: endTime - startTime,
				memoryEstimate: memStats.unified.estimatedMemoryUsage
			};
		}
		
		// 生成对比报告
		let report = `⚡ 架构性能对比报告\n\n`;
		
		if (results.oldArchitecture) {
			report += `📊 传统架构:\n`;
			report += `  🔢 任务数量: ${results.oldArchitecture.taskCount}\n`;
			report += `  ⏱️ 执行时间: ${results.oldArchitecture.executionTime.toFixed(2)}ms\n`;
			report += `  💾 内存估算: ${(results.oldArchitecture.memoryEstimate / 1024 / 1024).toFixed(2)}MB\n\n`;
		}
		
		if (results.newArchitecture) {
			report += `🚀 新统一架构:\n`;
			report += `  🔢 任务数量: ${results.newArchitecture.taskCount}\n`;
			report += `  ⏱️ 执行时间: ${results.newArchitecture.executionTime.toFixed(2)}ms\n`;
			report += `  💾 实际内存: ${(results.newArchitecture.memoryEstimate / 1024 / 1024).toFixed(2)}MB\n\n`;
		}
		
		if (results.oldArchitecture && results.newArchitecture) {
			const timeImprovement = ((results.oldArchitecture.executionTime - results.newArchitecture.executionTime) / results.oldArchitecture.executionTime * 100);
			const memoryImprovement = ((results.oldArchitecture.memoryEstimate - results.newArchitecture.memoryEstimate) / results.oldArchitecture.memoryEstimate * 100);
			
			report += `📈 性能提升:\n`;
			report += `  ⚡ 速度提升: ${timeImprovement > 0 ? '+' : ''}${timeImprovement.toFixed(1)}%\n`;
			report += `  💾 内存优化: ${memoryImprovement > 0 ? '+' : ''}${memoryImprovement.toFixed(1)}%`;
		} else {
			report += `ℹ️ 当前仅能测试 ${isCurrentlyUnified ? '新架构' : '旧架构'}`;
		}
		
		new Notice(report, 8000);
		console.log("⚡ 性能对比结果:", results);
		
	} catch (error) {
		new Notice(`❌ 性能对比失败: ${error}`, 3000);
		console.error("性能对比失败:", error);
	}
}

/**
 * 快速切换架构
 */
async function toggleUnifiedArchitecture(plugin: TaskProgressBarPlugin): Promise<void> {
	const currentState = plugin.settings.experimental?.enableUnifiedDataManager || false;
	const newState = !currentState;
	
	try {
		// 更新设置
		if (!plugin.settings.experimental) {
			plugin.settings.experimental = {};
		}
		plugin.settings.experimental.enableUnifiedDataManager = newState;
		await plugin.saveSettings();
		
		const archName = newState ? "新统一架构" : "传统架构";
		new Notice(`🔄 已切换到 ${archName}\n\n重新加载插件以生效`, 4000);
		
		console.log(`🔄 架构切换: ${currentState ? '新架构' : '旧架构'} → ${newState ? '新架构' : '旧架构'}`);
		
	} catch (error) {
		new Notice(`❌ 架构切换失败: ${error}`, 3000);
		console.error("架构切换失败:", error);
	}
}

/**
 * 运行架构功能验证测试
 */
async function runArchitectureValidation(plugin: TaskProgressBarPlugin): Promise<void> {
	new Notice("✅ 开始架构功能验证测试...", 2000);
	
	const activeManager = plugin.getActiveTaskManager();
	const isUnified = plugin.settings.experimental?.enableUnifiedDataManager || false;
	
	const testResults = {
		passed: 0,
		failed: 0,
		tests: [] as Array<{name: string, passed: boolean, error?: string}>
	};
	
	// 测试函数
	const runTest = async (name: string, testFn: () => Promise<void> | void): Promise<void> => {
		try {
			await testFn();
			testResults.tests.push({name, passed: true});
			testResults.passed++;
			console.log(`✅ ${name} - 通过`);
		} catch (error) {
			testResults.tests.push({name, passed: false, error: String(error)});
			testResults.failed++;
			console.error(`❌ ${name} - 失败:`, error);
		}
	};
	
	// 执行测试
	await runTest("管理器实例存在", () => {
		if (!activeManager) throw new Error("管理器实例不存在");
	});
	
	await runTest("初始化状态检查", () => {
		const initialized = activeManager && typeof (activeManager as any).getInitialized === 'function' 
		                   ? (activeManager as any).getInitialized() 
		                   : false;
		if (initialized === false) throw new Error("管理器未初始化");
	});
	
	if (isUnified && plugin.unifiedTaskManager) {
		await runTest("获取任务列表", async () => {
			const tasks = await plugin.unifiedTaskManager!.getTasks();
			if (!Array.isArray(tasks)) throw new Error("任务列表不是数组");
		});
		
		await runTest("内存统计获取", () => {
			const stats = plugin.unifiedTaskManager!.getMemoryStats();
			if (!stats || typeof stats.unified?.cacheSize !== 'number') {
				throw new Error("内存统计格式错误");
			}
		});
		
		await runTest("健康检查", async () => {
			const health = await plugin.unifiedTaskManager!.healthCheck();
			if (!health || typeof health.healthy !== 'boolean') {
				throw new Error("健康检查结果格式错误");
			}
		});
	} else {
		await runTest("传统架构任务获取", () => {
			if (!plugin.taskManager) throw new Error("传统TaskManager不存在");
			const tasks = plugin.taskManager.getAllTasks();
			if (!Array.isArray(tasks)) throw new Error("任务列表不是数组");
		});
	}
	
	// 生成测试报告
	let report = `✅ 架构功能验证报告\n\n`;
	report += `🏗️ 测试架构: ${isUnified ? '新统一架构' : '传统架构'}\n`;
	report += `📊 测试结果: ${testResults.passed}/${testResults.passed + testResults.failed} 通过\n\n`;
	
	if (testResults.failed > 0) {
		report += `❌ 失败的测试:\n`;
		testResults.tests
			.filter(t => !t.passed)
			.forEach(t => {
				report += `  • ${t.name}: ${t.error}\n`;
			});
	} else {
		report += `🎉 所有测试通过！架构运行正常`;
	}
	
	new Notice(report, 6000);
	console.log("✅ 架构验证测试完成:", testResults);
}