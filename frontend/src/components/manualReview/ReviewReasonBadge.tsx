/**
 * ReviewReasonBadge Component
 * 
 * Color-coded badge displaying manual review reason
 * - low_confidence: Amber
 * - fallback_mode: Orange  
 * - screening_failed: Red
 * - flagged: Purple
 */

interface ReviewReasonBadgeProps {
    reason: string | null;
}

const reasonConfig: Record<
    string,
    { label: string; bgColor: string; textColor: string }
> = {
    low_confidence: {
        label: 'Low AI Confidence',
        bgColor: '#FEF3C7',
        textColor: '#92400E',
    },
    fallback_mode: {
        label: 'AI Unavailable',
        bgColor: '#FFEDD5',
        textColor: '#9A3412',
    },
    screening_failed: {
        label: 'Screening Failed',
        bgColor: '#FEE2E2',
        textColor: '#991B1B',
    },
    flagged: {
        label: 'Flagged for Review',
        bgColor: '#F3E8FF',
        textColor: '#6B21A8',
    },
};

export function ReviewReasonBadge({ reason }: ReviewReasonBadgeProps) {
    if (!reason) {
        return (
            <span
                style={{
                    display: 'inline-block',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 500,
                    backgroundColor: '#F3F4F6',
                    color: '#6B7280',
                }}
            >
                Manual Review
            </span>
        );
    }

    const config = reasonConfig[reason] || {
        label: reason.replace(/_/g, ' '),
        bgColor: '#F3F4F6',
        textColor: '#6B7280',
    };

    return (
        <span
            style={{
                display: 'inline-block',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 500,
                backgroundColor: config.bgColor,
                color: config.textColor,
            }}
            role="status"
            aria-label={`Review reason: ${config.label}`}
        >
            {config.label}
        </span>
    );
}
