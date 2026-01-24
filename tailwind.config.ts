import type { Config } from "tailwindcss";

const config: Config = {
    content: [
        "./pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./components/**/*.{js,ts,jsx,tsx,mdx}",
        "./app/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            colors: {
                background: "#FAFAF9",
                foreground: "#1F2937",
                accent: "#6366F1",
                "accent-hover": "#4F46E5",
                muted: "#9CA3AF",
                border: "#E5E7EB",
            },
            fontFamily: {
                sans: [
                    "-apple-system",
                    "BlinkMacSystemFont",
                    "Segoe UI",
                    "Roboto",
                    "Oxygen",
                    "Ubuntu",
                    "Cantarell",
                    "sans-serif",
                ],
            },
            spacing: {
                "18": "4.5rem",
                "22": "5.5rem",
            },
            borderRadius: {
                "xl": "0.75rem",
                "2xl": "1rem",
            },
        },
    },
    plugins: [],
};

export default config;
