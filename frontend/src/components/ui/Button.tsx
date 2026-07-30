'use client';

import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'danger' | 'warning';
    size?: 'sm' | 'md' | 'lg';
    children: React.ReactNode;
}

const variantStyles = {
    primary: {
        backgroundColor: '#3b82f6',
        color: 'white',
        border: 'none',
        hover: '#2563eb',
    },
    secondary: {
        backgroundColor: '#6b7280',
        color: 'white',
        border: 'none',
        hover: '#4b5563',
    },
    danger: {
        backgroundColor: '#ef4444',
        color: 'white',
        border: 'none',
        hover: '#dc2626',
    },
    warning: {
        backgroundColor: '#f59e0b',
        color: 'white',
        border: 'none',
        hover: '#d97706',
    },
};

const sizeStyles = {
    sm: {
        padding: '0.375rem 0.75rem',
        fontSize: '0.875rem',
    },
    md: {
        padding: '0.5rem 1rem',
        fontSize: '1rem',
    },
    lg: {
        padding: '0.75rem 1.5rem',
        fontSize: '1.125rem',
    },
};

export function Button({
    variant = 'primary',
    size = 'md',
    children,
    disabled,
    style,
    ...props
}: ButtonProps) {
    const variantStyle = variantStyles[variant];
    const sizeStyle = sizeStyles[size];

    return (
        <button
            {...props}
            disabled={disabled}
            style={{
                ...variantStyle,
                ...sizeStyle,
                borderRadius: '0.375rem',
                fontWeight: 500,
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.6 : 1,
                transition: 'background-color 0.2s',
                ...style,
            }}
            onMouseEnter={(e) => {
                if (!disabled) {
                    e.currentTarget.style.backgroundColor = variantStyle.hover;
                }
            }}
            onMouseLeave={(e) => {
                if (!disabled) {
                    e.currentTarget.style.backgroundColor = variantStyle.backgroundColor;
                }
            }}
        >
            {children}
        </button>
    );
}
