import * as vscode from 'vscode';

export class SecureStorage {
  private storage: vscode.SecretStorage;

  constructor(storage: vscode.SecretStorage) {
    this.storage = storage;
  }

  async set(key: string, value: string): Promise<void> {
    await this.storage.store(key, value);
  }

  async get(key: string): Promise<string | undefined> {
    return this.storage.get(key);
  }

  async delete(key: string): Promise<void> {
    await this.storage.delete(key);
  }
}
