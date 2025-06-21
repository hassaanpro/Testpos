// This file is used to set up the testing environment
// It will be run before each test file

// Mock browser APIs that might not be available in the test environment
global.matchMedia = global.matchMedia || function() {
  return {
    matches: false,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  };
};

// Mock window.print
global.window.print = vi.fn();

// Mock URL.createObjectURL
global.URL.createObjectURL = vi.fn(() => 'mock-url');
global.URL.revokeObjectURL = vi.fn();

// Create a mock for document.createElement
const originalCreateElement = document.createElement;
document.createElement = function(tagName) {
  const element = originalCreateElement.call(document, tagName);
  if (tagName === 'a') {
    element.click = vi.fn();
  }
  return element;
};