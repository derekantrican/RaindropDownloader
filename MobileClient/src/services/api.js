import Logger from './logger';
import { NativeModules, NativeEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { YtDlpModule } = NativeModules;
const ytDlpEmitter = new NativeEventEmitter(YtDlpModule);

class ApiService {
  constructor() {
    this.testToken = null;
  }

  setTestToken(token) {
    this.testToken = token;
  }

  async getBookmarks() {
    if (!this.testToken) throw new Error('No test token configured. Set it in Settings.');

    // Load filter setting
    let filterVideosOnly = true;
    try {
      const saved = await AsyncStorage.getItem('settings');
      if (saved) {
        const settings = JSON.parse(saved);
        filterVideosOnly = settings.raindropFilter !== 'all';
      }
    } catch (e) { /* use default */ }

    const allBookmarks = [];
    let page = 0;
    let hasMore = true;

    Logger.log('Fetching bookmarks from Raindrop.io...');

    while (hasMore) {
      const response = await fetch(
        `https://api.raindrop.io/rest/v1/raindrops/0?page=${page}&perpage=50`,
        { headers: { Authorization: `Bearer ${this.testToken}` } }
      );

      if (response.status === 401) throw new Error('Test token is invalid or expired');
      if (!response.ok) throw new Error(`API error: ${response.status}`);

      const data = await response.json();
      if (!data.items || data.items.length === 0) {
        hasMore = false;
      } else {
        const filtered = filterVideosOnly
          ? data.items.filter((item) => item.type === 'video')
          : data.items;
        allBookmarks.push(
          ...filtered.map((item) => ({
            id: item._id,
            title: item.title,
            link: item.link,
            excerpt: item.excerpt,
            cover: item.cover,
            created: item.created,
            lastUpdate: item.lastUpdate,
            tags: item.tags,
            type: item.type,
          }))
        );
        Logger.log(`Page ${page}: ${data.items.length} items, ${filtered.length} matched filter`);
        hasMore = data.items.length === 50;
        page++;
      }
    }

    Logger.log(`Found ${allBookmarks.length} bookmarks total`);
    return allBookmarks;
  }

  async getVideoInfo(videoUrl) {
    Logger.log(`Getting info for: ${videoUrl}`);
    try {
      const info = await YtDlpModule.getVideoInfo(videoUrl);
      Logger.log(`Video: "${info.title}" by ${info.uploader} (${info.duration}s)`);
      return info;
    } catch (e) {
      Logger.error('getVideoInfo failed', e);
      throw e;
    }
  }

  getProgressEmitter() {
    return ytDlpEmitter;
  }
}

export default new ApiService();

