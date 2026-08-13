'use client';

import { useMemo } from 'react';
import clsx from 'clsx';

type AnsiSegment = {
    text: string;
    bold?: boolean;
    underline?: boolean;
    colorClass?: string;
};

function parseAnsiText(text: string): AnsiSegment[] {
    const ansiRegex = /\x1B\[[0-9;]*m/g;
    let match;
    let lastIndex = 0;
    const segments: AnsiSegment[] = [];

    let isBold = false;
    let isUnderline = false;
    let currentColorClass = '';

    const getStylesFromCodes = (codesStr: string) => {
        if (!codesStr || codesStr === '0') {
            isBold = false;
            isUnderline = false;
            currentColorClass = '';
            return;
        }

        const codes = codesStr.split(';').map(Number);
        for (const code of codes) {
            if (code === 0) {
                isBold = false;
                isUnderline = false;
                currentColorClass = '';
            } else if (code === 1) {
                isBold = true;
            } else if (code === 4) {
                isUnderline = true;
            } else if (code >= 30 && code <= 37) {
                const colors = [
                    'text-[#000000]',
                    'text-rose-400 font-semibold',
                    'text-emerald-400',
                    'text-amber-400',
                    'text-sky-400',
                    'text-fuchsia-400',
                    'text-cyan-400',
                    'text-[#FFFFFF]'
                ];
                currentColorClass = colors[code - 30] || '';
            } else if (code >= 90 && code <= 97) {
                const brightColors = [
                    'text-[#666666]',
                    'text-rose-300 font-bold',
                    'text-emerald-300 font-bold',
                    'text-amber-300 font-bold',
                    'text-sky-300 font-bold',
                    'text-fuchsia-300 font-bold',
                    'text-cyan-300 font-bold',
                    'text-white font-bold'
                ];
                currentColorClass = brightColors[code - 90] || '';
            } else if (code === 39) {
                currentColorClass = '';
            }
        }
    };

    while ((match = ansiRegex.exec(text)) !== null) {
        const textSegment = text.substring(lastIndex, match.index);
        if (textSegment) {
            segments.push({
                text: textSegment,
                bold: isBold,
                underline: isUnderline,
                colorClass: currentColorClass
            });
        }
        const rawCode = match[0].substring(2, match[0].length - 1);
        getStylesFromCodes(rawCode);
        lastIndex = ansiRegex.lastIndex;
    }

    const remainingText = text.substring(lastIndex);
    if (remainingText) {
        segments.push({
            text: remainingText,
            bold: isBold,
            underline: isUnderline,
            colorClass: currentColorClass
        });
    }

    return segments;
}

export function AnsiText({ text, searchQuery }: { text: string; searchQuery: string }) {
    const segments = useMemo(() => parseAnsiText(text), [text]);

    if (!searchQuery) {
        return (
            <span className="break-all whitespace-pre-wrap font-mono">
                {segments.map((seg, idx) => (
                    <span
                        key={idx}
                        className={clsx(
                            seg.bold && 'font-bold',
                            seg.underline && 'underline',
                            seg.colorClass
                        )}
                    >
                        {seg.text}
                    </span>
                ))}
            </span>
        );
    }

    return (
        <span className="break-all whitespace-pre-wrap font-mono">
            {segments.map((seg, idx) => {
                const classes = clsx(
                    seg.bold && 'font-bold',
                    seg.underline && 'underline',
                    seg.colorClass
                );

                if (seg.text.toLowerCase().includes(searchQuery.toLowerCase())) {
                    const queryRegex = new RegExp(`(${searchQuery.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'gi');
                    const parts = seg.text.split(queryRegex);

                    return (
                        <span key={idx} className={classes}>
                            {parts.map((part, pIdx) =>
                                part.toLowerCase() === searchQuery.toLowerCase() ? (
                                    <mark key={pIdx} className="bg-amber-400/30 text-amber-200 px-0.5 rounded font-bold">
                                        {part}
                                    </mark>
                                ) : (
                                    part
                                )
                            )}
                        </span>
                    );
                }

                return (
                    <span key={idx} className={classes}>
                        {seg.text}
                    </span>
                );
            })}
        </span>
    );
}
