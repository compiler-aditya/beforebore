"use client";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        gap: 12,
        padding: 40,
        textAlign: "center",
        fontFamily: "inherit",
        background: "#0c0e12",
        color: "#f4f4f5",
      }}
    >
      <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
        BeforeBore couldn’t load this view.
      </h2>
      <p
        style={{ color: "#a1a1aa", maxWidth: 420, lineHeight: 1.5, margin: 0 }}
      >
        Your data has not been changed. Please try loading the view again.
      </p>
      <button
        type="button"
        onClick={reset}
        style={{ background: "#fbbf24", color: "#09090b", border: 0, borderRadius: 8, padding: "10px 16px", fontWeight: 700, cursor: "pointer" }}
      >
        Try again
      </button>
    </main>
  );
}
