/**
 * Niches de départ par région. Ce sont des hypothèses tirées de rapports publics (ZIK Analytics, guides eBay,
 * blogs vendeurs), pas des données de ventes vérifiées : la note CJ puis les données eBay de chaque pays tranchent.
 *
 * Volontairement exclus : pièces auto (compatibilités), cosmétiques, compléments alimentaires, crèmes solaires
 * (réglementés), produits de marque ou copies, batteries et liquides (transport restreint).
 */
export interface Niche {
  label: string;
  keyword: string; // mot-clé de recherche CJ (anglais)
}

export interface Region {
  id: string;
  name: string;
  markets: string[];
  why: string;
  niches: Niche[];
}

export const REGIONS: Region[] = [
  {
    id: "north-america",
    name: "Amérique du Nord",
    markets: ["EBAY_US", "EBAY_CA"],
    why: "Plus gros marché eBay. Électronique, maison et animaux dominent les ventes. Entrepôts CJ aux US : 2–7 j.",
    niches: [
      { label: "Accessoires téléphone", keyword: "phone holder" },
      { label: "Accessoires PC", keyword: "laptop stand" },
      { label: "Hubs & câbles USB-C", keyword: "usb c hub" },
      { label: "Accessoires voiture", keyword: "car organizer" },
      { label: "Lits pour chiens", keyword: "dog bed" },
      { label: "Jouets pour chats", keyword: "cat toy" },
      { label: "Gadgets cuisine", keyword: "kitchen gadget" },
      { label: "Rangement maison", keyword: "storage organizer" },
      { label: "Fitness maison", keyword: "resistance bands" },
    ],
  },
  {
    id: "uk",
    name: "Royaume-Uni",
    markets: ["EBAY_GB"],
    why: "2e marché eBay. Jardin, maison et bricolage très demandés.",
    niches: [
      { label: "Éclairage solaire jardin", keyword: "solar garden light" },
      { label: "Outils de jardin", keyword: "garden tool" },
      { label: "Arrosage", keyword: "hose nozzle" },
      { label: "Rangement maison", keyword: "storage organizer" },
      { label: "Accessoires animaux", keyword: "pet grooming" },
      { label: "Accessoires téléphone", keyword: "phone holder" },
    ],
  },
  {
    id: "europe",
    name: "Europe (DE, FR, IT, ES)",
    markets: ["EBAY_DE", "EBAY_FR", "EBAY_IT", "EBAY_ES"],
    why: "L'Allemagne est le 3e marché eBay. Maison, jardin, bricolage et électronique en tête.",
    niches: [
      { label: "Rubans LED", keyword: "led strip" },
      { label: "Éclairage solaire", keyword: "solar light" },
      { label: "Rangement outils", keyword: "tool organizer" },
      { label: "Accessoires cuisine", keyword: "kitchen organizer" },
      { label: "Accessoires animaux", keyword: "dog harness" },
      { label: "Accessoires téléphone", keyword: "phone case" },
      { label: "Accessoires vélo", keyword: "bike accessories" },
    ],
  },
  {
    id: "oceania",
    name: "Australie",
    markets: ["EBAY_AU"],
    why: "Plein air, sport et pêche se vendent bien et cher. Peu de stock CJ local : vérifier les délais.",
    niches: [
      { label: "Camping", keyword: "camping light" },
      { label: "Pêche", keyword: "fishing lure" },
      { label: "Randonnée", keyword: "hiking backpack" },
      { label: "Sport & fitness", keyword: "yoga mat" },
      { label: "Accessoires animaux", keyword: "dog leash" },
      { label: "Accessoires téléphone", keyword: "phone holder" },
    ],
  },
];
