const PATHS: Record<string, React.ReactNode> = {
    prod_001: (
        <>
            <rect x="7.5" y="3.5" width="9" height="17" rx="4.5" />
            <path d="M12 7.5v3" />
        </>
    ),

    prod_002: (
        <>
            <rect x="2.5" y="6.5" width="19" height="11" rx="1.5" />
            <path d="M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01M8 14h8" />
        </>
    ),

    prod_003: (
        <>
            <rect x="3.5" y="9.5" width="17" height="6" rx="3" />
            <path d="M8 9.5v-3M12 9.5v-3M16 9.5v-3" />
        </>
    ),

    prod_004: (
        <>
            <rect x="2.5" y="4.5" width="19" height="12" rx="1.5" />
            <path d="M9 20.5h6M12 16.5v4" />
        </>
    ),

    prod_005: (
        <>
            <path d="M4 15v-3a8 8 0 0 1 16 0v3" />
            <rect x="2.5" y="14.5" width="4" height="6" rx="1.5" />
            <rect x="17.5" y="14.5" width="4" height="6" rx="1.5" />
        </>
    ),

    prod_006: (
        <>
            <circle cx="12" cy="10" r="5.5" />
            <circle cx="12" cy="10" r="1.75" />
            <path d="M6 20.5h12" />
        </>
    ),

    prod_007: (
        <>
            <rect x="3.5" y="6.5" width="17" height="11" rx="1.5" />
            <path d="M7 17.5v3M11 17.5v3M15 17.5v3M8 10.5h8" />
        </>
    ),

    prod_008: (
        <>
            <path d="M4 18c4 0 3-6 8-6s4 6 8 6" />
            <rect x="2.5" y="15.5" width="3" height="5" rx="1" />
            <rect x="18.5" y="15.5" width="3" height="5" rx="1" />
        </>
    ),

    prod_009: (
        <>
            <rect x="2.5" y="7.5" width="19" height="9" rx="1.5" />
            <path d="M2.5 12h19" />
        </>
    ),

    prod_010: (
        <>
            <path d="M5 19l6-11M19 19l-6-11" />
            <path d="M3.5 19.5h17M9 12.5h6" />
        </>
    ),

    prod_011: (
        <>
            <rect x="9.5" y="2.5" width="5" height="10" rx="2.5" />
            <path d="M6.5 11a5.5 5.5 0 0 0 11 0M12 16.5v4M9 20.5h6" />
        </>
    ),

    prod_012: (
        <>
            <path d="M4 20.5h7M7.5 20.5V11M7.5 11l7-5" />
            <path d="M11.5 4.5l7 4-3.5 4z" />
        </>
    ),

    prod_013: (
        <>
            <rect x="2.5" y="13.5" width="19" height="6" rx="1.5" />
            <path d="M6 16.5h.01M9.5 16.5h.01" />
            <path d="M8 9.5a6 6 0 0 1 8 0M10.5 6.5a10 10 0 0 1 3 0" />
        </>
    ),

    prod_014: (
        <>
            <rect x="5.5" y="3.5" width="13" height="17" rx="1.5" />
            <path d="M12.5 8l-2.5 4h4l-2.5 4" />
        </>
    ),

    prod_015: (
        <>
            <path d="M9 20.5c-2 0-3.5-1.6-3.5-3.5V9a5.5 5.5 0 0 1 5.5-5.5c2 0 3.5 1.6 3.5 3.5v8a5.5 5.5 0 0 1-5.5 5.5z" />
            <path d="M9 7.5v3" />
        </>
    ),
};

const FALLBACK = (
    <>
        <rect x="3.5" y="6.5" width="17" height="12" rx="1.5" />
        <path d="M3.5 10.5h17" />
    </>
);

export function ProductIcon({ id }: { id: string }) {
    return (
        <svg
            className="product-icon"
            viewBox="0 0 24 24"
            width="22"
            height="22"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            {PATHS[id] ?? FALLBACK}
        </svg>
    );
}
