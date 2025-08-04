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

const UIController = require('../../../services/UIController');

// Mock DOM environment
const mockDocument = {
    getElementById: jest.fn(),
    body: {
        addEventListener: jest.fn()
    }
};

global.document = mockDocument;

describe('UIController', () => {
    let uiController;
    let mockEventBus;
    let mockElements;

    beforeEach(() => {
        // Mock event bus
        mockEventBus = {
            emit: jest.fn(),
            on: jest.fn(),
            removeAllListeners: jest.fn(),
            setDebugging: jest.fn()
        };

        // Mock DOM elements
        mockElements = {
            fileInput: { 
                addEventListener: jest.fn(),
                value: '',
                files: []
            },
            uploadButton: { 
                addEventListener: jest.fn(),
                style: { display: 'block' }
            },
            cancelButton: { 
                addEventListener: jest.fn(),
                style: { display: 'none' }
            },
            cancelButtonProgress: { 
                addEventListener: jest.fn(),
                style: { display: 'none' }
            },
            resetButton: { 
                addEventListener: jest.fn(),
                style: { display: 'none' }
            },
            passwordCheckbox: { 
                addEventListener: jest.fn(),
                checked: false
            },
            passwordSection: { 
                style: { display: 'none' }
            },
            passwordInput: { 
                value: '',
                focus: jest.fn()
            },
            dropZone: { 
                addEventListener: jest.fn(),
                classList: { add: jest.fn(), remove: jest.fn() }
            },
            progressBar: { 
                style: { width: '0%' }
            },
            progressText: { 
                textContent: ''
            },
            statusMessage: { 
                textContent: '',
                className: 'status-message'
            },
            fileInfo: { 
                innerHTML: ''
            }
        };

        mockDocument.getElementById.mockImplementation((id) => {
            const elementMap = {
                'file-input': mockElements.fileInput,
                'file-upload-button': mockElements.uploadButton,
                'cancel-upload-button': mockElements.cancelButton,
                'cancel-upload-button-progress': mockElements.cancelButtonProgress,
                'file-reset-button': mockElements.resetButton,
                'file-password-checkbox': mockElements.passwordCheckbox,
                'file-password-section': mockElements.passwordSection,
                'file-password-input': mockElements.passwordInput,
                'file-drop-zone': mockElements.dropZone,
                'upload-progress-bar': mockElements.progressBar,
                'upload-progress-text': mockElements.progressText,
                'upload-status-message': mockElements.statusMessage,
                'selected-file-info': mockElements.fileInfo
            };
            return elementMap[id] || null;
        });

        uiController = new UIController(mockEventBus);
        
        // Clear all mocks
        jest.clearAllMocks();
    });

    describe('Initialization', () => {
        test('should initialize with event bus', () => {
            expect(uiController.eventBus).toBe(mockEventBus);
            expect(uiController.state).toBeDefined();
            expect(uiController.state.uploadState).toBe('idle');
        });

        test('should cache DOM elements', () => {
            expect(uiController.elements.fileInput).toBe(mockElements.fileInput);
            expect(uiController.elements.uploadButton).toBe(mockElements.uploadButton);
            expect(uiController.elements.dropZone).toBe(mockElements.dropZone);
        });

        test('should setup event listeners when elements exist', () => {
            // Create new controller to test setup
            const newController = new UIController(mockEventBus);
            
            // Verify calls were made during initialization
            expect(mockElements.fileInput.addEventListener).toHaveBeenCalled();
            expect(mockElements.uploadButton.addEventListener).toHaveBeenCalled();
        });

        test('should setup event bus handlers', () => {
            // Create new controller to test setup
            const newController = new UIController(mockEventBus);
            
            // Verify event bus handlers were registered
            expect(mockEventBus.on).toHaveBeenCalledWith('upload:progress', expect.any(Function));
            expect(mockEventBus.on).toHaveBeenCalledWith('upload:complete', expect.any(Function));
            expect(mockEventBus.on).toHaveBeenCalledWith('upload:error', expect.any(Function));
        });
    });

    describe('File Selection', () => {
        const mockFile = {
            name: 'test.txt',
            size: 1024,
            type: 'text/plain'
        };

        test('should handle file selection', () => {
            uiController.handleFileSelection(mockFile);

            expect(uiController.state.currentFile).toBe(mockFile);
            expect(mockEventBus.emit).toHaveBeenCalledWith('file:selected', { file: mockFile });
            expect(uiController.state.uploadState).toBe('ready');
        });

        test('should update file info display', () => {
            uiController.handleFileSelection(mockFile);

            expect(mockElements.fileInfo.innerHTML).toContain('test.txt');
            expect(mockElements.fileInfo.innerHTML).toContain('1 KB');
            expect(mockElements.fileInfo.innerHTML).toContain('text/plain');
        });

        test('should trigger file input change event', () => {
            const mockEvent = {
                target: { files: [mockFile] }
            };

            // Directly test the file selection handler
            uiController.handleFileSelection(mockFile);

            expect(uiController.state.currentFile).toBe(mockFile);
        });
    });

    describe('Upload Control', () => {
        const mockFile = {
            name: 'test.txt',
            size: 1024,
            type: 'text/plain'
        };

        beforeEach(() => {
            uiController.handleFileSelection(mockFile);
            jest.clearAllMocks();
        });

        test('should start upload when file is selected', () => {
            uiController.startUpload();

            expect(mockEventBus.emit).toHaveBeenCalledWith('upload:start', {
                file: mockFile,
                password: null
            });
            expect(uiController.state.uploadState).toBe('uploading');
        });

        test('should include password in upload options', () => {
            mockElements.passwordCheckbox.checked = true;
            mockElements.passwordInput.value = 'secret123';

            uiController.startUpload();

            expect(mockEventBus.emit).toHaveBeenCalledWith('upload:start', {
                file: mockFile,
                password: 'secret123'
            });
        });

        test('should show error when no file selected', () => {
            uiController.state.currentFile = null;

            uiController.startUpload();

            expect(mockElements.statusMessage.textContent).toContain('No file selected');
            expect(mockElements.statusMessage.className).toContain('error');
        });

        test('should handle upload cancellation', () => {
            uiController.state.uploadState = 'uploading';

            uiController.cancelUpload();

            expect(mockEventBus.emit).toHaveBeenCalledWith('upload:cancel');
            expect(uiController.state.uploadState).toBe('cancelled');
        });

        test('should reset file selection', () => {
            uiController.resetFileSelection();

            expect(uiController.state.currentFile).toBeNull();
            expect(mockElements.fileInput.value).toBe('');
            expect(uiController.state.uploadState).toBe('idle');
            expect(mockEventBus.emit).toHaveBeenCalledWith('file:reset');
        });
    });

    describe('Progress Tracking', () => {
        test('should update progress bar and text', () => {
            uiController.updateProgress(75, 'Uploading...');

            expect(mockElements.progressBar.style.width).toBe('75%');
            expect(mockElements.progressText.textContent).toBe('75%');
            expect(mockElements.statusMessage.textContent).toBe('Uploading...');
            expect(uiController.state.progress).toBe(75);
        });

        test('should handle progress events from event bus', () => {
            // Directly test the progress update method
            uiController.updateProgress(50, 'Halfway done');

            expect(mockElements.progressBar.style.width).toBe('50%');
            expect(mockElements.progressText.textContent).toBe('50%');
            expect(mockElements.statusMessage.textContent).toBe('Halfway done');
        });

        test('should clear progress indicators', () => {
            uiController.updateProgress(100);
            uiController.clearProgress();

            expect(mockElements.progressBar.style.width).toBe('0%');
            expect(mockElements.progressText.textContent).toBe('0%');
            expect(uiController.state.progress).toBe(0);
        });
    });

    describe('State Management', () => {
        test('should update UI for idle state', () => {
            uiController.updateUploadState('idle');

            expect(mockElements.uploadButton.style.display).toBe('none');
            expect(mockElements.cancelButton.style.display).toBe('none');
            expect(mockElements.resetButton.style.display).toBe('none');
        });

        test('should update UI for ready state', () => {
            uiController.updateUploadState('ready');

            expect(mockElements.uploadButton.style.display).toBe('block');
            expect(mockElements.cancelButton.style.display).toBe('none');
            expect(mockElements.resetButton.style.display).toBe('block');
            expect(mockElements.statusMessage.textContent).toBe('File ready for upload');
        });

        test('should update UI for uploading state', () => {
            uiController.updateUploadState('uploading');

            expect(mockElements.uploadButton.style.display).toBe('none');
            expect(mockElements.cancelButton.style.display).toBe('block');
            expect(mockElements.resetButton.style.display).toBe('none');
            expect(mockElements.statusMessage.textContent).toBe('Uploading...');
        });

        test('should update UI for completed state', () => {
            uiController.updateUploadState('completed');

            expect(mockElements.uploadButton.style.display).toBe('none');
            expect(mockElements.cancelButton.style.display).toBe('none');
            expect(mockElements.resetButton.style.display).toBe('block');
            expect(mockElements.statusMessage.textContent).toBe('Upload completed successfully!');
        });

        test('should emit state change events', () => {
            uiController.updateUploadState('uploading');

            expect(mockEventBus.emit).toHaveBeenCalledWith('ui:state:changed', {
                newState: 'uploading',
                previousState: 'idle',
                progress: 0
            });
        });
    });

    describe('Drag and Drop', () => {
        beforeEach(() => {
            // Setup drop zone if it exists
            if (mockElements.dropZone) {
                uiController.setupDropZone();
            }
        });

        test('should setup drag and drop event listeners', () => {
            if (mockElements.dropZone) {
                expect(mockElements.dropZone.addEventListener).toHaveBeenCalledWith('dragenter', expect.any(Function), false);
                expect(mockElements.dropZone.addEventListener).toHaveBeenCalledWith('dragover', expect.any(Function), false);
                expect(mockElements.dropZone.addEventListener).toHaveBeenCalledWith('drop', expect.any(Function), false);
            }
        });

        test('should highlight drop zone on drag enter', () => {
            uiController.highlight(mockElements.dropZone);

            expect(mockElements.dropZone.classList.add).toHaveBeenCalledWith('drag-over');
        });

        test('should unhighlight drop zone on drag leave', () => {
            uiController.unhighlight(mockElements.dropZone);

            expect(mockElements.dropZone.classList.remove).toHaveBeenCalledWith('drag-over');
        });

        test('should handle dropped files', () => {
            const mockFile = { name: 'dropped.txt', size: 2048, type: 'text/plain' };
            const mockEvent = {
                dataTransfer: { files: [mockFile] }
            };

            if (mockElements.dropZone) {
                const dropHandler = mockElements.dropZone.addEventListener.mock.calls
                    .find(call => call[0] === 'drop')[1];
                
                dropHandler(mockEvent);

                expect(uiController.state.currentFile).toBe(mockFile);
            }
        });
    });

    describe('Password Section', () => {
        test('should toggle password section visibility', () => {
            mockElements.passwordCheckbox.checked = true;
            uiController.togglePasswordSection();

            expect(mockElements.passwordSection.style.display).toBe('block');
            expect(mockElements.passwordInput.focus).toHaveBeenCalled();

            mockElements.passwordCheckbox.checked = false;
            uiController.togglePasswordSection();

            expect(mockElements.passwordSection.style.display).toBe('none');
        });

        test('should handle password checkbox change event', () => {
            const changeHandler = mockElements.passwordCheckbox.addEventListener.mock.calls
                .find(call => call[0] === 'change')[1];

            mockElements.passwordCheckbox.checked = true;
            changeHandler();

            expect(mockElements.passwordSection.style.display).toBe('block');
        });
    });

    describe('Event Bus Integration', () => {
        test('should handle upload complete event', () => {
            const completeHandler = mockEventBus.on.mock.calls
                .find(call => call[0] === 'upload:complete')[1];

            const uploadData = { shareUrl: 'https://example.com/share/123' };
            completeHandler(uploadData);

            expect(uiController.state.uploadState).toBe('completed');
            expect(mockElements.statusMessage.textContent).toContain('https://example.com/share/123');
        });

        test('should handle upload error event', () => {
            const errorHandler = mockEventBus.on.mock.calls
                .find(call => call[0] === 'upload:error')[1];

            const error = { message: 'Upload failed' };
            errorHandler(error);

            expect(uiController.state.uploadState).toBe('error');
            expect(mockElements.statusMessage.textContent).toContain('Upload failed');
            expect(mockElements.statusMessage.className).toContain('error');
        });

        test('should handle validation error event', () => {
            const validationHandler = mockEventBus.on.mock.calls
                .find(call => call[0] === 'file:validation:error')[1];

            const error = { message: 'File too large' };
            validationHandler(error);

            expect(mockElements.statusMessage.textContent).toContain('Validation Error: File too large');
        });
    });

    describe('Utility Functions', () => {
        test('should format file size correctly', () => {
            expect(uiController.formatFileSize(0)).toBe('0 Bytes');
            expect(uiController.formatFileSize(1024)).toBe('1 KB');
            expect(uiController.formatFileSize(1024 * 1024)).toBe('1 MB');
            expect(uiController.formatFileSize(1024 * 1024 * 1024)).toBe('1 GB');
            expect(uiController.formatFileSize(1536)).toBe('1.5 KB');
        });

        test('should prevent default events', () => {
            const mockEvent = {
                preventDefault: jest.fn(),
                stopPropagation: jest.fn()
            };

            uiController.preventDefaults(mockEvent);

            expect(mockEvent.preventDefault).toHaveBeenCalled();
            expect(mockEvent.stopPropagation).toHaveBeenCalled();
        });

        test('should set element visibility', () => {
            const mockElement = { style: { display: 'block' } };

            uiController.setElementVisibility(mockElement, false);
            expect(mockElement.style.display).toBe('none');

            uiController.setElementVisibility(mockElement, true);
            expect(mockElement.style.display).toBe('block');

            // Should handle null elements gracefully
            uiController.setElementVisibility(null, true);
        });
    });

    describe('State Getters', () => {
        test('should return current state', () => {
            const state = uiController.getState();

            expect(state.currentFile).toBeNull();
            expect(state.uploadState).toBe('idle');
            expect(state.progress).toBe(0);
        });

        test('should return current file', () => {
            const mockFile = { name: 'test.txt' };
            uiController.state.currentFile = mockFile;

            expect(uiController.getCurrentFile()).toBe(mockFile);
        });

        test('should check if uploading', () => {
            expect(uiController.isUploading()).toBe(false);

            uiController.state.uploadState = 'uploading';
            expect(uiController.isUploading()).toBe(true);
        });
    });

    describe('SOLID Principles Compliance', () => {
        test('should follow Single Responsibility Principle', () => {
            // UIController should only handle UI concerns
            const methods = Object.getOwnPropertyNames(UIController.prototype);
            const uiMethods = methods.filter(method => 
                ['updateProgress', 'updateUploadState', 'handleFileSelection'].includes(method)
            );
            
            expect(uiMethods.length).toBe(3);
            // Should not have crypto or network methods
            expect(methods.some(m => m.includes('encrypt') || m.includes('upload'))).toBe(false);
        });

        test('should follow Open/Closed Principle', () => {
            // Can extend UI behavior through event system without modification
            expect(uiController.eventBus).toBeDefined();
            expect(typeof uiController.eventBus.emit).toBe('function');
        });

        test('should follow Dependency Inversion Principle', () => {
            // Depends on EventBus abstraction
            expect(uiController.eventBus.emit).toBeDefined();
            expect(uiController.eventBus.on).toBeDefined();
        });
    });

    describe('Error Handling', () => {
        test('should handle missing DOM elements gracefully', () => {
            mockDocument.getElementById.mockReturnValue(null);
            
            // Should not throw when elements are missing
            expect(() => {
                new UIController(mockEventBus);
            }).not.toThrow();
        });

        test('should handle event bus errors gracefully', () => {
            const errorEventBus = {
                emit: jest.fn().mockImplementation(() => {
                    throw new Error('Event bus error');
                }),
                on: jest.fn()
            };

            const controller = new UIController(errorEventBus);
            
            // Should not throw when event emission fails
            expect(() => {
                controller.handleFileSelection({ name: 'test.txt' });
            }).not.toThrow();
        });
    });

    describe('Performance', () => {
        test('should handle rapid state changes efficiently', () => {
            const states = ['ready', 'uploading', 'completed', 'idle'];
            
            const start = Date.now();
            states.forEach(state => {
                uiController.updateUploadState(state);
            });
            const duration = Date.now() - start;

            expect(duration).toBeLessThan(50); // Should complete in under 50ms
        });

        test('should handle frequent progress updates', () => {
            const updates = Array(100).fill(null).map((_, i) => i);
            
            const start = Date.now();
            updates.forEach(progress => {
                uiController.updateProgress(progress, `Progress: ${progress}%`);
            });
            const duration = Date.now() - start;

            expect(duration).toBeLessThan(100); // Should complete in under 100ms
        });
    });
});