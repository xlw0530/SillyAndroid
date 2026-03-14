import RNFS from 'react-native-fs';
import { unzip } from 'react-native-zip-archive';

// ==================== 配置区 ====================

// 多镜像源支持（按优先级排列，第一个失败会自动尝试下一个）
const UPDATE_SERVERS = [
  'http://114.66.53.192:8080/updates',      // 主服务器
  // 'https://your-backup-server.com/updates', // 备用服务器1（取消注释并填入备用地址）
  // 'https://cdn.example.com/updates',        // 备用服务器2（如 CDN 或 OSS）
];

// 超时和速度配置
const TIMEOUT_CONFIG = {
  CHECK_TIMEOUT: 10000,       // 版本检查超时 (毫秒) - 10秒
  DOWNLOAD_TIMEOUT: 15000,    // 下载初始连接超时 (毫秒) - 15秒
  STALL_CHECK_INTERVAL: 5000, // 下载停滞检测间隔 (毫秒) - 每5秒检查一次
  STALL_THRESHOLD: 5000,      // 下载停滞阈值 (毫秒) - 5秒内无进度视为停滞
  MIN_SPEED_BYTES: 10 * 1024, // 最低可接受速度 (bytes/s) - 10KB/s
};

// ==================== 内部状态 ====================

// 当前使用的服务器索引
let currentServerIndex = 0;

// 获取当前服务器地址
const getUpdateServer = () => UPDATE_SERVERS[currentServerIndex];
const getVersionFile = () => `${getUpdateServer()}/version.json`;
const getPayloadUrl = () => `${getUpdateServer()}/payload.zip`;

// 切换到下一个服务器
const switchToNextServer = (): boolean => {
  if (currentServerIndex < UPDATE_SERVERS.length - 1) {
    currentServerIndex++;
    console.log(`[UpdateManager] Switching to backup server: ${getUpdateServer()}`);
    return true;
  }
  return false;
};

// 重置为主服务器
const resetToMainServer = () => {
  currentServerIndex = 0;
};

