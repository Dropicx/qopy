/*
 * Copyright (C) 2025 Qopy App
 * 
 * This file is part of Qopy.
 * 
 * Qopy is dual-licensed:
 * 
 * 1. GNU Affero General Public License v3.0 (AGPL-3.0)
 *    For open source use. See LICENSE-AGPL for details.
 * 
 * 2. Commercial License
 *    For proprietary/commercial use. Contact qopy@lit.services
 * 
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 */

/**
 * EventBus - Event-driven communication system
 * 
 * This service provides decoupled communication between UI, processing,
 * and business logic components following the Observer pattern.
 */
class EventBus {
    constructor() {
        this.listeners = new Map();
        this.history = [];
        this.maxHistorySize = 1000;
        this.debugging = false;
    }

    /**
     * Subscribe to an event
     * @param {string} event - Event name
     * @param {Function} callback - Callback function
     * @param {Object} options - Subscription options
     * @returns {Function} Unsubscribe function
     */
    on(event, callback, options = {}) {
        if (typeof callback !== 'function') {
            throw new Error('Callback must be a function');
        }

        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }

        const listener = {
            callback,
            once: options.once || false,
            priority: options.priority || 0,
            id: this.generateListenerId(),
            subscribedAt: Date.now()
        };

        const listeners = this.listeners.get(event);
        listeners.push(listener);

        // Sort by priority (higher priority first)
        listeners.sort((a, b) => b.priority - a.priority);

        this.log(`Subscribed to '${event}' (ID: ${listener.id})`);

