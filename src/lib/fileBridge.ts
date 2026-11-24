export interface FileBridge {
  saveBackupFile(
    suggestedName: string,
    jsonString: string,
    mimeType?: string
  ): Promise<boolean>;
  pickBackupFile(mimeType?: string): Promise<string | null>;
}

export interface NativeFileModule {
  createDocument(
    suggestedName: string,
    mimeType: string,
    content: string
  ): Promise<boolean>;
  openDocument(mimeType: string): Promise<string | null>;
}

function resolveNativeModule(): NativeFileModule | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { NativeModules } = require('react-native');
    return NativeModules?.KyrosFile;
  } catch {
    return undefined;
  }
}

export function createFileBridge(customModule?: NativeFileModule): FileBridge {
  return {
    async saveBackupFile(
      suggestedName: string,
      content: string,
      mimeType?: string
    ): Promise<boolean> {
      const module = customModule ?? resolveNativeModule();
      if (!module || typeof module.createDocument !== 'function') {
        throw new Error('Native file export module is not available on this platform.');
      }
      const effectiveMime =
        mimeType ?? (suggestedName.endsWith('.csv') ? 'text/csv' : 'application/json');
      return module.createDocument(suggestedName, effectiveMime, content);
    },

    async pickBackupFile(mimeType: string = 'application/json'): Promise<string | null> {
      const module = customModule ?? resolveNativeModule();
      if (!module || typeof module.openDocument !== 'function') {
        throw new Error('Native file picker module is not available on this platform.');
      }
      return module.openDocument(mimeType);
    },
  };
}

export const defaultFileBridge = createFileBridge();
