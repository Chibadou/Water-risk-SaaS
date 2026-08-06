import type { Metadata } from "next";
import CarteClient from "@/components/CarteClient";

export const metadata: Metadata = {
  title: "Carte des ressources en eau — HydroVigie",
  description:
    "Stations de débit, piézomètres, observations d'assecs, ouvrages de prélèvement et nappes affleurantes autour d'une adresse, en France.",
};

export default function CartePage() {
  return <CarteClient />;
}
