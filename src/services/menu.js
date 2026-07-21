const supabase = require('./supabase');

/**
 * Fetches all categories, ordered the way they should be displayed to
 * customers (sort_order, ascending).
 */
async function getCategories() {
  const { data, error } = await supabase
    .from('categories')
    .select('id, name_ar, name_en, sort_order')
    .order('sort_order', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch categories: ${error.message}`);
  }

  return data;
}

/**
 * Fetches every menu product along with its category name and its sizes/
 * prices, flattened into one array. This is what the AI needs to actually
 * match a customer's words ("بيتزا مكس لحوم") to a real product instead of
 * guessing at names.
 */
async function getMenuProducts() {
  const { data, error } = await supabase
    .from('menu_products')
    .select(`
      id,
      name_ar,
      name_en,
      available,
      categories ( name_en ),
      product_sizes ( size_name, price )
    `)
    .eq('available', true);

  if (error) {
    throw new Error(`Failed to fetch menu products: ${error.message}`);
  }

  return data;
}

/**
 * Fetches all active delivery zones with their fees - this is what lets the
 * AI (and our own price calculation) match a customer's stated area to a
 * real zone and fee.
 */
async function getDeliveryZones() {
  const { data, error } = await supabase
    .from('delivery_prices')
    .select('area, price, active')
    .eq('active', true);

  if (error) {
    throw new Error(`Failed to fetch delivery zones: ${error.message}`);
  }

  return data;
}

module.exports = { getCategories, getMenuProducts, getDeliveryZones };
