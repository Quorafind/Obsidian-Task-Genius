// Simple project resolver skeleton
export interface ProjectData {
  name?: string;
  meta: Record<string, any>;
}

export class Resolver {
  constructor() {}

  // TODO: integrate with ProjectConfigManager/ProjectDataCache
  async get(path: string): Promise<ProjectData | null> {
    return { name: undefined, meta: {} };
  }
}

