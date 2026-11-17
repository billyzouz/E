import { db } from "@/lib/db";
import { publishListing } from "@/lib/ebay/inventory";
import { getUserAccessToken } from "@/lib/ebay/token-store";

/** Quantité affichée sur eBay : on plafonne pour ne jamais survendre un stock fournisseur instable. */
export const MAX_LISTED_QUANTITY = 5;
export const listedQuantity = (stock: number) => Math.max(0, Math.min(stock, MAX_LISTED_QUANTITY));

/** Publie un produit brouillon sur eBay. La catégorie doit avoir été choisie. */
export async function publishProduct(productId: string) {
  const { data: p, error } = await db().from("products").select("*").eq("id", productId).single();
  if (error) throw error;
  if (!p.category_id) throw new Error("Choisis une catégorie eBay avant de publier");

  const token = await getUserAccessToken();
  try {
    const { offerId, listingId } = await publishListing(token, {
      sku: p.sku,
      title: p.title,
      descriptionHtml: p.description_html,
      imageUrls: p.image_urls,
      aspects: { Marque: ["Sans marque"], ...p.aspects },
      categoryId: p.category_id,
      quantity: listedQuantity(p.stock),
      price: Number(p.price_eur),
    });
    await db()
      .from("products")
      .update({ status: "listed", ebay_offer_id: offerId, ebay_listing_id: listingId, last_error: null })
      .eq("id", productId);
    return { offerId, listingId };
  } catch (e) {
    await db().from("products").update({ status: "error", last_error: String(e) }).eq("id", productId);
    throw e;
  }
}
