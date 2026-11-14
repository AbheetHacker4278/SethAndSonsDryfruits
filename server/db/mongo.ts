import mongoose, { Connection, Model, Schema } from 'mongoose';
import { BRAND_CONFIG, parsePackPieces, parseWeightGrams, PRODUCTS_SEED } from '../../shared/catalogSeed.ts';
import { AppConfig } from '../config.ts';
import { DEFAULT_EMAIL_TEMPLATES } from '../emails/defaultTemplates.ts';
import { hashPassword, normalizeEmail } from '../utils/crypto.ts';

export const ALL_ADMIN_PERMISSIONS = [
  'dashboard',
  'products',
  'categories',
  'inventory',
  'orders',
  'customers',
  'suppliers',
  'purchases',
  'sales',
  'expenses',
  'coupons',
  'reports',
  'communications',
  'support',
  'marketing',
  'staff',
  'settings',
] as const;

export type AdminPermission = (typeof ALL_ADMIN_PERMISSIONS)[number];

export const PERMISSION_DEFINITIONS: Array<{
  key: AdminPermission;
  label: string;
  module: string;
  description: string;
}> = [
    { key: 'dashboard', label: 'Dashboard', module: 'Overview', description: 'View KPI summary and analytics charts' },
    { key: 'products', label: 'Products', module: 'Catalog', description: 'Manage products, SKUs, and weight variants' },
    { key: 'categories', label: 'Categories', module: 'Catalog', description: 'Manage dry-fruit product categories' },
    { key: 'inventory', label: 'Inventory', module: 'Warehouse', description: 'Manage stock levels, batches, and audit logs' },
    { key: 'orders', label: 'Orders', module: 'Fulfillment', description: 'Process orders, dispatch AWB, invoices, returns' },
    { key: 'customers', label: 'Customers', module: 'CRM', description: 'View customer profiles, spend, and segments' },
    { key: 'suppliers', label: 'Suppliers', module: 'Procurement', description: 'Manage dry-fruit growers and vendor payables' },
    { key: 'purchases', label: 'Purchases', module: 'Procurement', description: 'Create POs and receive inventory stock' },
    { key: 'sales', label: 'Sales & Revenue', module: 'Finance', description: 'Inspect sales, COGS, GST, and P&L statements' },
    { key: 'expenses', label: 'Expenses', module: 'Finance', description: 'Record and categorize operating expenses' },
    { key: 'coupons', label: 'Coupons', module: 'Growth', description: 'Manage promotional codes and discounts' },
    { key: 'reports', label: 'Reports', module: 'Analytics', description: 'Preview and export PDF, Excel, and CSV reports' },
    { key: 'communications', label: 'Communications', module: 'Messaging', description: 'Manage email templates, logs, and suppressions' },
    { key: 'support', label: 'Customer Service', module: 'Concierge', description: 'Review customer service tickets, attachments, and send custom replies' },
    { key: 'marketing', label: 'Marketing', module: 'Growth', description: 'Run festival & product launch email campaigns' },
    { key: 'staff', label: 'Staff Management', module: 'Security', description: 'Manage admin/staff roles & permissions' },
    { key: 'settings', label: 'Settings', module: 'System', description: 'Configure website storefront & business/tax rules' },
  ];

export const DEFAULT_EMAIL_PREFERENCES = {
  transactional: {
    orderConfirmation: true,
    shipmentUpdates: true,
    deliveryUpdates: true,
    cancellationAndRefund: true,
    accountSecurity: true,
  },
  marketing: {
    newProductAnnouncements: true,
    festivalOffers: true,
    promotionalDiscounts: true,
    specialCampaigns: true,
    newsletter: true,
  },
};

export const DEFAULT_CATEGORIES = [
  { id: 'cat_almonds', name: 'Almonds (Badam)', slug: 'almonds', storefrontGroup: 'nuts', description: 'High-oil Kashmiri & Mamra almonds' },
  { id: 'cat_cashews', name: 'Cashews (Kaju)', slug: 'cashews', storefrontGroup: 'nuts', description: 'Jumbo W-240 ivory whole cashews' },
  { id: 'cat_pistachios', name: 'Pistachios (Pista)', slug: 'pistachios', storefrontGroup: 'nuts', description: 'Wood-roasted smiling emerald pistachios' },
  { id: 'cat_walnuts', name: 'Walnuts (Akhrot)', slug: 'walnuts', storefrontGroup: 'nuts', description: 'Wild Chenab Valley & Kishtwar walnut kernels' },
  { id: 'cat_raisins', name: 'Raisins (Kishmish)', slug: 'raisins', storefrontGroup: 'dried-fruits', description: 'Earthen shade-cured seedless raisins' },
  { id: 'cat_figs', name: 'Figs (Anjeer)', slug: 'figs', storefrontGroup: 'dried-fruits', description: 'Sun-cured sweet mountain figs' },
  { id: 'cat_berries_seeds', name: 'Berries & Seeds', slug: 'berries-and-seeds', storefrontGroup: 'dried-fruits', description: 'Antioxidant-rich dried berries, plums & superfood seeds' },
  { id: 'cat_dates_honey', name: 'Dates & Honey', slug: 'dates-and-honey', storefrontGroup: 'dried-fruits', description: 'Royal Arabian dates & pure wild Himalayan honey' },
  { id: 'cat_oils', name: 'Oil', slug: 'oil', storefrontGroup: 'nuts', description: 'Pure cold-pressed Almond, Walnut, Apricot & Kalonji oils' },
  { id: 'cat_spices', name: 'Spices', slug: 'spices', storefrontGroup: 'saffron', description: 'Pure Kashmiri spices, whole aromatics, saffron & authentic hing' },
  { id: 'cat_mix', name: 'Premium Dry Fruit Mix', slug: 'premium-mix', storefrontGroup: 'nuts', description: 'Curated signature trail & vitality assortments' },
  { id: 'cat_hampers', name: 'Gift Hampers', slug: 'gift-hampers', storefrontGroup: 'saffron', description: 'Royal velvet & walnut-wood gifting chests' },
  { id: 'cat_other', name: 'Other Products', slug: 'other', storefrontGroup: 'saffron', description: 'Pure Kashmiri Mongra Saffron & specialty reserves' },
];

export const DEFAULT_BUSINESS_SETTINGS = {
  businessName: 'Seth And Sons DryFruits',
  businessAddress: 'D - 315 Sentosa Heights , Bhimrad Road , Althan , Surat - 395007',
  gstin: '01AABCA4819K1Z5',
  contactNumber: '+91 6356038361',
  businessEmail: 'aseth9588@gmail.com',
  currency: 'INR ₹',
  defaultGstRate: 5,
  invoicePrefix: 'AS-INV',
  nextInvoiceNumber: 1001,
  defaultShippingCharge: 120,
  freeShippingThreshold: 5000,
  notificationPreferences: {
    lowStockAlerts: true,
    newOrderAlerts: true,
    expiryAlerts: true,
    supplierPaymentAlerts: true,
  },
};

export const DEFAULT_WEBSITE_SETTINGS = {
  logoUrl: BRAND_CONFIG.logoPath,
  faviconUrl: BRAND_CONFIG.logoPath,
  brandName: BRAND_CONFIG.name,
  tagline: 'A Legacy of Quality & Taste',
  heroBanners: BRAND_CONFIG.heroVideos,
  featuredProductIds: ['kaju', 'badam', 'kesar'],
  promotionalSections: [
    {
      title: 'Direct Jammu & Kashmir Provenance',
      subtitle: 'Hand-graded harvests cured in traditional earthen cellars.',
      active: true,
    },
  ],
  footerAbout: 'Three generations of royal grading rooted in Jammu & Kashmir.',
  contactPhone: BRAND_CONFIG.displayPhone,
  contactEmail: BRAND_CONFIG.supportEmail,
  dispatchLocation: BRAND_CONFIG.dispatchLocation,
  socialLinks: {
    instagram: 'https://instagram.com/sethandsonsdryfruits',
    facebook: 'https://facebook.com/sethandsonsdryfruits',
    whatsapp: BRAND_CONFIG.whatsappBusinessNumber,
  },
  shippingInfo: 'Orders above ₹5,000 ship complimentary across India within 3–5 business days.',
  returnPolicy: 'Unopened vacuum-sealed packs may be returned within 7 days of delivery.',
  privacyPolicy: 'Customer data is encrypted and used strictly for verified order fulfillment and consented updates.',
  termsAndConditions: 'All authentic dry-fruit harvests are graded in Jammu and sold subject to batch availability.',
};

