import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: "JARVIS",
        short_name: "JARVIS",
        description: "Private owner-controlled JARVIS conversational interface",
        start_url: "/conversation",
        scope: "/",
        display: "standalone",
        background_color: "#f5f5f0",
        theme_color: "#18282b",
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
