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

module.exports = { getCategories };