const PRODUCT_CATEGORY_MAP: Record<string, { catId: string; sku: string; purchasePrice: number; stock: number; minAlert: number }> = {
  kaju: { catId: 'cat_cashews', sku: 'AS-KAJ-W240', purchasePrice: 980, stock: 42, minAlert: 10 },
  badam: { catId: 'cat_almonds', sku: 'AS-BAD-MAM', purchasePrice: 790, stock: 55, minAlert: 12 },
  kishmish: { catId: 'cat_raisins', sku: 'AS-KIS-GRN', purchasePrice: 460, stock: 38, minAlert: 10 },
  akhrot: { catId: 'cat_walnuts', sku: 'AS-AKH-KSH', purchasePrice: 540, stock: 30, minAlert: 8 },
  pista: { catId: 'cat_pistachios', sku: 'AS-PIS-JMB', purchasePrice: 1680, stock: 8, minAlert: 10 },
  kesar: { catId: 'cat_other', sku: 'AS-KES-MNG', purchasePrice: 255, stock: 180, minAlert: 50 },
  'akhrot-best': { catId: 'cat_walnuts', sku: 'AS-WAL-BST-03', purchasePrice: 599, stock: 10, minAlert: 3 },
  'akhrot-brown-giri': { catId: 'cat_walnuts', sku: 'AS-WAL-BRN', purchasePrice: 599, stock: 10, minAlert: 3 },
  'akhrot-kashmiri-medium': { catId: 'cat_walnuts', sku: 'AS-WAL-MED-05', purchasePrice: 379, stock: 10, minAlert: 3 },
  'akhrot-kashmiri-small': { catId: 'cat_walnuts', sku: 'AS-WAL-SML-06', purchasePrice: 279, stock: 10, minAlert: 3 },
  'akhrot-milky-white': { catId: 'cat_walnuts', sku: 'AS-WAL-MLK-01', purchasePrice: 879, stock: 10, minAlert: 3 },
  'akhrot-organic': { catId: 'cat_walnuts', sku: 'AS-WAL-ORG-04', purchasePrice: 479, stock: 10, minAlert: 3 },
  'akhrot-7star-kernels': { catId: 'cat_walnuts', sku: 'AS-WAL-7STAR', purchasePrice: 1239, stock: 10, minAlert: 3 },
  'akhrot-quarter-giri': { catId: 'cat_walnuts', sku: 'AS-WAL-QTR', purchasePrice: 849, stock: 10, minAlert: 3 },
  'akhrot-super-jumbo': { catId: 'cat_walnuts', sku: 'AS-WAL-JMB-02', purchasePrice: 649, stock: 10, minAlert: 3 },
  'akhrot-tukda-giri': { catId: 'cat_walnuts', sku: 'AS-WAL-TKD', purchasePrice: 759, stock: 10, minAlert: 3 },
  'akhrot-3star-kernels': { catId: 'cat_walnuts', sku: 'AS-WAL-3STAR', purchasePrice: 699, stock: 10, minAlert: 3 },
  'akhrot-4star-kernels': { catId: 'cat_walnuts', sku: 'AS-WAL-4STAR', purchasePrice: 799, stock: 10, minAlert: 3 },
  'akhrot-5star-kernels': { catId: 'cat_walnuts', sku: 'AS-WAL-5STAR', purchasePrice: 1059, stock: 10, minAlert: 3 },
  'kaju-best': { catId: 'cat_cashews', sku: 'AS-KAJ-BST', purchasePrice: 999, stock: 10, minAlert: 3 },
  'kaju-super-jumbo': { catId: 'cat_cashews', sku: 'AS-KAJ-JMB', purchasePrice: 1359, stock: 10, minAlert: 3 },
  'kaju-super': { catId: 'cat_cashews', sku: 'AS-KAJ-SUP', purchasePrice: 1099, stock: 10, minAlert: 3 },
  'pista-classic': { catId: 'cat_pistachios', sku: 'AS-PIS-CLS', purchasePrice: 1859, stock: 10, minAlert: 3 },
  'pista-kernels': { catId: 'cat_pistachios', sku: 'AS-PIS-KRN', purchasePrice: 2999, stock: 10, minAlert: 3 },
  'pista-premium': { catId: 'cat_pistachios', sku: 'AS-PIS-PRM', purchasePrice: 1999, stock: 10, minAlert: 3 },
  'kishmish-afghani': { catId: 'cat_raisins', sku: 'AS-KIS-AFG', purchasePrice: 559, stock: 10, minAlert: 3 },
  'kishmish-black': { catId: 'cat_raisins', sku: 'AS-KIS-BLK', purchasePrice: 599, stock: 10, minAlert: 3 },
  'kishmish-green': { catId: 'cat_raisins', sku: 'AS-KIS-GRN-02', purchasePrice: 599, stock: 10, minAlert: 3 },
  'kishmish-munaka': { catId: 'cat_raisins', sku: 'AS-KIS-MNK', purchasePrice: 799, stock: 10, minAlert: 3 },
  'anjeer-jammu': { catId: 'cat_figs', sku: 'AS-ANJ-JMU', purchasePrice: 999, stock: 10, minAlert: 3 },
  'anjeer-afghani': { catId: 'cat_figs', sku: 'AS-ANJ-AFG', purchasePrice: 1099, stock: 10, minAlert: 3 },
  'anjeer-best': { catId: 'cat_figs', sku: 'AS-ANJ-BST', purchasePrice: 1299, stock: 10, minAlert: 3 },
  'anjeer-juicy-jumbo': { catId: 'cat_figs', sku: 'AS-ANJ-JMB', purchasePrice: 1999, stock: 10, minAlert: 3 },
  'berry-aaloo-bhakhara': { catId: 'cat_berries_seeds', sku: 'AS-BRY-PLM', purchasePrice: 899, stock: 10, minAlert: 3 },
  'seed-basil': { catId: 'cat_berries_seeds', sku: 'AS-SED-BSL', purchasePrice: 519, stock: 10, minAlert: 3 },
  'berry-blackberry': { catId: 'cat_berries_seeds', sku: 'AS-BRY-BLK', purchasePrice: 799, stock: 10, minAlert: 3 },
  'berry-blueberry': { catId: 'cat_berries_seeds', sku: 'AS-BRY-BLU', purchasePrice: 1599, stock: 10, minAlert: 3 },
  'seed-chia': { catId: 'cat_berries_seeds', sku: 'AS-SED-CHA', purchasePrice: 559, stock: 10, minAlert: 3 },
  'berry-cranberry': { catId: 'cat_berries_seeds', sku: 'AS-BRY-CRN', purchasePrice: 699, stock: 10, minAlert: 3 },
  'seed-apricot': { catId: 'cat_berries_seeds', sku: 'AS-SED-APR', purchasePrice: 659, stock: 10, minAlert: 3 },
  'berry-dry-cherry': { catId: 'cat_berries_seeds', sku: 'AS-BRY-CHR', purchasePrice: 799, stock: 10, minAlert: 3 },
  'berry-dry-kiwi': { catId: 'cat_berries_seeds', sku: 'AS-BRY-KIW', purchasePrice: 599, stock: 10, minAlert: 3 },
  'seed-flax': { catId: 'cat_berries_seeds', sku: 'AS-SED-FLX', purchasePrice: 239, stock: 10, minAlert: 3 },
  'seed-muskmelon': { catId: 'cat_berries_seeds', sku: 'AS-SED-MMS', purchasePrice: 1199, stock: 10, minAlert: 3 },
  'seed-pumpkin': { catId: 'cat_berries_seeds', sku: 'AS-SED-PMP', purchasePrice: 699, stock: 10, minAlert: 3 },
  'berry-roseberry': { catId: 'cat_berries_seeds', sku: 'AS-BRY-RSB', purchasePrice: 599, stock: 10, minAlert: 3 },
  'berry-seedless-apricot': { catId: 'cat_berries_seeds', sku: 'AS-BRY-APR', purchasePrice: 1399, stock: 10, minAlert: 3 },
  'berry-strawberry': { catId: 'cat_berries_seeds', sku: 'AS-BRY-STR', purchasePrice: 959, stock: 10, minAlert: 3 },
  'seed-sunflower': { catId: 'cat_berries_seeds', sku: 'AS-SED-SUN-02', purchasePrice: 359, stock: 10, minAlert: 3 },
  'honey-acacia': { catId: 'cat_dates_honey', sku: 'AS-HNY-ACA', purchasePrice: 699, stock: 10, minAlert: 3 },
  'dates-ajwa': { catId: 'cat_dates_honey', sku: 'AS-DAT-AJW', purchasePrice: 1399, stock: 10, minAlert: 3 },
  'dates-arabian': { catId: 'cat_dates_honey', sku: 'AS-DAT-ARB', purchasePrice: 499, stock: 10, minAlert: 3 },
  'dates-fard-premium': { catId: 'cat_dates_honey', sku: 'AS-DAT-FRD', purchasePrice: 499, stock: 10, minAlert: 3 },
  'honey-gulkand': { catId: 'cat_dates_honey', sku: 'AS-HNY-GLK-01', purchasePrice: 299, stock: 10, minAlert: 3 },
  'dates-kalmi': { catId: 'cat_dates_honey', sku: 'AS-DAT-KLM', purchasePrice: 799, stock: 10, minAlert: 3 },
  'honey-kesar': { catId: 'cat_dates_honey', sku: 'AS-HNY-KES', purchasePrice: 799, stock: 10, minAlert: 3 },
  'honey-kashmiri': { catId: 'cat_dates_honey', sku: 'AS-HNY-KSH', purchasePrice: 449, stock: 10, minAlert: 3 },
  'dates-shuara': { catId: 'cat_dates_honey', sku: 'AS-DAT-SHR', purchasePrice: 399, stock: 10, minAlert: 3 },
  'oil-almond-100ml': { catId: 'cat_oils', sku: 'AS-OIL-ALM-01', purchasePrice: 249, stock: 1000, minAlert: 200 },
  'oil-apricot-100ml': { catId: 'cat_oils', sku: 'AS-OIL-APR-03', purchasePrice: 249, stock: 1000, minAlert: 200 },
  'oil-kalonji-100ml': { catId: 'cat_oils', sku: 'AS-OIL-KAL-04', purchasePrice: 249, stock: 1000, minAlert: 200 },
  'oil-walnut-100ml': { catId: 'cat_oils', sku: 'AS-OIL-WAL-02', purchasePrice: 249, stock: 1000, minAlert: 200 },
  'badam-kagzi-shell': { catId: 'cat_almonds', sku: 'AS-BAD-KGZ', purchasePrice: 499, stock: 10, minAlert: 3 },
  'badam-california-giri': { catId: 'cat_almonds', sku: 'AS-BAD-CAL', purchasePrice: 1159, stock: 10, minAlert: 3 },
  'badam-chapti-giri': { catId: 'cat_almonds', sku: 'AS-BAD-CHP', purchasePrice: 1079, stock: 10, minAlert: 3 },
  'badam-hanuman-mamra': { catId: 'cat_almonds', sku: 'AS-BAD-HNM', purchasePrice: 899, stock: 10, minAlert: 3 },
  'badam-kashmiri-giri': { catId: 'cat_almonds', sku: 'AS-BAD-KSH', purchasePrice: 1039, stock: 10, minAlert: 3 },
  'badam-kashmiri-malai': { catId: 'cat_almonds', sku: 'AS-BAD-MLI', purchasePrice: 1039, stock: 10, minAlert: 3 },
  'badam-kashmiri-mamra': { catId: 'cat_almonds', sku: 'AS-BAD-KMR', purchasePrice: 699, stock: 10, minAlert: 3 },
  'badam-shahi-kesari': { catId: 'cat_almonds', sku: 'AS-BAD-SHK', purchasePrice: 1559, stock: 10, minAlert: 3 },
  'spice-hing-powder': { catId: 'cat_spices', sku: 'AS-SPC-HNG-02', purchasePrice: 249, stock: 1000, minAlert: 200 },
  'spice-kashmiri-mirch-powder': { catId: 'cat_spices', sku: 'AS-SPC-KMP', purchasePrice: 579, stock: 10, minAlert: 3 },
  'spice-kashmiri-sabut-mirch': { catId: 'cat_spices', sku: 'AS-SPC-KSM', purchasePrice: 879, stock: 10, minAlert: 3 },
  'spice-masala-tikki': { catId: 'cat_spices', sku: 'AS-SPC-MTK', purchasePrice: 180, stock: 1000, minAlert: 250 },
  'spice-dalchini': { catId: 'cat_spices', sku: 'AS-SPC-DLC', purchasePrice: 779, stock: 10, minAlert: 3 },
  'spice-kali-mirch': { catId: 'cat_spices', sku: 'AS-SPC-KLM', purchasePrice: 1199, stock: 10, minAlert: 3 },
  'spice-laung': { catId: 'cat_spices', sku: 'AS-SPC-LNG', purchasePrice: 1399, stock: 10, minAlert: 3 },
  'spice-pure-hing': { catId: 'cat_spices', sku: 'AS-SPC-HNG-01', purchasePrice: 179, stock: 1000, minAlert: 200 },
  'spice-shah-zeera': { catId: 'cat_spices', sku: 'AS-SPC-SZR', purchasePrice: 1399, stock: 10, minAlert: 3 },
  // Superfoods, Gourmet Nuts & Artisanal Kashmiri Teas
  'sup-dhingri-mushroom': { catId: 'cat_other', sku: 'AS-SUP-DNG', purchasePrice: 1599, stock: 10, minAlert: 3 },
  'sup-hazelnut-kernels': { catId: 'cat_other', sku: 'AS-SUP-HZL', purchasePrice: 2599, stock: 10, minAlert: 3 },
  'sup-healthy-mix': { catId: 'cat_mix', sku: 'AS-MIX-HLT', purchasePrice: 759, stock: 10, minAlert: 3 },
  'sup-himalayan-garlic': { catId: 'cat_other', sku: 'AS-SUP-HMG', purchasePrice: 1399, stock: 10, minAlert: 3 },
  'sup-instant-kahwa': { catId: 'cat_other', sku: 'AS-TEA-IKW-04', purchasePrice: 249, stock: 1000, minAlert: 250 },
  'sup-masala-chai': { catId: 'cat_other', sku: 'AS-TEA-KMC-02', purchasePrice: 249, stock: 1000, minAlert: 200 },
  'sup-sugar-free-kahwa': { catId: 'cat_other', sku: 'AS-TEA-SFK-01', purchasePrice: 219, stock: 1000, minAlert: 140 },
  'sup-mix-seeds-berries': { catId: 'cat_berries_seeds', sku: 'AS-MIX-MSB', purchasePrice: 599, stock: 10, minAlert: 3 },
  'sup-pecans': { catId: 'cat_other', sku: 'AS-SUP-PEC', purchasePrice: 1199, stock: 10, minAlert: 3 },
  'sup-pecans-kernels': { catId: 'cat_other', sku: 'AS-SUP-PCK', purchasePrice: 2399, stock: 10, minAlert: 3 },
  'sup-green-tea': { catId: 'cat_other', sku: 'AS-TEA-PGT-03', purchasePrice: 199, stock: 1000, minAlert: 200 },
  // Himalayan Wellness, Kesar Infusions, Chilgoza & Gourmet Reserves
  'elachi-cardamom': { catId: 'cat_spices', sku: 'AS-SPC-ELC', purchasePrice: 5999, stock: 10, minAlert: 3 },
  'himalayan-shilajit-resin': { catId: 'cat_other', sku: 'AS-SHL-RSN-01', purchasePrice: 779, stock: 1000, minAlert: 150 },
  'himalayan-shilajit-tea': { catId: 'cat_other', sku: 'AS-SHL-TEA-01', purchasePrice: 369, stock: 1000, minAlert: 200 },
  'kashmiri-bhaderwahi-rajma': { catId: 'cat_other', sku: 'AS-SUP-KBR-01', purchasePrice: 249, stock: 10, minAlert: 3 },
  'kesar-attar-6ml': { catId: 'cat_other', sku: 'AS-KES-ATR-04', purchasePrice: 179, stock: 1000, minAlert: 120 },
  'kesar-cream-50gm': { catId: 'cat_other', sku: 'AS-KES-CRM-02', purchasePrice: 249, stock: 1000, minAlert: 200 },
  'kesar-flower-1gm': { catId: 'cat_other', sku: 'AS-KES-FLW-02', purchasePrice: 299, stock: 1000, minAlert: 100 },
  'kesar-handcrafted-soap': { catId: 'cat_other', sku: 'AS-KES-SOP-01', purchasePrice: 199, stock: 1000, minAlert: 200 },
  'kesar-petal-1gm': { catId: 'cat_other', sku: 'AS-KES-PTL-01', purchasePrice: 279, stock: 1000, minAlert: 100 },
  'kesar-scrub-100gm': { catId: 'cat_other', sku: 'AS-KES-SCR-03', purchasePrice: 249, stock: 1000, minAlert: 200 },
  'chilgoza-kernels': { catId: 'cat_other', sku: 'AS-CHG-KRN', purchasePrice: 7999, stock: 10, minAlert: 3 },
  'chilgoza-with-shell': { catId: 'cat_other', sku: 'AS-CHG-SHL', purchasePrice: 5999, stock: 10, minAlert: 3 },
  'walnut-cracker': { catId: 'cat_other', sku: 'AS-ACC-WCR-01', purchasePrice: 299, stock: 10, minAlert: 3 },
};

