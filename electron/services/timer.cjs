class SleepTimer {
  constructor() {
    this.timer = null;
    this.endsAt = 0;
    this.onFire = null;
  }

  start(minutes, onFire) {
    this.cancel();
    this.onFire = onFire;
    const ms = Math.max(1, Number(minutes) || 1) * 60 * 1000;
    this.endsAt = Date.now() + ms;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.endsAt = 0;
      if (typeof this.onFire === 'function') this.onFire();
    }, ms);
  }

  cancel() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.endsAt = 0;
  }

  status() {
    if (!this.timer || !this.endsAt) {
      return { isActive: false, remainingSeconds: 0 };
    }
    const remainingSeconds = Math.max(0, Math.ceil((this.endsAt - Date.now()) / 1000));
    return { isActive: remainingSeconds > 0, remainingSeconds };
  }
}

module.exports = { SleepTimer };
