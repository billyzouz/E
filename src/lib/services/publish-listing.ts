import { writeListing, type WrittenListing } from "@/lib/ai/listing-writer";
import { db } from "@/lib/db";
import { getPolicies, ensureLocation } from "@/lib/ebay/account";
import { publishGroup, type GroupDraft } from "@/lib/ebay/inventory";
import { appToken } from "@/lib/ebay/oauth";
import { suggestCategories } from "@/lib/ebay/taxonomy";
import { getUserAccessToken } from "@/lib/ebay/token-store";
import { getMarket } from "@/lib/markets";

/** Contenu généré par l'IA, stocké dans market_listings.aspects. */
type StoredContent = Omit<WrittenListing, "title" | "descriptionHtml">;

async function loadListing(listingId: string) {
  const { data: listing, error } = await db().from("market_listings").select("*").eq("id", listingId).single();
  if (error) throw error;
  const { data: offers, error: offersError } = await db()
    .from("market_offers")
    .select("*, product:products(*)")
    .eq("listing_id", listingId);
  if (offersError) throw offersError;
  return { listing, offers: offers ?? [] };
}

const fail = async (listingId: string, e: unknown) => {
  await db()
    .from("market_listings")
    .update({ status: "error", last_error: e instanceof Error ? e.message : String(e), updated_at: new Date().toISOString() })
    .eq("id", listingId);
};

/** Étape 1 (sans eBay) : l'IA écrit l'annonce dans la langue du pays. */
export async function prepareListing(listingId: string) {
  const { listing, offers } = await loadListing(listingId);
  if (!offers.length) throw new Error("Annonce sans variante");
  const market = getMarket(listing.marketplace);
  const first = offers[0].product;

  try {
    const written = await writeListing(
      {
        nameEn: first.name_en,
        descriptionHtml: first.description_html,
        optionNames: first.option_names ?? [],
        variantKeys: offers.map((o) => o.product.variant_key ?? o.product.cj_variant_sku),
      },
      market,
    );
    const { title, descriptionHtml, ...content } = written;
    await db()
      .from("market_listings")
      .update({
        title,
        description_html: descriptionHtml,
        aspects: content satisfies StoredContent,
        status: listing.status === "listed" ? "listed" : "ready",
        last_error: null,
        ai_generated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", listingId);
    return { title };
  } catch (e) {
    await fail(listingId, e);
    throw e;
  }
}

/** Étape 2 : catégorie eBay, politiques, lieu d'expédition, puis publication de l'annonce à variantes. */
export async function publishListing(listingId: string) {
  let { listing } = await loadListing(listingId);
  if (!listing.title) {
    await prepareListing(listingId);
    ({ listing } = await loadListing(listingId));
  }
  const { offers } = await loadListing(listingId);
  const market = getMarket(listing.marketplace);
  const content = listing.aspects as StoredContent;

  try {
    let categoryId: string | null = listing.category_id;
    if (!categoryId) {
      const app = await appToken();
      const [best] = await suggestCategories(app.access_token, market, content.categoryQuery || listing.title);
      if (!best) throw new Error(`Aucune catégorie eBay trouvée pour « ${content.categoryQuery} »`);
      categoryId = best.categoryId;
    }

    const token = await getUserAccessToken();
    const [policies, merchantLocationKey] = await Promise.all([
      getPolicies(token, market),
      ensureLocation(token, listing.ship_from),
    ]);

    const live = offers.filter((o) => o.quantity > 0);
    if (!live.length) throw new Error("Aucune variante en stock dans l'entrepôt choisi");

    const draft: GroupDraft = {
      groupKey: listing.group_key,
      title: listing.title,
      descriptionHtml: listing.description_html,
      imageUrls: [...new Set(live.flatMap((o) => o.product.image_urls as string[]))],
      aspects: content.aspects ?? {},
      variesBy: live.length > 1 ? content.variesBy ?? [] : [],
      categoryId,
      merchantLocationKey,
      policies,
      variants: live.map((o) => ({
        sku: o.sku,
        aspects: live.length > 1 ? content.variantAspects?.[o.product.variant_key ?? o.product.cj_variant_sku] ?? {} : {},
        imageUrls: o.product.image_urls,
        quantity: o.quantity,
        price: Number(o.price),
        offerId: o.ebay_offer_id,
      })),
    };

    const { listingId: ebayListingId, offerIds } = await publishGroup(token, market, draft);
    for (const o of live) {
      await db().from("market_offers").update({ ebay_offer_id: offerIds[o.sku] }).eq("id", o.id);
    }
    await db()
      .from("market_listings")
      .update({
        status: "listed",
        category_id: categoryId,
        ebay_listing_id: ebayListingId,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", listingId);
    return { ebayListingId };
  } catch (e) {
    await fail(listingId, e);
    throw e;
  }
}
