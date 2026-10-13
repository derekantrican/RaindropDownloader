import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import ApiService from './api';
import Logger from './logger';

const STORAGE_KEY = 'pendingRaindropDeletes';

// Raindrop bookmark deletes that failed for lack of network. Persisted so they survive
// an app restart, and retried on launch, on reconnect, and when the Downloads screen opens.
class PendingDeletes {
  constructor() {
    this.items = [];
    this.listeners = new Set();
    this.processing = null;
    this.loaded = this._load();
  }

  async _load() {
    try {
      const saved = await AsyncStorage.getItem(STORAGE_KEY);
      this.items = saved ? JSON.parse(saved) : [];
    } catch (e) {
      this.items = [];
    }
    this._notify();
  }

  async _save() {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.items));
    this._notify();
  }

  _notify() {
    this.listeners.forEach((fn) => fn(this.items.length));
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  get count() {
    return this.items.length;
  }

  async enqueue(raindropId, title) {
    await this.loaded;
    if (this.items.some((i) => i.raindropId === raindropId)) return;
    this.items.push({ raindropId, title });
    await this._save();
    Logger.log(`Queued Raindrop delete for "${title}" (offline)`);
  }

  // Runs the queue in order; stops at the first failure since the rest would likely fail too
  process() {
    if (!this.processing) {
      this.processing = this._process().finally(() => { this.processing = null; });
    }
    return this.processing;
  }

  async _process() {
    await this.loaded;
    if (this.items.length === 0) return;
    Logger.log(`Processing ${this.items.length} queued Raindrop delete(s)`);
    while (this.items.length > 0) {
      const item = this.items[0];
      try {
        await ApiService.deleteBookmark(item.raindropId);
      } catch (error) {
        if (error.isNetworkError) {
          Logger.log('Still offline; Raindrop deletes remain queued');
        } else {
          Logger.error(`Queued Raindrop delete for "${item.title}" failed`, error);
        }
        return;
      }
      this.items.shift();
      await this._save();
    }
  }

  // Call once at startup: drain anything left from last session and retry whenever we reconnect
  start() {
    this.process();
    let wasConnected = true;
    return NetInfo.addEventListener((state) => {
      const connected = state.isConnected && state.isInternetReachable !== false;
      if (connected && !wasConnected) this.process();
      wasConnected = connected;
    });
  }
}

export default new PendingDeletes();