const baseOpts = { id: false, versionKey: false } as const;

function createModels(conn: Connection) {
  const RoleSchema = new Schema(
    {
      id: { type: String, required: true, unique: true, index: true },
      name: { type: String, required: true, unique: true },
      label: { type: String, required: true },
      description: { type: String, default: '' },
      defaultPermissions: { type: [String], default: [] },
      createdAt: { type: String, required: true },
    },
    baseOpts
  );

  const PermissionSchema = new Schema(
    {
      id: { type: String, required: true, unique: true, index: true },
      key: { type: String, required: true, unique: true },
      label: { type: String, required: true },
      module: { type: String, required: true },
      description: { type: String, default: '' },
    },
    baseOpts
  );

  const CustomerSchema = new Schema(
    {
      id: { type: String, required: true, unique: true, index: true },
      name: { type: String, required: true },
      email: { type: String, required: true, unique: true, lowercase: true, index: true },
      pendingEmail: { type: String, default: null },
      emailVerified: { type: Boolean, default: false },
      emailVerifiedAt: { type: String, default: null },
      phone: { type: String, default: '', index: true },
      passwordHash: { type: String, default: '' },
      role: { type: String, enum: ['customer', 'admin'], default: 'customer', index: true },
      adminRole: { type: String, enum: ['super_admin', 'staff', null], default: null },
      permissions: { type: [String], default: [] },
      isActive: { type: Boolean, default: true, index: true },
      internalNotes: { type: String, default: '' },
      profilePicture: { type: String, default: null },
      tier: { type: String, default: 'Privileged Patron' },
      loyaltyPoints: { type: Number, default: 0 },
      marketingConsent: { type: Boolean, default: false },
      marketingConsentAt: { type: String, default: null },
      consentSource: { type: String, default: null },
      unsubscribedAt: { type: String, default: null },
      emailPreferences: { type: Schema.Types.Mixed, default: () => ({ ...DEFAULT_EMAIL_PREFERENCES }) },
      googleId: { type: String, sparse: true, unique: true },
      failedLoginAttempts: { type: Number, default: 0 },
      lockedUntil: { type: String, default: null },
      lastVerificationSentAt: { type: String, default: null },
      isOneTime: { type: Boolean, default: false, index: true },
      source: { type: String, default: 'web', index: true },
      createdAt: { type: String, required: true, index: true },
      updatedAt: { type: String, required: true },
    },
    baseOpts
  );

  const CustomerAddressSchema = new Schema(
    {
      id: { type: String, required: true, unique: true, index: true },
      customerId: { type: String, required: true, index: true },
      label: { type: String, default: 'Home' },
      fullName: { type: String, required: true },
      phone: { type: String, required: true },
      addressLine: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String, required: true },
      pincode: { type: String, required: true },
      isDefault: { type: Boolean, default: false },
      createdAt: { type: String, required: true },
      updatedAt: { type: String, required: true },
    },
    baseOpts
  );

  const SessionSchema = new Schema(
    {
      id: { type: String, required: true, unique: true, index: true },
      tokenHash: { type: String, required: true, unique: true, index: true },
      customerId: { type: String, required: true, index: true },
      rememberMe: { type: Boolean, default: false },
      userAgent: { type: String, default: '' },
      ipAddress: { type: String, default: '' },
      expiresAt: { type: String, required: true, index: true },
      revokedAt: { type: String, default: null, index: true },
      createdAt: { type: String, required: true },
    },
    baseOpts
  );

  const VerificationTokenSchema = new Schema(
    {
      id: { type: String, required: true, unique: true, index: true },
      customerId: { type: String, required: true, index: true },
      emailTarget: { type: String, required: true },
      purpose: { type: String, enum: ['email_verify', 'email_change', 'admin_login_otp'], default: 'email_verify' },
      tokenHash: { type: String, required: true, unique: true, index: true },
      attempts: { type: Number, default: 0 },
      expiresAt: { type: String, required: true },
      usedAt: { type: String, default: null },
      createdAt: { type: String, required: true },
    },
    baseOpts
  );

  const PasswordResetTokenSchema = new Schema(
    {
      id: { type: String, required: true, unique: true, index: true },
      customerId: { type: String, required: true, index: true },
      tokenHash: { type: String, required: true, unique: true, index: true },
      expiresAt: { type: String, required: true },
      usedAt: { type: String, default: null },
      createdAt: { type: String, required: true },
    },
    baseOpts
  );

  const CategorySchema = new Schema(
    {
      id: { type: String, required: true, unique: true, index: true },
      name: { type: String, required: true, unique: true },
      slug: { type: String, required: true, unique: true },
      storefrontGroup: { type: String, default: 'nuts' },
      description: { type: String, default: '' },
      displayOrder: { type: Number, default: 0 },
      active: { type: Boolean, default: true },
      createdAt: { type: String, required: true },
      updatedAt: { type: String, required: true },
    },
    baseOpts
  );

  const ProductSchema = new Schema(
    {
      id: { type: String, required: true, unique: true, index: true },
      name: { type: String, required: true, index: true },
      hindiName: { type: String, default: null },
      subtitle: { type: String, required: true },
      sku: { type: String, default: null, index: true },
      barcode: { type: String, default: null },
      purchasePrice: { type: Number, default: 0 },
      price: { type: Number, required: true },
      discountPrice: { type: Number, default: null },
      gstRate: { type: Number, default: 5 },
      stock: { type: Number, default: 25, index: true },
      minStockAlert: { type: Number, default: 5 },
      unit: { type: String, enum: ['kg', 'gram', 'ml', 'piece'], default: 'kg' },
      weightLabel: { type: String, default: '1kg' },
      step: { type: Number, default: 1 },
      minQty: { type: Number, default: 1 },
      category: { type: String, required: true },
      categoryId: { type: String, default: null, index: true },
      image: { type: String, required: true },
      images: { type: [String], default: [] },
      gallery: { type: [String], default: [] },
      fallbackImage: { type: String, default: null },
      videoUrl: { type: String, default: null },
      videoDetails: { type: Schema.Types.Mixed, default: null },
      description: { type: String, required: true },
      origin: { type: String, required: true },
      grade: { type: String, required: true },
      expiryDate: { type: String, default: null },
      storageInstructions: { type: String, default: 'Cool dry airtight storage' },
      featured: { type: Boolean, default: false, index: true },
      features: { type: [String], default: [] },
      variants: { type: [String], default: [] },
      tasteProfile: { type: String, default: 'Balanced heritage sweetness and crunch' },
      jammuStory: { type: String, default: 'Hand-graded in Jammu Heritage Cellars.' },
      inStock: { type: Boolean, default: true },
      harvestSeason: { type: String, default: '2026 Autumn Crop' },
      nutrition: { type: Schema.Types.Mixed, default: {} },
      status: { type: String, default: 'published', index: true },
      createdAt: { type: String, required: true, index: true },
      updatedAt: { type: String, required: true },
    },
    baseOpts
  );

  const ProductVariantSchema = new Schema(
    {
      id: { type: String, required: true, unique: true, index: true },
      productId: { type: String, required: true, index: true },
      weightLabel: { type: String, required: true },
      sku: { type: String, required: true },
      purchasePrice: { type: Number, default: 0 },
      sellingPrice: { type: Number, required: true },
      discountPrice: { type: Number, default: null },
      stock: { type: Number, default: 0 },
      active: { type: Boolean, default: true },
      createdAt: { type: String, required: true },
      updatedAt: { type: String, required: true },
    },
    baseOpts
  );

  const InventorySchema = new Schema(
    {
      id: { type: String, required: true, unique: true, index: true },
      productId: { type: String, required: true, unique: true, index: true },
      sku: { type: String, default: '' },
      stockQuantity: { type: Number, default: 0 },
      minStockAlert: { type: Number, default: 5 },
      purchaseCost: { type: Number, default: 0 },
      valuation: { type: Number, default: 0 },
      updatedAt: { type: String, required: true },
    },
    baseOpts
  );

  const InventoryBatchSchema = new Schema(
    {
      id: { type: String, required: true, unique: true, index: true },
      productId: { type: String, required: true, index: true },
      supplierId: { type: String, default: null },
      purchaseId: { type: String, default: null },
      batchNumber: { type: String, required: true },
      quantity: { type: Number, required: true },
      remainingQty: { type: Number, required: true },
      purchaseCost: { type: Number, default: 0 },
      expiryDate: { type: String, default: null, index: true },
      notes: { type: String, default: '' },
      receivedAt: { type: String, required: true, index: true },
    },
    baseOpts
  );

  const InventoryTransactionSchema = new Schema(
    {
      id: { type: String, required: true, unique: true, index: true },
      productId: { type: String, required: true, index: true },
      variantId: { type: String, default: null },
      movementType: { type: String, required: true, index: true },
      quantity: { type: Number, required: true },
      previousStock: { type: Number, required: true },
      updatedStock: { type: Number, required: true },
      unitCost: { type: Number, default: 0 },
      batchNumber: { type: String, default: null },
      reason: { type: String, required: true },
      adminId: { type: String, default: null },
      adminName: { type: String, default: 'System' },
      timestamp: { type: String, required: true, index: true },
    },
    baseOpts
  );

  const SupplierSchema = new Schema(
    {
      id: { type: String, required: true, unique: true, index: true },
      supplierName: { type: String, required: true },
      businessName: { type: String, default: '' },
      contactPerson: { type: String, default: '' },
      phone: { type: String, required: true },
      email: { type: String, default: '' },
      address: { type: String, default: '' },
      gstin: { type: String, default: '' },
      paymentTerms: { type: String, default: 'Net 15 Days' },
      outstandingBalance: { type: Number, default: 0 },
      notes: { type: String, default: '' },
      active: { type: Boolean, default: true },
      createdAt: { type: String, required: true },
      updatedAt: { type: String, required: true },
    },
    baseOpts
  );

  const PurchaseSchema = new Schema(
    {
      id: { type: String, required: true, unique: true, index: true },
      purchaseNumber: { type: String, required: true, unique: true, index: true },
      supplierId: { type: String, required: true, index: true },
      purchaseDate: { type: String, required: true, index: true },
      subtotal: { type: Number, default: 0 },
      gstAmount: { type: Number, default: 0 },
      additionalExpenses: { type: Number, default: 0 },
      totalAmount: { type: Number, default: 0 },
      paymentStatus: { type: String, enum: ['pending', 'partial', 'paid'], default: 'pending' },
      paidAmount: { type: Number, default: 0 },
      invoiceFile: { type: String, default: null },
      notes: { type: String, default: '' },
      status: { type: String, enum: ['ordered', 'received', 'cancelled'], default: 'ordered' },
      receivedAt: { type: String, default: null },
      createdBy: { type: String, default: null },
      createdAt: { type: String, required: true },
      updatedAt: { type: String, required: true },
    },
    baseOpts
  );

  const PurchaseItemSchema = new Schema(
    {
      id: { type: String, required: true, unique: true, index: true },
      purchaseId: { type: String, required: true, index: true },
      productId: { type: String, required: true },
      productName: { type: String, required: true },
      quantity: { type: Number, required: true },
      purchasePrice: { type: Number, required: true },
      gstRate: { type: Number, default: 5 },
      totalCost: { type: Number, required: true },
      batchNumber: { type: String, default: null },
      expiryDate: { type: String, default: null },
    },
    baseOpts
  );

  const ExpenseSchema = new Schema(
    {
      id: { type: String, required: true, unique: true, index: true },
      category: { type: String, required: true, index: true },
      title: { type: String, required: true },
      amount: { type: Number, required: true },
      expenseDate: { type: String, required: true, index: true },
      vendor: { type: String, default: '' },
      paymentMode: { type: String, default: 'UPI' },
      receiptUrl: { type: String, default: null },
      notes: { type: String, default: '' },
      createdBy: { type: String, default: null },
      createdAt: { type: String, required: true },
      updatedAt: { type: String, required: true },
    },
    baseOpts
  );

  const OrderSchema = new Schema(
    {
      id: { type: String, required: true, unique: true, index: true },
      orderNumber: { type: String, required: true, unique: true, index: true },
      customerId: { type: String, required: true, index: true },
      orderType: { type: String, enum: ['standard', 'custom'], default: 'standard' },
      status: { type: String, default: 'placed', index: true },
      paymentMethod: { type: String, default: 'Concierge Invoice / COD' },
      paymentStatus: { type: String, default: 'pending', index: true },
      subtotal: { type: Number, required: true },
      discountAmount: { type: Number, default: 0 },
      couponCode: { type: String, default: null },
      shippingCharge: { type: Number, default: 0 },
      taxAmount: { type: Number, default: 0 },
      totalAmount: { type: Number, required: true },
      costOfGoods: { type: Number, default: 0 },
      deliveryAddress: { type: Schema.Types.Mixed, required: true },
      customerSnapshot: { type: Schema.Types.Mixed, required: true },
      instructions: { type: String, default: '' },
      internalNotes: { type: String, default: '' },
      orderSource: { type: String, default: 'online', index: true },
      paymentScreenshotUrl: { type: String, default: null },
      paymentReference: { type: String, default: null },
      estimatedDeliveryEstimate: { type: String, default: null },
      confirmedAt: { type: String, default: null },
      deliveredAt: { type: String, default: null },
      cancelledAt: { type: String, default: null },
      cancellationReason: { type: String, default: null },
      returnedAt: { type: String, default: null },
      returnReason: { type: String, default: null },
      refundStatus: { type: String, default: 'none' },
      refundAmount: { type: Number, default: null },
      refundMethod: { type: String, default: null },
      refundReferenceId: { type: String, default: null },
      refundDate: { type: String, default: null },
      refundBankEta: { type: String, default: null },
      createdAt: { type: String, required: true, index: true },
      updatedAt: { type: String, required: true },
    },
    baseOpts
  );

  const OrderItemSchema = new Schema(
    {
      id: { type: String, required: true, unique: true, index: true },
      orderId: { type: String, required: true, index: true },
      productId: { type: String, required: true, index: true },
      variantId: { type: String, default: null },
      weightLabel: { type: String, default: null },
      productName: { type: String, required: true },
      productImage: { type: String, required: true },
      category: { type: String, required: true },
      unit: { type: String, required: true },
      purchasePrice: { type: Number, default: 0 },
      unitPrice: { type: Number, required: true },
      quantity: { type: Number, required: true },
      stockQuantity: { type: Number, default: null },
      subtotal: { type: Number, required: true },
    },
    baseOpts
  );

  const OrderShipmentSchema = new Schema(
    {
      id: { type: String, required: true, unique: true, index: true },
      orderId: { type: String, required: true, unique: true, index: true },
      courierPartner: { type: String, required: true },
      trackingNumber: { type: String, required: true },
      trackingUrl: { type: String, default: null },
      dispatchDate: { type: String, required: true },
      estimatedDeliveryDate: { type: String, default: null },
      shipmentNotes: { type: String, default: null },
      updatedBy: { type: String, required: true },
      createdAt: { type: String, required: true },
      updatedAt: { type: String, required: true },
    },
    baseOpts
  );

  const OrderStatusHistorySchema = new Schema(
    {
      id: { type: String, required: true, unique: true, index: true },
      orderId: { type: String, required: true, index: true },
      previousStatus: { type: String, default: null },
      newStatus: { type: String, required: true },
      updatedBy: { type: String, required: true },
      notes: { type: String, default: null },
      timestamp: { type: String, required: true, index: true },
    },
    baseOpts
  );

  const PaymentSchema = new Schema(
    {
      id: { type: String, required: true, unique: true, index: true },
      paymentType: {
        type: String,
        enum: ['order_payment', 'order_refund', 'supplier_payment'],
        required: true,
        index: true,
      },
      referenceId: { type: String, required: true, index: true },
      orderNumber: { type: String, default: null },
      purchaseId: { type: String, default: null },
      customerId: { type: String, default: null },
      supplierId: { type: String, default: null },
      amount: { type: Number, required: true },
      method: { type: String, default: 'UPI / Bank' },
      status: { type: String, default: 'completed' },
      transactionRef: { type: String, default: null },
      notes: { type: String, default: '' },
      recordedBy: { type: String, default: 'System' },
      createdAt: { type: String, required: true, index: true },
    },
    baseOpts
  );

  const CouponSchema = new Schema(
    {
      id: { type: String, required: true, unique: true, index: true },
      code: { type: String, required: true, unique: true, uppercase: true, index: true },
      title: { type: String, required: true },
      description: { type: String, default: '' },
      discountType: { type: String, enum: ['percentage', 'flat'], required: true },
      discountValue: { type: Number, required: true },
      minOrderValue: { type: Number, default: 0 },
      maxDiscount: { type: Number, default: null },
      startDate: { type: String, default: null },
      endDate: { type: String, default: null },
      applicableProducts: { type: [String], default: [] },
      usageLimit: { type: Number, default: null },
      usedCount: { type: Number, default: 0 },
      targetCustomerId: { type: String, default: null, index: true },
      targetEmail: { type: String, default: null, index: true },
      active: { type: Boolean, default: true, index: true },
      createdAt: { type: String, required: true },
    },
    baseOpts
  );

  const WishlistItemSchema = new Schema(
    {
      id: { type: String, required: true, unique: true, index: true },
      customerId: { type: String, required: true, index: true },
      productId: { type: String, required: true },
      createdAt: { type: String, required: true },
    },
    baseOpts
  );
  WishlistItemSchema.index({ customerId: 1, productId: 1 }, { unique: true });

  const CustomerNotificationSchema = new Schema(
    {
      id: { type: String, required: true, unique: true, index: true },
      customerId: { type: String, required: true, index: true },
      type: { type: String, required: true },
      title: { type: String, required: true },
      message: { type: String, required: true },
      relatedOrderId: { type: String, default: null },
      isRead: { type: Boolean, default: false },
      createdAt: { type: String, required: true, index: true },
    },
    baseOpts
  );

  const AdminNotificationSchema = new Schema(
    {
      id: { type: String, required: true, unique: true, index: true },
      type: { type: String, required: true, index: true },
      title: { type: String, required: true },
      message: { type: String, required: true },
      severity: { type: String, default: 'info' },
      entityType: { type: String, default: null },
      entityId: { type: String, default: null },
      isRead: { type: Boolean, default: false, index: true },
      createdAt: { type: String, required: true, index: true },
    },
    baseOpts
  );

  const SupportTicketSchema = new Schema(
    {
      id: { type: String, required: true, unique: true, index: true },
      ticketNumber: { type: String, required: true, unique: true, index: true },
      customerId: { type: String, default: null, index: true },
      name: { type: String, required: true },
      email: { type: String, required: true, index: true },
      phone: { type: String, default: '' },
      category: { type: String, default: 'Order Issue' },
      orderNumber: { type: String, default: null },
      subject: { type: String, required: true },
      description: { type: String, required: true },
      attachments: { type: [Schema.Types.Mixed], default: [] },
      adminAttachments: { type: [Schema.Types.Mixed], default: [] },
      status: {
        type: String,
        enum: ['open', 'in_review', 'responded', 'resolved', 'closed'],
        default: 'open',
        index: true,
      },
      priority: {
        type: String,
        enum: ['normal', 'high', 'urgent'],
        default: 'normal',
      },
      adminNotes: { type: String, default: '' },
      replies: { type: [Schema.Types.Mixed], default: [] },
      lastRepliedAt: { type: String, default: null },
      lastRepliedBy: { type: String, default: null },
      createdAt: { type: String, required: true, index: true },
      updatedAt: { type: String, required: true },
    },
    baseOpts
  );

  const EmailTemplateSchema = new Schema(
    {
      id: { type: String, required: true, unique: true, index: true },
      templateKey: { type: String, required: true, unique: true, index: true },
      templateName: { type: String, required: true },
      category: { type: String, enum: ['transactional', 'marketing'], required: true },
      subject: { type: String, required: true },
      htmlContent: { type: String, required: true },
      textContent: { type: String, required: true },
      variables: { type: [String], default: [] },
      enabled: { type: Boolean, default: true },
      updatedAt: { type: String, required: true },
      updatedBy: { type: String, default: null },
    },
    baseOpts
  );

  const EmailLogSchema = new Schema(
    {
      id: { type: String, required: true, unique: true, index: true },
      idempotencyKey: { type: String, sparse: true, unique: true },
      recipient: { type: String, required: true, index: true },
      customerId: { type: String, default: null, index: true },
      emailType: { type: String, required: true },
      subject: { type: String, required: true },
      htmlBody: { type: String, default: '' },
      textBody: { type: String, default: '' },
      provider: { type: String, required: true },
      providerMessageId: { type: String, default: null, index: true },
      previewUrl: { type: String, default: null },
      relatedOrderId: { type: String, default: null, index: true },
      campaignId: { type: String, default: null, index: true },
      status: { type: String, default: 'queued', index: true },
      attempts: { type: Number, default: 0 },
      errorMessage: { type: String, default: null },
      opensCount: { type: Number, default: 0 },
      clicksCount: { type: Number, default: 0 },
      scheduledAt: { type: String, default: null },
      sentAt: { type: String, default: null },
      deliveredAt: { type: String, default: null },
      createdAt: { type: String, required: true, index: true },
      updatedAt: { type: String, required: true },
    },
    baseOpts
  );

  const EmailJobSchema = new Schema(
    {
      id: { type: String, required: true, unique: true, index: true },
      idempotencyKey: { type: String, sparse: true, unique: true },
      emailLogId: { type: String, required: true, index: true },
      jobType: { type: String, required: true },
      payload: { type: Schema.Types.Mixed, default: {} },
      status: { type: String, default: 'pending', index: true },
      attempts: { type: Number, default: 0 },
      maxAttempts: { type: Number, default: 5 },
      nextRunAt: { type: String, required: true, index: true },
      lastError: { type: String, default: null },
      campaignId: { type: String, default: null, index: true },
      createdAt: { type: String, required: true },
      updatedAt: { type: String, required: true },
    },
    baseOpts
  );

  const EmailSuppressionSchema = new Schema(
    {
      id: { type: String, required: true, unique: true, index: true },
      email: { type: String, required: true, unique: true, index: true },
      reason: { type: String, required: true },
      bounceCount: { type: Number, default: 1 },
      details: { type: String, default: null },
      suppressedAt: { type: String, required: true },
    },
    baseOpts
  );

  const EmailUnsubscribeSchema = new Schema(
    {
      id: { type: String, required: true, unique: true, index: true },
      customerId: { type: String, default: null, index: true },
      email: { type: String, required: true },
      unsubscribeTokenHash: { type: String, required: true, unique: true, index: true },
      unsubscribedAt: { type: String, default: null },
      reason: { type: String, default: null },
      createdAt: { type: String, required: true },
    },
    baseOpts
  );

  const MarketingCampaignSchema = new Schema(
    {
      id: { type: String, required: true, unique: true, index: true },
      campaignName: { type: String, required: true },
      campaignType: { type: String, required: true },
      festivalName: { type: String, default: null },
      productId: { type: String, default: null },
      subject: { type: String, required: true },
      content: { type: String, required: true },
      bannerImage: { type: String, default: null },
      discountPercentage: { type: Number, default: null },
      couponCode: { type: String, default: null },
      startDate: { type: String, default: null },
      endDate: { type: String, default: null },
      applicableProducts: { type: [String], default: [] },
      minOrderValue: { type: Number, default: 0 },
      maxDiscount: { type: Number, default: null },
      ctaText: { type: String, default: 'Shop Royal Harvests' },
      ctaUrl: { type: String, default: '/catalog' },
      targetSegment: { type: String, default: 'all_opted_in' },
      segmentCategory: { type: String, default: null },
      status: { type: String, default: 'draft', index: true },
      totalRecipients: { type: Number, default: 0 },
      sentCount: { type: Number, default: 0 },
      failedCount: { type: Number, default: 0 },
      scheduledAt: { type: String, default: null, index: true },
      sentAt: { type: String, default: null },
      approvedBy: { type: String, default: null },
      approvedAt: { type: String, default: null },
      createdBy: { type: String, required: true },
      createdAt: { type: String, required: true, index: true },
      updatedAt: { type: String, required: true },
    },
    baseOpts
  );

  const SiteSettingSchema = new Schema(
    {
      key: { type: String, required: true, unique: true, index: true },
      value: { type: Schema.Types.Mixed, required: true },
      updatedAt: { type: String, required: true },
    },
    baseOpts
  );

  const BusinessSettingSchema = new Schema(
    {
      id: { type: String, required: true, unique: true, index: true },
      data: { type: Schema.Types.Mixed, required: true },
      updatedAt: { type: String, required: true },
    },
    baseOpts
  );

  const WebsiteSettingSchema = new Schema(
    {
      id: { type: String, required: true, unique: true, index: true },
      data: { type: Schema.Types.Mixed, required: true },
      updatedAt: { type: String, required: true },
    },
    baseOpts
  );

  const AuditLogSchema = new Schema(
    {
      id: { type: String, required: true, unique: true, index: true },
      actorId: { type: String, default: null, index: true },
      actorEmail: { type: String, default: null },
      action: { type: String, required: true, index: true },
      entityType: { type: String, required: true },
      entityId: { type: String, default: null },
      details: { type: Schema.Types.Mixed, default: {} },
      ipAddress: { type: String, default: '' },
      createdAt: { type: String, required: true, index: true },
    },
    baseOpts
  );

  function getOrCompile<T>(name: string, schema: Schema<T>): Model<T> {
    return (conn.models[name] as Model<T>) || conn.model<T>(name, schema);
  }

  return {
    Role: getOrCompile('Role', RoleSchema),
    Permission: getOrCompile('Permission', PermissionSchema),
    Customer: getOrCompile('Customer', CustomerSchema),
    CustomerAddress: getOrCompile('CustomerAddress', CustomerAddressSchema),
    Session: getOrCompile('Session', SessionSchema),
    VerificationToken: getOrCompile('VerificationToken', VerificationTokenSchema),
    PasswordResetToken: getOrCompile('PasswordResetToken', PasswordResetTokenSchema),
    Category: getOrCompile('Category', CategorySchema),
    Product: getOrCompile('Product', ProductSchema),
    ProductVariant: getOrCompile('ProductVariant', ProductVariantSchema),
    Inventory: getOrCompile('Inventory', InventorySchema),
    InventoryBatch: getOrCompile('InventoryBatch', InventoryBatchSchema),
    InventoryTransaction: getOrCompile('InventoryTransaction', InventoryTransactionSchema),
    Supplier: getOrCompile('Supplier', SupplierSchema),
    Purchase: getOrCompile('Purchase', PurchaseSchema),
    PurchaseItem: getOrCompile('PurchaseItem', PurchaseItemSchema),
    Expense: getOrCompile('Expense', ExpenseSchema),
    Order: getOrCompile('Order', OrderSchema),
    OrderItem: getOrCompile('OrderItem', OrderItemSchema),
    OrderShipment: getOrCompile('OrderShipment', OrderShipmentSchema),
    OrderStatusHistory: getOrCompile('OrderStatusHistory', OrderStatusHistorySchema),
    Payment: getOrCompile('Payment', PaymentSchema),
    Coupon: getOrCompile('Coupon', CouponSchema),
    WishlistItem: getOrCompile('WishlistItem', WishlistItemSchema),
    CustomerNotification: getOrCompile('CustomerNotification', CustomerNotificationSchema),
    AdminNotification: getOrCompile('AdminNotification', AdminNotificationSchema),
    SupportTicket: getOrCompile('SupportTicket', SupportTicketSchema),
    EmailTemplate: getOrCompile('EmailTemplate', EmailTemplateSchema),
    EmailLog: getOrCompile('EmailLog', EmailLogSchema),
    EmailJob: getOrCompile('EmailJob', EmailJobSchema),
    EmailSuppression: getOrCompile('EmailSuppression', EmailSuppressionSchema),
    EmailUnsubscribe: getOrCompile('EmailUnsubscribe', EmailUnsubscribeSchema),
    MarketingCampaign: getOrCompile('MarketingCampaign', MarketingCampaignSchema),
    SiteSetting: getOrCompile('SiteSetting', SiteSettingSchema),
    BusinessSetting: getOrCompile('BusinessSetting', BusinessSettingSchema),
    WebsiteSetting: getOrCompile('WebsiteSetting', WebsiteSettingSchema),
    AuditLog: getOrCompile('AuditLog', AuditLogSchema),
  };
}

