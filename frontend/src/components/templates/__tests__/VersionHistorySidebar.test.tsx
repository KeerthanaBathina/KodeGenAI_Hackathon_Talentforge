/**
 * Version History Sidebar Component Tests
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import VersionHistorySidebar from '../VersionHistorySidebar';
import type { TemplateVersion } from '@/app/admin/templates/page';

describe('VersionHistorySidebar', () => {
    const mockVersions: TemplateVersion[] = [
        {
            id: '3',
            versionNumber: 3,
            name: 'Welcome Email v3',
            subject: 'Welcome to our platform!',
            bodyHtml: '<p>Welcome v3</p>',
            bodyText: 'Welcome v3',
            createdBy: { name: 'Jane Admin' },
            createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
        },
        {
            id: '2',
            versionNumber: 2,
            name: 'Welcome Email v2',
            subject: 'Welcome!',
            bodyHtml: '<p>Welcome v2</p>',
            bodyText: 'Welcome v2',
            createdBy: { name: 'John Admin' },
            createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
        },
        {
            id: '1',
            versionNumber: 1,
            name: 'Welcome Email v1',
            subject: 'Hello',
            bodyHtml: '<p>Welcome v1</p>',
            bodyText: 'Welcome v1',
            createdBy: { name: 'Admin User' },
            createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
        },
    ];

    it('should render version history title', () => {
        const onRestore = vi.fn();
        render(
            <VersionHistorySidebar
                versions={mockVersions}
                currentVersionNumber={3}
                onRestore={onRestore}
            />
        );

        expect(screen.getByText('Version History')).toBeInTheDocument();
        expect(screen.getByText('3 versions')).toBeInTheDocument();
    });

    it('should display all versions in order', () => {
        const onRestore = vi.fn();
        render(
            <VersionHistorySidebar
                versions={mockVersions}
                currentVersionNumber={3}
                onRestore={onRestore}
            />
        );

        expect(screen.getByText('Version 3')).toBeInTheDocument();
        expect(screen.getByText('Version 2')).toBeInTheDocument();
        expect(screen.getByText('Version 1')).toBeInTheDocument();
    });

    it('should mark current version correctly', () => {
        const onRestore = vi.fn();
        render(
            <VersionHistorySidebar
                versions={mockVersions}
                currentVersionNumber={3}
                onRestore={onRestore}
            />
        );

        expect(screen.getByText('(Current)')).toBeInTheDocument();
        
        // Find the version container with bg-blue-50 class
        const versionContainers = document.querySelectorAll('[class*="bg-blue-50"]');
        expect(versionContainers.length).toBeGreaterThan(0);
    });

    it('should display version details', () => {
        const onRestore = vi.fn();
        render(
            <VersionHistorySidebar
                versions={mockVersions}
                currentVersionNumber={3}
                onRestore={onRestore}
            />
        );

        expect(screen.getByText('Welcome Email v3')).toBeInTheDocument();
        expect(screen.getByText('by Jane Admin')).toBeInTheDocument();
        expect(screen.getByText('2 hours ago')).toBeInTheDocument();
    });

    it('should display subject line for each version', () => {
        const onRestore = vi.fn();
        render(
            <VersionHistorySidebar
                versions={mockVersions}
                currentVersionNumber={3}
                onRestore={onRestore}
            />
        );

        expect(screen.getByText(/Welcome to our platform!/)).toBeInTheDocument();
        expect(screen.getByText(/Welcome!/)).toBeInTheDocument();
        expect(screen.getByText(/Hello/)).toBeInTheDocument();
    });

    it('should show restore button for non-current versions', () => {
        const onRestore = vi.fn();
        render(
            <VersionHistorySidebar
                versions={mockVersions}
                currentVersionNumber={3}
                onRestore={onRestore}
            />
        );

        const restoreButtons = screen.getAllByRole('button', { name: /Restore/i });
        expect(restoreButtons).toHaveLength(2); // Only for versions 1 and 2
    });

    it('should not show restore button for current version', () => {
        const onRestore = vi.fn();
        render(
            <VersionHistorySidebar
                versions={mockVersions}
                currentVersionNumber={3}
                onRestore={onRestore}
            />
        );

        const version3Element = screen.getByText('Version 3').closest('div');
        const restoreButton = version3Element?.querySelector('button[aria-label*="Restore"]');
        expect(restoreButton).not.toBeInTheDocument();
    });

    it('should open confirmation dialog when restore is clicked', () => {
        const onRestore = vi.fn();
        render(
            <VersionHistorySidebar
                versions={mockVersions}
                currentVersionNumber={3}
                onRestore={onRestore}
            />
        );

        const restoreButton = screen.getByRole('button', { name: 'Restore version 2' });
        fireEvent.click(restoreButton);

        expect(screen.getByText('Restore Template Version')).toBeInTheDocument();
        expect(screen.getByText(/Are you sure you want to restore/)).toBeInTheDocument();
    });

    it('should call onRestore when confirmed', () => {
        const onRestore = vi.fn();
        render(
            <VersionHistorySidebar
                versions={mockVersions}
                currentVersionNumber={3}
                onRestore={onRestore}
            />
        );

        // Click restore button
        const restoreButton = screen.getByRole('button', { name: 'Restore version 2' });
        fireEvent.click(restoreButton);

        // Confirm in dialog
        const confirmButton = screen.getByRole('button', { name: 'Restore Version' });
        fireEvent.click(confirmButton);

        expect(onRestore).toHaveBeenCalledWith(2);
    });

    it('should not call onRestore when cancelled', () => {
        const onRestore = vi.fn();
        render(
            <VersionHistorySidebar
                versions={mockVersions}
                currentVersionNumber={3}
                onRestore={onRestore}
            />
        );

        // Click restore button
        const restoreButton = screen.getByRole('button', { name: 'Restore version 2' });
        fireEvent.click(restoreButton);

        // Cancel in dialog
        const cancelButton = screen.getByRole('button', { name: 'Cancel' });
        fireEvent.click(cancelButton);

        expect(onRestore).not.toHaveBeenCalled();
    });

    it('should display empty state when no versions', () => {
        const onRestore = vi.fn();
        render(
            <VersionHistorySidebar
                versions={[]}
                currentVersionNumber={1}
                onRestore={onRestore}
            />
        );

        expect(screen.getByText('No version history available')).toBeInTheDocument();
        expect(screen.getByText('0 versions')).toBeInTheDocument();
    });

    it('should format relative time correctly', () => {
        const onRestore = vi.fn();
        render(
            <VersionHistorySidebar
                versions={mockVersions}
                currentVersionNumber={3}
                onRestore={onRestore}
            />
        );

        expect(screen.getByText('2 hours ago')).toBeInTheDocument();
        expect(screen.getByText('3 days ago')).toBeInTheDocument();
        expect(screen.getByText('1 month ago')).toBeInTheDocument();
    });
});
