import type { Metadata } from "next";
import SitesDashboard from "@/components/SitesDashboard";

export const metadata: Metadata = {
  title: "Mes sites — HydroVigie",
  description:
    "Tableau de bord multi-sites des restrictions sécheresse en vigueur (données VigiEau).",
};

export default function SitesPage() {
  return <SitesDashboard />;
}
