// modules/lab/lab_document_proxy.js
import express from "express";

const router = express.Router();

// Streams a Cloudinary-hosted attachment back to the client with
// Content-Disposition: inline, so browsers/WebViews render it directly
// instead of downloading it. Needed because Cloudinary's `raw` resource
// type always serves `attachment` disposition — the `fl_attachment:false`
// URL flag has no effect on `raw` resources (confirmed by direct test),
// so there's no URL-based workaround; proxying and rewriting the header
// ourselves is the only reliable fix.
//
// Unauthenticated by design: <iframe> src, mobile WebViews, and Google Docs
// viewer cannot attach Authorization headers. Safe because proxy target is
// strictly restricted to https://res.cloudinary.com/.
router.get("/proxy", async (req, res, next) => {
  try {
    const { url } = req.query;
    if (!url || typeof url !== "string" || !url.startsWith("https://res.cloudinary.com/")) {
      return res.status(400).json({ success: false, message: "Invalid document URL" });
    }

    const upstream = await fetch(url);
    if (!upstream.ok) {
      return res.status(upstream.status).json({ success: false, message: "Failed to fetch document" });
    }

    // The server's global helmet CSP sets frame-ancestors 'self', which
    // blocks this exact route — the frontend embedding this PDF
    // (wellirecord.com) is a different origin than this backend
    // (wellirecord.onrender.com). Override it here so the patient-facing
    // app can actually iframe what this route serves.
    res.setHeader(
      "Content-Security-Policy",
      "frame-ancestors 'self' https://wellirecord.com https://www.wellirecord.com https://staging.wellirecord.com https://wellirecords.vercel.app http://localhost:5173 http://localhost:3000"
    );
    res.removeHeader("X-Frame-Options");

    let contentType = upstream.headers.get("content-type") || "application/pdf";
    if (contentType === "application/octet-stream" || !contentType) {
      contentType = "application/pdf";
    }

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", "inline");
    res.setHeader("Cache-Control", "private, max-age=3600");

    const buffer = Buffer.from(await upstream.arrayBuffer());
    return res.send(buffer);
  } catch (error) {
    next(error);
  }
});

export default router;