export type MongoModels = ReturnType<typeof createModels>;

export interface MongoDatabase {
  conn: Connection;
  models: MongoModels;
  close: () => Promise<void>;
}

export async function connectDatabase(mongoUri: string): Promise<MongoDatabase> {
  const conn = mongoose.createConnection(mongoUri, {
    serverSelectionTimeoutMS: 10000,
    maxPoolSize: 20,
  });
  conn.on('error', err => {
    console.error('[MongoDB] Connection error:', err instanceof Error ? err.message : err);
  });
  await conn.asPromise();
  const models = createModels(conn);
  await Promise.all(Object.values(models).map(m => m.syncIndexes().catch(() => { })));

  return {
    conn,
    models,
    async close() {
      await conn.close();
    },
  };
}

function normalizeBusinessSettings(raw?: Record<string, any>): typeof DEFAULT_BUSINESS_SETTINGS {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    ...DEFAULT_BUSINESS_SETTINGS,
    ...src,
    defaultGstRate:
      typeof src.defaultGstRate === 'number' && Number.isFinite(src.defaultGstRate)
        ? src.defaultGstRate
        : Number(src.defaultGstRate ?? DEFAULT_BUSINESS_SETTINGS.defaultGstRate) || 0,
    nextInvoiceNumber:
      typeof src.nextInvoiceNumber === 'number' && Number.isFinite(src.nextInvoiceNumber)
        ? Math.max(1, Math.round(src.nextInvoiceNumber))
        : DEFAULT_BUSINESS_SETTINGS.nextInvoiceNumber,
    defaultShippingCharge:
      typeof src.defaultShippingCharge === 'number' && Number.isFinite(src.defaultShippingCharge)
        ? Math.max(0, src.defaultShippingCharge)
        : Number(src.defaultShippingCharge ?? DEFAULT_BUSINESS_SETTINGS.defaultShippingCharge) || 0,
    freeShippingThreshold:
      typeof src.freeShippingThreshold === 'number' && Number.isFinite(src.freeShippingThreshold)
        ? Math.max(0, src.freeShippingThreshold)
        : Number(src.freeShippingThreshold ?? DEFAULT_BUSINESS_SETTINGS.freeShippingThreshold) || 0,
    notificationPreferences: {
      ...DEFAULT_BUSINESS_SETTINGS.notificationPreferences,
      ...(src.notificationPreferences && typeof src.notificationPreferences === 'object'
        ? src.notificationPreferences
        : {}),
    },
  };
}

