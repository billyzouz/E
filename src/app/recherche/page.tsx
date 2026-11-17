import { PageHeader } from "@/components/ui";
import { REGIONS } from "@/lib/niches";
import { Finder } from "./finder";

export default function RecherchePage() {
  return (
    <>
      <PageHeader
        title="Trouver des produits"
        subtitle="Catalogue CJ classé par note : boutiques qui vendent déjà le produit, stock, prix d'achat. Chaque produit importé est préparé pour les 8 pays."
      />
      <Finder regions={REGIONS} />
    </>
  );
}
