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
var scheduler = {
    
    /** @private */
    _timeoutId: null,
    
    /** @private */
    _totalPostponingSeconds: 0,
    
    config: {
        /**
         * Postponing time. If it is zero, the callback is always executed immediately. 
         */
        buffer_seconds: 0,
        /**
         * If is defined, postponning is limited to this total time.
         * So when the new postponings are request and it will exceed this value, it will be ignored. 
         */
        buffer_max_seconds: 60,
    },

    /**
     * Plan postponed execution of callback function.
     * If some plan exists, it will be cancelled.
     * 
     * @param {function} callback
     */
    schedule: function(callback) {
        if (this.config.buffer_max_seconds && (this.config.buffer_max_seconds <= this._totalPostponingSeconds + this.config.buffer_seconds)) {
            // Max buffer time reached. Do not replan sending.
            return;
        }
        
        // If previous sending is planned, cancel it.        
        if (this._timeoutId) {
            clearTimeout(this._timeoutId);
        }
        // Plan the message sending after timeout
        var self = this;
        this._timeoutId = setTimeout(function() {
            self._timeoutId = null;
            self._totalPostponingSeconds = 0;
            
            callback();
        }, this.config.buffer_seconds * 1000);
        this._totalPostponingSeconds += this.config.buffer_seconds;
        
    },
    
};

module.exports = scheduler;
