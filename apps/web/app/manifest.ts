import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: "JARVIS",
        short_name: "JARVIS",
        description: "Private owner-controlled JARVIS conversational interface",
        start_url: "/conversation",
        scope: "/",
        display: "standalone",
        background_color: "#050505",
        theme_color: "#050505",
        orientation: "portrait-primary",
        categories: ["productivity", "utilities"],
        icons: [
            {
                src: "/icon",
                sizes: "512x512",
                type: "image/png",
                purpose: "any maskable",
            },
        ],
    };
}
