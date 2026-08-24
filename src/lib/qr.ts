import QRCode from "qrcode";

/** A PNG data URL for `text`, sized for on-screen scanning + printing. */
export function qrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, { width: 320, margin: 2, errorCorrectionLevel: "M" });
}
