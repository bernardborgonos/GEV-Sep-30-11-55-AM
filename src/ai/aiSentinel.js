/**
 * @module aiSentinel
 * @description Tracks Gemini API usage, detects rate limits (429 errors), manages cooling states, and supports simulation.
 */

export class GeminiSentinel {
  constructor() {
    this.usageCount = 0;
    this.errorCount = 0;
    this.isRateLimited = false;
    this.cooldownSeconds = 0;
    this.cooldownInterval = null;
    this.modelUsage = {};
    this.lastErrorMsg = '';
  }

  trackCall(modelName = 'gemini-3.5-flash') {
    this.usageCount++;
    this.modelUsage[modelName] = (this.modelUsage[modelName] || 0) + 1;
  }

  trackError(error, modelName = 'gemini-3.5-flash') {
    this.errorCount++;
    const errMsg = error?.message || String(error);
    this.lastErrorMsg = errMsg;
    
    if (this.isRateLimitError(error)) {
      this.triggerRateLimit();
    }
  }

  triggerRateLimit(duration = 60) {
    this.isRateLimited = true;
    this.cooldownSeconds = duration;
    
    if (this.cooldownInterval) {
      clearInterval(this.cooldownInterval);
    }
    
    this.cooldownInterval = setInterval(() => {
      if (this.cooldownSeconds > 0) {
        this.cooldownSeconds--;
      } else {
        this.clearRateLimit();
      }
    }, 1000);
    
    console.error(`[GeminiSentinel] Rate limit activated. Cooldown: ${duration}s`);
  }

  clearRateLimit() {
    this.isRateLimited = false;
    this.cooldownSeconds = 0;
    if (this.cooldownInterval) {
      clearInterval(this.cooldownInterval);
      this.cooldownInterval = null;
    }
    console.info('[GeminiSentinel] Rate limit cleared.');
  }

  isRateLimitError(error) {
    const message = String(error?.message || error || '');
    return (
      message.includes('429') || 
      message.includes('quota') || 
      message.includes('RESOURCE_EXHAUSTED') ||
      message.includes('exhausted')
    );
  }

  getStats() {
    return {
      usageCount: this.usageCount,
      errorCount: this.errorCount,
      isRateLimited: this.isRateLimited,
      cooldownSeconds: this.cooldownSeconds,
      modelUsage: this.modelUsage,
      lastErrorMsg: this.lastErrorMsg,
    };
  }

  /**
   * Diagnostic simulation hooks for UI/testing
   */
  simulateCall() {
    this.trackCall('gemini-3.5-flash');
  }

  simulateRateLimit() {
    this.trackError(new Error('RESOURCE_EXHAUSTED: Quota exceeded for metric generativelanguage.googleapis.com'));
  }

  resetAll() {
    this.usageCount = 0;
    this.errorCount = 0;
    this.clearRateLimit();
    this.modelUsage = {};
    this.lastErrorMsg = '';
  }
}

export const sentinel = new GeminiSentinel();
