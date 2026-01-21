import { DEMO_PRODUCTS } from '../src/commerce/marketplace';

export default function handler(req: any, res: any) {
  res.status(200).json(DEMO_PRODUCTS);
}
