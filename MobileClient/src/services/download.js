import { NativeModules } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFS from 'react-native-fs';
import Logger from './logger';

const { YtDlpModule } = NativeModules;

const QUALITY_FORMATS = {
  best: 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
  '1080p': 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best',
  '720p': 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best',
  '480p': 'bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480][ext=mp4]/best',
  '360p': 'bestvideo[height<=360][ext=mp4]+bestaudio[ext=m4a]/best[height<=360][ext=mp4]/best',
  'audio': 'bestaudio[ext=m4a]/bestaudio',
};

const AUDIO_EXTENSIONS = ['m4a', 'mp3', 'opus', 'ogg', 'aac', 'flac', 'wav'];
const MEDIA_EXTENSIONS = ['mp4', 'mkv', 'webm', 'mov', ...AUDIO_EXTENSIONS];

// yt-dlp leftovers that aren't finished downloads: partial files, per-format streams
// awaiting merge (e.g. "title.f137.mp4"), and intermediate post-processing files
const isIntermediateFile = (name) =>
  /\.(part|ytdl|temp|tmp)$/i.test(name) || /\.f\d+\.[^.]+$/i.test(name) || /\.temp\.[^.]+$/i.test(name);

// Maps downloaded file name -> Raindrop bookmark, so a file can be traced back to its bookmark
const INDEX_KEY = 'downloadIndex';
const fileNameOf = (path) => path.split('/').pop();

class DownloadService {
  constructor() {
    this.activeDownloads = new Set();
    // Serializes index writes — several downloads can finish at the same time
    this.indexWriteChain = Promise.resolve();
  }

  async getIndex() {
    try {
      const saved = await AsyncStorage.getItem(INDEX_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  }

  updateIndex(mutate) {
    this.indexWriteChain = this.indexWriteChain
      .then(async () => {
        const index = await this.getIndex();
        mutate(index);
        await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(index));
      })
      .catch((e) => Logger.error('Failed to update download index', e));
    return this.indexWriteChain;
  }

  async getDownloadOptions() {
    try {
      const saved = await AsyncStorage.getItem('settings');
      if (saved) {
        const settings = JSON.parse(saved);
        return {
          outputDir: settings.downloadLocation || null,
          format: QUALITY_FORMATS[settings.videoQuality || 'best'] || QUALITY_FORMATS.best,
          sponsorBlock: settings.sponsorBlock ?? false,
          preciseCuts: settings.preciseSponsorCuts ?? false,
        };
      }
    } catch (e) { /* use defaults */ }
    return {
      outputDir: null,
      format: QUALITY_FORMATS.best,
      sponsorBlock: false,
      preciseCuts: false,
    };
  }

  async getDownloadDir() {
    try {
      const saved = await AsyncStorage.getItem('settings');
      if (saved) {
        const settings = JSON.parse(saved);
        if (settings.downloadLocation) return settings.downloadLocation;
      }
    } catch (e) { /* use default */ }
    return RNFS.DownloadDirectoryPath;
  }

  // Finished media files in the download folder, newest first
  async listDownloads() {
    const dir = await this.getDownloadDir();
    if (!(await RNFS.exists(dir))) return [];
    const [entries, index] = await Promise.all([RNFS.readDir(dir), this.getIndex()]);
    return entries
      .filter((e) => e.isFile() && !isIntermediateFile(e.name))
      .map((e) => ({ entry: e, ext: e.name.split('.').pop().toLowerCase() }))
      .filter(({ ext }) => MEDIA_EXTENSIONS.includes(ext))
      .map(({ entry, ext }) => ({
        path: entry.path,
        name: entry.name,
        size: Number(entry.size),
        modified: entry.mtime ? new Date(entry.mtime) : null,
        isAudio: AUDIO_EXTENSIONS.includes(ext),
        raindropId: index[entry.name]?.raindropId ?? null,
      }))
      .sort((a, b) => (b.modified?.getTime() || 0) - (a.modified?.getTime() || 0));
  }

  async getThumbnail(path) {
    try {
      return await YtDlpModule.getThumbnail(path);
    } catch (e) {
      return null;
    }
  }

  async openFile(path) {
    Logger.log(`Opening ${path}`);
    await YtDlpModule.openFile(path);
  }

  async deleteFile(path) {
    await RNFS.unlink(path);
    Logger.log(`Deleted ${path}`);
    await this.updateIndex((index) => { delete index[fileNameOf(path)]; });
  }

  // Bookmark is gone, so stop linking the file to it
  async unlinkRaindrop(path) {
    await this.updateIndex((index) => { delete index[fileNameOf(path)]; });
  }

  async downloadVideo(item, onProgress) {
    const processId = `dl_${item.id}`;
    this.activeDownloads.add(processId);

    Logger.log(`Downloading "${item.title}" via yt-dlp`);
    Logger.log(`URL: ${item.link}`);

    const options = await this.getDownloadOptions();

    try {
      const result = await YtDlpModule.download(item.link, item.title, processId, options);
      this.activeDownloads.delete(processId);

      const outLines = result.out || '';
      const hasDownloaded = outLines.includes('[download] 100%') ||
        outLines.includes('has already been downloaded') ||
        outLines.includes('[Merger] Merging formats') ||
        outLines.includes('[download] 100% of');

      if (result.success || hasDownloaded) {
        Logger.log(`Download complete: "${item.title}"`);

        const mergeMatch = outLines.match(/\[Merger\] Merging formats into "(.+)"/);
        const destMatch = outLines.match(/Destination: (.+)/);
        const alreadyMatch = outLines.match(/\[download\] (.+) has already been downloaded/);
        const filePath = mergeMatch?.[1] || destMatch?.[1] || alreadyMatch?.[1] || '';

        if (filePath) {
          Logger.log(`Saved to: ${filePath}`);
          await this.updateIndex((index) => {
            index[fileNameOf(filePath)] = { raindropId: item.id, title: item.title };
          });
        }

        return { success: true, path: filePath };
      } else {
        const errMsg = result.err || outLines;
        Logger.error(`yt-dlp failed (exit code ${result.exitCode}): ${errMsg.substring(0, 200)}`);
        return { success: false, error: `Exit code ${result.exitCode}` };
      }
    } catch (error) {
      this.activeDownloads.delete(processId);
      if (error.code === 'YTDLP_CANCELLED') {
        Logger.log(`Download cancelled: "${item.title}"`);
        return { success: false, error: 'Cancelled' };
      }
      Logger.error(`Download exception for "${item.title}": ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async stopDownload(itemId) {
    const processId = `dl_${itemId}`;
    if (this.activeDownloads.has(processId)) {
      await YtDlpModule.cancelDownload(processId);
      this.activeDownloads.delete(processId);
    }
  }

  async stopAll() {
    const promises = [...this.activeDownloads].map((processId) =>
      YtDlpModule.cancelDownload(processId).catch(() => {})
    );
    await Promise.all(promises);
    this.activeDownloads.clear();
  }

  get activeCount() {
    return this.activeDownloads.size;
  }
}

export default new DownloadService();