function normalizeWebsiteSettings(raw?: Record<string, any>): typeof DEFAULT_WEBSITE_SETTINGS {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    ...DEFAULT_WEBSITE_SETTINGS,
    ...src,
    heroBanners: Array.isArray(src.heroBanners)
      ? src.heroBanners.map(String)
      : [...DEFAULT_WEBSITE_SETTINGS.heroBanners],
    featuredProductIds: Array.isArray(src.featuredProductIds)
      ? src.featuredProductIds.map(String)
      : [...DEFAULT_WEBSITE_SETTINGS.featuredProductIds],
    promotionalSections: Array.isArray(src.promotionalSections)
      ? src.promotionalSections
      : [...DEFAULT_WEBSITE_SETTINGS.promotionalSections],
    socialLinks: {
      ...DEFAULT_WEBSITE_SETTINGS.socialLinks,
      ...(src.socialLinks && typeof src.socialLinks === 'object' ? src.socialLinks : {}),
    },
  };
}

export async function getBusinessSettingsDoc(db: MongoDatabase): Promise<typeof DEFAULT_BUSINESS_SETTINGS> {
  const row = await db.models.BusinessSetting.findOne({ id: 'singleton' }).lean();
  if (row?.data && typeof row.data === 'object') {
    return normalizeBusinessSettings(row.data as Record<string, any>);
  }
  const siteRow = await db.models.SiteSetting.findOne({ key: 'business_settings' }).lean();
  if (siteRow?.value && typeof siteRow.value === 'object') {
    return normalizeBusinessSettings(siteRow.value as Record<string, any>);
  }
  return normalizeBusinessSettings();
}

