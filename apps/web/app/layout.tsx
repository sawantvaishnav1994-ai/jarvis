import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "./mobile.css";

export const metadata: Metadata = {
    title: {
        default: "JARVIS",
        template: "%s · JARVIS",
    },
    description: "Private owner-controlled JARVIS conversational interface",
    applicationName: "JARVIS",
    manifest: "/manifest.webmanifest",
    appleWebApp: {
        capable: true,
        title: "JARVIS",
        statusBarStyle: "black-translucent",
    },
    formatDetection: {
        telephone: false,
    },
};

export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
    colorScheme: "light",
    themeColor: "#18282b",
};

export default function RootLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    );
}
