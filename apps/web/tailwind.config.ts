import type { Config } from 'tailwindcss';

const config: Config = {
    content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './hooks/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                background: '#000000',
                surface: {
                    DEFAULT: '#0A0A0A',
                    secondary: '#111111',
                },
                border: '#1F1F1F',
                foreground: '#FFFFFF',
                'secondary-foreground': '#A1A1A1',
                'muted-foreground': '#666666',
                // Map default slate color palette to pure black developer tool values
                slate: {
                    950: '#000000',
                    900: '#0A0A0A',
                    800: '#111111',
                    700: '#1F1F1F',
                    600: '#666666',
                    500: '#888888',
                    400: '#A1A1A1',
                    300: '#D4D4D4',
                    200: '#E5E5E5',
                    100: '#F5F5F5',
                    50: '#FFFFFF',
                },
            },
            borderRadius: {
                DEFAULT: '0.375rem',
            },
        },
    },
    plugins: [],
};

export default config;

