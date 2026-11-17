import { ebayFetch } from "./client";
import { marketplace } from "./config";

/** ID de l'arbre de catégories par marketplace. */
const CATEGORY_TREE: Record<string, string> = { EBAY_FR: "71", EBAY_DE: "77", EBAY_GB: "3", EBAY_US: "0" };

/** Propose des catégories eBay à partir d'un titre produit (nécessite un token application). */
export async function suggestCategories(appAccessToken: string, query: string) {
  const treeId = CATEGORY_TREE[marketplace().id] ?? "71";
  const res = await ebayFetch<{
    categorySuggestions?: { category: { categoryId: string; categoryName: string } }[];
  }>(appAccessToken, `/commerce/taxonomy/v1/category_tree/${treeId}/get_category_suggestions?q=${encodeURIComponent(query)}`);
  return (res.categorySuggestions ?? []).map((s) => s.category);
}
