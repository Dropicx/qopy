/*
 * Copyright (C) 2025 Qopy App
 * UI manipulation utilities - standalone version for plain scripts
 */
(function (global) {
    'use strict';
    global.UIHelpers = {
        showPasswordSection: function () {
            const passwordSection = document.getElementById('password-section');
            const passwordInput = document.getElementById('retrieve-password-input');
            if (passwordSection && passwordInput) {
                passwordSection.classList.remove('hidden');
                passwordSection.style.display = 'block';
                passwordInput.focus();
                return true;
            }
            return false;
        },
        hidePasswordSection: function () {
            const passwordSection = document.getElementById('password-section');
            if (passwordSection) {
                passwordSection.classList.add('hidden');
                passwordSection.style.display = 'none';
                return true;
            }
            return false;
        },
        showLoading: function (elementId) {
            const el = document.getElementById(elementId);
            if (el) {
                el.classList.remove('hidden');
                el.style.display = 'block';
                return true;
            }
            return false;
        },
        hideLoading: function (elementId) {
            const el = document.getElementById(elementId);
            if (el) {
                el.classList.add('hidden');
                el.style.display = 'none';
                return true;
            }
            return false;
        },
        getPasswordValue: function () {
            const el = document.getElementById('retrieve-password-input');
            return el ? el.value : null;
        }
    };
})(typeof window !== 'undefined' ? window : globalThis);
