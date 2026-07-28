/**
 * Version History Sidebar Component
 * 
 * Displays chronological version history for email templates.
 * Allows restoration of previous versions with confirmation dialog.
 */

import React, { useState } from 'react';
import type { TemplateVersion } from '@/app/admin/templates/page';
import ConfirmationDialog from '@/components/templates/ConfirmationDialog';

interface VersionHistorySidebarProps {
    versions: TemplateVersion[];
    currentVersionNumber: number;
    onRestore: (versionNumber: number) => void;
}

function formatRelativeTime(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) {
        return 'just now';
    }

    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) {
        return `${diffInMinutes} minute${diffInMinutes === 1 ? '' : 's'} ago`;
    }

    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) {
        return `${diffInHours} hour${diffInHours === 1 ? '' : 's'} ago`;
    }

    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 30) {
        return `${diffInDays} day${diffInDays === 1 ? '' : 's'} ago`;
    }

    const diffInMonths = Math.floor(diffInDays / 30);
    if (diffInMonths < 12) {
        return `${diffInMonths} month${diffInMonths === 1 ? '' : 's'} ago`;
    }

    const diffInYears = Math.floor(diffInMonths / 12);
    return `${diffInYears} year${diffInYears === 1 ? '' : 's'} ago`;
}

export default function VersionHistorySidebar({
    versions,
    currentVersionNumber,
    onRestore,
}: VersionHistorySidebarProps) {
    const [restoreTarget, setRestoreTarget] = useState<TemplateVersion | null>(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    const handleRestoreClick = (version: TemplateVersion) => {
        setRestoreTarget(version);
        setIsDialogOpen(true);
    };

    const handleConfirmRestore = () => {
        if (restoreTarget) {
            onRestore(restoreTarget.versionNumber);
        }
        setIsDialogOpen(false);
        setRestoreTarget(null);
    };

    const handleCancelRestore = () => {
        setIsDialogOpen(false);
        setRestoreTarget(null);
    };

    return (
        <>
            <div className="bg-white rounded-lg shadow">
                <div className="px-4 py-5 border-b border-gray-200">
                    <h3 className="text-lg font-medium text-gray-900">
                        Version History
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">
                        {versions.length} version{versions.length === 1 ? '' : 's'}
                    </p>
                </div>

                <div className="divide-y divide-gray-200 max-h-[600px] overflow-y-auto">
                    {versions.length > 0 ? (
                        versions.map((version) => {
                            const isCurrent = version.versionNumber === currentVersionNumber;

                            return (
                                <div
                                    key={version.id}
                                    className={`px-4 py-4 ${
                                        isCurrent ? 'bg-blue-50' : 'hover:bg-gray-50'
                                    }`}
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center space-x-2">
                                                <span
                                                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                                        isCurrent
                                                            ? 'bg-blue-100 text-blue-800'
                                                            : 'bg-gray-100 text-gray-800'
                                                    }`}
                                                >
                                                    Version {version.versionNumber}
                                                </span>
                                                {isCurrent && (
                                                    <span className="text-xs font-medium text-blue-600">
                                                        (Current)
                                                    </span>
                                                )}
                                            </div>

                                            <div className="mt-2 text-sm text-gray-900">
                                                <p className="font-medium truncate">
                                                    {version.name}
                                                </p>
                                            </div>

                                            <div className="mt-1 text-xs text-gray-500">
                                                <p>by {version.createdBy.name}</p>
                                                <p className="mt-0.5">
                                                    {formatRelativeTime(version.createdAt)}
                                                </p>
                                            </div>
                                        </div>

                                        {!isCurrent && (
                                            <div className="ml-3 flex-shrink-0">
                                                <button
                                                    type="button"
                                                    onClick={() => handleRestoreClick(version)}
                                                    className="inline-flex items-center px-2.5 py-1.5 border border-gray-300 shadow-sm text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                                                    aria-label={`Restore version ${version.versionNumber}`}
                                                >
                                                    Restore
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {/* Preview subject line */}
                                    <div className="mt-3 text-xs text-gray-500 truncate">
                                        <span className="font-medium">Subject:</span> {version.subject}
                                    </div>
                                </div>
                            );
                        })
                    ) : (
                        <div className="px-4 py-8 text-center text-sm text-gray-500">
                            <svg
                                className="mx-auto h-8 w-8 text-gray-400 mb-2"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                aria-hidden="true"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                            </svg>
                            <p>No version history available</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Confirmation Dialog */}
            {restoreTarget && (
                <ConfirmationDialog
                    isOpen={isDialogOpen}
                    title="Restore Template Version"
                    message={
                        <>
                            <p>
                                Are you sure you want to restore <strong>Version {restoreTarget.versionNumber}</strong>?
                            </p>
                            <p className="mt-2">
                                This will create a new version with the content from Version {restoreTarget.versionNumber}.
                                Your current changes will not be lost.
                            </p>
                            <div className="mt-4 p-3 bg-gray-50 rounded-md text-sm">
                                <p className="font-medium text-gray-900">Version {restoreTarget.versionNumber} Details:</p>
                                <p className="mt-1 text-gray-600">Name: {restoreTarget.name}</p>
                                <p className="text-gray-600">Subject: {restoreTarget.subject}</p>
                                <p className="text-gray-600">Created by: {restoreTarget.createdBy.name}</p>
                            </div>
                        </>
                    }
                    confirmLabel="Restore Version"
                    cancelLabel="Cancel"
                    onConfirm={handleConfirmRestore}
                    onCancel={handleCancelRestore}
                    variant="warning"
                />
            )}
        </>
    );
}
