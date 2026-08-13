'use client';

import React from 'react';
import clsx from 'clsx';

export type BrandLogoVariant = 'symbol' | 'primary' | 'secondary' | 'icon';
export type BrandLogoSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'hero';

interface BrandLogoProps {
    variant?: BrandLogoVariant;
    size?: BrandLogoSize;
    className?: string;
    showBadge?: boolean;
    badgeText?: string;
}

const SIZE_MAP: Record<BrandLogoSize, { svg: number; container: string; font: string; subfont: string }> = {
    sm: { svg: 14, container: 'h-6 w-6', font: 'text-xs', subfont: 'text-[9px]' },
    md: { svg: 18, container: 'h-8 w-8', font: 'text-sm', subfont: 'text-[10px]' },
    lg: { svg: 22, container: 'h-10 w-10', font: 'text-base', subfont: 'text-[11px]' },
    xl: { svg: 30, container: 'h-12 w-12', font: 'text-lg', subfont: 'text-xs' },
    '2xl': { svg: 40, container: 'h-16 w-16', font: 'text-xl', subfont: 'text-xs' },
    hero: { svg: 64, container: 'h-24 w-24', font: 'text-3xl', subfont: 'text-sm' },
};

export function DeployForgeSymbol({ size = 20, className }: { size?: number; className?: string }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={clsx('shrink-0 text-white select-none', className)}
            aria-hidden="true"
        >
            {/* DeployForge Dual Diagonal Parallel Bars (45° Precision Vector) */}
            <path
                d="M4 3H11L21 13V17H17L7 7H4V3Z"
                fill="currentColor"
            />
            <path
                d="M3 11.5H7.5L17 21H12.5L3 11.5Z"
                fill="currentColor"
            />
        </svg>
    );
}

export function DeployForgeLogo({
    variant = 'primary',
    size = 'md',
    className,
    showBadge = false,
    badgeText = 'v1.0',
}: BrandLogoProps) {
    const dimensions = SIZE_MAP[size];

    if (variant === 'symbol') {
        return <DeployForgeSymbol size={dimensions.svg} className={className} />;
    }

    if (variant === 'icon') {
        return (
            <div
                className={clsx(
                    'flex items-center justify-center rounded-md border border-[#1F1F1F] bg-[#0A0A0A] transition-colors',
                    dimensions.container,
                    className
                )}
            >
                <DeployForgeSymbol size={dimensions.svg} />
            </div>
        );
    }

    if (variant === 'secondary') {
        return (
            <div className={clsx('inline-flex items-center gap-2.5 font-mono select-none', className)}>
                <div className="flex h-7 w-7 items-center justify-center rounded border border-[#1F1F1F] bg-[#0A0A0A]">
                    <DeployForgeSymbol size={15} />
                </div>
                <div className="flex items-center gap-2">
                    <span className="font-bold uppercase tracking-widest text-white text-xs">
                        DEPLOYFORGE
                    </span>
                    {showBadge && (
                        <span className="rounded border border-[#1F1F1F] bg-[#111111] px-1.5 py-0.5 text-[9px] font-mono text-[#A1A1A1]">
                            {badgeText}
                        </span>
                    )}
                </div>
            </div>
        );
    }

    // Default: 'primary' (Symbol + Wordmark)
    return (
        <div className={clsx('inline-flex items-center gap-2.5 font-mono select-none', className)}>
            <div className="flex h-7 w-7 items-center justify-center rounded border border-[#1F1F1F] bg-[#0A0A0A]">
                <DeployForgeSymbol size={15} />
            </div>
            <div className="flex flex-col justify-center">
                <div className="flex items-center gap-2">
                    <span className={clsx('font-bold tracking-tight text-white', dimensions.font)}>
                        Deploy<span className="text-[#A1A1A1] font-normal">Forge</span>
                    </span>
                    {showBadge && (
                        <span className="rounded border border-[#1F1F1F] bg-[#111111] px-1.5 py-0.5 text-[9px] font-mono text-[#666666]">
                            {badgeText}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}
