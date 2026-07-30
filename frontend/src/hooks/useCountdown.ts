import { useState, useEffect, useRef } from 'react';

interface CountdownResult {
    minutes: number;
    seconds: number;
    totalSeconds: number;
    isExpired: boolean;
    formatted: string; // "MM:SS"
}

/**
 * Countdown hook that updates every second until a target timestamp.
 * 
 * @param targetDate - Target timestamp (Date object or ISO string)
 * @param onExpire - Optional callback when countdown reaches 0
 * @returns Countdown state with formatted time
 */
export function useCountdown(
    targetDate: Date | string | null,
    onExpire?: () => void
): CountdownResult {
    const [timeLeft, setTimeLeft] = useState<number>(0);
    const onExpireRef = useRef(onExpire);

    // Keep callback ref updated
    useEffect(() => {
        onExpireRef.current = onExpire;
    }, [onExpire]);

    useEffect(() => {
        if (!targetDate) {
            setTimeLeft(0);
            return;
        }

        const target = typeof targetDate === 'string' ? new Date(targetDate) : targetDate;

        // Calculate initial time left
        const updateTimeLeft = () => {
            const now = Date.now();
            const difference = target.getTime() - now;

            if (difference <= 0) {
                setTimeLeft(0);
                if (onExpireRef.current) {
                    onExpireRef.current();
                }
                return false; // Stop interval
            }

            setTimeLeft(Math.ceil(difference / 1000));
            return true; // Continue interval
        };

        // Update immediately
        if (!updateTimeLeft()) {
            return; // Already expired
        }

        // Update every second
        const interval = setInterval(() => {
            if (!updateTimeLeft()) {
                clearInterval(interval);
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [targetDate]);

    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    const formatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

    return {
        minutes,
        seconds,
        totalSeconds: timeLeft,
        isExpired: timeLeft <= 0,
        formatted,
    };
}
