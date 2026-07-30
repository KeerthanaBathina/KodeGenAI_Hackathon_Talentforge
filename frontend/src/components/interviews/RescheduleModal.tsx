'use client';

import React, { useState } from 'react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { DateTimePicker } from '../ui/DateTimePicker';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import { InterviewDetails, RescheduleData } from '../../types/interview';

interface RescheduleModalProps {
    interview: InterviewDetails;
    onConfirm: (data: RescheduleData) => void;
    onCancel: () => void;
    isLoading: boolean;
}

export function RescheduleModal({
    interview,
    onConfirm,
    onCancel,
    isLoading,
}: RescheduleModalProps) {
    const [newScheduledAt, setNewScheduledAt] = useState<Date>(
        new Date(interview.scheduledAt)
    );
    const [newDuration, setNewDuration] = useState(interview.duration || 60);
    const [newMeetingLink, setNewMeetingLink] = useState(interview.meetingLink || '');
    const [newLocation, setNewLocation] = useState(interview.location || '');
    const [reason, setReason] = useState('');
    const [errors, setErrors] = useState<Record<string, string>>({});

    const validate = () => {
        const newErrors: Record<string, string> = {};

        if (newScheduledAt <= new Date()) {
            newErrors.scheduledAt = 'New time must be in the future';
        }

        if (newDuration < 15 || newDuration > 480) {
            newErrors.duration = 'Duration must be between 15 and 480 minutes';
        }

        if (!newMeetingLink && !newLocation) {
            newErrors.location = 'Provide either a meeting link or location';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleConfirm = () => {
        if (!validate()) return;

        onConfirm({
            newScheduledAt: newScheduledAt.toISOString(),
            newDuration,
            newMeetingLink: newMeetingLink || undefined,
            newLocation: newLocation || undefined,
            reason: reason || undefined,
        });
    };

    return (
        <Dialog open onClose={onCancel} title="Reschedule Interview">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {interview.state === 'no_show' && (
                    <div
                        style={{
                            backgroundColor: '#e0f2fe',
                            border: '1px solid #0ea5e9',
                            borderRadius: '0.375rem',
                            padding: '1rem',
                        }}
                    >
                        <strong style={{ display: 'block', marginBottom: '0.5rem' }}>
                            ℹ️ Rescheduling After No-Show
                        </strong>
                        <p style={{ margin: 0, fontSize: '0.875rem' }}>
                            This will create a new interview and send updated invites to all
                            participants.
                        </p>
                    </div>
                )}

                <div>
                    <label
                        htmlFor="new-scheduled-at"
                        style={{
                            display: 'block',
                            marginBottom: '0.5rem',
                            fontWeight: 500,
                            fontSize: '0.875rem',
                        }}
                    >
                        New Date & Time <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <DateTimePicker
                        id="new-scheduled-at"
                        value={newScheduledAt}
                        onChange={setNewScheduledAt}
                        disabled={isLoading}
                        minDate={new Date()}
                        error={errors.scheduledAt}
                    />
                </div>

                <div>
                    <label
                        htmlFor="new-duration"
                        style={{
                            display: 'block',
                            marginBottom: '0.5rem',
                            fontWeight: 500,
                            fontSize: '0.875rem',
                        }}
                    >
                        Duration (minutes)
                    </label>
                    <Input
                        id="new-duration"
                        type="number"
                        value={newDuration}
                        onChange={(e) => setNewDuration(parseInt(e.target.value, 10))}
                        min={15}
                        max={480}
                        disabled={isLoading}
                        error={errors.duration}
                    />
                </div>

                <div>
                    <label
                        htmlFor="new-meeting-link"
                        style={{
                            display: 'block',
                            marginBottom: '0.5rem',
                            fontWeight: 500,
                            fontSize: '0.875rem',
                        }}
                    >
                        Meeting Link
                    </label>
                    <Input
                        id="new-meeting-link"
                        type="url"
                        value={newMeetingLink}
                        onChange={(e) => setNewMeetingLink(e.target.value)}
                        placeholder="https://meet.google.com/..."
                        disabled={isLoading}
                    />
                </div>

                <div>
                    <label
                        htmlFor="new-location"
                        style={{
                            display: 'block',
                            marginBottom: '0.5rem',
                            fontWeight: 500,
                            fontSize: '0.875rem',
                        }}
                    >
                        Or Physical Location
                    </label>
                    <Input
                        id="new-location"
                        type="text"
                        value={newLocation}
                        onChange={(e) => setNewLocation(e.target.value)}
                        placeholder="Building A, Room 301"
                        disabled={isLoading}
                        error={errors.location}
                    />
                </div>

                <div>
                    <label
                        htmlFor="reschedule-reason"
                        style={{
                            display: 'block',
                            marginBottom: '0.5rem',
                            fontWeight: 500,
                            fontSize: '0.875rem',
                        }}
                    >
                        Reason (Optional)
                    </label>
                    <Textarea
                        id="reschedule-reason"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Reason for rescheduling..."
                        rows={2}
                        disabled={isLoading}
                    />
                </div>

                <div
                    style={{
                        display: 'flex',
                        gap: '0.75rem',
                        justifyContent: 'flex-end',
                        marginTop: '0.5rem',
                    }}
                >
                    <Button variant="secondary" onClick={onCancel} disabled={isLoading}>
                        Cancel
                    </Button>
                    <Button
                        variant="primary"
                        onClick={handleConfirm}
                        disabled={isLoading}
                    >
                        {isLoading ? 'Rescheduling...' : 'Reschedule Interview'}
                    </Button>
                </div>
            </div>
        </Dialog>
    );
}
