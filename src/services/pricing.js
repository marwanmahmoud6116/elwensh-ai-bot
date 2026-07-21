/**
 * Looks up the correct price for an order item, accounting for size, by
 * matching against the real menuProducts data from Supabase - never trusts
 * a price the AI might have mentioned in conversation.
 */
function resolveItemPrice(item, menuProducts) {
  const product = menuProducts.find(p => p.name_ar === item.name_ar);
  if (!product) return 0;

  const sizes = product.product_sizes || [];
  if (sizes.length === 0) return 0;

  if (item.size_name) {
    const match = sizes.find(s => s.size_name === item.size_name);
    if (match) return match.price;
  }

  // Items with only one size (e.g. "regular") don't require the customer
  // to specify one - fall back to it if that's all there is.
  if (sizes.length === 1) return sizes[0].price;

  return 0;
}

/**
 * Sums the price of every item in the cart (quantity-aware).
 */
function calculateItemsTotal(items, menuProducts) {
  let total = 0;
  for (const item of items) {
    const quantity = item.quantity || 1;
    total += resolveItemPrice(item, menuProducts) * quantity;
  }
  return Math.round(total * 100) / 100;
}

/**
 * Looks up the delivery fee for a given zone name, by matching against the
 * real delivery_prices data from Supabase.
 */
function resolveZonePrice(zoneName, deliveryZones) {
  const zone = deliveryZones.find(z => z.area === zoneName);
  return zone ? zone.price : 0;
}

/**
 * Full price breakdown for an order: food subtotal + delivery fee (if
 * applicable) + grand total. This is the single source of truth for money -
 * the AI never calculates this itself, we always compute it server-side.
 */
function calculateOrderBreakdown(state, menuProducts, deliveryZones) {
  const itemsTotal = calculateItemsTotal(state.items, menuProducts);
  const isDelivery = state.fulfillmentType === 'delivery';
  const deliveryFee = isDelivery ? resolveZonePrice(state.customerZone, deliveryZones) : 0;
  return {
    itemsTotal,
    fulfillmentType: state.fulfillmentType,
    deliveryFee,
    grandTotal: Math.round((itemsTotal + deliveryFee) * 100) / 100,
  };
}

module.exports = {
  resolveItemPrice,
  calculateItemsTotal,
  resolveZonePrice,
  calculateOrderBreakdown,
};
