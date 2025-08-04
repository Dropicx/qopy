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
 * UIHelpers - Centralized UI manipulation utilities
 * Eliminates DRY violations for common UI operations
 */
export class UIHelpers {
    /**
     * Show password section by removing 'hidden' class and ensuring visibility
     * @returns {boolean} true if operation successful, false otherwise
     */
    static showPasswordSection() {
        const passwordSection = document.getElementById('password-section');
        const passwordInput = document.getElementById('retrieve-password-input');
        
        if (passwordSection && passwordInput) {
            passwordSection.classList.remove('hidden');
            passwordSection.style.display = 'block';
            passwordInput.focus();
            return true;
        }
        return false;
    }
    
    /**
     * Hide password section by adding 'hidden' class
     * @returns {boolean} true if operation successful, false otherwise
     */
    static hidePasswordSection() {
        const passwordSection = document.getElementById('password-section');
        
        if (passwordSection) {
            passwordSection.classList.add('hidden');
            passwordSection.style.display = 'none';
            return true;
        }
        return false;
    }
    
    /**
     * Toggle password section visibility
     * @param {boolean} show - true to show, false to hide
     * @returns {boolean} true if operation successful
     */
    static togglePasswordSection(show) {
        return show ? this.showPasswordSection() : this.hidePasswordSection();
    }
    
    /**
     * Check if password section is currently visible
     * @returns {boolean} true if visible, false otherwise
     */
    static isPasswordSectionVisible() {
        const passwordSection = document.getElementById('password-section');
        return passwordSection && 
               !passwordSection.classList.contains('hidden') && 
               passwordSection.style.display !== 'none';
    }
    
    /**
     * Clear the password input field
     * @returns {boolean} true if cleared successfully
     */
    static clearPasswordInput() {
        const passwordInput = document.getElementById('retrieve-password-input');
        
        if (passwordInput) {
            passwordInput.value = '';
            return true;
        }
        return false;
    }
    
    /**
     * Focus on the password input field
     * @returns {boolean} true if focused successfully
     */
    static focusPasswordInput() {
        const passwordInput = document.getElementById('retrieve-password-input');
        
        if (passwordInput) {
            passwordInput.focus();
            return true;
        }
        return false;
    }
    
    /**
     * Get the current value of the password input
     * @returns {string|null} password value or null if not found
     */
    static getPasswordValue() {
        const passwordInput = document.getElementById('retrieve-password-input');
        return passwordInput ? passwordInput.value : null;
    }
    
    /**
     * Set the value of the password input
     * @param {string} value - The value to set
     * @returns {boolean} true if set successfully
     */
    static setPasswordValue(value) {
        const passwordInput = document.getElementById('retrieve-password-input');
        
        if (passwordInput) {
            passwordInput.value = value;
            return true;
        }
        return false;
    }
    
    /**
     * Show loading state for a specific element
     * @param {string} elementId - The ID of the loading element
     * @returns {boolean} true if shown successfully
     */
    static showLoading(elementId) {
        const loadingElement = document.getElementById(elementId);
        
        if (loadingElement) {
            loadingElement.classList.remove('hidden');
            loadingElement.style.display = 'block';
            return true;
        }
        return false;
    }
    
    /**
     * Hide loading state for a specific element
     * @param {string} elementId - The ID of the loading element
     * @returns {boolean} true if hidden successfully
     */
    static hideLoading(elementId) {
        const loadingElement = document.getElementById(elementId);
        
        if (loadingElement) {
            loadingElement.classList.add('hidden');
            loadingElement.style.display = 'none';
            return true;
        }
        return false;
    }
    
    /**
     * Check if an element exists in the DOM
     * @param {string} elementId - The ID of the element
     * @returns {boolean} true if element exists
     */
    static elementExists(elementId) {
        return document.getElementById(elementId) !== null;
    }
    
    /**
     * Safe element getter with null check
     * @param {string} elementId - The ID of the element
     * @returns {HTMLElement|null} The element or null
     */
    static safeGetElement(elementId) {
        return document.getElementById(elementId);
    }
}