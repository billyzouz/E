import type { Market } from "@/lib/markets";
import { ebayFetch } from "./client";

const treeIds = new Map<string, string>();

async function categoryTreeId(appToken: string, m: Market): Promise<string> {
  if (!treeIds.has(m.id)) {
    const res = await ebayFetch<{ categoryTreeId: string }>(
      appToken,
      `/commerce/taxonomy/v1/get_default_category_tree_id?marketplace_id=${m.id}`,
    );
    treeIds.set(m.id, res.categoryTreeId);
  }
  return treeIds.get(m.id)!;
}

/** Catégories eBay suggérées pour un texte, sur un marché donné (token application suffisant). */
export async function suggestCategories(appToken: string, m: Market, query: string) {
  const treeId = await categoryTreeId(appToken, m);
  const res = await ebayFetch<{
    categorySuggestions?: { category: { categoryId: string; categoryName: string } }[];
  }>(appToken, `/commerce/taxonomy/v1/category_tree/${treeId}/get_category_suggestions?q=${encodeURIComponent(query)}`, {
    contentLanguage: m.language,
  });
  return (res.categorySuggestions ?? []).map((s) => s.category);
}
