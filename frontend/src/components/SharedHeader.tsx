'use client';

import React from 'react';
import { BellIcon } from './BellIcon';

/**
 * SharedHeader Component
 * 
 * Common header bar displayed across all pages.
 * Contains logo/branding and notification bell icon.
 * 
 * Add to app layout or individual pages as needed.
 */
export function SharedHeader() {
  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Left side - Logo/Brand */}
          <div className="flex items-center">
            <h1 className="text-xl font-bold text-gray-900">
              AI Interview Platform
            </h1>
          </div>

          {/* Right side - Notifications and User Menu */}
          <div className="flex items-center gap-4">
            <BellIcon />
            
            {/* User menu placeholder - can be expanded later */}
            <div className="h-8 w-8 bg-gray-300 rounded-full flex items-center justify-center">
              <span className="text-sm font-medium text-gray-700">U</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
