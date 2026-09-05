import { ImageResponse } from "next/og";

export const size = {
    width: 180,
    height: 180,
};

export const contentType = "image/png";

export default function AppleIcon() {
    return new ImageResponse(
        (
            <div
                style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "#050505",
                    color: "#d9a326",
                    fontSize: 104,
                    fontWeight: 700,
                    fontFamily: "serif",
                    borderRadius: 36,
                    border: "4px solid #d9a326",
                }}
            >
                ॐ
            </div>
        ),
        size,
    );
}