export async function getWebsiteSettingsDoc(db: MongoDatabase): Promise<typeof DEFAULT_WEBSITE_SETTINGS> {
  const row = await db.models.WebsiteSetting.findOne({ id: 'singleton' }).lean();
  if (row?.data && typeof row.data === 'object') {
    return normalizeWebsiteSettings(row.data as Record<string, any>);
  }
  const siteRow = await db.models.SiteSetting.findOne({ key: 'website_settings' }).lean();
  if (siteRow?.value && typeof siteRow.value === 'object') {
    return normalizeWebsiteSettings(siteRow.value as Record<string, any>);
  }
  return normalizeWebsiteSettings();
}

export async function syncInventoryRecord(db: MongoDatabase, productId: string): Promise<void> {
  const prod = await db.models.Product.findOne({ id: productId }).lean();
  if (!prod) return;
  const stockQuantity = Number(prod.stock || 0);
  const purchaseCost = Number(prod.purchasePrice || 0);
  const baseUnitsPerPack =
    prod.unit === 'ml'
      ? parseWeightGrams(String(prod.weightLabel || '100ml')) || 100
      : prod.unit === 'gram'
      ? parseWeightGrams(String(prod.weightLabel || '1g')) || 1
      : 1;
  const valuation = Math.round((stockQuantity / baseUnitsPerPack) * purchaseCost);
  await db.models.Inventory.updateOne(
    { productId },
    {
      $set: {
        sku: prod.sku || '',
        stockQuantity,
        minStockAlert: Number(prod.minStockAlert ?? 5),
        purchaseCost,
        valuation,
        updatedAt: new Date().toISOString(),
      },
      $setOnInsert: {
        id: `inv_${productId}`,
        productId,
      },
    },
    { upsert: true }
  );
}

