import '@testing-library/jest-dom'
import { PropsWithChildren } from 'react';

if (typeof window !== 'undefined') {
  // Mock scrollIntoView for JSDOM
  window.HTMLElement.prototype.scrollIntoView = jest.fn();
  window.HTMLMediaElement.prototype.play = () => Promise.resolve();
  window.HTMLMediaElement.prototype.pause = jest.fn();
}

// Mock react-markdown to avoid ESM issues in Jest
jest.mock('react-markdown', () => ({
    __esModule: true,
    default: ({ children }: PropsWithChildren) => children,
}));
