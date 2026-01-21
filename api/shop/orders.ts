// Simple in-memory order store (resets on deploy)
// In production, use a database

export default async function handler(req: any, res: any) {
  // Return empty orders for now (demo mode)
  res.json({
    orders: [],
    total: 0,
  });
}
