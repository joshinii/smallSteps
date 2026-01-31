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
                background: "#FAF9F7",
                foreground: "#2C2A27",
                accent: "#7C6F5E",
                "accent-hover": "#6A5F4F",
                muted: "#9B8F80",
                border: "#E8E4DF",
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
