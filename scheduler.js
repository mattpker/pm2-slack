'use strict';


/**
 * Adds ability to postpone the execution of some function.
 * If new postpone is requested, old schedule will be cancelling. So max. one schedule can exists in one time.
 * 
 * Configuration:
 * 
 * - Postponing time is defined in `this.config.buffer_seconds`.
 * - 
 */
function Scheduler(config) {
    const self = this;
    
    /** @private */
    self._timeoutId = null;
    
    /** @private */
    self._totalPostponingSeconds = 0;
    
    
    /**
     * @property {number} buffer_seconds - Postponing time. If it is zero, the callback is always executed immediately.
     * 
     * @property {number} buffer_max_seconds - If is defined, postponning is limited to this total time.
     *     So when the new postponings are request and it will exceed this value, it will be ignored. 
     */
    self.config = config;
};


/**
 * Plan the postponed execution of callback function.
 * If some plan exists, it will be cancelled and replaced by the new one.
 * 
 * @param {function} callback
 */
Scheduler.prototype.schedule = function(callback) {
    const self = this;
    
    if (self.config.buffer_max_seconds && (self.config.buffer_max_seconds <= self._totalPostponingSeconds + self.config.buffer_seconds)) {
        // Max buffer time reached. Do not replan sending.
        return;
    }
    
    // If previous sending is planned, cancel it.        
    if (self._timeoutId) {
        clearTimeout(this._timeoutId);
    }
    // Plan the message sending after timeout
    self._timeoutId = setTimeout(function() {
        self._timeoutId = null;
        self._totalPostponingSeconds = 0;
        
        callback();
    }, self.config.buffer_seconds * 1000);
    self._totalPostponingSeconds += this.config.buffer_seconds;
    
};
    

module.exports = Scheduler;
