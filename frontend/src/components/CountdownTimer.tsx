import { useCountdown } from '../hooks/useCountdown';

interface CountdownTimerProps {
    resetAt: Date | string;
    onExpire?: () => void;
    className?: string;
}

/**
 * Displays a countdown timer showing time until a target timestamp.
 * Automatically updates every second and calls onExpire when reaching 0.
 */
export function CountdownTimer({ resetAt, onExpire, className = '' }: CountdownTimerProps) {
    const { formatted, isExpired } = useCountdown(resetAt, onExpire);

    if (isExpired) {
        return null;
    }

    return (
        <span
            className={`font-mono text-sm ${className}`}
            role="timer"
            aria-live="polite"
            aria-atomic="true"
        >
            {formatted}
        </span>
    );
}
