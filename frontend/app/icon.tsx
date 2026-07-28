import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
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
          background: "#161b26",
          borderRadius: 7,
        }}
      >
        <svg width="24" height="24" viewBox="0 0 26 26" fill="none">
          <line x1="5" y1="13" x2="21" y2="13" stroke="#c9a24b" strokeWidth="1.4" />
          <circle cx="17" cy="9" r="2.6" fill="#ddb968" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
