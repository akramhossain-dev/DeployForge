export type UserAgentInfo = {
    browser: string;
    device: string;
    os: string;
};

export function parseUserAgent(userAgent?: string): UserAgentInfo {
    let browser = 'Unknown Browser';
    let device = 'Desktop';
    let os = 'Unknown OS';

    if (!userAgent) {
        return { browser, device, os };
    }

    const normalized = userAgent.toLowerCase();
    if (/mobile|android|iphone|ipad|phone/i.test(normalized)) device = 'Mobile';
    else if (/tablet|ipad/i.test(normalized)) device = 'Tablet';

    if (/chrome|crios/i.test(normalized) && !/edge|edg|opr/i.test(normalized)) browser = 'Chrome';
    else if (/safari/i.test(normalized) && !/chrome|crios/i.test(normalized)) browser = 'Safari';
    else if (/firefox|fxios/i.test(normalized)) browser = 'Firefox';
    else if (/edge|edg/i.test(normalized)) browser = 'Edge';
    else if (/opr/i.test(normalized)) browser = 'Opera';

    if (/windows|win32/i.test(normalized)) os = 'Windows';
    else if (/macintosh|mac os x/i.test(normalized)) os = 'macOS';
    else if (/linux/i.test(normalized)) os = 'Linux';
    else if (/android/i.test(normalized)) os = 'Android';
    else if (/iphone|ipad|ipod/i.test(normalized)) os = 'iOS';

    return { browser, device, os };
}
