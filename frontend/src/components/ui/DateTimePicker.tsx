'use client';

import React from 'react';
import { Input } from './Input';

export interface DateTimePickerProps {
    id?: string;
    value: Date;
    onChange: (date: Date) => void;
    disabled?: boolean;
    minDate?: Date;
    error?: string;
}

export function DateTimePicker({
    id,
    value,
    onChange,
    disabled,
    minDate,
    error,
}: DateTimePickerProps) {
    // Format date to datetime-local input format
    const formatDateTimeLocal = (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newDate = new Date(e.target.value);
        if (!isNaN(newDate.getTime())) {
            onChange(newDate);
        }
    };

    return (
        <Input
            id={id}
            type="datetime-local"
            value={formatDateTimeLocal(value)}
            onChange={handleChange}
            disabled={disabled}
            min={minDate ? formatDateTimeLocal(minDate) : undefined}
            error={error}
        />
    );
}
