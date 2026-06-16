/**
 * Python 包管理器
 * 管理内嵌 Python 环境的 pip 配置和包安装
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';

const execFileAsync = promisify(execFile);

export interface PythonConfig {
  enabled: boolean;
  mirrorUrl?: string;
  trustedHost?: string;
  timeout?: number;
  autoInstall?: boolean;
}

export interface PackageInstallResult {
  success: boolean;
  output: string;
}

export interface ScriptExecResult {
  success: boolean;
  stdout: string;
  stderr: string;
}

export interface EnsurePackagesResult {
  installed: string[];
  failed: string[];
  skipped: string[];
}

export class PythonPackageManager {
  private pythonPath: string;
  private config: PythonConfig;

  constructor(pythonPath: string, config: PythonConfig) {
    this.pythonPath = pythonPath;
    this.config = config;
  }

  /** Get the embedded Python executable path */
  getPythonPath(): string {
    return this.pythonPath;
  }

  /** Get current configuration */
  getConfig(): PythonConfig {
    return { ...this.config };
  }

  /** Update configuration (also updates pip.ini if mirrorUrl is set) */
  async updateConfig(config: PythonConfig): Promise<void> {
    this.config = config;
    await this.updatePipConfig();
  }

  /** Check if Python is available */
  async isAvailable(): Promise<boolean> {
    try {
      await fs.promises.access(this.pythonPath, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }

  /** Generate pip.ini with mirror config */
  async updatePipConfig(): Promise<void> {
    if (!this.config.mirrorUrl) return;

    const pipConfDir = path.dirname(this.pythonPath);
    const pipConfPath = path.join(pipConfDir, 'pip.ini');

    // Derive trusted-host from mirrorUrl if not explicitly set
    const trustedHost = this.config.trustedHost || this.extractHostname(this.config.mirrorUrl);

    const content = `[global]
index-url = ${this.config.mirrorUrl}
trusted-host = ${trustedHost}
timeout = ${this.config.timeout || 120}`;

    await fs.promises.writeFile(pipConfPath, content, 'utf-8');
    console.log('[PythonPackageManager] pip.ini updated:', pipConfPath);
  }

  /** Install a package using pip */
  async installPackage(packageName: string): Promise<PackageInstallResult> {
    try {
      const args = ['-m', 'pip', 'install', packageName];
      if (this.config.mirrorUrl) {
        args.push('-i', this.config.mirrorUrl);
        if (this.config.trustedHost) {
          args.push('--trusted-host', this.config.trustedHost);
        }
      }
      const timeout = (this.config.timeout || 120) * 1000;
      const { stdout, stderr } = await execFileAsync(this.pythonPath, args, { timeout });
      return { success: true, output: stdout + stderr };
    } catch (error: any) {
      return { success: false, output: error.message };
    }
  }

  /** Uninstall a package */
  async uninstallPackage(packageName: string): Promise<PackageInstallResult> {
    try {
      const args = ['-m', 'pip', 'uninstall', '-y', packageName];
      const timeout = (this.config.timeout || 120) * 1000;
      const { stdout, stderr } = await execFileAsync(this.pythonPath, args, { timeout });
      return { success: true, output: stdout + stderr };
    } catch (error: any) {
      return { success: false, output: error.message };
    }
  }

  /** Check if a package is installed by trying to import it */
  async isPackageInstalled(packageName: string): Promise<boolean> {
    try {
      await execFileAsync(this.pythonPath, ['-c', `import ${packageName}`], { timeout: 10000 });
      return true;
    } catch {
      return false;
    }
  }

  /** List installed packages */
  async listPackages(): Promise<string> {
    try {
      const { stdout } = await execFileAsync(this.pythonPath, ['-m', 'pip', 'list', '--format=columns'], { timeout: 30000 });
      return stdout;
    } catch (error: any) {
      return `Error: ${error.message}`;
    }
  }

  /** Install missing packages; returns results grouped by status */
  async ensurePackages(packages: string[]): Promise<EnsurePackagesResult> {
    const installed: string[] = [];
    const failed: string[] = [];
    const skipped: string[] = [];

    for (const pkg of packages) {
      const isInstalled = await this.isPackageInstalled(pkg);
      if (isInstalled) {
        skipped.push(pkg);
        continue;
      }

      console.log(`[PythonPackageManager] Installing ${pkg}...`);
      const result = await this.installPackage(pkg);
      if (result.success) {
        installed.push(pkg);
        console.log(`[PythonPackageManager] Installed ${pkg}`);
      } else {
        failed.push(pkg);
        console.error(`[PythonPackageManager] Failed to install ${pkg}:`, result.output);
      }
    }

    return { installed, failed, skipped };
  }

  /** Execute a Python script file */
  async executeScript(scriptPath: string, args: string[] = []): Promise<ScriptExecResult> {
    try {
      const timeout = (this.config.timeout || 120) * 1000;
      const { stdout, stderr } = await execFileAsync(this.pythonPath, [scriptPath, ...args], { timeout });
      return { success: true, stdout, stderr };
    } catch (error: any) {
      return { success: false, stdout: error.stdout || '', stderr: error.stderr || error.message };
    }
  }

  /** Execute a Python code string (python -c "...") */
  async executeCode(code: string): Promise<ScriptExecResult> {
    try {
      const { stdout, stderr } = await execFileAsync(this.pythonPath, ['-c', code], { timeout: 30000 });
      return { success: true, stdout, stderr };
    } catch (error: any) {
      return { success: false, stdout: error.stdout || '', stderr: error.stderr || error.message };
    }
  }

  /** Extract hostname from a URL string */
  private extractHostname(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      // Fallback: naive extraction
      const match = url.match(/^https?:\/\/([^:/]+)/);
      return match ? match[1] : url;
    }
  }
}

// ==================== Global singleton via Symbol ====================

const PYTHON_PACKAGE_MANAGER_KEY = Symbol.for('zero-employee:pythonPackageManager');

/**
 * Get the global PythonPackageManager instance
 */
export function getPythonPackageManager(): PythonPackageManager | null {
  return (globalThis as any)[PYTHON_PACKAGE_MANAGER_KEY] || null;
}

/**
 * Set the global PythonPackageManager instance
 */
export function setPythonPackageManager(manager: PythonPackageManager): void {
  (globalThis as any)[PYTHON_PACKAGE_MANAGER_KEY] = manager;
}
