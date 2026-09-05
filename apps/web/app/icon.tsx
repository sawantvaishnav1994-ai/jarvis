import { ImageResponse } from "next/og";

export const size = {
    width: 512,
    height: 512,
};

export const contentType = "image/png";

export default function Icon() {
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
                    fontSize: 300,
                    fontWeight: 700,
                    fontFamily: "serif",
                    border: "12px solid #d9a326",
                    borderRadius: 112,
                }}
            >
                ॐ
            </div>
        ),
        size,
    );
}