        // Return unsubscribe function
        return () => this.off(event, listener.id);
    }

    /**
     * Subscribe to an event that fires only once
     * @param {string} event - Event name
     * @param {Function} callback - Callback function
     * @param {Object} options - Subscription options
     * @returns {Function} Unsubscribe function
     */
    once(event, callback, options = {}) {
        return this.on(event, callback, { ...options, once: true });
    }

    /**
     * Unsubscribe from an event
     * @param {string} event - Event name
     * @param {string|Function} callbackOrId - Callback function or listener ID
     */
    off(event, callbackOrId) {
        if (!this.listeners.has(event)) {
            return;
        }

        const listeners = this.listeners.get(event);
        let removedCount = 0;

        if (typeof callbackOrId === 'string') {
            // Remove by ID
            const index = listeners.findIndex(l => l.id === callbackOrId);
            if (index !== -1) {
                listeners.splice(index, 1);
                removedCount = 1;
            }
        } else if (typeof callbackOrId === 'function') {
            // Remove by callback function
            for (let i = listeners.length - 1; i >= 0; i--) {
                if (listeners[i].callback === callbackOrId) {
                    listeners.splice(i, 1);
                    removedCount++;
                }
            }
        }

        if (listeners.length === 0) {
            this.listeners.delete(event);
        }

        if (removedCount > 0) {
            this.log(`Unsubscribed from '${event}' (${removedCount} listeners removed)`);
        }
    }

    /**
     * Emit an event to all subscribers
     * @param {string} event - Event name
     * @param {*} data - Event data
     * @returns {Promise<Array>} Array of callback results
     */
    async emit(event, data = null) {
        const eventInfo = {
            event,
            data,
            timestamp: Date.now(),
            id: this.generateEventId()
        };

        this.addToHistory(eventInfo);
        this.log(`Emitting '${event}' with data:`, data);

        if (!this.listeners.has(event)) {
            this.log(`No listeners for '${event}'`);
            return [];
        }

        const listeners = [...this.listeners.get(event)];
        const results = [];
        const onceListeners = [];

        for (const listener of listeners) {
            try {
                const result = await listener.callback(data, eventInfo);
                results.push(result);

                if (listener.once) {
                    onceListeners.push(listener.id);
                }

            } catch (error) {
                console.error(`Error in event listener for '${event}':`, error);
                results.push({ error: error.message });
            }
        }

        // Remove 'once' listeners
        onceListeners.forEach(id => this.off(event, id));

        this.log(`Emitted '${event}' to ${listeners.length} listeners`);
        return results;
    }

    /**
     * Emit an event synchronously
     * @param {string} event - Event name
     * @param {*} data - Event data
     * @returns {Array} Array of callback results
     */
    emitSync(event, data = null) {
        const eventInfo = {
            event,
            data,
            timestamp: Date.now(),
            id: this.generateEventId()
        };

        this.addToHistory(eventInfo);
        this.log(`Emitting sync '${event}' with data:`, data);

        if (!this.listeners.has(event)) {
            this.log(`No listeners for '${event}'`);
            return [];
        }

        const listeners = [...this.listeners.get(event)];
        const results = [];
        const onceListeners = [];

        for (const listener of listeners) {
            try {
                const result = listener.callback(data, eventInfo);
                results.push(result);

                if (listener.once) {
                    onceListeners.push(listener.id);
                }

            } catch (error) {
                console.error(`Error in sync event listener for '${event}':`, error);
                results.push({ error: error.message });
            }
        }

        // Remove 'once' listeners
        onceListeners.forEach(id => this.off(event, id));

        this.log(`Emitted sync '${event}' to ${listeners.length} listeners`);
        return results;
    }

    /**
     * Remove all listeners for an event or all events
     * @param {string} [event] - Optional event name, if not provided removes all
     */
    removeAllListeners(event = null) {
        if (event) {
            this.listeners.delete(event);
            this.log(`Removed all listeners for '${event}'`);
        } else {
            this.listeners.clear();
            this.log('Removed all listeners for all events');
        }
    }

    /**
     * Get list of events with listeners
     * @returns {Array<string>} Array of event names
     */
    getEvents() {
        return Array.from(this.listeners.keys());
    }

    /**
     * Get listener count for an event
     * @param {string} event - Event name
     * @returns {number} Number of listeners
     */
    getListenerCount(event) {
        return this.listeners.has(event) ? this.listeners.get(event).length : 0;
    }

    /**
     * Check if event has listeners
     * @param {string} event - Event name
     * @returns {boolean} True if has listeners
     */
    hasListeners(event) {
        return this.getListenerCount(event) > 0;
    }

    /**
     * Get event history
     * @param {number} [limit] - Maximum number of events to return
     * @returns {Array} Array of historical events
     */
    getHistory(limit = null) {
        const history = [...this.history];
        return limit ? history.slice(-limit) : history;
    }

    /**
     * Clear event history
     */
    clearHistory() {
        this.history = [];
        this.log('Event history cleared');
    }

    /**
     * Enable or disable debugging
     * @param {boolean} enabled - Whether to enable debugging
     */
    setDebugging(enabled) {
        this.debugging = enabled;
        this.log(`Debugging ${enabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * Get debugging status
     * @returns {boolean} Whether debugging is enabled
     */
    isDebugging() {
        return this.debugging;
    }

    /**
     * Create a namespaced event bus
     * @param {string} namespace - Namespace prefix
     * @returns {Object} Namespaced event bus methods
     */
    namespace(namespace) {
        return {
            on: (event, callback, options) => 
                this.on(`${namespace}:${event}`, callback, options),
            once: (event, callback, options) => 
                this.once(`${namespace}:${event}`, callback, options),
            off: (event, callbackOrId) => 
                this.off(`${namespace}:${event}`, callbackOrId),
            emit: (event, data) => 
                this.emit(`${namespace}:${event}`, data),
            emitSync: (event, data) => 
                this.emitSync(`${namespace}:${event}`, data)
        };
    }

    /**
     * Wait for an event to be emitted
     * @param {string} event - Event name to wait for
     * @param {number} [timeout] - Optional timeout in milliseconds
     * @returns {Promise} Promise that resolves with event data
     */
    waitFor(event, timeout = null) {
        return new Promise((resolve, reject) => {
            let timeoutId = null;

            const unsubscribe = this.once(event, (data) => {
                if (timeoutId) {
                    clearTimeout(timeoutId);
                }
                resolve(data);
            });

            if (timeout) {
                timeoutId = setTimeout(() => {
                    unsubscribe();
                    reject(new Error(`Timeout waiting for event '${event}'`));
                }, timeout);
            }
        });
    }

    /**
     * Utility methods
     */

    addToHistory(eventInfo) {
        this.history.push(eventInfo);
        
        // Limit history size
        if (this.history.length > this.maxHistorySize) {
            this.history.shift();
        }
    }

    generateEventId() {
        return `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    generateListenerId() {
        return `listener_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    log(message, ...args) {
        if (this.debugging) {
            console.log(`[EventBus] ${message}`, ...args);
        }
    }

    /**
     * Get current statistics
     * @returns {Object} EventBus statistics
     */
    getStats() {
        const events = this.getEvents();
        const totalListeners = events.reduce((sum, event) => 
            sum + this.getListenerCount(event), 0);

        return {
            totalEvents: events.length,
            totalListeners,
            historySize: this.history.length,
            debugging: this.debugging,
            events: events.map(event => ({
                name: event,
                listeners: this.getListenerCount(event)
            }))
        };
    }
}

module.exports = EventBus;