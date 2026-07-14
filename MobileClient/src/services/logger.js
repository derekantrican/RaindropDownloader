class Logger {
  constructor() {
    this.logs = [];
    this.listeners = new Set();
    this.maxLogs = 200;
  }

  log(message) {
    const entry = { timestamp: new Date().toLocaleTimeString(), level: 'INFO', message };
    this._add(entry);
  }

  error(message, error) {
    const detail = error ? `${message}: ${error.message || error}` : message;
    const entry = { timestamp: new Date().toLocaleTimeString(), level: 'ERROR', message: detail };
    this._add(entry);
  }

  warn(message) {
    const entry = { timestamp: new Date().toLocaleTimeString(), level: 'WARN', message };
    this._add(entry);
  }

  _add(entry) {
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }
    this.listeners.forEach((fn) => fn([...this.logs]));
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  clear() {
    this.logs = [];
    this.listeners.forEach((fn) => fn([]));
  }

  getLogs() {
    return [...this.logs];
  }
}

export default new Logger();
