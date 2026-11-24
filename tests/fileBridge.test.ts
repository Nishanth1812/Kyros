import { describe, expect, it } from 'bun:test';
import { createFileBridge, NativeFileModule } from '../src/lib/fileBridge';

describe('fileBridge', () => {
  it('saves file through native createDocument', async () => {
    let capturedArgs: any = null;
    const mockModule: NativeFileModule = {
      async createDocument(name, mime, content) {
        capturedArgs = { name, mime, content };
        return true;
      },
      async openDocument() {
        return null;
      },
    };

    const bridge = createFileBridge(mockModule);
    const result = await bridge.saveBackupFile('kyros-backup.json', '{"test":1}');

    expect(result).toBe(true);
    expect(capturedArgs).toEqual({
      name: 'kyros-backup.json',
      mime: 'application/json',
      content: '{"test":1}',
    });
  });

  it('handles user cancellation during file export', async () => {
    const mockModule: NativeFileModule = {
      async createDocument() {
        return false;
      },
      async openDocument() {
        return null;
      },
    };

    const bridge = createFileBridge(mockModule);
    const result = await bridge.saveBackupFile('kyros.json', '{}');
    expect(result).toBe(false);
  });

  it('opens and reads document through native openDocument', async () => {
    const mockModule: NativeFileModule = {
      async createDocument() {
        return false;
      },
      async openDocument(mime) {
        expect(mime).toBe('application/json');
        return '{"hello":"world"}';
      },
    };

    const bridge = createFileBridge(mockModule);
    const content = await bridge.pickBackupFile();
    expect(content).toBe('{"hello":"world"}');
  });

  it('handles user cancellation during file picker', async () => {
    const mockModule: NativeFileModule = {
      async createDocument() {
        return false;
      },
      async openDocument() {
        return null;
      },
    };

    const bridge = createFileBridge(mockModule);
    const content = await bridge.pickBackupFile();
    expect(content).toBeNull();
  });

  it('throws when native module is missing', async () => {
    const bridge = createFileBridge({} as any);
    await expect(bridge.saveBackupFile('a.json', '{}')).rejects.toThrow(
      'Native file export module is not available'
    );
    await expect(bridge.pickBackupFile()).rejects.toThrow(
      'Native file picker module is not available'
    );
  });
});
