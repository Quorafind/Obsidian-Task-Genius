/**
 * Mock for ProjectData.worker.ts in test environment
 */

export default class MockProjectDataWorker {
	private messageHandler: ((event: MessageEvent) => void) | null = null;

	constructor() {
		// Mock worker constructor
	}

	postMessage(message: any) {
		// Mock postMessage - simulate immediate response
		setTimeout(() => {
			if (this.messageHandler) {
				const mockResponse = {
					data: {
						type: "projectDataResult",
						requestId: message.requestId,
						success: true,
						data: {
							filePath: message.filePath || "test.md",
							tgProject: {
								type: "test",
								name: "Test Project",
								source: "mock",
								readonly: true,
							},
							enhancedMetadata: {},
							timestamp: Date.now(),
						},
					},
				};
				this.messageHandler(mockResponse as MessageEvent);
			}
		}, 0);
	}

	set onmessage(handler: (event: MessageEvent) => void) {
		this.messageHandler = handler;
	}

	terminate() {
		// Mock terminate
		this.messageHandler = null;
	}
}
