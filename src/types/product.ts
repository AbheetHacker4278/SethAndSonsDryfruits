export type { VideoDetails, Product } from '../../shared/catalogSeed';
import type { Product } from '../../shared/catalogSeed';

export type OrderStatus =
  | 'placed'
  | 'confirmed'
  | 'processing'
  | 'packed'
  | 'dispatched'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled';

export interface OrderItem {
  productId: string;
  quantity: number;
}

export interface CustomerDetails {
  fullName: string;
  mobileNumber: string;
  whatsappNumber: string;
  sameAsMobile: boolean;
  email: string;
  deliveryAddress: string;
  city: string;
  state: string;
  pincode: string;
  instructions: string;
}

export interface PurchaseRequest {
  id: string;
  createdAt: string;
  items: {
    product: Product;
    quantity: number;
    subtotal: number;
  }[];
  totalEstimatedAmount: number;
  customer: CustomerDetails;
  status?: OrderStatus;
}