export async function seedDatabase(db: MongoDatabase, config: AppConfig): Promise<void> {
  const now = new Date().toISOString();
  const { models } = db;
  const includeDemoSeed = config.nodeEnv === 'test';

  // 1. Seed Roles & Permissions
  await models.Role.updateOne(
    { id: 'role_super_admin' },
    {
      $setOnInsert: {
        id: 'role_super_admin',
        name: 'super_admin',
        label: 'Super Admin',
        description: 'Unrestricted access to all storefront, ERP, financial, and staff settings.',
        defaultPermissions: [...ALL_ADMIN_PERMISSIONS],
        createdAt: now,
      },
    },
    { upsert: true }
  );
  await models.Role.updateOne(
    { id: 'role_staff' },
    {
      $setOnInsert: {
        id: 'role_staff',
        name: 'staff',
        label: 'Staff Operator',
        description: 'Scoped operational access constrained by assigned permissions.',
        defaultPermissions: ['dashboard', 'orders'],
        createdAt: now,
      },
    },
    { upsert: true }
  );
  for (const p of PERMISSION_DEFINITIONS) {
    await models.Permission.updateOne(
      { key: p.key },
      { $setOnInsert: { id: `perm_${p.key}`, ...p } },
      { upsert: true }
    );
  }

  // 2. Seed Site, Website & Business Settings
  await models.SiteSetting.updateOne(
    { key: 'brand_logo_url' },
    { $setOnInsert: { key: 'brand_logo_url', value: BRAND_CONFIG.emailLogoUrl, updatedAt: now } },
    { upsert: true }
  );
  await models.SiteSetting.updateOne(
    { key: 'brand_logo_url', value: { $in: [BRAND_CONFIG.logoPath, ''] } },
    { $set: { value: BRAND_CONFIG.emailLogoUrl, updatedAt: now } }
  );
  await models.SiteSetting.updateOne(
    { key: 'tracking_enabled' },
    { $setOnInsert: { key: 'tracking_enabled', value: config.emailTrackingEnabled, updatedAt: now } },
    { upsert: true }
  );
  await models.SiteSetting.updateOne(
    { key: 'business_settings' },
    { $setOnInsert: { key: 'business_settings', value: DEFAULT_BUSINESS_SETTINGS, updatedAt: now } },
    { upsert: true }
  );
  await models.SiteSetting.updateOne(
    { key: 'website_settings' },
    { $setOnInsert: { key: 'website_settings', value: DEFAULT_WEBSITE_SETTINGS, updatedAt: now } },
    { upsert: true }
  );
  await models.BusinessSetting.updateOne(
    { id: 'singleton' },
    { $setOnInsert: { id: 'singleton', data: DEFAULT_BUSINESS_SETTINGS, updatedAt: now } },
    { upsert: true }
  );
  await models.WebsiteSetting.updateOne(
    { id: 'singleton' },
    { $setOnInsert: { id: 'singleton', data: DEFAULT_WEBSITE_SETTINGS, updatedAt: now } },
    { upsert: true }
  );

  const [deletedProdRow, deletedCatRow] = await Promise.all([
    models.SiteSetting.findOne({ key: 'deleted_seed_product_ids' }).lean(),
    models.SiteSetting.findOne({ key: 'deleted_seed_category_ids' }).lean(),
  ]);
  const deletedProductIds = new Set<string>(
    Array.isArray(deletedProdRow?.value) ? deletedProdRow.value.map(String) : []
  );
  const deletedCategoryIds = new Set<string>(
    Array.isArray(deletedCatRow?.value) ? deletedCatRow.value.map(String) : []
  );

  // 3. Seed Dry Fruit Categories (safe upsert for new catalog categories & clean up obsolete empty ones)
  for (let i = 0; i < DEFAULT_CATEGORIES.length; i++) {
    const cat = DEFAULT_CATEGORIES[i];
    if (deletedCategoryIds.has(cat.id)) continue;
    await models.Category.updateOne(
      { id: cat.id },
      {
        $setOnInsert: {
          ...cat,
          displayOrder: i + 1,
          active: true,
          createdAt: now,
          updatedAt: now,
        },
      },
      { upsert: true }
    );
  }
  for (const obsoleteCatId of ['cat_dates', 'cat_seeds']) {
    const inUse = await models.Product.countDocuments({ categoryId: obsoleteCatId });
    if (inUse === 0) {
      await models.Category.deleteOne({ id: obsoleteCatId });
    }
  }

  // 4. Seed Storefront Catalog Products, Weight Variants & Inventory (safe upsert for new catalog additions, skipping permanently deleted IDs)
  const futureExpiry = new Date(Date.now() + 270 * 86400_000).toISOString().slice(0, 10);
  for (const p of PRODUCTS_SEED) {
      if (deletedProductIds.has(p.id)) continue;
      const meta = PRODUCT_CATEGORY_MAP[p.id] || {
        catId: 'cat_other',
        sku: `AS-${p.id.toUpperCase()}`,
        purchasePrice: Math.round(p.price * 0.65),
        stock: 25,
        minAlert: 5,
      };
      const isFeatured = ['kaju', 'badam', 'kesar'].includes(p.id);
      const gallery = p.gallery || [p.image];

      const resolvedWeightLabel =
        p.weightLabel || (p.unit === 'gram' ? '1g' : p.unit === 'ml' ? '100ml' : p.unit === 'piece' ? '1 Piece' : '1kg');
      const initialSeedStock = includeDemoSeed ? meta.stock : 0;

      await models.Product.updateOne(
        { id: p.id },
        {
          $setOnInsert: {
            id: p.id,
            name: p.name,
            hindiName: p.hindiName || null,
            subtitle: p.subtitle,
            sku: meta.sku,
            barcode: null,
            purchasePrice: meta.purchasePrice,
            price: p.price,
            discountPrice: null,
            gstRate: 5,
            stock: initialSeedStock,
            minStockAlert: meta.minAlert,
            unit: p.unit,
            weightLabel: resolvedWeightLabel,
            step: p.step,
            minQty: p.minQty,
            category: p.category,
            categoryId: meta.catId,
            image: p.image,
            images: gallery,
            gallery,
            fallbackImage: p.fallbackImage || null,
            videoUrl: p.videoUrl || null,
            videoDetails: p.videoDetails || null,
            description: p.description,
            origin: p.origin,
            grade: p.grade,
            expiryDate: futureExpiry,
            storageInstructions: 'Store in airtight container in a cool, dry place below 22°C.',
            featured: isFeatured,
            features: p.features || [],
            variants: p.variants || [],
            tasteProfile: p.tasteProfile,
            jammuStory: p.jammuStory,
            inStock: includeDemoSeed ? Boolean(p.inStock) : false,
            harvestSeason: p.harvestSeason,
            nutrition: p.nutrition,
            status: p.status || 'published',
            createdAt: now,
            updatedAt: now,
          },
        },
        { upsert: true }
      );

      // Sync product image and gallery to seed
      await models.Product.updateOne(
        { id: p.id },
        {
          $set: {
            image: p.image,
            images: gallery,
            gallery,
            fallbackImage: p.fallbackImage || null,
            updatedAt: now,
          },
        }
      );

      const basePackUnits =
        p.unit === 'piece'
          ? parsePackPieces(resolvedWeightLabel)
          : p.unit === 'gram'
          ? parseWeightGrams(resolvedWeightLabel) || 1
          : p.unit === 'ml'
          ? parseWeightGrams(resolvedWeightLabel) || 100
          : 1;

      const weights =
        p.unit === 'piece'
          ? (Array.isArray(p.variants) && p.variants.length > 0 ? p.variants : [resolvedWeightLabel]).map(label => {
              const pcs = parsePackPieces(label);
              return { label, mult: pcs / basePackUnits, units: pcs };
            })
          : p.unit === 'gram' && basePackUnits > 1 && Array.isArray(p.variants) && p.variants.length > 0
          ? p.variants
              .map(label => {
                const grams = parseWeightGrams(label);
                return grams ? { label, mult: grams / basePackUnits, units: grams } : null;
              })
              .filter((w): w is { label: string; mult: number; units: number } => Boolean(w))
          : p.unit === 'gram'
          ? [
            { label: '1g', mult: 1, units: 1 },
            { label: '2g', mult: 2, units: 2 },
            { label: '5g', mult: 5, units: 5 },
          ]
          : p.unit === 'ml' && basePackUnits !== 100 && Array.isArray(p.variants) && p.variants.length > 0
          ? p.variants
              .map(label => {
                const ml = parseWeightGrams(label);
                return ml ? { label, mult: ml / basePackUnits, units: ml } : null;
              })
              .filter((w): w is { label: string; mult: number; units: number } => Boolean(w))
          : p.unit === 'ml'
          ? [
            { label: '100ml', mult: 1, units: 100 },
            { label: '250ml', mult: 2.5, units: 250 },
            { label: '500ml', mult: 5, units: 500 },
            { label: '1000ml', mult: 10, units: 1000 },
          ]
          : Array.isArray(p.variants) && p.variants.includes('100g')
          ? [
            { label: '100g', mult: 0.1, units: 0.1 },
            { label: '250g', mult: 0.25, units: 0.25 },
            { label: '500g', mult: 0.5, units: 0.5 },
            { label: '1kg', mult: 1, units: 1 },
          ]
          : [
            { label: '250g', mult: 0.25, units: 0.25 },
            { label: '500g', mult: 0.5, units: 0.5 },
            { label: '1kg', mult: 1, units: 1 },
          ];

      for (const w of weights) {
        const varId = `var_${p.id}_${w.label}`;
        await models.ProductVariant.updateOne(
          { id: varId },
          {
            $setOnInsert: {
              id: varId,
              productId: p.id,
              weightLabel: w.label,
              sku: `${meta.sku}-${w.label.toUpperCase()}`,
              purchasePrice: Math.round(meta.purchasePrice * w.mult),
              sellingPrice: Math.round(p.price * w.mult),
              stock: !includeDemoSeed
                ? 0
                : p.unit === 'ml' || (p.unit === 'gram' && basePackUnits > 1) || p.unit === 'piece'
                ? Math.max(1, Math.floor(initialSeedStock / w.units))
                : Math.max(5, Math.round(initialSeedStock / 2)),
              active: true,
              createdAt: now,
              updatedAt: now,
            },
          },
          { upsert: true }
        );
      }

      const initValuation = Math.round((initialSeedStock / basePackUnits) * meta.purchasePrice);

      await models.Inventory.updateOne(
        { productId: p.id },
        {
          $setOnInsert: {
            id: `inv_${p.id}`,
            productId: p.id,
            sku: meta.sku,
            stockQuantity: initialSeedStock,
            minStockAlert: meta.minAlert,
            purchaseCost: meta.purchasePrice,
            valuation: initValuation,
            updatedAt: now,
          },
        },
        { upsert: true }
      );

      if (includeDemoSeed) {
        await models.InventoryBatch.updateOne(
          { id: `batch_${p.id}_init` },
          {
            $setOnInsert: {
              id: `batch_${p.id}_init`,
              productId: p.id,
              batchNumber: `JMU-2026-${p.id.slice(0, 3).toUpperCase()}`,
              quantity: meta.stock,
              remainingQty: meta.stock,
              purchaseCost: meta.purchasePrice,
              expiryDate: futureExpiry,
              notes: 'Opening Jammu cellar harvest stock',
              receivedAt: now,
            },
          },
          { upsert: true }
        );
      }
    }

  // Repair any gram-unit product whose base price was saved at its 1kg variant rate while weightLabel stayed '1g'
  const mismatchedGramProducts = await models.Product.find({
    unit: 'gram',
    weightLabel: { $in: ['1g', null, ''] },
    price: { $gte: 50000 },
  }).lean();
  for (const prod of mismatchedGramProducts) {
    const kgVariant = await models.ProductVariant.findOne({
      productId: prod.id,
      weightLabel: { $regex: /^1\s*kg$/i },
    }).lean();
    if (kgVariant && Math.abs(Number(kgVariant.sellingPrice) - Number(prod.price)) <= 5) {
      await models.Product.updateOne(
        { id: prod.id },
        { $set: { weightLabel: '1kg', updatedAt: now } }
      );
      await syncInventoryRecord(db, prod.id);
    }
  }

  // 5. Seed all Email Templates (customer & admin transactional + marketing)
  for (const tpl of DEFAULT_EMAIL_TEMPLATES) {
    await models.EmailTemplate.updateOne(
      { templateKey: tpl.templateKey },
      {
        $setOnInsert: {
          id: `tpl_${tpl.templateKey}`,
          templateKey: tpl.templateKey,
          templateName: tpl.templateName,
          category: tpl.category,
          subject: tpl.subject,
          htmlContent: tpl.htmlContent,
          textContent: tpl.textContent,
          variables: tpl.variables,
          enabled: true,
          updatedAt: now,
          updatedBy: 'system',
        },
      },
      { upsert: true }
    );
  }

  // 6. Test-only Sample Coupons
  if (includeDemoSeed) {
    await models.Coupon.updateOne(
      { id: 'cpn_welcome10' },
      {
        $setOnInsert: {
          id: 'cpn_welcome10',
          code: 'JAMMU10',
          title: 'Heritage Welcome Privilege',
          description: '10% off your first verified order from our Jammu harvest cellars (up to ₹500).',
          discountType: 'percentage',
          discountValue: 10,
          minOrderValue: 1000,
          maxDiscount: 500,
          startDate: null,
          endDate: null,
          applicableProducts: [],
          active: true,
          createdAt: now,
        },
      },
      { upsert: true }
    );
    await models.Coupon.updateOne(
      { id: 'cpn_festive250' },
      {
        $setOnInsert: {
          id: 'cpn_festive250',
          code: 'SETH250',
          title: 'Royal Harvest Reserve Benefit',
          description: 'Flat ₹250 off orders above ₹2,500 on almonds, walnuts, cashews & saffron.',
          discountType: 'flat',
          discountValue: 250,
          minOrderValue: 2500,
          maxDiscount: 250,
          startDate: null,
          endDate: null,
          applicableProducts: [],
          active: true,
          createdAt: now,
        },
      },
      { upsert: true }
    );
  }

  // 7. Seed Super Admin & keep configured adminSeedEmail promoted as active Super Admin
  const targetAdminEmail = normalizeEmail(config.adminSeedEmail);
  const existingAdmin = await models.Customer.findOne({ role: 'admin' }).lean();
  const rootAdmin = await models.Customer.findOne({ id: 'cust_admin_root' }).lean();
  const existingTargetUser = await models.Customer.findOne({ email: targetAdminEmail }).lean();

  if (!existingAdmin && !existingTargetUser) {
    const adminHash = await hashPassword(config.adminSeedPassword);
    await models.Customer.create({
      id: 'cust_admin_root',
      name: 'Seth And Sons Admin',
      email: targetAdminEmail,
      emailVerified: true,
      emailVerifiedAt: now,
      phone: '9876543210',
      passwordHash: adminHash,
      role: 'admin',
      adminRole: 'super_admin',
      permissions: [...ALL_ADMIN_PERMISSIONS],
      isActive: true,
      tier: 'Super Admin',
      loyaltyPoints: 0,
      marketingConsent: false,
      consentSource: 'system',
      emailPreferences: DEFAULT_EMAIL_PREFERENCES,
      createdAt: now,
      updatedAt: now,
    });
  } else if (existingTargetUser) {
    // Ensure configured admin email is Super Admin (even if previously registered as a customer)
    await models.Customer.updateOne(
      { id: existingTargetUser.id },
      {
        $set: {
          role: 'admin',
          adminRole: 'super_admin',
          permissions: [...ALL_ADMIN_PERMISSIONS],
          emailVerified: true,
          emailVerifiedAt: existingTargetUser.emailVerifiedAt || now,
          isActive: true,
          tier: 'Super Admin',
          updatedAt: now,
        },
      }
    );
    // Remove default placeholder root admin if it uses an outdated default seed email
    if (
      rootAdmin &&
      rootAdmin.id !== existingTargetUser.id &&
      rootAdmin.email === 'admin@asuleshseth.com' &&
      targetAdminEmail !== 'admin@asuleshseth.com'
    ) {
      await models.Customer.deleteOne({ id: 'cust_admin_root' });
    }
  } else if (rootAdmin && rootAdmin.email !== targetAdminEmail) {
    await models.Customer.updateOne(
      { id: 'cust_admin_root' },
      {
        $set: {
          email: targetAdminEmail,
          emailVerified: true,
          emailVerifiedAt: rootAdmin.emailVerifiedAt || now,
          adminRole: 'super_admin',
          permissions: [...ALL_ADMIN_PERMISSIONS],
          isActive: true,
          updatedAt: now,
        },
      }
    );
  } else if (existingAdmin && (!existingAdmin.adminRole || !existingAdmin.permissions?.length)) {
    await models.Customer.updateMany(
      { role: 'admin' },
      { $set: { adminRole: 'super_admin', permissions: [...ALL_ADMIN_PERMISSIONS], isActive: true } }
    );
  }

  // 8. Test-only Demo Verified Patron + Sample Order (disabled in dev/prod)
  if (includeDemoSeed) {
    const existingPatron = await models.Customer.findOne({ email: 'vikram.seth@heritage.in' }).lean();
    if (!existingPatron) {
      const patronHash = await hashPassword('Patron@2026!');
      await models.Customer.create({
        id: 'cust_demo_vikram',
        name: 'Vikramaditya Seth',
        email: 'vikram.seth@heritage.in',
        emailVerified: true,
        emailVerifiedAt: now,
        phone: '9812345678',
        passwordHash: patronHash,
        role: 'customer',
        isActive: true,
        tier: 'Heritage Circle Member',
        loyaltyPoints: 350,
        marketingConsent: true,
        marketingConsentAt: now,
        consentSource: 'registration',
        emailPreferences: DEFAULT_EMAIL_PREFERENCES,
        createdAt: now,
        updatedAt: now,
      });

      await models.CustomerAddress.updateOne(
        { id: 'addr_demo_vikram' },
        {
          $setOnInsert: {
            id: 'addr_demo_vikram',
            customerId: 'cust_demo_vikram',
            label: 'Heritage Home',
            fullName: 'Vikramaditya Seth',
            phone: '9812345678',
            addressLine: '24/B Heritage Enclave, Circular Road',
            city: 'Jammu',
            state: 'Jammu & Kashmir',
            pincode: '180001',
            isDefault: true,
            createdAt: now,
            updatedAt: now,
          },
        },
        { upsert: true }
      );

      const twoDaysAgo = new Date(Date.now() - 86400000 * 2).toISOString();
      const oneDayAgo = new Date(Date.now() - 86400000).toISOString();

      await models.Order.updateOne(
        { id: 'ord_demo_4819' },
        {
          $setOnInsert: {
            id: 'ord_demo_4819',
            orderNumber: 'AS-REQ-2026-4819',
            customerId: 'cust_demo_vikram',
            orderType: 'standard',
            status: 'confirmed',
            paymentMethod: 'Concierge Invoice / COD',
            paymentStatus: 'pending',
            subtotal: 3588,
            discountAmount: 0,
            couponCode: null,
            shippingCharge: 0,
            taxAmount: 0,
            totalAmount: 3588,
            costOfGoods: 2345,
            deliveryAddress: {
              fullName: 'Vikramaditya Seth',
              mobileNumber: '9812345678',
              whatsappNumber: '9812345678',
              email: 'vikram.seth@heritage.in',
              deliveryAddress: '24/B Heritage Enclave, Circular Road',
              city: 'Jammu',
              state: 'Jammu & Kashmir',
              pincode: '180001',
            },
            customerSnapshot: {
              id: 'cust_demo_vikram',
              name: 'Vikramaditya Seth',
              email: 'vikram.seth@heritage.in',
              phone: '9812345678',
            },
            instructions: 'Vacuum tin seal requested for saffron',
            estimatedDeliveryEstimate: '3-5 Business Days',
            confirmedAt: oneDayAgo,
            createdAt: twoDaysAgo,
            updatedAt: oneDayAgo,
          },
        },
        { upsert: true }
      );

      await models.OrderItem.updateOne(
        { id: 'oi_demo_1' },
        {
          $setOnInsert: {
            id: 'oi_demo_1',
            orderId: 'ord_demo_4819',
            productId: 'badam',
            productName: 'Shell Mamara Badam',
            productImage: '/assets/aistudio/2a3c89dd1edf49b4c54431c043fd7a29_4031e226.jpg',
            category: 'nuts',
            unit: 'kg',
            purchasePrice: 790,
            unitPrice: 1200,
            quantity: 2,
            subtotal: 2400,
          },
        },
        { upsert: true }
      );
      await models.OrderItem.updateOne(
        { id: 'oi_demo_2' },
        {
          $setOnInsert: {
            id: 'oi_demo_2',
            orderId: 'ord_demo_4819',
            productId: 'kesar',
            productName: 'Kesar (Saffron)',
            productImage: '/assets/aistudio/089d9d032b3d8ce5adc25c5bd337bbe4_4cc41a23.jpg',
            category: 'saffron',
            unit: 'gram',
            purchasePrice: 255,
            unitPrice: 396,
            quantity: 3,
            subtotal: 1188,
          },
        },
        { upsert: true }
      );
      await models.OrderStatusHistory.updateOne(
        { id: 'osh_demo_1' },
        {
          $setOnInsert: {
            id: 'osh_demo_1',
            orderId: 'ord_demo_4819',
            previousStatus: null,
            newStatus: 'placed',
            updatedBy: 'Vikramaditya Seth',
            notes: 'Order received through Jammu harvest storefront',
            timestamp: twoDaysAgo,
          },
        },
        { upsert: true }
      );
      await models.OrderStatusHistory.updateOne(
        { id: 'osh_demo_2' },
        {
          $setOnInsert: {
            id: 'osh_demo_2',
            orderId: 'ord_demo_4819',
            previousStatus: 'placed',
            newStatus: 'confirmed',
            updatedBy: 'Seth And Sons Admin',
            notes: 'Harvest batch verified and queued for vacuum tin sealing',
            timestamp: oneDayAgo,
          },
        },
        { upsert: true }
      );
    }

    // 9. Test-only Sample Suppliers, Expense & Notifications
    const suppCount = await models.Supplier.countDocuments();
    if (suppCount === 0) {
      await models.Supplier.create([
        {
          id: 'sup_pir_panjal',
          supplierName: 'Pir Panjal Growers Collective',
          businessName: 'Pir Panjal Orchards & Curing Co.',
          contactPerson: 'Ghulam Nabi Bhat',
          phone: '9419011223',
          email: 'orchards@pirpanjal.in',
          address: 'Pampore & Pulwama Saffron Belt, J&K',
          gstin: '01AABCP1234M1Z2',
          paymentTerms: 'Net 15 Days',
          outstandingBalance: 0,
          notes: 'Primary Mongra saffron & highland Mamra almond grower',
          active: true,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'sup_chenab_walnut',
          supplierName: 'Chenab Valley Walnut Traders',
          businessName: 'Kishtwar Snow-White Kernels LLP',
          contactPerson: 'Harshvardhan Thakur',
          phone: '9419144556',
          email: 'supply@chenabwalnuts.in',
          address: 'Kishtwar Mandi, Jammu & Kashmir',
          gstin: '01AAACC9981P1Z8',
          paymentTerms: 'Net 30 Days',
          outstandingBalance: 0,
          notes: 'Wild-pollinated light amber walnut halves & jumbo cashews',
          active: true,
          createdAt: now,
          updatedAt: now,
        },
      ]);

      await models.Expense.updateOne(
        { id: 'exp_seed_1' },
        {
          $setOnInsert: {
            id: 'exp_seed_1',
            category: 'Packaging',
            title: 'Custom Gold-Foiled Vacuum Pouches & Tins',
            amount: 4800,
            expenseDate: now.slice(0, 10),
            vendor: 'Jammu Heritage Printers',
            paymentMode: 'Bank Transfer',
            notes: 'Monthly velvet & kraft box packaging replenishment',
            createdBy: 'system',
            createdAt: now,
            updatedAt: now,
          },
        },
        { upsert: true }
      );

      await models.AdminNotification.updateOne(
        { id: 'anotif_seed_lowstock' },
        {
          $setOnInsert: {
            id: 'anotif_seed_lowstock',
            type: 'low_stock',
            title: 'Low Stock Alert: Pista (Pistachios)',
            message: 'Available stock (8 kg) is below minimum alert threshold (10 kg).',
            severity: 'warning',
            entityType: 'product',
            entityId: 'pista',
            isRead: false,
            createdAt: now,
          },
        },
        { upsert: true }
      );

      await models.AdminNotification.updateOne(
        { id: 'anotif_seed_order' },
        {
          $setOnInsert: {
            id: 'anotif_seed_order',
            type: 'new_order',
            title: 'Order #AS-REQ-2026-4819 Confirmed',
            message: 'Awaiting packing & courier AWB assignment.',
            severity: 'info',
            entityType: 'order',
            entityId: 'AS-REQ-2026-4819',
            isRead: false,
            createdAt: now,
          },
        },
        { upsert: true }
      );
    }
  }
}

