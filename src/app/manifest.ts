import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Small Group",
    short_name: "Small Group",
    description: "Meals, prayer, and notes for our weekly small group",
    start_url: "/",
    display: "standalone",
    background_color: "#FAF5EC",
    theme_color: "#C4693F",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
