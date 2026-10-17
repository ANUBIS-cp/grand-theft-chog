/** The owner's wallets (ADMIN_WALLETS, comma-separated, in the server's settings): the usage page, demo controls. */
export function isAdmin(address: string | null | undefined): boolean {
  if (!address) return false;
  return (process.env.ADMIN_WALLETS ?? '')
    .split(',')
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean)
    .includes(address.toLowerCase());
}
