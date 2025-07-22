/**
 * Mock for Obsidian module in tests
 */

// Mock moment function
export const moment = (date?: any) => {
  const mockDate = date || new Date();
  return {
    format: (formatStr: string) => {
      // Simple mock implementation for common formats
      const d = new Date(mockDate);
      const pad = (n: number) => n.toString().padStart(2, '0');

      let result = formatStr;
      result = result.replace('YYYY', d.getFullYear().toString());
      result = result.replace('MM', pad(d.getMonth() + 1));
      result = result.replace('DD', pad(d.getDate()));
      result = result.replace('HH', pad(d.getHours()));
      result = result.replace('mm', pad(d.getMinutes()));
      result = result.replace('hh', pad(d.getHours() % 12 || 12));
      result = result.replace('A', d.getHours() >= 12 ? 'PM' : 'AM');

      return result;
    }
  };
};

// Mock other Obsidian classes as needed
export class TFile {
  basename: string;
  extension: string;
  path: string;
  name: string;
  parent: any;
  vault: any;
  stat: any;

  constructor(data: Partial<TFile> = {}) {
    Object.assign(this, data);
  }
}

export class Plugin {
  app: any;
  manifest: any;

  async loadData() {
    return {};
  }

  async saveData(data: any) {
    return;
  }
}

export class Notice {
  constructor(message: string) {
    console.log('Notice:', message);
  }
}
