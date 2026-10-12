export function whatsappWindowOpen(lastInboundAt: string | null | undefined): boolean {
  if (!lastInboundAt) return false;
  const at = Date.parse(lastInboundAt);
  return Number.isFinite(at) && at <= Date.now() && Date.now() - at < 24 * 60 * 60 * 1000;
}
