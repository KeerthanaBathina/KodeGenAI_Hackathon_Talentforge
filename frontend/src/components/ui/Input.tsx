'use client';

import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    error?: string;
}

export function Input({ error, style, ...props }: InputProps) {
    return (
        <>
            <input
                {...props}
                style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    border: `1px solid ${error ? '#ef4444' : '#d1d5db'}`,
                    borderRadius: '0.375rem',
                    fontSize: '1rem',
                    outline: 'none',
                    transition: 'border-color 0.2s',
                    ...style,
                }}
                onFocus={(e) => {
                    e.target.style.borderColor = error ? '#ef4444' : '#3b82f6';
                }}
                onBlur={(e) => {
                    e.target.style.borderColor = error ? '#ef4444' : '#d1d5db';
                }}
            />
            {error && (
                <span
                    style={{
                        color: '#ef4444',
                        fontSize: '0.875rem',
                        marginTop: '0.25rem',
                        display: 'block',
                    }}
                >
                    {error}
                </span>
            )}
        </>
    );
}
