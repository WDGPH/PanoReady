import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// Option B: serif "P" monogram with a small gold dot accent,
// on the brand's verde background (see app/globals.css --verde/--gold).
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
          background: "#3F4A34",
          borderRadius: 8,
          position: "relative",
        }}
      >
        <div
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: "#F3ECDD",
            fontFamily: "Georgia, serif",
            display: "flex",
            transform: "translate(-1px, -1px)",
          }}
        >
          P
        </div>
        <div
          style={{
            position: "absolute",
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: "#E7C77E",
            right: 7,
            bottom: 7,
            display: "flex",
          }}
        />
      </div>
    ),
    { ...size }
  );
}
