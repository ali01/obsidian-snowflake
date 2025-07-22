/* eslint-disable */
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
export abstract class TAbstractFile {
  vault: any = null;
  path: string = '';
  name: string = '';
  parent: any = null;
}

export class TFile extends TAbstractFile {
  basename: string = '';
  extension: string = '';
  stat: any = null;

  constructor(data: Partial<TFile> = {}) {
    super();
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

export interface EditorPosition {
  line: number;
  ch: number;
}

export class Editor {
  private cursor: EditorPosition = { line: 0, ch: 0 };

  getCursor(): EditorPosition {
    return this.cursor;
  }

  setCursor(pos: EditorPosition) {
    this.cursor = pos;
  }
}

export class Vault {
  async read(file: TFile): Promise<string> {
    return '';
  }

  async modify(file: TFile, content: string): Promise<void> {
    return;
  }

  getAbstractFileByPath(path: string): TFile | null {
    return null;
  }
}

export class FuzzySuggestModal<T> {
  constructor(app: any) {}

  open() {}

  close() {}
}

export class TFolder extends TAbstractFile {
  children: any[] = [];
  isRoot: boolean = false;

  constructor(data: Partial<TFolder> = {}) {
    super();
    Object.assign(this, data);
  }
}

export class App {
  vault: Vault = new Vault();
}

export class MarkdownView {
  file: TFile | null = null;
}

export interface MarkdownFileInfo {
  file: TFile;
}

export interface FuzzyMatch<T> {
  item: T;
  match: {
    score: number;
    matches: number[][];
  };
}