// 带超时的 fetch 封装
const fetchWithTimeout = async (url: string, timeoutMs: number): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'Cache-Control': 'no-cache' },
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Connection timeout after ${timeoutMs}ms`);
    }
    throw error;
  }
};

// 本地路径
const APP_DIR = RNFS.DocumentDirectoryPath;
const CURRENT_DIR = `${APP_DIR}/SillyTavern`;
const BACKUP_DIR = `${APP_DIR}/SillyTavern.backup`;
const NEW_DIR = `${APP_DIR}/SillyTavern.new`;
const TEMP_ZIP = `${RNFS.CachesDirectoryPath}/update.zip`;
const LOCAL_VERSION_FILE = `${CURRENT_DIR}/version.json`;

interface VersionInfo {
  version: string;
  buildNumber: number;
  changelog?: string;
  fileSize?: number;
  md5?: string;
}

export class UpdateManager {
  // 获取本地版本号
  static async getLocalVersion(): Promise<VersionInfo | null> {
    try {
      const exists = await RNFS.exists(LOCAL_VERSION_FILE);
      if (!exists) return null;
      const content = await RNFS.readFile(LOCAL_VERSION_FILE, 'utf8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  // 检查远程版本（支持多服务器故障转移 + 超时检测）
  static async checkUpdate(): Promise<{ hasUpdate: boolean; remote: VersionInfo | null }> {
    resetToMainServer(); // 每次检查从主服务器开始

    while (true) {
      try {
        console.log(`[UpdateManager] Checking update from: ${getVersionFile()}`);
        const response = await fetchWithTimeout(
          getVersionFile(),
          TIMEOUT_CONFIG.CHECK_TIMEOUT,
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const remote: VersionInfo = await response.json();
        const local = await this.getLocalVersion();

        const hasUpdate = !local || remote.buildNumber > local.buildNumber;
        return { hasUpdate, remote };
      } catch (error) {
        console.error(`[UpdateManager] Check update failed from ${getUpdateServer()}:`, error);
        // 尝试切换到下一个服务器
        if (!switchToNextServer()) {
          // 没有更多服务器可尝试
          console.error('[UpdateManager] All update servers failed');
          return { hasUpdate: false, remote: null };
        }
      }
    }
  }

  // 下载更新包（支持多服务器故障转移 + 超时/停滞检测）
  static async downloadUpdate(
    onProgress: (progress: number) => void,
  ): Promise<boolean> {
    while (true) {
      try {
        // 清理旧的临时文件
        if (await RNFS.exists(TEMP_ZIP)) {
          await RNFS.unlink(TEMP_ZIP);
        }

        console.log(`[UpdateManager] Downloading update from: ${getPayloadUrl()}`);

        // 用于停滞检测的状态
        let lastBytesWritten = 0;
        let lastProgressTime = Date.now();
        let downloadJobId: number | null = null;
        let isStalled = false;

        // 停滞检测定时器
        const stallChecker = setInterval(() => {
          const now = Date.now();
          const timeSinceLastProgress = now - lastProgressTime;

          if (timeSinceLastProgress > TIMEOUT_CONFIG.STALL_THRESHOLD) {
            console.warn(
              `[UpdateManager] Download stalled for ${timeSinceLastProgress}ms, cancelling...`,
            );
            isStalled = true;
            if (downloadJobId !== null) {
              RNFS.stopDownload(downloadJobId);
            }
          }
        }, TIMEOUT_CONFIG.STALL_CHECK_INTERVAL);

        // 下载超时定时器（初始连接超时）
        const downloadTimeout = setTimeout(() => {
          if (lastBytesWritten === 0) {
            console.warn('[UpdateManager] Download connection timeout, cancelling...');
            isStalled = true;
            if (downloadJobId !== null) {
              RNFS.stopDownload(downloadJobId);
            }
          }
        }, TIMEOUT_CONFIG.DOWNLOAD_TIMEOUT);

        // 开始下载
        const download = RNFS.downloadFile({
          fromUrl: getPayloadUrl(),
          toFile: TEMP_ZIP,
          progress: res => {
            // 更新停滞检测状态
            if (res.bytesWritten > lastBytesWritten) {
              lastBytesWritten = res.bytesWritten;
              lastProgressTime = Date.now();
            }
            const progress = res.bytesWritten / res.contentLength;
            onProgress(progress);
          },
          connectionTimeout: TIMEOUT_CONFIG.DOWNLOAD_TIMEOUT,
          readTimeout: TIMEOUT_CONFIG.STALL_THRESHOLD,
        });

        downloadJobId = download.jobId;

        try {
          const result = await download.promise;
          clearInterval(stallChecker);
          clearTimeout(downloadTimeout);

          if (isStalled) {
            throw new Error('Download stalled or timed out');
          }

          if (result.statusCode === 200) {
            console.log('[UpdateManager] Download completed successfully');
            return true;
          } else {
            throw new Error(`HTTP ${result.statusCode}`);
          }
        } catch (downloadError) {
          clearInterval(stallChecker);
          clearTimeout(downloadTimeout);
          throw downloadError;
        }
      } catch (error) {
        console.error(`[UpdateManager] Download failed from ${getUpdateServer()}:`, error);
        // 尝试切换到下一个服务器
        if (!switchToNextServer()) {
          // 没有更多服务器可尝试
          console.error('[UpdateManager] All download servers failed');
          return false;
        }
        // 重置进度
        onProgress(0);
      }
    }
  }

  // 安装更新（解压 + 替换）
  static async installUpdate(): Promise<boolean> {
    try {
      // 1. 解压到临时目录
      if (await RNFS.exists(NEW_DIR)) {
        await RNFS.unlink(NEW_DIR);
      }
      await unzip(TEMP_ZIP, NEW_DIR);

      // 2. 验证解压结果（检查关键文件）
      const serverJsExists = await RNFS.exists(`${NEW_DIR}/server.js`);
      if (!serverJsExists) {
        throw new Error('Invalid package: server.js not found');
      }

      // 3. 备份当前版本
      if (await RNFS.exists(CURRENT_DIR)) {
        if (await RNFS.exists(BACKUP_DIR)) {
          await RNFS.unlink(BACKUP_DIR);
        }
        await RNFS.moveFile(CURRENT_DIR, BACKUP_DIR);
      }

      // 4. 部署新版本
      await RNFS.moveFile(NEW_DIR, CURRENT_DIR);

      // 5. 清理下载文件
      await RNFS.unlink(TEMP_ZIP);

      return true;
    } catch (error) {
      console.error('Install failed:', error);
      // 尝试回滚
      await this.rollback();
      return false;
    }
  }

  // 回滚到备份版本
  static async rollback(): Promise<void> {
    try {
      if (await RNFS.exists(BACKUP_DIR)) {
        if (await RNFS.exists(CURRENT_DIR)) {
          await RNFS.unlink(CURRENT_DIR);
        }
        await RNFS.moveFile(BACKUP_DIR, CURRENT_DIR);
      }
    } catch (error) {
      console.error('Rollback failed:', error);
    }
  }

  // 清理备份（更新成功后调用）
  static async cleanBackup(): Promise<void> {
    try {
      if (await RNFS.exists(BACKUP_DIR)) {
        await RNFS.unlink(BACKUP_DIR);
      }
    } catch (error) {
      console.error('Clean backup failed:', error);
    }
  }
}
